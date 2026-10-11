"""Tumours on the served website: dictation, the findings-list editor, hand move and edge-resize, both views,
phone layout, and a teaching-review round trip that carries tumour details."""
import subprocess, time, math
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3', '-m', 'http.server', '8772', '--bind', '127.0.0.1'], cwd='dist/site', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8772/'
errs, fails = [], []
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))
    if not cond: fails.append(name)
def watch(pg, tag):
    pg.on('pageerror', lambda e: errs.append(f'{tag} PAGEERROR {e}'))
    pg.on('console', lambda m: errs.append(f'{tag} {m.type}: {m.text}') if m.type in ('error', 'warning') else None)
def cmd(pg, t): pg.fill('#cmd', t); pg.press('#cmd', 'Enter'); pg.wait_for_timeout(300)
def titles(pg): return pg.evaluate("() => [...document.querySelectorAll('#findings .f-title')].map(e => e.textContent)")
def subs(pg): return pg.evaluate("() => [...document.querySelectorAll('#findings .f-sub')].map(e => e.textContent)")
def note(pg): return pg.text_content('#note')
def page_pt(pg, x, y):
    b = pg.evaluate("() => { const r = document.querySelector('#chart').getBoundingClientRect(); return [r.left, r.top, r.width]; }")
    return b[0] + (x + 410) / 820 * b[2], b[1] + (y + 410) / 820 * b[2]
def place(pg, i=0):
    return pg.evaluate(f"""() => {{ const s = JSON.parse(localStorage.getItem('rdraw.scene.v2')); const f = s.findings[{i}]; const P = RD.catPlace(f, s.eye); return [P.x, P.y, P.tum.rx, P.tum.ry]; }}""")
