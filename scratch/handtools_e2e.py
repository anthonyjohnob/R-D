"""Resizing spot findings by hand, tracing laser, and versions: the update list, the note on the first load of a
new version, and the bar offered when a newer version is published while the page is open."""
import json, math, subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3', '-m', 'http.server', '8777', '--bind', '127.0.0.1'], cwd='dist/site', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8777/'
VER = json.load(open('dist/site/version.json'))['version']
errs, fails = [], []
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))
    if not cond: fails.append(name)
def watch(pg, tag):
    pg.on('pageerror', lambda e: errs.append(f'{tag} PAGEERROR {e}'))
    pg.on('console', lambda m: errs.append(f'{tag} {m.type}: {m.text}') if m.type in ('error', 'warning') else None)
def chart_pt(pg, r, h):
    box = pg.evaluate("() => { const b = document.querySelector('#chart').getBoundingClientRect(); return [b.left, b.top, b.width]; }")
    a = math.radians(h * 30 - 90); x, y = r * math.cos(a), r * math.sin(a)
    return box[0] + (x + 410) / 820 * box[2], box[1] + (y + 410) / 820 * box[2]
def xy(pg, x, y):
    box = pg.evaluate("() => { const b = document.querySelector('#chart').getBoundingClientRect(); return [b.left, b.top, b.width]; }")
    return box[0] + (x + 410) / 820 * box[2], box[1] + (y + 410) / 820 * box[2]
def arc_stroke(h0, h1, rmin, n=50):
    span = (h1 - h0) % 12
    return [(312 - (312 - rmin) * math.sin(math.pi * i / n) ** 0.8, h0 + span * i / n) for i in range(n + 1)]
def path(pg, pts, steps=2):
    x, y = chart_pt(pg, *pts[0]); pg.mouse.move(x, y); pg.mouse.down()
    for q in pts[1:]: x, y = chart_pt(pg, *q); pg.mouse.move(x, y, steps=steps)
    pg.mouse.up(); pg.wait_for_timeout(200)
def titles(pg): return pg.evaluate("() => [...document.querySelectorAll('#findings .f-title')].map(e => e.textContent)")
def scene(pg): return pg.evaluate("() => JSON.parse(localStorage.getItem('rdraw.scene.v2'))")
def lever(pg):
    """the size lever drawn for the selected finding (chart units), published by hand.js for checks"""
    return pg.evaluate("() => window.RDHand.lever")
