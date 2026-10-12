import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import _classic  # noqa: E402,F401
"""Reviewer repros: lingering preview after arming a tile; armed tile surviving the pole view; touch scroll in pole view."""
from playwright.sync_api import sync_playwright
import math
URL = 'file:///home/claude/rdraw/dist/R-D.html'
def chart_pt(pg, r, h):
    box = pg.evaluate("() => { const b = document.querySelector('#chart').getBoundingClientRect(); return [b.left, b.top, b.width]; }")
    a = math.radians(h * 30 - 90)
    return box[0] + (r * math.cos(a) + 410) / 820 * box[2], box[1] + (r * math.sin(a) + 410) / 820 * box[2]
def arc(h0, h1, rmin, n=40):
    span = (h1 - h0) % 12
    return [(312 - (312 - rmin) * math.sin(math.pi * i / n) ** 0.8, h0 + span * i / n) for i in range(n + 1)]
def findings(pg): return pg.evaluate("() => [...document.querySelectorAll('#findings .f-title')].map(e => e.textContent)")
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1360, 'height': 1000})
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(500)
    def mp(pts):
        x, y = chart_pt(pg, *pts[0]); pg.mouse.move(x, y); pg.mouse.down()
        for q in pts[1:]: x, y = chart_pt(pg, *q); pg.mouse.move(x, y, steps=2)
        pg.mouse.up()
    mp(arc(10, 2, 120)); x, y = chart_pt(pg, 250, 12); pg.mouse.click(x, y); pg.wait_for_timeout(250)
    mp(arc(7, 11, 150)); x, y = chart_pt(pg, 260, 9); pg.mouse.move(x, y); pg.wait_for_timeout(250)   # hover → preview of the 7–11 side
    pg.click('.pal-tile[aria-label="Atrophic hole"]'); pg.wait_for_timeout(100)
    preview_after_arm = pg.evaluate("() => document.querySelector('#inkHint').innerText")
    x, y = chart_pt(pg, 262, 1); pg.mouse.click(x, y); pg.wait_for_timeout(300)
    print('findings:', findings(pg))
    pg.locator('.chart-card').screenshot(path='scratch/r1_after_arm.png')
    # armed tile then pole view and back: the next tap must not place a hole
    pg.click('.pal-tile[aria-label="Atrophic hole"]'); pg.wait_for_timeout(80)
    pg.click('.view-switch button[data-view="pole"]'); pg.wait_for_timeout(150)
    print('pole view inking class:', pg.evaluate("() => document.querySelector('#chart').classList.contains('inking')"))
    pg.click('.view-switch button[data-view="fundus"]'); pg.wait_for_timeout(150)
    n0 = len(findings(pg)); x, y = chart_pt(pg, 150, 7); pg.mouse.click(x, y); pg.wait_for_timeout(250)
    print('tap after view switch adds nothing:', len(findings(pg)) == n0, findings(pg))
    # contradicting spoken status replaces the drawn border
    pg.fill('#cmd', 'macula off'); pg.press('#cmd', 'Enter'); pg.wait_for_timeout(250)
    print('live:', pg.inner_text('#live').replace('\n', ' | ')[:240])
    print('rd sub:', pg.evaluate("() => document.querySelector('#findings .f-sub').textContent"))
    b.close()
print('\n'.join(errs) or 'no page errors')
