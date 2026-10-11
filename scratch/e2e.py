from playwright.sync_api import sync_playwright
import json
URL='file:///home/claude/rdraw/dist/RDraw.html'
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1360,'height':1000}, device_scale_factor=1)
    pg=ctx.new_page(); errs=[]
    pg.on('console', lambda m: errs.append(m.type+': '+m.text) if m.type in ('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)))
    pg.goto(URL); pg.wait_for_timeout(700)
    pg.screenshot(path='e2e_initial.png')
    # start blank, then dictate-by-typing a multi-finding command
    pg.wait_for_timeout(100)  # opens on a clean chart
    pg.fill('#cmd','mac off RRD 10 to 2 with HST at 12, lattice 7-8'); pg.wait_for_timeout(400)
    pg.screenshot(path='e2e_preview.png')
    pg.press('#cmd','Enter'); pg.wait_for_timeout(400)
    pg.fill('#cmd','actually fovea on'); pg.press('#cmd','Enter'); pg.wait_for_timeout(300)
    pg.fill('#cmd','where is the break'); pg.press('#cmd','Enter'); pg.wait_for_timeout(400)
    info = pg.evaluate("""() => ({findings: [...document.querySelectorAll('#findings .f-title')].map(e=>e.textContent), note: document.querySelector('#note').textContent, live: document.querySelector('#live').innerText, lincoff: document.querySelector('#lincoff').innerText})""")
    print(json.dumps(info, indent=1))
    pg.screenshot(path='e2e_after.png', full_page=True)
    # undo via keyboard, mobile + dark
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(200)
    m=b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, color_scheme='dark')
    mp=m.new_page(); mp.on('pageerror', lambda e: errs.append('M '+str(e)))
    mp.goto(URL); mp.wait_for_timeout(700); mp.screenshot(path='e2e_mobile_dark.png', full_page=True)
    sw = mp.evaluate("() => [document.documentElement.scrollWidth, window.innerWidth]")
    print('mobile scrollWidth vs viewport', sw)
    print('\n'.join(errs) or 'no console errors')
    b.close()