def drag_handle(pg, typ, factor, shot=None):
    """slide the lever knob: factor 1 keeps the size, >1 moves it up (larger), <1 down (smaller)"""
    L = lever(pg)
    f = [f for f in scene(pg)['findings'] if f['type'] == typ][-1]
    s0 = f.get('size', 1)
    yk = lambda sz: L['y1'] - (min(max(sz, L['min']), L['max']) - L['min']) / (L['max'] - L['min']) * (L['y1'] - L['y0'])
    kx, ky = xy(pg, L['x'], yk(s0)); tx, ty = xy(pg, L['x'], yk(s0 * factor))
    pg.mouse.move(kx, ky); pg.mouse.down(); pg.mouse.move(tx, ty, steps=10); pg.wait_for_timeout(120)
    if shot: pg.locator('#stage').screenshot(path=shot)
    pg.mouse.up(); pg.wait_for_timeout(250)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        # ---------------- versions ----------------
        ctx = b.new_context(viewport={'width': 1360, 'height': 1000}); pg = ctx.new_page(); watch(pg, 'first')
        pg.goto(URL); pg.wait_for_timeout(700)
        check('version shown by the logo', pg.text_content('#verLink') == f'v{VER}', pg.text_content('#verLink'))
        check('first visit: no update note', pg.is_hidden('#whatsNew'))
        check('first visit: version remembered', pg.evaluate("() => JSON.parse(localStorage.getItem('rdraw.seenVersion'))") == VER)
        pg.click('#verLink'); pg.wait_for_timeout(500)
        vs = pg.evaluate("() => [...document.querySelectorAll('#updatesList > li .up-h')].map(e => e.innerText.replace(/\\n/g, ' | '))")
        check('update list opens from the version link', pg.evaluate("() => document.querySelector('#updates').open") and len(vs) >= 6, vs)
        check('newest first, with a date', vs[0].startswith(f'Version {VER}') and '2026' in vs[0] and vs[-1].startswith('Version 1.0'), vs)
        pg.locator('#updates').screenshot(path='scratch/ht_updates.png')
        pg.reload(); pg.wait_for_timeout(700)
        check('same version on reload: no note', pg.is_hidden('#whatsNew'))
        ctx.close()
        # someone who used R/D before version notes existed
        ctx = b.new_context(viewport={'width': 1360, 'height': 1000})
        ctx.add_init_script("if (!sessionStorage.getItem('seeded')) { localStorage.setItem('rdraw.prefs', JSON.stringify({ eye: 'OD' })); sessionStorage.setItem('seeded', '1'); }")
        pg = ctx.new_page(); watch(pg, 'legacy')
        pg.goto(URL); pg.wait_for_timeout(700)
        check('earlier user: update note shown', pg.is_visible('#whatsNew') and f'version {VER}' in pg.text_content('#whatsNew h2'), pg.text_content('#whatsNew') if pg.is_visible('#whatsNew') else '')
        n_items = pg.evaluate("() => document.querySelectorAll('#whatsNew .wn-list li').length")
        n_new = pg.evaluate("() => RDChangelog.CHANGELOG[0].items.length")
        check('note lists only what is new', n_items == n_new, (n_items, n_new))
        pg.screenshot(path='scratch/ht_whatsnew.png', clip={'x': 0, 'y': 0, 'width': 1360, 'height': 520})
        pg.click('#whatsNew button:has-text("Got it")'); pg.wait_for_timeout(150)
        check('Got it closes the note', pg.is_hidden('#whatsNew'))
        pg.reload(); pg.wait_for_timeout(700)
        check('shown once: not on the next load', pg.is_hidden('#whatsNew'))
        ctx.close()
        # someone on 1.1: everything since, labelled by version
        ctx = b.new_context(viewport={'width': 1360, 'height': 1000})
        ctx.add_init_script("if (!sessionStorage.getItem('seeded')) { localStorage.setItem('rdraw.seenVersion', JSON.stringify('1.1')); sessionStorage.setItem('seeded', '1'); }")
        pg = ctx.new_page(); watch(pg, 'v1.1')
        pg.goto(URL); pg.wait_for_timeout(700)
        labels = pg.evaluate("() => [...document.querySelectorAll('#whatsNew .wn-list li strong')].map(e => e.textContent)")
        check('from 1.1: items labelled by version', labels[:1] == [f'{VER}: '] and '1.1.1: ' in labels and '1.1: ' not in labels, labels)
        pg.click('#whatsNew button:has-text("All updates")'); pg.wait_for_timeout(400)
        check('All updates opens the list', pg.evaluate("() => document.querySelector('#updates').open"))
        ctx.close()
        # a newer version published while the page is open
        ctx = b.new_context(viewport={'width': 1360, 'height': 1000}); pg = ctx.new_page(); watch(pg, 'newer')
        pg.route('**/version.json*', lambda route: route.fulfill(status=200, content_type='application/json', body=json.dumps({'version': '1.99', 'date': '2026-12-01'})))
        pg.goto(URL); pg.wait_for_timeout(5000)
        check('newer version offered', pg.is_visible('#updateBar') and 'Version 1.99' in pg.text_content('#updateBar'), pg.text_content('#updateBar'))
        pg.screenshot(path='scratch/ht_updatebar.png', clip={'x': 300, 'y': 860, 'width': 760, 'height': 140})
        pg.click('#updateBar .ub-x'); pg.wait_for_timeout(150)
        check('Not now hides it', pg.is_hidden('#updateBar'))
        ctx.close()
        ctx = b.new_context(viewport={'width': 1360, 'height': 1000}); pg = ctx.new_page(); watch(pg, 'same')
        pg.goto(URL); pg.wait_for_timeout(5000)
        check('same version live: no bar', pg.is_hidden('#updateBar'))

        # ---------------- a locked detachment; Redraw / Add ----------------
        path(pg, arc_stroke(10, 2, 120))
        x, y = chart_pt(pg, 250, 12); pg.mouse.click(x, y); pg.wait_for_timeout(300)
        check('Redraw / Add buttons appear with a detachment', pg.is_visible('.rd-bar'))
        path(pg, arc_stroke(6.5, 9.5, 130))
        check('a stray drag does not draw a new detachment', titles(pg) == ['RD 10 → 2 · 4 clock hours'], titles(pg))
        check('and says why', 'locked' in pg.inner_text('#inkHint'), pg.inner_text('#inkHint'))
        pg.click('.rd-btn:has-text("Add detachment")'); pg.wait_for_timeout(120)
        check('Add detachment arms one trace', pg.get_attribute('.rd-btn:has-text("Add detachment")', 'aria-pressed') == 'true' and 'next detachment' in pg.inner_text('#inkHint'))
        path(pg, arc_stroke(6.5, 9.5, 130)); x, y = chart_pt(pg, 260, 8); pg.mouse.click(x, y); pg.wait_for_timeout(300)
        check('a second detachment is added', len([t for t in titles(pg) if t.startswith('RD')]) == 2, titles(pg))
        check('then locked again', pg.get_attribute('.rd-btn:has-text("Add detachment")', 'aria-pressed') == 'false')
        pg.click('.rd-btn:has-text("Redraw")'); pg.wait_for_timeout(120)
        pg.click('.rd-btn:has-text("Redraw")'); pg.wait_for_timeout(120)
        check('pressing Redraw again cancels', pg.get_attribute('.rd-btn:has-text("Redraw")', 'aria-pressed') == 'false')
        pg.click('.rd-btn:has-text("Redraw")'); pg.wait_for_timeout(120)
        path(pg, arc_stroke(10, 2, 120)); x, y = chart_pt(pg, 250, 12); pg.mouse.click(x, y); pg.wait_for_timeout(300)
        check('Redraw replaces every detachment', [t for t in titles(pg) if t.startswith('RD')] == ['RD 10 → 2 · 4 clock hours'], titles(pg))
        pg.click('#undo'); pg.wait_for_timeout(200)
        check('undo brings back both', len([t for t in titles(pg) if t.startswith('RD')]) == 2, titles(pg))
        pg.click('#clear'); pg.wait_for_timeout(200)
        check('Clear unlocks a fresh trace', pg.is_hidden('.rd-bar'))

        # ---------------- resizing ----------------
        path(pg, arc_stroke(10, 2, 120))
        x, y = chart_pt(pg, 250, 12); pg.mouse.click(x, y); pg.wait_for_timeout(300)
        pg.click('#palette .pal-breaks .pal-tile[aria-label="Horseshoe tear"]'); pg.wait_for_timeout(100)
        x, y = chart_pt(pg, 262, 12.5); pg.mouse.click(x, y); pg.wait_for_timeout(300)
        check('tear placed and selected', 'Horseshoe tear · 12:30' in titles(pg), titles(pg))
        check('a selected tear shows its size lever', lever(pg) is not None)
        drag_handle(pg, 'hst', 1.8, 'scratch/ht_resize.png')
        hst = [f for f in scene(pg)['findings'] if f['type'] == 'hst'][0]
        check('sliding the lever up enlarges the tear', 1.25 <= hst.get('size', 1) <= 2.5 and 'Large horseshoe tear · 12:30' in titles(pg), (hst.get('size'), titles(pg)))
        check('the note says large', 'Large horseshoe tear at 12:30 o’clock' in pg.text_content('#note'))
        pg.click('#undo'); pg.wait_for_timeout(200)
        check('undo restores the size', 'Horseshoe tear · 12:30' in titles(pg), titles(pg))
        x, y = chart_pt(pg, 262, 12.5); pg.mouse.click(x, y); pg.wait_for_timeout(200)     # select it again
        drag_handle(pg, 'hst', 0.35)
        check('sliding down makes it small', 'Small horseshoe tear · 12:30' in titles(pg), titles(pg))
        drag_handle(pg, 'hst', 0.05)
        check('never smaller than half', [f for f in scene(pg)['findings'] if f['type'] == 'hst'][0].get('size', 1) >= 0.5)
        # a hole
        pg.click('#palette .pal-breaks .pal-tile[aria-label="Atrophic hole"]'); pg.wait_for_timeout(100)
        x, y = chart_pt(pg, 255, 1.5); pg.mouse.click(x, y); pg.wait_for_timeout(250)
        drag_handle(pg, 'hole', 2.2)
        check('hole enlarged', any(t.startswith('Large atrophic hole') for t in titles(pg)), titles(pg))
        # vitreous haemorrhage
        pg.click('#palette .pal-tile[aria-label="Vitreous haemorrhage"]'); pg.wait_for_timeout(100)
        x, y = chart_pt(pg, 200, 6); pg.mouse.click(x, y); pg.wait_for_timeout(250)
        drag_handle(pg, 'vh', 1.5)
        vh = [f for f in scene(pg)['findings'] if f['type'] == 'vh'][0]
        check('VH resized', vh.get('size', 1) > 1.2, vh.get('size'))

        # ---------------- laser ----------------
        n0 = len(titles(pg))
        pg.click('#palette .pal-tile[aria-label="Laser"]'); pg.wait_for_timeout(100)
        check('laser hint mentions tracing', 'trace' in pg.inner_text('#inkHint'), pg.inner_text('#inkHint'))
        check('laser pattern options appear', pg.is_visible('#palette .pal-laser') and pg.is_visible('#palette .pal-laser .seg[aria-label="Rows"]'))
        pressed = lambda grp: pg.evaluate(f"() => [...document.querySelectorAll('#palette .pal-laser .seg[aria-label=\"{grp}\"] button[aria-pressed=\"true\"]')].map(b => b.textContent)")
        check('default: 3 rows, spaced ½', pressed('Rows') == ['3'] and pressed('Burns') == ['Spaced'] and pressed('Gap') == ['½'], (pressed('Rows'), pressed('Burns'), pressed('Gap')))
        pg.click('#palette .pal-laser .seg[aria-label="Rows"] button:has-text("2")'); pg.wait_for_timeout(80)
        pg.click('#palette .pal-laser button:has-text("Confluent")'); pg.wait_for_timeout(80)
        check('confluent hides the gap choice', pg.locator('#palette .pal-laser .seg[aria-label="Gap"]').count() == 0)
        check('pattern described', '2 rows, confluent' in pg.text_content('#palette .pal-laser .pal-note'), pg.text_content('#palette .pal-laser .pal-note'))
        x0, y0 = chart_pt(pg, 230, 9.5); pg.mouse.move(x0, y0); pg.mouse.down()
        for i in range(1, 41):
            x, y = chart_pt(pg, 230 + 25 * math.sin(i / 40 * math.pi), 9.5 + i * 0.05); pg.mouse.move(x, y, steps=2)
        pg.wait_for_timeout(80); pg.locator('#stage').screenshot(path='scratch/ht_laser_tracing.png')
        pg.mouse.up(); pg.wait_for_timeout(250)
        lt = [t for t in titles(pg) if t.startswith('Laser line')]
        check('traced laser added', len(lt) == 1 and len(titles(pg)) == n0 + 1 and lt[0].endswith('· 2 rows'), titles(pg))
        lf = [f for f in scene(pg)['findings'] if f['type'] == 'laser' and f.get('line')][0]
        check('line carries the pattern', lf.get('rows') == 2 and lf.get('gap') == 0, (lf.get('rows'), lf.get('gap')))
        check('laser stays picked for more', pg.is_visible('#palette .pal-laser') and 'Done' in pg.inner_text('#inkHint'), pg.inner_text('#inkHint'))
        check('line follows the trace', len(lf['line']) > 10 and all(abs(math.hypot(*q) - 240) < 30 for q in lf['line']), len(lf['line']))
        check('note: drawn line and its pattern', 'along a drawn line from' in pg.text_content('#note') and '(2 rows, confluent)' in pg.text_content('#note'), pg.text_content('#note')[-200:])
        pg.locator('#stage').screenshot(path='scratch/ht_laser.png')
        # still on laser: 4 rows, 1 burn width apart, then tap a break to laser around it
        pg.click('#palette .pal-laser .seg[aria-label="Rows"] button:has-text("4")'); pg.click('#palette .pal-laser button:has-text("Spaced")'); pg.wait_for_timeout(60)
        pg.click('#palette .pal-laser .seg[aria-label="Gap"] button:text-is("1")'); pg.wait_for_timeout(80)
        x, y = chart_pt(pg, 255, 1.5); pg.mouse.click(x, y); pg.wait_for_timeout(250)
        check('tap on a break lasers around it, in the pattern', 'Laser around a break · 4 rows' in titles(pg), titles(pg))
        check('note gives the pattern', '(4 rows, 1 burn width apart)' in pg.text_content('#note'), pg.text_content('#note')[-260:])
        pg.click('#palette .pal-laser button:has-text("Done")'); pg.wait_for_timeout(150)
        check('Done ends laser', pg.is_hidden('#palette .pal-laser') and 'Drag a finding' in pg.inner_text('#inkHint'), pg.inner_text('#inkHint'))
        check('the pattern is remembered', pg.evaluate("() => JSON.parse(localStorage.getItem('rdraw.prefs')).laser") == {'rows': 4, 'gap': 1})
        # select the line: its pattern can be changed
        mid = lf['line'][len(lf['line']) // 2]
        sx, sy = xy(pg, *mid); pg.mouse.click(sx, sy); pg.wait_for_timeout(150)
        check('selecting a laser shows its pattern', pg.is_visible('#palette .pal-laser') and 'selected laser' in pg.text_content('#palette .pal-laser .pal-sec').lower() and pressed('Rows') == ['2'], pressed('Rows'))
        pg.click('#palette .pal-laser .seg[aria-label="Rows"] button:has-text("3")'); pg.wait_for_timeout(150)
        lfx = [f for f in scene(pg)['findings'] if f['type'] == 'laser' and f.get('line')][0]
        check('changing it updates the selected line', lfx.get('rows') == 3 and lfx.get('gap') == 0, (lfx.get('rows'), lfx.get('gap')))
        pg.click('#undo'); pg.wait_for_timeout(150)
        check('one undo step', [f for f in scene(pg)['findings'] if f['type'] == 'laser' and f.get('line')][0].get('rows') == 2)
        # move the line, then drag it off
        sx, sy = xy(pg, *mid); pg.mouse.click(sx, sy); pg.wait_for_timeout(150)
        pg.mouse.move(sx, sy); pg.mouse.down(); ex, ey = xy(pg, mid[0] + 20, mid[1] + 30); pg.mouse.move(ex, ey, steps=8); pg.mouse.up(); pg.wait_for_timeout(250)
        lf2 = [f for f in scene(pg)['findings'] if f['type'] == 'laser' and f.get('line')][0]
        dx, dy = lf2['line'][0][0] - lf['line'][0][0], lf2['line'][0][1] - lf['line'][0][1]
        check('dragging moves the whole line', abs(dx - 20) < 3 and abs(dy - 30) < 3, (dx, dy))
        mid = lf2['line'][len(lf2['line']) // 2]
        sx, sy = xy(pg, *mid); pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(sx - 600, sy, steps=10); pg.mouse.up(); pg.wait_for_timeout(250)
        check('dragged off the chart: removed', not any(t.startswith('Laser line') for t in titles(pg)), titles(pg))
        pg.click('#undo'); pg.wait_for_timeout(200)
        check('undo brings it back', any(t.startswith('Laser line') for t in titles(pg)))
        # review link keeps sizes and the line
        pg.click('#review button:has-text("Send for review")'); pg.wait_for_timeout(400); link = pg.input_value('.rv-link')
        fp = b.new_context(viewport={'width': 1360, 'height': 1000}).new_page(); watch(fp, 'fellow')
        fp.goto(link); fp.wait_for_timeout(900)
        check('reviewer sees sizes, the traced line and its pattern', any(t.startswith('Small horseshoe tear') for t in titles(fp)) and any(t.startswith('Laser line') and t.endswith('2 rows') for t in titles(fp)), titles(fp))
        fp.close()

        # ---------------- phone: drawing is off; a tap on the chart asks ----------------
        tp = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2).new_page(); watch(tp, 'touch')
        tp.goto(URL); tp.wait_for_timeout(800); tp.locator('#chart').scroll_into_view_if_needed(); tp.wait_for_timeout(200)
        check('phone: drawing starts off', tp.get_attribute('#handBtn', 'aria-pressed') == 'false')
        x, y = chart_pt(tp, 100, 3); tp.touchscreen.tap(x, y); tp.wait_for_timeout(250)
        check('a tap on the chart asks to start drawing', tp.is_visible('.draw-ask'))
        tp.click('.draw-ask button:has-text("Not now")'); tp.wait_for_timeout(150)
        tp.touchscreen.tap(x, y); tp.wait_for_timeout(250)
        check('Not now: not asked again', tp.is_hidden('.draw-ask'))
        tp.reload(); tp.wait_for_timeout(800); tp.locator('#chart').scroll_into_view_if_needed(); tp.wait_for_timeout(200)
        x, y = chart_pt(tp, 100, 3); tp.touchscreen.tap(x, y); tp.wait_for_timeout(250)
        tp.click('.draw-ask button:has-text("Yes")'); tp.wait_for_timeout(250)
        check('Yes turns drawing on', tp.get_attribute('#handBtn', 'aria-pressed') == 'true' and tp.is_hidden('.draw-ask'))
        tp.close()

        # ---------------- phone, dark ----------------
        mp = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2, color_scheme='dark')
        mp.add_init_script("if (!sessionStorage.getItem('seeded')) { localStorage.setItem('rdraw.seenVersion', JSON.stringify('1.2')); sessionStorage.setItem('seeded', '1'); }")
        m = mp.new_page(); watch(m, 'mobile')
        m.goto(URL); m.wait_for_timeout(800)
        check('phone: update note shown', m.is_visible('#whatsNew'))
        m.screenshot(path='scratch/ht_phone_whatsnew.png')
        check('phone: no sideways scroll', m.evaluate('document.documentElement.scrollWidth') <= 390, m.evaluate('document.documentElement.scrollWidth'))
        b.close()
finally:
    srv.terminate()
print('\n'.join(errs) or 'no console errors')
print('ALL PASS' if not fails and not errs else f'{len(fails)} FAILED')
