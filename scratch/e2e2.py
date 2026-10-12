import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import _classic  # noqa: E402,F401
from playwright.sync_api import sync_playwright
import json
URL='file:///home/claude/rdraw/dist/R-D.html'
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1360,'height':1000}, device_scale_factor=1)
    pg=ctx.new_page(); errs=[]
    pg.on('console', lambda m: errs.append(m.type+': '+m.text) if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)))
    pg.goto(URL); pg.wait_for_timeout(800)
    pg.screenshot(path='n_initial.png')
    pg.wait_for_timeout(100)  # opens on a clean chart
    for c in ['macula off RRD from 10 to 3 with a horseshoe tear at 1, lattice 7 to 8',
              'dot blot hemorrhages and microaneurysms in the macula, hard exudates',
              'cotton wool spots at 1:30 and 4:30', 'BRVO inferotemporal', 'disc hemorrhage at 5',
              'choroidal nevus at 8 in the mid periphery', 'cystic tuft at 10']:
        pg.fill('#cmd', c); pg.press('#cmd','Enter'); pg.wait_for_timeout(250)
    info = pg.evaluate("""() => ({findings: [...document.querySelectorAll('#findings .f-title')].map(e=>e.textContent), note: document.querySelector('#note').textContent, live: document.querySelector('#live').innerText, key: document.querySelector('#key').innerText.slice(0,400)})""")
    print(json.dumps(info, indent=1))
    pg.screenshot(path='n_fundus.png')
    pg.click('.view-switch button[data-view="pole"]'); pg.wait_for_timeout(300)
    pg.screenshot(path='n_pole.png')
    pg.fill('#libSearch','sea fan'); pg.wait_for_timeout(300)
    pg.click('#libList .lib-head'); pg.wait_for_timeout(200)
    el = pg.query_selector('.library'); el.screenshot(path='n_library.png')
    print('lib:', pg.evaluate("() => document.querySelector('#libList').innerText.slice(0,600)"))
    pg.screenshot(path='n_full.png', full_page=True)
    m=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, color_scheme='dark')
    mp=m.new_page(); mp.on('pageerror', lambda e: errs.append('M '+str(e)))
    mp.goto(URL); mp.wait_for_timeout(800); mp.screenshot(path='n_mobile_dark.png', full_page=True)
    print('mobile scrollWidth vs viewport', mp.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]"))
    print('\n'.join(errs) or 'no console errors')
    b.close()
