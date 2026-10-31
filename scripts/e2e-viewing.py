"""
End-to-end walkthrough of every Survivor night flow, as several people's phones (390px, touch).
Run before pushing any /viewing or homepage-card change. Needs the in-memory store, so it never
touches the real poll or pings anyone:

  1. a Seasons CSV with S51 Teams + Voters served locally, e.g. /tmp/csv/seasons.csv on :8765
  2. VIEWING_DEV_MEMORY=1 SEASONS_CSV_URL=http://localhost:8765/seasons.csv npx next dev -p 3123
  3. python3 scripts/e2e-viewing.py      (fresh server each run — the memory store keeps state)

Checks state on the server AND that what each tap reveals is actually on screen (not below the fold).
Dates assume Nov 6/7 2026 are inside the poll form's 5-week calendar — bump them for later runs.
"""
import json, urllib.request
from playwright.sync_api import sync_playwright
U='http://localhost:3123'
FAIL=[]; ERRS=[]
def ok(cond, msg):
    print(('PASS ' if cond else 'FAIL ')+msg)
    if not cond: FAIL.append(msg)
def api(d):
    r=urllib.request.Request(U+'/api/viewing', json.dumps(d).encode(), {'Content-Type':'application/json'})
    try: return json.load(urllib.request.urlopen(r, timeout=60))
    except urllib.error.HTTPError as e: return json.load(e)
def state(): return json.load(urllib.request.urlopen(U+'/api/viewing', timeout=60))
def in_view(pg, loc):
    loc.first.wait_for(state='visible', timeout=5000)
    pg.wait_for_timeout(600)  # let smooth scrolls finish
    r=loc.first.evaluate("e=>{const b=e.getBoundingClientRect();return [b.top,b.bottom,innerHeight]}")
    return r[0] < r[2] and r[1] > 0
