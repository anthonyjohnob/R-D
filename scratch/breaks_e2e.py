import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import _classic  # noqa: E402,F401
"""Outlining a detachment opens the panel on the breaks: title, Lincoff hint, break tiles first, the Lincoff zone shaded
while a break is placed, back to "Add findings" once a break is drawn, and the phone panel scrolled into view."""
import math, subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3', '-m', 'http.server', '8775', '--bind', '127.0.0.1'], cwd='dist/site', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8775/'
errs, fails = [], []
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))
    if not cond: fails.append(name)
def watch(pg, tag):
    pg.on('pageerror', lambda e: errs.append(f'{tag} PAGEERROR {e}'))
    pg.on('console', lambda m: errs.append(f'{tag} {m.type}: {m.text}') if m.type in ('error', 'warning') and 'willReadFrequently' not in m.text else None)
def chart_pt(pg, r, h):
    box = pg.evaluate("() => { const b = document.querySelector('#chart').getBoundingClientRect(); return [b.left, b.top, b.width]; }")
    a = math.radians(h * 30 - 90); x, y = r * math.cos(a), r * math.sin(a)
    return box[0] + (x + 410) / 820 * box[2], box[1] + (y + 410) / 820 * box[2]
def arc_stroke(h0, h1, rmin, n=50):
    span = (h1 - h0) % 12
    return [(312 - (312 - rmin) * math.sin(math.pi * i / n) ** 0.8, h0 + span * i / n) for i in range(n + 1)]
def trace(pg, pts):
    x, y = chart_pt(pg, *pts[0]); pg.mouse.move(x, y); pg.mouse.down()
    for q in pts[1:]: x, y = chart_pt(pg, *q); pg.mouse.move(x, y, steps=2)
    pg.mouse.up(); pg.wait_for_timeout(150)
