import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import _classic  # noqa: E402,F401
"""Scleral buckle guide on the served website: hidden until there is a detachment, gated with the repair options,
tabs, Show on chart (preview only), Add to drawing + Undo, the element library, citations, a teaching-review round trip
carrying buckle elements, and the phone layout in dark mode."""
import subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3', '-m', 'http.server', '8773', '--bind', '127.0.0.1'], cwd='dist/site', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8773/'
errs, fails = [], []
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))
    if not cond: fails.append(name)
def watch(pg, tag):
    pg.on('pageerror', lambda e: errs.append(f'{tag} PAGEERROR {e}'))
    pg.on('console', lambda m: errs.append(f'{tag} {m.type}: {m.text}') if m.type in ('error', 'warning') else None)
def cmd(pg, t): pg.fill('#cmd', t); pg.press('#cmd', 'Enter'); pg.wait_for_timeout(250)
def titles(pg): return pg.evaluate("() => [...document.querySelectorAll('#findings .f-title')].map(e => e.textContent)")
def bk_titles(pg): return pg.evaluate("() => [...document.querySelectorAll('#buckle .bk-title')].map(e => e.textContent)")
def tabs(pg): return pg.evaluate("() => [...document.querySelectorAll('#buckle .bk-tabs button')].map(e => e.textContent + (e.getAttribute('aria-selected') === 'true' ? '*' : ''))")
def chart(pg): return pg.evaluate("() => document.querySelector('#chart').toDataURL()")
def note(pg): return pg.text_content('#note')
def hand_off(pg): pg.evaluate("() => { const b = document.querySelector('#handBtn'); if (b && b.getAttribute('aria-pressed') === 'true') b.click(); }")
SP = 'scratch/'
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={'width': 1360, 'height': 1000}).new_page(); watch(pg, 'desktop')
        pg.goto(URL); pg.wait_for_timeout(800)
        check('no detachment: guide hidden', pg.is_hidden('#buckleCard'))
        cmd(pg, 'left eye'); hand_off(pg)
        cmd(pg, 'macula on RRD 10 to 2 with a horseshoe tear at 12, phakic, no PVD')
        check('detachment: guide shown', pg.is_visible('#buckleCard'))
        check('gated until the repair options are opened', 'Open the surgical options' in pg.text_content('#buckle') and not bk_titles(pg))
        pg.click('.rep-gate button'); pg.wait_for_timeout(250)
        check('single tear: radial element', bk_titles(pg) == ['Radial segmental element under the tear'], bk_titles(pg))
        check('both tabs offered', [t.rstrip('*') for t in tabs(pg)] == ['Buckle alone', 'Vitrectomy + buckle'], tabs(pg))
        steps = pg.evaluate("() => [...document.querySelectorAll('#buckle .bk-step h3')].map(e => e.textContent)")
        check('four steps', steps == ['1Configuration', '2Elements', '3Placement and sutures', '4What to expect'], steps)
        lv = pg.evaluate("() => [...new Set([...document.querySelectorAll('#buckle .bk-step .lv')].map(e => e.textContent))]")
        check('evidence levels tagged', 'Lab / geometric model' in lv and 'Expert technique' in lv and 'Case series' in lv, lv)
        # citations: every number links somewhere real and appears in the sources list
        links = pg.evaluate("() => [...document.querySelectorAll('#buckle .bk-step .rep-refs a')].map(a => [a.textContent, a.href])")
        check('citations link to DOI, PubMed or the source page', links and all(h.startswith('https://') for _, h in links), links[:3])
        nums = sorted({int(t) for t, _ in links})
        nsrc = pg.evaluate("() => document.querySelectorAll('#buckle .rep-reflist li').length")
        check('sources list numbered to match', nums == list(range(1, len(nums) + 1)) and nsrc >= len(nums), f'{nums[-1]} cited, {nsrc} listed')
        pg.locator('#buckleCard').screenshot(path=SP + 'bke_radial_card.png')

        # Show on chart: a preview only
        base = chart(pg)
        n0 = len(titles(pg))
        pg.click('#buckle button:has-text("Show on chart")'); pg.wait_for_timeout(250)
        check('preview drawn', chart(pg) != base)
        check('preview not added to the findings', len(titles(pg)) == n0)
        check('button turns into Hide', pg.locator('#buckle .bk-actions button[aria-pressed="true"]').text_content() == 'Hide from chart')
        pg.locator('#chart').screenshot(path=SP + 'bke_radial_preview.png')
        pg.click('#buckle button:has-text("Hide from chart")'); pg.wait_for_timeout(250)
        check('Hide restores the chart', chart(pg) == base)
        pg.click('#buckle button:has-text("Show on chart")'); pg.wait_for_timeout(200)
        cmd(pg, 'lattice from 7 to 8')
        check('a new command ends the preview', pg.locator('#buckle .bk-actions button[aria-pressed="true"]').count() == 0 and not any('buckle' in t.lower() for t in titles(pg)), titles(pg))
        pg.click('#undo'); pg.wait_for_timeout(200)

        # Add to drawing, then Undo
        pg.click('#buckle button:has-text("Add to drawing")'); pg.wait_for_timeout(250)
        check('Add puts the element in the findings', any(t.startswith('Radial buckle element · 12') for t in titles(pg)), titles(pg))
        check('note mentions the element', 'Radial scleral buckle element at 12 o’clock' in note(pg), note(pg)[:300])
        check('a drawn buckle does not change the plan', bk_titles(pg) == ['Radial segmental element under the tear'])
        pg.click('#undo'); pg.wait_for_timeout(250)
        check('Undo removes it', not any('buckle' in t.lower() for t in titles(pg)), titles(pg))

        # PPV + band tab
        pg.click('#buckle .bk-tabs button:has-text("Vitrectomy + buckle")'); pg.wait_for_timeout(200)
        check('PPV tab: band plan', bk_titles(pg) == ['Vitrectomy with a 360° encircling band'], bk_titles(pg))
        subs = pg.evaluate("() => [...document.querySelectorAll('#buckle .bk-sub')].map(e => e.textContent)")
        check('PPV tab: for and against', 'Evidence for adding the band' in subs and 'Against, or no benefit shown' in subs, subs)
        check('PPV tab: VIPER and Cochrane shown', 'VIPER' in pg.text_content('#buckle') and '6 RCTs' in pg.text_content('#buckle'))
        pg.locator('#buckleCard').screenshot(path=SP + 'bke_ppv_card.png')

        # element library
        pg.click('#buckle .bk-lib summary'); pg.wait_for_timeout(150)
        nel = pg.evaluate("() => document.querySelectorAll('#buckle .bk-els li').length")
        nsvg = pg.evaluate("() => document.querySelectorAll('#buckle .bk-els li .bk-svg svg').length")
        check('library lists the elements with drawings', nel >= 12 and nsvg == nel, f'{nel} elements, {nsvg} drawings')
        pg.locator('#buckle .bk-lib').screenshot(path=SP + 'bke_library.png')

        # encircling plan, added and sent for review
        pg.click('#clear'); pg.wait_for_timeout(200)
        if pg.is_visible('.clear-ask button:has-text("Clear")'): pg.click('.clear-ask button:has-text("Clear")'); pg.wait_for_timeout(200)
        check('Clear hides the guide', pg.is_hidden('#buckleCard'))
        cmd(pg, 'left eye'); hand_off(pg)
        cmd(pg, 'RRD 8 to 4 macula off, tears at 9, 12 and 3, phakic, partial PVD')
        pg.click('#buckle .bk-tabs button:has-text("Buckle alone")'); pg.wait_for_timeout(200)
        check('three spread tears: encircle', bk_titles(pg) == ['Encircling band, with a segment under the breaks'], bk_titles(pg))
        pg.click('#buckle button:has-text("Show on chart")'); pg.wait_for_timeout(250)
        pg.locator('#chart').screenshot(path=SP + 'bke_encircle_preview.png')
        pg.click('#buckle button:has-text("Add to drawing")'); pg.wait_for_timeout(250)
        bt = [t for t in titles(pg) if 'band' in t.lower()]
        check('band and three tires added', len(bt) == 4 and bt[0] == 'Encircling band · 240' and all(t.endswith('· 287') for t in bt[1:]), bt)
        pg.click('#review button:has-text("Send for review")'); pg.wait_for_timeout(400); link = pg.input_value('.rv-link')
        fp = b.new_context(viewport={'width': 1360, 'height': 1000}).new_page(); watch(fp, 'fellow')
        fp.goto(link); fp.wait_for_timeout(900)
        ft = [t for t in titles(fp) if 'band' in t.lower()]
        check('reviewer sees the elements', ft == bt, ft)
        fp.close()

        # giant tear, pseudophakic: buckle alone not offered
        pg.goto(URL); pg.wait_for_timeout(600)
        pg.click('#clear'); pg.wait_for_timeout(150)
        if pg.is_visible('.clear-ask button:has-text("Clear")'): pg.click('.clear-ask button:has-text("Clear")'); pg.wait_for_timeout(200)
        cmd(pg, 'left eye'); hand_off(pg)
        cmd(pg, 'RRD 12 to 6 macula off, giant retinal tear from 1 to 4, pseudophakic')
        check('giant tear: no tabs, vitrectomy plan only', not tabs(pg) and bk_titles(pg) == ['Vitrectomy with a 360° encircling band'], (tabs(pg), bk_titles(pg)))

        # phone, dark mode
        mp = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2, color_scheme='dark').new_page(); watch(mp, 'mobile')
        mp.goto(URL); mp.wait_for_timeout(800)
        cmd(mp, 'left eye'); hand_off(mp)
        cmd(mp, 'RRD 3 to 7, dialysis 4 to 5, phakic, no PVD')
        if mp.is_visible('.rep-gate button'): mp.click('.rep-gate button'); mp.wait_for_timeout(250)
        check('phone: dialysis plan', bk_titles(mp) == ['Circumferential segmental buckle along the dialysis'], bk_titles(mp))
        mp.click('#buckle .bk-lib summary'); mp.wait_for_timeout(150)
        mp.locator('#buckleCard').scroll_into_view_if_needed(); mp.wait_for_timeout(150)
        mp.locator('#buckleCard').screenshot(path=SP + 'bke_phone_dark.png')
        check('phone: no sideways scroll', mp.evaluate('document.documentElement.scrollWidth') <= 390, mp.evaluate('document.documentElement.scrollWidth'))
        b.close()
finally:
    srv.terminate()
print('\n'.join(errs) or 'no console errors')
print('ALL PASS' if not fails and not errs else f'{len(fails)} FAILED')
