/**
 * Survivor Tools — complete script (scoring + season automation)
 * ==============================================================
 * This is the FULL script. In the Apps Script editor, select all (Cmd/Ctrl+A),
 * delete, and paste this in. Then set the CONFIG values just below, Save, and
 * reload the sheet.
 *
 * First run of a season tool will ask for permission (it writes to your hub
 * workbook) — approve it.
 */

// ---------- CONFIG (set these once) ----------
// The workbook that holds your Seasons (registry) tab and your tidy History tab —
// the one the website reads. Default = your current season-50 workbook.
const HUB_SPREADSHEET_ID = '1X3FMeNbGRBCewm8KWY78H254q7845AEBquyChxmCgG0';
const SEASONS_TAB_NAME   = 'Seasons';        // registry tab name in the hub
const HISTORY_TAB_NAME   = 'History-Dash';   // <-- set to the EXACT name of your tidy history tab
const DEFAULT_WEEKS      = 14;
// ---------------------------------------------


// Create the custom menu in the spreadsheet
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


// =====================================================================
// SEASON AUTOMATION
// =====================================================================

/**
 * Run this FROM THE NEW SEASON'S WORKBOOK (a copy of last season's).
 * Registers the season on the website by writing one row into the hub's
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
    lb.getRange(2, 2, lb.getLastRow() - 1, lb.getLastColumn() - 1).clearContent();
  }
  const inp = ss.getSheetByName('Input');
  if (inp && inp.getLastRow() > 1 && inp.getLastColumn() > 1) {
    inp.getRange(2, 2, inp.getLastRow() - 1, inp.getLastColumn() - 1).clearContent();
  }
}


// =====================================================================
// SCORING (your existing functions, unchanged)
// =====================================================================

// Function to retroactively populate the Leaderboard sheet
function retroactiveUpdate() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var episodesSheet = ss.getSheetByName("Episodes");
  var contestantsSheet = ss.getSheetByName("Contestants");
  var leaderboardSheet = ss.getSheetByName("Leaderboard");

  // Get data from Episodes sheet (A2:N for contestants and Week 2 to Week 14)
  var episodesData = episodesSheet.getRange(2, 1, episodesSheet.getLastRow() - 1, 14).getValues();
  var contestants = episodesData.map(row => row[0]); // Contestant names from column A
  var pointsData = episodesData.map(row => row.slice(1, 14)); // Points from columns B to N

  // Get team mapping from Contestants sheet
  var contestantsData = contestantsSheet.getRange(2, 1, contestantsSheet.getLastRow() - 1, 2).getValues();
  var teamMap = {};
  contestantsData.forEach(row => teamMap[row[0]] = row[1]);

  // Get team names from Leaderboard sheet
  var teamsData = leaderboardSheet.getRange(2, 1, leaderboardSheet.getLastRow() - 1, 1).getValues();
  var teams = teamsData.map(row => row[0]).filter(team => team && team !== "Top Contestant" && team !== "Top Team");

  // Find the last filled week column in Episodes (check row 2)
  var lastFilledColumn = 2;
  for (var col = 2; col <= 14; col++) { // Columns B to N
    if (episodesSheet.getRange(2, col).getValue() !== "") {
      lastFilledColumn = col;
    } else {
      break;
    }
  }

  // Process each week from Week 2 to the last filled week
  for (var weekCol = 2; weekCol <= lastFilledColumn; weekCol++) {
    var weekIndex = weekCol - 2; // Adjust for pointsData array (Week 2 is index 0)

    // Calculate cumulative points up to this week for each contestant
    var cumulativePoints = contestants.map((_, rowIndex) => {
      var sum = 0;
      for (var w = 0; w <= weekIndex; w++) {
        sum += pointsData[rowIndex][w] || 0;
      }
      return sum;
    });

    // Calculate team totals based on cumulative points
    var teamTotals = {};
    teams.forEach(team => {
      var teamContestants = contestants.filter(c => teamMap[c] === team);
      var teamTotal = teamContestants.reduce((sum, c) => sum + (cumulativePoints[contestants.indexOf(c)] || 0), 0);
      teamTotals[team] = teamTotal;
    });

    // Calculate team totals for this specific week
    var weeklyTeamTotals = {};
    teams.forEach(team => {
      var teamContestants = contestants.filter(c => teamMap[c] === team);
      var teamWeeklyTotal = teamContestants.reduce((sum, c) => {
        var contestantIndex = contestants.indexOf(c);
        return sum + (pointsData[contestantIndex][weekIndex] || 0);
      }, 0);
      weeklyTeamTotals[team] = teamWeeklyTotal;
    });

    // Sort teams by cumulative points (highest to lowest)
    var sortedTeams = Object.entries(teamTotals).sort((a, b) => b[1] - a[1]);

    // Assign rankings to teams
    var rankings = {};
    sortedTeams.forEach((entry, index) => {
      rankings[entry[0]] = index + 1;
    });

    // Find the top contestant for this specific week
    var weekPoints = pointsData.map(row => row[weekIndex]);
    var maxPoints = Math.max(...weekPoints);
    var topContestantIndex = weekPoints.indexOf(maxPoints);
    var topContestant = contestants[topContestantIndex];

    // Find the top team for this week based on weekly points
    var topTeamThisWeek = Object.keys(weeklyTeamTotals).reduce((a, b) => weeklyTeamTotals[a] > weeklyTeamTotals[b] ? a : b);
    var topTeamPointsThisWeek = weeklyTeamTotals[topTeamThisWeek];

    // Write results to Leaderboard sheet (column C for Week 2, D for Week 3, etc.)
    var rankColumn = weekCol + 1;

    // Write team rankings
    teams.forEach(team => {
      var teamRow = teams.indexOf(team) + 2;
      leaderboardSheet.getRange(teamRow, rankColumn).setValue(rankings[team]);
    });

    // Find rows for "Top Contestant" and "Top Team"
    var leaderboardColumnA = leaderboardSheet.getRange(1, 1, leaderboardSheet.getLastRow(), 1).getValues();
    var topContestantRow = leaderboardColumnA.findIndex(row => row[0] === "Top Contestant") + 1;
    var topTeamRow = leaderboardColumnA.findIndex(row => row[0] === "Top Team") + 1;

    // Write top contestant and top team
    if (topContestantRow > 0 && topTeamRow > 0) {
      leaderboardSheet.getRange(topContestantRow, rankColumn).setValue(`${topContestant} (${maxPoints})`);
      leaderboardSheet.getRange(topTeamRow, rankColumn).setValue(`${topTeamThisWeek} (${topTeamPointsThisWeek})`);
    }
  }

  SpreadsheetApp.getUi().alert('Retroactive update completed successfully!');
}

function updateSurvivorScores() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var episodesSheet = ss.getSheetByName("Episodes");
  var contestantsSheet = ss.getSheetByName("Contestants");
  var scoringSheet = ss.getSheetByName("Scoring");
  var leaderboardSheet = ss.getSheetByName("Leaderboard");
  var inputSheet = ss.getSheetByName("Input");

  // Find the next available week column (B to N, columns 2 to 14 for Week 2 to Week 14)
  var nextWeekColumn = -1;
  for (var col = 2; col <= 14; col++) {
    if (episodesSheet.getRange(2, col).isBlank()) {
      nextWeekColumn = col;
      break;
    }
  }
  if (nextWeekColumn == -1) {
    SpreadsheetApp.getUi().alert('All week columns (Week 2 to Week 14) are filled. Cannot add more weeks.');
    return;
  }
  var weekNumber = nextWeekColumn; // Column 2 is Week 2, Column 3 is Week 3, etc.
  var nextWeekHeader = "Week " + weekNumber;
  if (episodesSheet.getRange(1, nextWeekColumn).isBlank()) {
    episodesSheet.getRange(1, nextWeekColumn).setValue(nextWeekHeader);
  } else {
    nextWeekHeader = episodesSheet.getRange(1, nextWeekColumn).getValue();
  }

  // Build scoring map from Scoring sheet
  var scoringData = scoringSheet.getRange(2, 1, scoringSheet.getLastRow() - 1, 2).getValues();
  var scoringMap = {};
  scoringData.forEach(row => scoringMap[row[0]] = row[1]);

  // Get action headers from Input sheet
  var actionNames = inputSheet.getRange(2, 1, inputSheet.getLastRow() - 1, 1).getValues().map(row => row[0]);
  var contestantHeaders = inputSheet.getRange(1, 2, 1, inputSheet.getLastColumn() - 1).getValues()[0];

  // Calculate points per contestant for this week
  var pointsPerContestant = {};
  contestantHeaders.forEach(contestant => pointsPerContestant[contestant] = 0);
  actionNames.forEach((action, rowIndex) => {
    var points = scoringMap[action] || 0;
    contestantHeaders.forEach((contestant, colIndex) => {
      var tally = inputSheet.getRange(rowIndex + 2, colIndex + 2).getValue();
      if (typeof tally === 'number' && tally > 0) {
        pointsPerContestant[contestant] += tally * points;
      }
    });
  });

  // Update Episodes sheet
  var episodeContestants = episodesSheet.getRange(2, 1, episodesSheet.getLastRow() - 1, 1).getValues().map(row => row[0]);
  episodeContestants.forEach((contestant, index) => {
    var points = pointsPerContestant[contestant] || 0;
    episodesSheet.getRange(index + 2, nextWeekColumn).setValue(points);
  });

  // Calculate cumulative totals up to this week
  var cumulativeTotals = {};
  episodeContestants.forEach((contestant, index) => {
    var sum = 0;
    for (var col = 2; col <= nextWeekColumn; col++) {
      sum += episodesSheet.getRange(index + 2, col).getValue() || 0;
    }
    cumulativeTotals[contestant] = sum;
  });

  // Update Leaderboard with team totals and rankings
  var contestantsData = contestantsSheet.getRange(2, 1, contestantsSheet.getLastRow() - 1, 2).getValues();
  var teamMap = {};
  contestantsData.forEach(row => teamMap[row[0]] = row[1]);
  var teams = leaderboardSheet.getRange(2, 1, leaderboardSheet.getLastRow() - 1, 1).getValues()
    .map(row => row[0])
    .filter(team => team && team !== "Top Contestant" && team !== "Top Team");
  var teamTotals = {};
  teams.forEach(team => {
    var teamContestants = Object.keys(teamMap).filter(contestant => teamMap[contestant] === team);
    var teamTotal = teamContestants.reduce((sum, contestant) => sum + (cumulativeTotals[contestant] || 0), 0);
    teamTotals[team] = teamTotal;
    leaderboardSheet.getRange(teams.indexOf(team) + 2, 2).setValue(teamTotal);
  });

  // Record team rankings for this week
  var sortedTeams = Object.entries(teamTotals).sort((a, b) => b[1] - a[1]);
  var headers = leaderboardSheet.getRange(1, 1, 1, leaderboardSheet.getLastColumn()).getValues()[0];
  var weekColumnIndex = headers.indexOf(nextWeekHeader) + 1;
  if (weekColumnIndex == 0) {
    SpreadsheetApp.getUi().alert('Error: Week header not found in Leaderboard sheet.');
    return;
  }
  sortedTeams.forEach((entry, index) => {
    var team = entry[0];
    var rank = index + 1;
    var teamRow = teams.indexOf(team) + 2;
    leaderboardSheet.getRange(teamRow, weekColumnIndex).setValue(rank);
  });

  // Calculate team totals for this specific week
  var weeklyTeamTotals = {};
  teams.forEach(team => {
    var teamContestants = Object.keys(teamMap).filter(contestant => teamMap[contestant] === team);
    var teamWeeklyTotal = teamContestants.reduce((sum, contestant) => sum + (pointsPerContestant[contestant] || 0), 0);
    weeklyTeamTotals[team] = teamWeeklyTotal;
  });

  // Identify top performers
  var topContestant = Object.keys(pointsPerContestant).reduce((a, b) => pointsPerContestant[a] > pointsPerContestant[b] ? a : b);
  var topTeamThisWeek = Object.keys(weeklyTeamTotals).reduce((a, b) => weeklyTeamTotals[a] > weeklyTeamTotals[b] ? a : b);
  var topContestantPoints = pointsPerContestant[topContestant];
  var topTeamPointsThisWeek = weeklyTeamTotals[topTeamThisWeek];

  // Find rows for "Top Contestant" and "Top Team" dynamically
  var leaderboardColumnA = leaderboardSheet.getRange(1, 1, leaderboardSheet.getLastRow(), 1).getValues();
  var topContestantRow = leaderboardColumnA.findIndex(row => row[0] === "Top Contestant") + 1;
  var topTeamRow = leaderboardColumnA.findIndex(row => row[0] === "Top Team") + 1;
  if (topContestantRow == 0 || topTeamRow == 0) {
    SpreadsheetApp.getUi().alert('Error: "Top Contestant" or "Top Team" row not found in Leaderboard sheet.');
    return;
  }

  // Write top contestant and top team with consistent formatting
  leaderboardSheet.getRange(topContestantRow, weekColumnIndex).setValue(`${topContestant} (${topContestantPoints})`);
  leaderboardSheet.getRange(topTeamRow, weekColumnIndex).setValue(`${topTeamThisWeek} (${topTeamPointsThisWeek})`);

  // Clear Input sheet tallies
  var lastRow = inputSheet.getLastRow();
  var lastCol = inputSheet.getLastColumn();
  if (lastRow > 1 && lastCol > 1) {
    inputSheet.getRange(2, 2, lastRow - 1, lastCol - 1).clearContent();
  }

  SpreadsheetApp.getUi().alert('Scores updated successfully for ' + nextWeekHeader + '!\nTop Contestant (this week): ' + topContestant + ' (' + topContestantPoints + ' points)\nTop Team (this week): ' + topTeamThisWeek + ' (' + topTeamPointsThisWeek + ' points)');
}
