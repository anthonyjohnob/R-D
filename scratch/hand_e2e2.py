"""Second pass: touch drag-and-drop from the docked palette, library search drops, Esc, pole view, dark mode, export."""
from playwright.sync_api import sync_playwright
import math
URL = 'file:///home/claude/rdraw/dist/R-D.html'
OUT = 'scratch/'
def chart_pt(pg, r, h):
    box = pg.evaluate("() => { const b = document.querySelector('#chart').getBoundingClientRect(); return [b.left, b.top, b.width]; }")
    a = math.radians(h * 30 - 90)
    return box[0] + (r * math.cos(a) + 410) / 820 * box[2], box[1] + (r * math.sin(a) + 410) / 820 * box[2]
def arc_stroke(h0, h1, rmin, n=40):
    span = (h1 - h0) % 12
    return [(312 - (312 - rmin) * math.sin(math.pi * i / n) ** 0.8, h0 + span * i / n) for i in range(n + 1)]
def findings(pg):
    return pg.evaluate("() => [...document.querySelectorAll('#findings .f-title')].map(e => e.textContent)")
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------- phone: touch drag from the docked palette ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR(m) ' + str(e)))
    pg.on('console', lambda m: errs.append('m ' + m.type + ': ' + m.text) if m.type in ('error', 'warning') and 'ERR_' not in m.text else None)
    pg.goto(URL); pg.wait_for_timeout(600)
    pg.tap('#handBtn'); pg.wait_for_timeout(100)
    cdp = ctx.new_cdp_session(pg)
    def touch(pts_xy):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': pts_xy[0][0], 'y': pts_xy[0][1]}]})
        for x, y in pts_xy[1:]: cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    touch([chart_pt(pg, *q) for q in arc_stroke(9, 3, 90)]); pg.wait_for_timeout(100)
    touch([chart_pt(pg, 90, 12), chart_pt(pg, 140, 12), chart_pt(pg, 200, 12)]); pg.wait_for_timeout(300)
    print('mobile RD:', findings(pg))
    # drag the tear tile (below the chart) up onto 1 o'clock — scroll so both are on screen
    tb = pg.locator('.pal-tile[aria-label="Horseshoe tear"]').bounding_box()
    tx, ty = chart_pt(pg, 262, 1)
    print('tile on screen:', tb['y'] < 844, 'target on screen:', ty > 0)
    path = [(tb['x'] + 20, tb['y'] + 20)] + [(tb['x'] + 20 + (tx - tb['x'] - 20) * k / 12, tb['y'] + 20 + (ty - tb['y'] - 20) * k / 12) for k in range(1, 13)]
    touch(path); pg.wait_for_timeout(300)
    print('after touch drag:', findings(pg))
    # tap lattice, then tap the chart at 7:30
    pg.tap('.pal-tile[aria-label="Lattice"]'); pg.wait_for_timeout(80)
    x, y = chart_pt(pg, 238, 7.5); touch([(x, y)]); pg.wait_for_timeout(300)
    print('after tap-tap lattice:', findings(pg))
    print('PVD row in palette:', pg.is_visible('#palette .pal-row'))
    pg.tap('#palette .pal-row button:has-text("Complete")'); pg.wait_for_timeout(200)
    print('PVD row hidden once answered:', not pg.is_visible('#palette .pal-row'))
    pg.locator('.chart-card').screenshot(path=OUT + 'm3_touch_items.png')
    ctx.close()

    # ---------- desktop: library search drop, Esc, pole view, export, dark mode ----------
    ctx = b.new_context(viewport={'width': 1360, 'height': 1000}, device_scale_factor=1, accept_downloads=True, color_scheme='dark')
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR(d) ' + str(e)))
    pg.on('console', lambda m: errs.append('d ' + m.type + ': ' + m.text) if m.type in ('error', 'warning') and 'ERR_' not in m.text else None)
    pg.goto(URL); pg.wait_for_timeout(600)
    def mouse_path(pts):
        x, y = chart_pt(pg, *pts[0]); pg.mouse.move(x, y); pg.mouse.down()
        for q in pts[1:]:
            x, y = chart_pt(pg, *q); pg.mouse.move(x, y, steps=2)
        pg.mouse.up()
    # Esc cancels a pending side choice
    mouse_path(arc_stroke(3, 7, 150)); pg.wait_for_timeout(100)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    print('Esc cancels:', findings(pg) == [], pg.inner_text('#inkHint'))
    mouse_path(arc_stroke(3, 7, 150)); x, y = chart_pt(pg, 260, 5); pg.mouse.click(x, y); pg.wait_for_timeout(300)
    print('inferotemporal RD:', findings(pg))
    # library search inside the palette → drop a choroidal nevus at 10:30 mid-periphery
    pg.click('.pal-tile[aria-label="Other findings"]'); pg.fill('.pal-more input', 'nevus'); pg.wait_for_timeout(300)
    res = pg.locator('.pal-res').first
    print('first result:', res.inner_text())
    rb = res.bounding_box(); pg.mouse.move(rb['x'] + 15, rb['y'] + 12); pg.mouse.down()
    tx, ty = chart_pt(pg, 150, 10.5); pg.mouse.move(tx, ty, steps=10); pg.mouse.up(); pg.wait_for_timeout(300)
    print('after nevus drop:', findings(pg))
    # a catalogue item dragged to a new spot follows the pointer
    pg.mouse.move(tx, ty); pg.mouse.down(); ex, ey = chart_pt(pg, 160, 11.5); pg.mouse.move(ex, ey, steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    print('after nevus move:', findings(pg))
    # star fold and VH
    for lab, r, h in (('PVR star fold', 180, 5), ('Vitreous haemorrhage', 200, 6.5)):
        pg.click(f'.pal-tile[aria-label="{lab}"]'); x, y = chart_pt(pg, r, h); pg.mouse.click(x, y); pg.wait_for_timeout(200)
    print('after star fold + VH:', findings(pg))
    print('note:', pg.text_content('#note'))
    pg.screenshot(path=OUT + 'd1_dark.png')
    pg.locator('#repairCard').screenshot(path=OUT + 'd2_dark_repair.png')
    # pole view disables drawing
    pg.click('.view-switch button[data-view="pole"]'); pg.wait_for_timeout(200)
    print('pole: hand disabled', pg.is_disabled('#handBtn'), 'palette hidden', not pg.is_visible('#palette'))
    pg.click('.view-switch button[data-view="fundus"]'); pg.wait_for_timeout(200)
    print('fundus: hand enabled', not pg.is_disabled('#handBtn'))
    with pg.expect_download() as dl: pg.click('#export')
    d = dl.value; d.save_as(OUT + 'd3_export.png'); print('export', d.suggested_filename)
    # undo the last few, redo
    n0 = len(findings(pg)); pg.click('#undo'); pg.wait_for_timeout(150); n1 = len(findings(pg)); pg.click('#redo'); pg.wait_for_timeout(150)
    print('undo/redo:', n0, n1, len(findings(pg)))
    # turning hand mode off restores normal clicks
    pg.click('#handBtn'); pg.wait_for_timeout(100)
    print('hand off: palette hidden', not pg.is_visible('#palette'), 'fab hidden', not pg.is_visible('#palFab'))
    ctx.close(); b.close()
print('\n'.join(errs) or 'no console errors')
