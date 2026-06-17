/**
 * Survivor Tools — Season automation
 * ===================================
 * Adds "Start New Season" and "Finalize Season" to your Survivor Tools menu so
 * setting up / closing out a season is a couple of clicks instead of manual steps.
 *
 * HOW TO INSTALL
 *   1. In your sheet: Extensions > Apps Script.
 *   2. Paste everything below into the project (a new file is fine).
 *   3. DELETE your old `onOpen` function — the one below replaces it and keeps
 *      your existing Update Scores / Retroactive Update items.
 *   4. Set the three CONFIG values just below.
 *   5. Save, reload the sheet. First run will ask for permission (it needs to
 *      write to your hub workbook) — approve it.
 *
 * Your existing updateSurvivorScores() and retroactiveUpdate() stay as they are.
 */

// ---------- CONFIG (set these once) ----------
// The workbook that holds your Seasons (registry) tab and your tidy History tab.
// This is the workbook the website reads. Default = your current season-50 workbook.
const HUB_SPREADSHEET_ID = '1X3FMeNbGRBCewm8KWY78H254q7845AEBquyChxmCgG0';
const SEASONS_TAB_NAME   = 'Seasons';        // registry tab name in the hub
const HISTORY_TAB_NAME   = 'History-Dash';   // <-- set to the exact name of your tidy history tab
const DEFAULT_WEEKS      = 14;
// ---------------------------------------------


function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Survivor Tools')
    .addItem('Update Scores', 'updateSurvivorScores')
    .addItem('Retroactive Update', 'retroactiveUpdate')
    .addSeparator()
    .addItem('Start New Season', 'startNewSeason')
    .addItem('Finalize Season', 'finalizeSeason')
    .addToUi();
}


/**
 * Run this FROM THE NEW SEASON'S WORKBOOK (a copy of last season's).
 * It registers the season on the website by writing one row into the hub's
 * Seasons tab, and can reset the score data so the copy starts fresh.
 */
function startNewSeason() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  // 1) Season number + weeks
  const sResp = ui.prompt('Start New Season', 'Season number (e.g. 51):', ui.ButtonSet.OK_CANCEL);
  if (sResp.getSelectedButton() !== ui.Button.OK) return;
  const season = parseInt(sResp.getResponseText().trim(), 10);
  if (!season) { ui.alert('That is not a valid season number.'); return; }

  const wResp = ui.prompt('Start New Season', 'Number of weeks (e.g. 13):', ui.ButtonSet.OK_CANCEL);
  if (wResp.getSelectedButton() !== ui.Button.OK) return;
  const weeks = parseInt(wResp.getResponseText().trim(), 10) || DEFAULT_WEEKS;

  // 2) Published base for THIS workbook (asked once per workbook).
  //    Guarded by owner id so a copied stale value is never reused.
  const props = PropertiesService.getDocumentProperties();
  let base = props.getProperty('PUBLISHED_BASE');
  const owner = props.getProperty('PUBLISHED_BASE_OWNER');
  if (!base || owner !== ss.getId()) {
    const pResp = ui.prompt(
      'Publish this workbook first',
      'File > Share > Publish to web > Entire Document > CSV > Publish.\n\n' +
      'Then paste ANY published CSV link from this workbook here:',
      ui.ButtonSet.OK_CANCEL);
    if (pResp.getSelectedButton() !== ui.Button.OK) return;
    const m = pResp.getResponseText().match(/(https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^\/]+)\/pub/);
    if (!m) { ui.alert('Could not read that link. It should look like .../spreadsheets/d/e/2PACX-.../pub?gid=...'); return; }
    base = m[1] + '/pub';
    props.setProperty('PUBLISHED_BASE', base);
    props.setProperty('PUBLISHED_BASE_OWNER', ss.getId());
  }

  // 3) Build per-tab CSV URLs from each tab's gid
  const csv = (name) => {
    const sh = ss.getSheetByName(name);
    if (!sh) throw new Error('This workbook is missing a tab named "' + name + '".');
    return base + '?gid=' + sh.getSheetId() + '&single=true&output=csv';
  };
  let epUrl, coUrl, lbUrl, scUrl = '';
  try {
    epUrl = csv('Episodes');
    coUrl = csv('Contestants');
    lbUrl = csv('Leaderboard');
    try { scUrl = csv('Scoring'); } catch (e) { /* Scoring optional */ }
  } catch (e) { ui.alert(e.message); return; }

  // 4) Append the registry row to the hub (skip if season already present)
  const hub = SpreadsheetApp.openById(HUB_SPREADSHEET_ID);
  const reg = hub.getSheetByName(SEASONS_TAB_NAME);
  if (!reg) { ui.alert('Hub workbook has no tab named "' + SEASONS_TAB_NAME + '".'); return; }
  const have = reg.getLastRow() > 1
    ? reg.getRange(2, 1, reg.getLastRow() - 1, 1).getValues().map(r => r[0]) : [];
  if (have.indexOf(season) === -1) {
    reg.appendRow([season, 'Season ' + season, 'active', epUrl, coUrl, lbUrl, scUrl, weeks]);
  } else {
    ui.alert('Season ' + season + ' is already in the registry — leaving it as-is.');
  }

  // 5) Optional: clear last season's score data in this copy
  const reset = ui.alert(
    'Reset score data?',
    'Clear Episodes points, Leaderboard ranks/points, and Input tallies in THIS workbook so it starts fresh for Season ' + season + '?\n\n' +
    '(Scoring rules stay. You will still update the Contestants + Draft tabs with the new cast.)',
    ui.ButtonSet.YES_NO);
  if (reset === ui.Button.YES) resetSeasonData_(ss);

  ui.alert(
    'Season ' + season + ' registered ✓',
    'It will show up on the dashboard at /s/' + season + ' within a minute or two.\n\n' +
    'Next: update the Contestants + Draft tabs with the new draft, then run Update Scores each week as usual.',
    ui.ButtonSet.OK);
}