def titles(pg): return pg.evaluate("() => [...document.querySelectorAll('#findings .f-title')].map(e => e.textContent)")
def ink_amber(pg):
    # amber pixels on the ink layer = the Lincoff zone outline
    return pg.evaluate("""() => { const c = document.querySelector('#ink'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] > 120 && d[i + 1] < 170 && d[i + 2] < 80 && d[i + 3] > 150) n++; return n; }""")
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={'width': 1360, 'height': 1000}).new_page(); watch(pg, 'desktop')
        pg.goto(URL); pg.wait_for_timeout(700)
        check('panel closed on a blank chart', pg.is_hidden('#palette'))
        trace(pg, arc_stroke(10, 2, 120))
        check('panel waits for the side to be chosen', pg.is_hidden('#palette'))
        x, y = chart_pt(pg, 250, 12); pg.mouse.click(x, y); pg.wait_for_timeout(300)
        check('detachment drawn', titles(pg) == ['RD 10 → 2 · 4 clock hours'], titles(pg))
        check('panel opens straight away', pg.is_visible('#palette') and 'min' not in (pg.get_attribute('#palette', 'class') or ''))
        check('titled “Add the breaks”', pg.text_content('#palette .pal-head strong') == 'Add the breaks')
        check('Lincoff hint in the panel', pg.is_visible('#palette .pal-lin') and 'Lincoff rule 2' in pg.text_content('#palette .pal-lin') and '10:30–1:30 first' in pg.text_content('#palette .pal-lin'), pg.text_content('#palette .pal-lin'))
        brk = pg.evaluate("() => [...document.querySelectorAll('#palette .pal-breaks .pal-tile')].map(t => t.getAttribute('aria-label'))")
        check('break tiles first', brk == ['Horseshoe tear', 'Atrophic hole', 'Operculated hole', 'Dialysis', 'Giant retinal tear'], brk)
        first = pg.evaluate("() => document.querySelector('#palette .pal-tile').getAttribute('aria-label')")
        check('the first tile is the tear', first == 'Horseshoe tear', first)
        check('chart hint points to the panel', 'add the break' in pg.inner_text('#inkHint'), pg.inner_text('#inkHint'))
        check('no zone shaded before a break is picked', ink_amber(pg) == 0)
        pg.click('#palette .pal-breaks .pal-tile[aria-label="Horseshoe tear"]'); pg.wait_for_timeout(150)
        x, y = chart_pt(pg, 262, 12.5); pg.mouse.move(x, y); pg.wait_for_timeout(200)
        zone_px = ink_amber(pg)
        check('Lincoff zone shaded while placing a break', zone_px > 200, zone_px)
        pg.locator('#stage').screenshot(path='scratch/br_armed.png')
        pg.mouse.click(x, y); pg.wait_for_timeout(300)
        check('tear placed', titles(pg) == ['RD 10 → 2 · 4 clock hours', 'Horseshoe tear · 12:30'], titles(pg))
        n_after = ink_amber(pg); check('zone cleared after placing (only the size lever left)', n_after < zone_px * 0.3, (n_after, zone_px))
        check('then “Add findings”, no Lincoff hint', pg.text_content('#palette .pal-head strong') == 'Add findings' and pg.is_hidden('#palette .pal-lin'))
        check('chart hint back to editing', 'Drag a finding' in pg.inner_text('#inkHint'), pg.inner_text('#inkHint'))
        # a non-break tile does not shade the zone
        pg.click('#palette .pal-tile[aria-label="Lattice"]'); pg.wait_for_timeout(150)
        x, y = chart_pt(pg, 250, 7); pg.mouse.move(x, y); pg.wait_for_timeout(150)
        check('lattice: no Lincoff zone', ink_amber(pg) == 0)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        # More… still opens the library search
        pg.click('#palette .pal-tile[aria-label="Other findings"]'); pg.wait_for_timeout(200)
        check('More… opens the search', pg.is_visible('#palette .pal-more input'))
        pg.click('#palette .pal-tile[aria-label="Other findings"]'); pg.wait_for_timeout(100)
        # undo the tear: back to “Add the breaks”
        pg.click('#undo'); pg.wait_for_timeout(250)
        check('undo the tear: the panel asks for breaks again', pg.text_content('#palette .pal-head strong') == 'Add the breaks')
        # with the zone already shown on the chart, the ink layer does not repeat it
        pg.click('#lincoffBtn'); pg.wait_for_timeout(200)
        pg.click('#palette .pal-breaks .pal-tile[aria-label="Atrophic hole"]'); pg.wait_for_timeout(150)
        x, y = chart_pt(pg, 250, 11); pg.mouse.move(x, y); pg.wait_for_timeout(150)
        check('zone not drawn twice when Lincoff is on', ink_amber(pg) == 0)
        pg.keyboard.press('Escape')

        # phone: the panel under the chart scrolls into view after the side is chosen
        mp = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2).new_page(); watch(mp, 'mobile')
        mp.goto(URL); mp.wait_for_timeout(700)
        mp.evaluate("() => { const b = document.querySelector('#handBtn'); if (b.getAttribute('aria-pressed') !== 'true') b.click(); }")
        mp.locator('#chart').scroll_into_view_if_needed(); mp.wait_for_timeout(300)
        trace(mp, arc_stroke(4, 8, 120))
        x, y = chart_pt(mp, 250, 6); mp.mouse.click(x, y); mp.wait_for_timeout(900)
        r = mp.evaluate("() => { const b = document.querySelector('#palette .pal-breaks').getBoundingClientRect(), c = document.querySelector('#chart').getBoundingClientRect(); return [b.top, b.bottom, c.top, c.bottom, innerHeight]; }")
        check('phone: break tiles on screen', r[0] >= 0 and r[1] <= r[4], r)
        check('phone: lower chart still on screen', r[3] > 0, r)
        check('phone: Lincoff rule 3 for an inferior RD', 'Lincoff rule 3' in mp.text_content('#palette .pal-lin'), mp.text_content('#palette .pal-lin'))
        mp.screenshot(path='scratch/br_phone.png')
        check('phone: no sideways scroll', mp.evaluate('document.documentElement.scrollWidth') <= 390)
        b.close()
finally:
    srv.terminate()
print('\n'.join(errs) or 'no console errors')
print('ALL PASS' if not fails and not errs else f'{len(fails)} FAILED')