SP = 'scratch/'
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={'width': 1360, 'height': 1000}).new_page(); watch(pg, 'desktop')
        pg.goto(URL); pg.wait_for_timeout(800)
        cmd(pg, 'left eye')
        cmd(pg, 'choroidal nevus 2 x 1.5 dd, 1 dd superotemporal to the disc, flat, with drusen, no orange pigment, no SRF')
        check('dictated naevus: title', titles(pg) == ['Choroidal nevus · 2×1.5 DD · superotemporal · 1 DD from disc'], titles(pg))
        check('dictated naevus: features under the title', subs(pg)[0].startswith('flat, drusen, no orange pigment, no SRF'), subs(pg)[0])
        check('note sentence', 'Choroidal nevus 2 × 1.5 DD, 1 DD superotemporal to the optic disc; flat, overlying drusen, no orange pigment, no subretinal fluid.' in note(pg))
        # edit controls
        row = pg.locator('#findings li').first
        row.locator('select[aria-label="Elevation"]').select_option('marked')
        pg.wait_for_timeout(200)
        row = pg.locator('#findings li').first
        row.locator('input[aria-label="Thickness in mm"]').fill('3.5'); row.locator('input[aria-label="Thickness in mm"]').press('Enter'); pg.wait_for_timeout(200)
        row = pg.locator('#findings li').first
        row.locator('select[aria-label="Subretinal fluid"]').select_option('ext'); pg.wait_for_timeout(200)
        row = pg.locator('#findings li').first
        row.locator('select[aria-label="Orange pigment"]').select_option('yes'); pg.wait_for_timeout(200)
        row = pg.locator('#findings li').first
        row.locator('input[aria-label="Size, second dimension"]').fill('2'); row.locator('input[aria-label="Size, second dimension"]').press('Enter'); pg.wait_for_timeout(200)
        check('editor updates the note', '2 × 2 DD' in note(pg) and '3.5 mm thick, markedly elevated' in note(pg) and 'orange pigment, extensive subretinal fluid' in note(pg), note(pg)[:240])
        row = pg.locator('#findings li').first
        row.locator('select[aria-label="Size unit"]').select_option('mm'); pg.wait_for_timeout(200)
        check('switching to mm converts the size', '3 × 3 mm' in note(pg), note(pg)[:120])
        row = pg.locator('#findings li').first
        row.locator('select[aria-label="Size unit"]').select_option('dd'); pg.wait_for_timeout(200)
        pg.locator('.chart-card').screenshot(path=SP + 'tu1_edited.png')
        # undo goes back one edit
        pg.click('#undo'); pg.wait_for_timeout(150)
        check('undo restores the previous edit', '3 × 3 mm' in note(pg))
        pg.click('#clear'); pg.wait_for_timeout(150)

        # hand drawing: move, then drag the edge to resize
        cmd(pg, 'nevus 2 DD at 7 in the mid periphery, minimally elevated')
        check('hand drawing is on', pg.get_attribute('#handBtn', 'aria-pressed') == 'true')
        x, y, rx, ry = place(pg)
        ex, ey = page_pt(pg, x + rx, y)
        tx, ty = page_pt(pg, x + rx * 1.5, y)
        pg.mouse.move(ex, ey); pg.mouse.down(); pg.mouse.move(tx, ty, steps=8); pg.wait_for_timeout(120)
        pg.locator('.chart-card').screenshot(path=SP + 'tu2_resizing.png')
        pg.mouse.up(); pg.wait_for_timeout(250)
        check('edge drag resizes 2 → 3 DD', titles(pg) == ['Choroidal nevus · 3 DD · 7 · mid-periphery'], titles(pg))
        x2, y2, rx2, _ = place(pg)
        check('resizing keeps the centre', abs(x2 - x) < 1 and abs(y2 - y) < 1 and abs(rx2 - 1.5 * rx) < 0.6)
        sx, sy = page_pt(pg, x - rx2 * 0.3, y)
        dx, dy = page_pt(pg, x - rx2 * 0.3 - 60, y - 40)
        pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(dx, dy, steps=8); pg.mouse.up(); pg.wait_for_timeout(250)
        x3, y3, _, _ = place(pg)
        check('drag inside moves it by the same amount', abs((x3 - x2) + 60) < 2 and abs((y3 - y2) + 40) < 2, f'{x3 - x2:.1f}, {y3 - y2:.1f}')
        check('still 3 DD after the move', titles(pg)[0].startswith('Choroidal nevus · 3 DD'), titles(pg))
        pg.click('#clear'); pg.wait_for_timeout(150)

        # a distance-placed tumour moved by hand drops its stated distance
        cmd(pg, 'nevus 1 DD, 2 DD from the disc')
        x, y, rx, ry = place(pg)
        sx, sy = page_pt(pg, x, y); dx, dy = page_pt(pg, x, y + 70)
        pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(dx, dy, steps=8); pg.mouse.up(); pg.wait_for_timeout(250)
        check('moving drops “2 DD from disc”', 'from disc' not in titles(pg)[0], titles(pg))
        pg.click('#clear'); pg.wait_for_timeout(150)

        # both views, every kind
        for c in ['right eye', 'mushroom shaped melanoma 4 x 3.5 DD at 1 o\'clock in the mid periphery, 8 mm thick, orange pigment, extensive SRF',
                  'amelanotic melanoma 2 DD at 4 in the mid periphery, moderately elevated, SRF', 'circumscribed choroidal hemangioma 2.5 x 2 DD temporal to the fovea with subretinal fluid',
                  'choroidal metastasis 2 dd at 8 at the equator, elevated', 'CHRPE 2 DD at 10 in the periphery', 'nevus 1.5 DD 1 DD below the disc, markedly elevated, drusen']:
            cmd(pg, c)
        check('all seven kinds drawn', len(titles(pg)) == 6, titles(pg))
        pg.locator('.chart-card').screenshot(path=SP + 'tu3_fundus.png')
        pg.click('.view-switch button[data-view="pole"]'); pg.wait_for_timeout(300)
        pg.locator('.chart-card').screenshot(path=SP + 'tu4_pole.png')
        pg.click('.view-switch button[data-view="fundus"]'); pg.wait_for_timeout(200)
        # hovering a list row highlights the lesion
        pg.locator('#findings li').first.hover(); pg.wait_for_timeout(150)
        # export
        with pg.expect_download() as dl:
            pg.click('#export')
        check('PNG export works with tumours', dl.value.suggested_filename.endswith('.png'), dl.value.suggested_filename)

        # review round trip with tumour details
        pg.click('#clear'); pg.wait_for_timeout(150)
        cmd(pg, 'nevus 2 DD at 7 in the mid periphery, flat, no SRF, no orange pigment')
        pg.click('#review button:has-text("Send for review")'); pg.wait_for_timeout(400); link = pg.input_value('.rv-link')
        fp = b.new_context(viewport={'width': 1360, 'height': 1000}).new_page(); watch(fp, 'fellow')
        fp.goto(link); fp.wait_for_timeout(900)
        check('reviewer sees the tumour details', 'flat, no orange pigment, no SRF' in subs(fp)[0], subs(fp))
        cmd(fp, 'the nevus is minimally elevated with orange pigment and trace SRF')
        ch = fp.evaluate("() => [...document.querySelectorAll('#review .rv-ch')].map(e => e.innerText.replace(/\\n/g, ' '))")
        check('reviewer’s change listed', any('flat, no orange pigment, no SRF → minimally elevated, orange pigment, trace SRF' in c for c in ch), ch)
        fp.click('#review button:has-text("Send back to resident")'); fp.wait_for_timeout(400); back = fp.input_value('.rv-link')
        pg.goto(back); pg.wait_for_timeout(900)
        check('resident sees the corrected details', 'minimally elevated, orange pigment, trace SRF' in subs(pg)[0], subs(pg))

        # phone: the editor fits
        mp = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2).new_page(); watch(mp, 'mobile')
        mp.goto(URL); mp.wait_for_timeout(800)
        cmd(mp, 'melanoma 3 x 2.5 DD inferotemporal to the fovea, 3.2 mm thick, dome shaped, orange pigment, subretinal fluid')
        mp.locator('#findings li').first.scroll_into_view_if_needed(); mp.wait_for_timeout(150)
        mp.locator('#findings li').first.screenshot(path=SP + 'tu5_phone_editor.png')
        check('phone: no sideways scroll', mp.evaluate('document.documentElement.scrollWidth') <= 390, mp.evaluate('document.documentElement.scrollWidth'))
        b.close()
finally:
    srv.terminate()
print('\n'.join(errs) or 'no console errors')
print('ALL PASS' if not fails and not errs else f'{len(fails)} FAILED')
