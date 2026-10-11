from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file:///home/claude/rdraw/scratch/rtest.html')
    pg.wait_for_function('document.title.startsWith("{")', timeout=300000)
    print(json.dumps(json.loads(pg.title()), indent=1)); print(errs)
    b.close()