with sync_playwright() as p:
    b=p.chromium.launch()
    def phone(me=None, also=None, key=None):
        ctx=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg=ctx.new_page()
        pg.on('console', lambda m: m.type=='error' and ERRS.append(f'{me}: {m.text[:160]}'))
        pg.on('pageerror', lambda e: ERRS.append(f'{me}: PAGEERROR {e}'))
        pg.on('dialog', lambda d: d.accept())
        pg.goto(U+'/')
        if me: pg.evaluate(f"localStorage.setItem('survivor-viewer', JSON.stringify({{me:'{me}',also:{json.dumps(also or [])}}}))")
        if key: pg.evaluate(f"localStorage.setItem('survivor-commish-key','{key}')")
        return pg

    # ── A. Karina starts a poll from a fresh phone through the form
    k=phone()
    k.goto(U+'/viewing'); k.wait_for_timeout(1500)
    k.get_by_role('button', name='Start a poll').tap(); k.wait_for_timeout(500)
    k.get_by_role('button', name='Karina').first.tap(); k.wait_for_timeout(300)
    if k.get_by_role('button', name='Just me').count(): k.get_by_role('button', name='Just me').tap()
    k.get_by_role('button', name='Fri, Nov 6').tap(); k.get_by_role('button', name='Sat, Nov 7').tap()
    k.wait_for_timeout(300)
    k.locator('select[aria-label="Fri, Nov 6 time 1"]').select_option('18:30')
    k.locator('select[aria-label="Sat, Nov 7 time 1"]').select_option('13:00')
    k.get_by_role('button', name='+ time').last.tap()
    k.locator('select[aria-label="Sat, Nov 7 time 2"]').select_option('18:00')
    k.get_by_role('button', name='Start the poll').tap(); k.wait_for_timeout(1500)
    st=state(); ok(st['viewing'] and st['viewing']['status']=='polling' and len(st['viewing']['options'])==3, 'A start poll via form → 3 options')
    ok(in_view(k, k.get_by_text('The poll is live')), 'A flash visible after starting')
    # Karina votes through the UI
    cards=k.locator('section.opt')
    for i,a in enumerate(['Yes','Yes','Maybe']):
        cards.nth(i).get_by_role('button', name=a, exact=True).tap(); k.wait_for_timeout(700)
    k.get_by_role('button', name='Done — see results').tap(); k.wait_for_timeout(800)
    ok(in_view(k, k.get_by_text('Thanks, Karina')), 'A results visible after Done')
    k.get_by_role('button', name='Change my votes').tap(); k.wait_for_timeout(500)
    ok(in_view(k, k.get_by_text('Pick a night for the next')), 'A change my votes returns to the poll (top)')
    ids={ (o['date'],o['time']):o['id'] for o in state()['viewing']['options']}
    fri,s1,s6=ids[('2026-11-06','18:30')],ids[('2026-11-07','13:00')],ids[('2026-11-07','18:00')]

    # ── B. Kenny (phone also votes for Lena) sees the poll, votes through UI
    kn=phone('Kenny',['Lena'])
    kn.goto(U+'/viewing'); kn.wait_for_timeout(1500)
    cards=kn.locator('section.opt')
    for i,a in enumerate(['Maybe','Maybe','Yes']):
        cards.nth(i).get_by_role('button', name=a, exact=True).tap(); kn.wait_for_timeout(700)
    v=state()['votes']; ok(any(x['person']=='Lena' and x['cast_by']=='Kenny' for x in v), 'B proxy vote for Lena saved')
    # Lena votes on her own phone (beats Kenny's proxy)
    for oid,a in [(fri,'y'),(s1,'n'),(s6,'y')]: api({'action':'vote','me':'Lena','as':['Lena'],'option_id':oid,'answer':a})
    api({'action':'vote','me':'Will','as':['Will'],'option_ids':[fri,s1,s6],'answer':'y'})
    kn.goto(U+'/'); kn.wait_for_timeout(1500)
    ok(kn.locator('a[href="/viewing"]', has_text='See results').count()==1, 'B homepage button = See results after voting')
    # remaining voters: Tony No all, Megan Sat6 only, Jake none-no, Kathleen no → tie Fri vs Sat6 at 3 teams, everyone voted
    api({'action':'vote','me':'Tony','as':['Tony'],'option_ids':[fri,s1,s6],'answer':'n'})
    api({'action':'vote','me':'Jake','as':['Jake'],'option_ids':[fri,s1,s6],'answer':'n'})
    api({'action':'vote','me':'Kathleen','as':['Kathleen'],'option_ids':[fri,s1,s6],'answer':'n'})
    api({'action':'vote','me':'Megan','as':['Megan'],'option_ids':[fri,s1],'answer':'n'})
    st=api({'action':'vote','me':'Megan','as':['Megan'],'option_id':s6,'answer':'y'})
    ok(st['viewing']['status']=='closed', 'C everyone voted + tie → closed (no auto-lock)')

    # ── C. pick step
    kn.goto(U+'/viewing'); kn.wait_for_timeout(1500)
    ok(in_view(kn, kn.get_by_text('Karina picks the night')), 'C Kenny (no key) sees "Karina picks the night"')
    ok(kn.get_by_role('button', name='Pick Fri').count()==0, 'C Kenny (no key) has no Pick buttons')
    k.goto(U+'/viewing'); k.wait_for_timeout(1500)
    ok(in_view(k, k.get_by_text('Pick the night')), 'C Karina sees "Pick the night"')
    ok(k.get_by_role('button', name='Pick Fri 6:30 PM').count()==1 and k.get_by_role('button', name='Pick Sat 6:00 PM').count()==1, 'C Karina has Pick buttons on both tied nights')
    k.get_by_role('button', name='Pick Fri 6:30 PM').tap(); k.wait_for_timeout(1500)
    st=state(); ok(st['viewing']['status']=='locked' and st['viewing']['locked_by']=='Karina', 'C Karina picked → locked')
    ok(in_view(k, k.get_by_text('Set: Fri, Nov 6')), 'C flash visible after pick')

    # ── D. set night as Kenny
    kn.goto(U+'/viewing'); kn.wait_for_timeout(1500)
    ok(kn.get_by_text('teams said Yes').count()==1, 'D reason line shown')
    kn.get_by_role('button', name='See the votes').tap()
    ok(in_view(kn, kn.locator('[aria-label="How everyone voted"]')), 'D See the votes → votes box visible on screen')
    kn.locator('[aria-label="How everyone voted"] button.trow').first.tap(); kn.wait_for_timeout(300)
    ok(in_view(kn, kn.locator('[aria-label="How everyone voted"] .tray')), 'D tapping a night shows who said what')
    kn.get_by_role('button', name='Hide the votes').tap(); kn.wait_for_timeout(300)
    ok(kn.locator('[aria-label="How everyone voted"]').count()==0, 'D Hide the votes closes it')
    box=kn.locator('.box', has_text='coming from this phone')
    ok(box.count()==1, 'D two-person phone sees "Who’s coming from this phone?"')
    kn.evaluate("localStorage.setItem('survivor-viewer', JSON.stringify({me:'Kenny',also:[]}))"); kn.reload(); kn.wait_for_timeout(1500)
    ok(kn.get_by_text('Are you coming?').count()>=1, 'D Kenny (said Maybe) asked "Are you coming?"')
    kn.get_by_role('button', name='I’m in').tap(); kn.wait_for_timeout(1500)
    ok(in_view(kn, kn.get_by_text('You’re in ✓')), 'D after I’m in → "You’re in ✓" visible')
    cls=kn.get_by_role('button', name='I’m in').get_attribute('class'); ok(cls=='in', f'D I’m in styled as selected (class={cls})')
    kn.locator('a[aria-label="Home"]').tap(); kn.wait_for_timeout(2000)
    ok(kn.locator('a[href="/viewing"]', has_text='You’re in ✓ · Details').count()==1, 'D homepage shows "You’re in ✓ · Details" after going Home')
    kn.go_back(); kn.wait_for_timeout(1500)
    kn.get_by_role('button', name='Can’t make it').tap(); kn.wait_for_timeout(1500)
    ok(in_view(kn, kn.get_by_text('You can’t make it')), 'D Can’t make it → title updates')
    kn.go_back(); kn.wait_for_timeout(1500)
    ok(kn.locator('a[href="/viewing"]', has_text='You can’t make it · Details').count()==1, 'D homepage (back gesture) shows the new answer')
    kn.go_forward(); kn.wait_for_timeout(1200)
    kn.get_by_role('button', name='I’m in').tap(); kn.wait_for_timeout(1200)
    # where + time + move
    kn.get_by_role('button', name='Kenny & Lena’s').tap(); kn.wait_for_timeout(1200)
    ok(state()['viewing']['place']=='Kenny & Lena’s', 'D set where')
    k.goto(U+'/viewing'); k.wait_for_timeout(1500)
    k.get_by_role('button', name='Change date or time').tap(); k.wait_for_timeout(400)
    ok(in_view(k, k.get_by_text('Move it').first), 'D Move it box visible')
    k.locator('.box input[type=date]').fill('2026-11-07'); k.get_by_role('button', name='Move it', exact=True).tap(); k.wait_for_timeout(1500)
    ok(state()['viewing']['lock_date']=='2026-11-07', 'D moved to Nov 7')
    ok(in_view(k, k.get_by_text('Moved to Sat, Nov 7')), 'D move flash visible')
    k.get_by_role('button', name='Add to calendar').tap(); k.wait_for_timeout(400)
    ok(in_view(k, k.get_by_text('Subscribe once').first) or in_view(k, k.get_by_text('subscribed').first), 'D Add to calendar box visible')
    # cancel → idle
    k.get_by_role('button', name='Cancel this Survivor night').tap(); k.wait_for_timeout(1500)
    ok(state()['viewing'] is None, 'E cancel → nothing planned')
    ok(in_view(k, k.get_by_text('Nothing on the calendar')), 'E idle screen visible')
    # We already picked a date
    k.get_by_role('button', name='We already picked a date').tap(); k.wait_for_timeout(500)
    k.get_by_role('button', name='Set it').tap(); k.wait_for_timeout(1500)
    st=state(); ok(st['viewing'] and st['viewing']['status']=='locked' and st['viewing']['locked_by']=='Karina', 'E add date directly → set')
    ok(k.get_by_role('button', name='See the votes').count()==0, 'E no See the votes for a night with no poll')
    kn.goto(U+'/'); kn.wait_for_timeout(1500)
    ok(kn.locator('a[href="/viewing"]', has_text='You’re in ✓').count()==1, 'E homepage: directly-set night starts everyone as in')
    print('\nconsole errors:', ERRS or 'none')
    print('FAILED:', FAIL or 'none')
    b.close()
