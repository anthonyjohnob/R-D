"""Serve dist/site over http and check: no third-party requests, service worker, offline reload, manifest, on-device dictation path."""
import subprocess, time, math, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3', '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd='dist/site', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8765/'
FAKE_SR = """
(() => {
  class FakeSR { constructor(){ this.processLocally = false; window.__rec = this; } start(){ window.__started = { local: this.processLocally }; } stop(){} }
  FakeSR.available = async (o) => { window.__availCalls = (window.__availCalls||0)+1; return window.__installed ? 'available' : 'downloadable'; };
  FakeSR.install = async (o) => { window.__installed = true; return true; };
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
})();
"""
errs, external = [], []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1300, 'height': 950})
        ctx.add_init_script(FAKE_SR)
        pg = ctx.new_page()
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('request', lambda r: external.append(r.url) if not r.url.startswith(URL) and not r.url.startswith('data:') and not r.url.startswith('blob:') else None)
        pg.goto(URL); pg.wait_for_timeout(1200)
        first = pg.evaluate("() => [[...document.querySelectorAll('#findings .f-title')].length, !!localStorage.getItem('rdraw.scene.v2'), document.querySelector('#clear').disabled]")
        print('first visit is a clean chart:', first[0] == 0 and first[2])
        sw = pg.evaluate("async () => { const r = await navigator.serviceWorker.ready; return !!r.active; }")
        print('service worker active:', sw)
        fonts = pg.evaluate("async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight); }")
        print('fonts loaded (self-hosted):', sorted(set(fonts)))
        man = pg.evaluate("async () => { const r = await fetch(document.querySelector('link[rel=manifest]').href); const j = await r.json(); return [j.short_name, j.icons.length, j.display]; }")
        print('manifest:', man)
        print('privacy section:', pg.is_visible('#privacy'), '| tag:', pg.inner_text('.tag'))
        print('Ask-Claude option hidden on the website:', not pg.is_visible('#claudeOpt'))
        # on-device dictation: first press installs the language pack, then recognition starts locally
        pg.click('#mic'); pg.wait_for_timeout(400)
        print('dictation started:', pg.evaluate('window.__started'), '| label:', pg.inner_text('#micLabel'))
        pg.click('#mic'); pg.wait_for_timeout(150)
        # offline: reload with the network cut
        ctx.set_offline(True)
        pg.reload(); pg.wait_for_timeout(1200)
        print('offline reload works:', pg.is_visible('#chart'), '| title:', pg.title())
        fonts2 = pg.evaluate("async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').length; }")
        print('fonts available offline:', fonts2)
        # draw something offline
        box = pg.evaluate("() => { const b = document.querySelector('#chart').getBoundingClientRect(); return [b.left, b.top, b.width]; }")
        def pt(r, h):
            a = math.radians(h * 30 - 90); return box[0] + (r * math.cos(a) + 410) / 820 * box[2], box[1] + (r * math.sin(a) + 410) / 820 * box[2]
        x, y = pt(312, 9); pg.mouse.move(x, y); pg.mouse.down()
        for i in range(1, 41):
            t = i / 40; x, y = pt(312 - 200 * math.sin(math.pi * t), 9 + 6 * t); pg.mouse.move(x, y)
        pg.mouse.up(); x, y = pt(250, 12); pg.mouse.click(x, y); pg.wait_for_timeout(300)
        print('drawn offline:', pg.evaluate("() => [...document.querySelectorAll('#findings .f-title')].map(e => e.textContent)"))
        ctx.set_offline(False)
        mob = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        mp = mob.new_page(); mp.goto(URL); mp.wait_for_timeout(800)
        mp.locator('#privacy summary').click(); mp.wait_for_timeout(200)
        mp.locator('#privacy').screenshot(path='scratch/s_privacy_mobile.png')
        print('mobile no horizontal scroll:', mp.evaluate('document.documentElement.scrollWidth') <= 390)
        b.close()
finally:
    srv.terminate()
print('third-party requests:', external or 'none')
print('\n'.join(errs) or 'no console errors')