/**
 * Run this FROM A FINISHED SEASON'S WORKBOOK. Reads the final team standings
 * from the Leaderboard, writes the 4 placement rows into the hub's History tab,
 * and flips that season's Status to "final" in the registry.
 */
function finalizeSeason() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const resp = ui.prompt('Finalize Season', 'Which season number is finishing? (e.g. 51):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const season = parseInt(resp.getResponseText().trim(), 10);
  if (!season) { ui.alert('That is not a valid season number.'); return; }

  // Final standings from Leaderboard: col A = team, col B = points (skip Top rows)
  const lb = ss.getSheetByName('Leaderboard');
  if (!lb) { ui.alert('No "Leaderboard" tab in this workbook.'); return; }
  const rows = lb.getRange(2, 1, lb.getLastRow() - 1, 2).getValues();
  const teams = rows
    .filter(r => r[0] && r[0] !== 'Top Contestant' && r[0] !== 'Top Team')
    .map(r => ({ team: String(r[0]).trim(), points: Number(r[1]) || 0 }))
    .sort((a, b) => b.points - a.points);
  if (!teams.length) { ui.alert('Could not read any teams from the Leaderboard.'); return; }

  const hub = SpreadsheetApp.openById(HUB_SPREADSHEET_ID);

  // Append placement rows to History (skip if season already recorded)
  const hist = hub.getSheetByName(HISTORY_TAB_NAME);
  if (!hist) { ui.alert('Hub workbook has no tab named "' + HISTORY_TAB_NAME + '".'); return; }
  const haveHist = hist.getLastRow() > 1
    ? hist.getRange(2, 1, hist.getLastRow() - 1, 1).getValues().map(r => r[0]) : [];
  if (haveHist.indexOf(season) === -1) {
    teams.forEach((t, i) => hist.appendRow([season, i + 1, t.team, t.points]));
  } else {
    ui.alert('Season ' + season + ' is already in History — not adding duplicates.');
  }

  // Flip the registry row to "final"
  const reg = hub.getSheetByName(SEASONS_TAB_NAME);
  if (reg && reg.getLastRow() > 1) {
    const sv = reg.getRange(2, 1, reg.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < sv.length; i++) {
      if (sv[i][0] === season) { reg.getRange(i + 2, 3).setValue('final'); break; }
    }
  }

  ui.alert('Season ' + season + ' finalized ✓',
    teams.map((t, i) => (i + 1) + '. ' + t.team + ' — ' + t.points + ' pts').join('\n'),
    ui.ButtonSet.OK);
}


/** Clears score data (keeps contestant names + scoring rules). */
function resetSeasonData_(ss) {
  const ep = ss.getSheetByName('Episodes');
  if (ep && ep.getLastRow() > 1 && ep.getLastColumn() > 1) {
    ep.getRange(2, 2, ep.getLastRow() - 1, ep.getLastColumn() - 1).clearContent();
  }
  const lb = ss.getSheetByName('Leaderboard');
  if (lb && lb.getLastRow() > 1 && lb.getLastColumn() > 1) {
    // clear team points + weekly ranks + Top Contestant/Top Team values (cols B onward)
    lb.getRange(2, 2, lb.getLastRow() - 1, lb.getLastColumn() - 1).clearContent();
  }
  const inp = ss.getSheetByName('Input');
  if (inp && inp.getLastRow() > 1 && inp.getLastColumn() > 1) {
    inp.getRange(2, 2, inp.getLastRow() - 1, inp.getLastColumn() - 1).clearContent();
  }
}
