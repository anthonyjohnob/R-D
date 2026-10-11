"""Drive the hand-drawing UI like a clinician would: mouse on desktop, touch on a phone."""
from playwright.sync_api import sync_playwright
import math, json, sys
URL = 'file:///home/claude/rdraw/dist/R-D.html'
OUT = 'scratch/'

def chart_pt(pg, r, h):
    """page coordinates of a chart point at radius r (chart units) and clock hour h"""
    box = pg.evaluate("() => { const b = document.querySelector('#chart').getBoundingClientRect(); return [b.left, b.top, b.width]; }")
    a = math.radians(h * 30 - 90)
    x, y = r * math.cos(a), r * math.sin(a)
    return box[0] + (x + 410) / 820 * box[2], box[1] + (y + 410) / 820 * box[2]

def arc_stroke(h0, h1, rmin, n=50):
    """a posterior border from the ora at h0, in to rmin, out to the ora at h1 (clockwise)"""
    span = (h1 - h0) % 12
    pts = []
    for i in range(n + 1):
        t = i / n
        h = h0 + span * t
        r = 312 - (312 - rmin) * math.sin(math.pi * t) ** 0.8
        pts.append((r, h))
    return pts

def mouse_path(pg, pts):
    x, y = chart_pt(pg, *pts[0])
    pg.mouse.move(x, y); pg.mouse.down()
    for p in pts[1:]:
        x, y = chart_pt(pg, *p); pg.mouse.move(x, y, steps=2)
    pg.mouse.up()

def findings(pg):
    return pg.evaluate("() => [...document.querySelectorAll('#findings .f-title')].map(e => e.textContent)")

errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------------- desktop, mouse ----------------
    ctx = b.new_context(viewport={'width': 1360, 'height': 1000}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') and 'ERR_' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(URL); pg.wait_for_timeout(700)
    pg.click('#startBlank'); pg.wait_for_timeout(200)
    print('hand on by default (fine pointer):', pg.get_attribute('#handBtn', 'aria-pressed'))
    print('hint:', pg.inner_text('#inkHint'))
    # trace a superotemporal-ish border 10 -> 2 and tap the detached (superior) side
    mouse_path(pg, arc_stroke(10, 2, 120))
    pg.wait_for_timeout(150)
    print('after trace hint:', pg.inner_text('#inkHint').replace('\n', ' '))
    pg.screenshot(path=OUT + 'h1_traced.png')
    x, y = chart_pt(pg, 250, 12)
    pg.mouse.move(x, y); pg.wait_for_timeout(250)
    pg.screenshot(path=OUT + 'h2_hover_side.png')
    pg.mouse.click(x, y); pg.wait_for_timeout(300)
    print('findings:', findings(pg))
    print('palette visible:', pg.is_visible('#palette'))
    print('live:', pg.inner_text('#live').replace('\n', ' | '))
    pg.screenshot(path=OUT + 'h3_rd_palette.png')
    # drag a horseshoe tear from the palette to 12:30 near the vitreous base
    tile = pg.get_by_role('button', name='Horseshoe tear', exact=True)
    tb = tile.bounding_box()
    pg.mouse.move(tb['x'] + tb['width'] / 2, tb['y'] + tb['height'] / 2); pg.mouse.down()
    tx, ty = chart_pt(pg, 262, 12.5)
    pg.mouse.move(tx, ty, steps=12); pg.wait_for_timeout(100)
    pg.screenshot(path=OUT + 'h4_dragging.png')
    pg.mouse.up(); pg.wait_for_timeout(250)
    print('after tear drop:', findings(pg))
    # tap lattice, then drag along the fundus from 7 to 8:30 at r 238
    pg.get_by_role('button', name='Lattice', exact=True).click(); pg.wait_for_timeout(100)
    print('armed hint:', pg.inner_text('#inkHint').replace('\n', ' '))
    pts = [(238, 7 + 1.5 * i / 20) for i in range(21)]
    mouse_path(pg, pts); pg.wait_for_timeout(250)
    print('after lattice:', findings(pg))
    # tap 'Atrophic hole' and tap a posterior spot (inferior, r 150)
    pg.get_by_role('button', name='Atrophic hole', exact=True).click()
    x, y = chart_pt(pg, 150, 5); pg.mouse.click(x, y); pg.wait_for_timeout(250)
    print('after hole:', findings(pg))
    # move the tear from 12:30 to 1:30
    sx, sy = chart_pt(pg, 262, 12.5); ex, ey = chart_pt(pg, 262, 1.5)
    pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(ex, ey, steps=10); pg.mouse.up(); pg.wait_for_timeout(250)
    print('after move:', findings(pg))
    # resize lattice: drag its 8:30 end to 9
    sx, sy = chart_pt(pg, 238, 8.5); ex, ey = chart_pt(pg, 238, 9.25)
    pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(ex, ey, steps=8); pg.mouse.up(); pg.wait_for_timeout(250)
    print('after resize:', findings(pg))
    # drag the hole off the chart -> removed
    sx, sy = chart_pt(pg, 150, 5)
    box = pg.evaluate("() => { const b = document.querySelector('#chart').getBoundingClientRect(); return [b.left, b.top, b.width]; }")
    pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(box[0] + box[2] + 60, box[1] + box[2] * 0.9, steps=12)
    pg.wait_for_timeout(80); pg.screenshot(path=OUT + 'h5_remove.png')
    pg.mouse.up(); pg.wait_for_timeout(250)
    print('after drag-off:', findings(pg))
    print('toast:', pg.inner_text('#toast'))
    # laser dropped onto the tear targets it
    tile = pg.get_by_role('button', name='Laser', exact=True); tb = tile.bounding_box()
    pg.mouse.move(tb['x'] + 20, tb['y'] + 20); pg.mouse.down(); tx, ty = chart_pt(pg, 262, 1.5); pg.mouse.move(tx, ty, steps=10); pg.mouse.up(); pg.wait_for_timeout(250)
    print('after laser:', findings(pg))
    # PVD and lens from the palette
    pg.locator('#palette .pal-row', has_text='PVD').get_by_role('button', name='None', exact=True).click(); pg.wait_for_timeout(150)
    print('note:', pg.text_content('#note'))
    print('gate shown:', pg.is_visible('.rep-gate'))
    pg.click('.rep-gate button'); pg.wait_for_timeout(200)
    print('gate opened, lens row present:', pg.is_visible('#repair .rep-q'))
    pg.locator('#repair .rep-q', has_text='Lens').get_by_role('button', name='Phakic', exact=True).click(); pg.wait_for_timeout(200)
    rep = pg.evaluate("() => [...document.querySelectorAll('.rep-opt')].map(li => li.querySelector('.rep-h').innerText.replace(/\\n/g, ' — '))")
    print('repair:', rep)
    pg.screenshot(path=OUT + 'h6_full.png', full_page=False)
    pg.locator('#repairCard').screenshot(path=OUT + 'h7_repair.png')
    # undo restores; dictation still works alongside
    pg.fill('#cmd', 'bullous, PVR C at 11'); pg.press('#cmd', 'Enter'); pg.wait_for_timeout(250)
    print('after dictation:', findings(pg))
    # trace a second border that overlaps -> replaces
    mouse_path(pg, arc_stroke(9, 3, 30)); pg.wait_for_timeout(100)
    x, y = chart_pt(pg, 200, 12); pg.mouse.click(x, y); pg.wait_for_timeout(300)
    print('after redraw:', findings(pg))
    print('note2:', pg.text_content('#note'))
    pg.locator('.chart-card').screenshot(path=OUT + 'h8_redraw.png')
    # closed loop around the posterior pole, detached outside (360 RD sparing the macula)
    pg.click('#clear'); pg.wait_for_timeout(150)
    loop = [(90, 12 * i / 40) for i in range(41)]
    mouse_path(pg, loop); pg.wait_for_timeout(100)
    x, y = chart_pt(pg, 250, 6); pg.mouse.click(x, y); pg.wait_for_timeout(300)
    print('loop:', findings(pg), pg.text_content('#note')[:160])
    pg.locator('.chart-card').screenshot(path=OUT + 'h9_loop.png')
    # export still works with a hand-drawn shape
    ctx.close()

    # ---------------- phone, touch ----------------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR(mobile) ' + str(e)))
    pg.on('console', lambda m: errs.append('mobile ' + m.type + ': ' + m.text) if m.type in ('error', 'warning') and 'ERR_' not in m.text else None)
    pg.goto(URL); pg.wait_for_timeout(700)
    pg.click('#startBlank'); pg.wait_for_timeout(150)
    print('\nmobile hand default:', pg.get_attribute('#handBtn', 'aria-pressed'))
    pg.tap('#handBtn'); pg.wait_for_timeout(150)
    print('mobile hand after tap:', pg.get_attribute('#handBtn', 'aria-pressed'))
    cdp = ctx.new_cdp_session(pg)
    def touch_path(pts):
        x, y = chart_pt(pg, *pts[0])
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        for q in pts[1:]:
            x, y = chart_pt(pg, *q)
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    scroll0 = pg.evaluate('scrollY')
    # inferior detachment 4 -> 8, macula on: trace, then swipe downward from the line
    touch_path(arc_stroke(4, 8, 140)); pg.wait_for_timeout(150)
    print('mobile hint:', pg.inner_text('#inkHint').replace('\n', ' '))
    touch_path([(140, 6), (170, 6), (200, 6), (230, 6)]); pg.wait_for_timeout(300)
    print('mobile findings:', findings(pg))
    print('page did not scroll while drawing:', pg.evaluate('scrollY') == scroll0)
    print('palette docked:', pg.evaluate("() => document.querySelector('#palette').classList.contains('docked')"), 'visible:', pg.is_visible('#palette'))
    pg.screenshot(path=OUT + 'm1_touch.png', full_page=False)
    pg.locator('.chart-card').screenshot(path=OUT + 'm2_card.png')
    print('mobile live:', pg.inner_text('#live').replace('\n', ' | '))
    sw = pg.evaluate('document.documentElement.scrollWidth'); print('no horizontal scroll:', sw <= 390, sw)
    ctx.close()
    b.close()
print('\n'.join(errs) or 'no console errors')
