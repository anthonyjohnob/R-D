from playwright.sync_api import sync_playwright
import json, shutil
URL='file:///home/claude/rdraw/dist/R-D.html'
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1360,'height':1000}, device_scale_factor=1, accept_downloads=True)
    pg=ctx.new_page(); errs=[]
    pg.on('console', lambda m: errs.append(m.type+': '+m.text) if m.type in ('error','warning') and 'ERR_TUNNEL' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)))
    pg.goto(URL); pg.wait_for_timeout(800)
    pg.wait_for_timeout(100)  # opens on a clean chart
    cmds = ['right eye', 'PDR with NVD and NVE superotemporally, no vitreous haemorrhage',
            'dot blot haemorrhages in all four quadrants, hard exudates temporal to the fovea, cotton wool spots along the superior arcade',
            'PRP', 'tractional retinal detachment along the inferior arcade', 'macular edema']
    for c in cmds:
        pg.fill('#cmd', c); pg.press('#cmd','Enter'); pg.wait_for_timeout(250)
    print(pg.evaluate("() => document.querySelector('#live').innerText"))
    print(pg.evaluate("() => document.querySelector('#note').textContent"))
    pg.screenshot(path='scratch/d_fundus.png')
    pg.click('.view-switch button[data-view="pole"]'); pg.wait_for_timeout(300)
    pg.query_selector('.chart-card').screenshot(path='scratch/d_pole.png')
    with pg.expect_download() as dl:
        pg.click('#export')
    d = dl.value; d.save_as('scratch/d_export.png'); print('download', d.suggested_filename)
    pg.query_selector('#key').screenshot(path='scratch/d_key.png')
    print('\n'.join(errs) or 'no console errors')
    b.close()
