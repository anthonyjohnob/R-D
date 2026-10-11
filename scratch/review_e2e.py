"""Teaching review round trip on the served website: resident → fellow → resident, in separate browsers."""
import subprocess, time, math, base64, zlib, json
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3', '-m', 'http.server', '8766', '--bind', '127.0.0.1'], cwd='dist/site', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8766/'
errs = []
def watch(pg, tag):
    pg.on('pageerror', lambda e: errs.append(f'{tag} PAGEERROR {e}'))
    pg.on('console', lambda m: errs.append(f'{tag} {m.type}: {m.text}') if m.type in ('error', 'warning') else None)
def cpt(pg, r, h):
    b = pg.evaluate("() => { const b = document.querySelector('#chart').getBoundingClientRect(); return [b.left, b.top, b.width]; }")
    a = math.radians(h * 30 - 90)
    return b[0] + (r * math.cos(a) + 410) / 820 * b[2], b[1] + (r * math.sin(a) + 410) / 820 * b[2]
def findings(pg): return pg.evaluate("() => [...document.querySelectorAll('#findings .f-title')].map(e => e.textContent)")
def cmd(pg, t): pg.fill('#cmd', t); pg.press('#cmd', 'Enter'); pg.wait_for_timeout(250)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        # ---------- resident ----------
        res = b.new_context(viewport={'width': 1360, 'height': 1000}); rp = res.new_page(); watch(rp, 'resident')
        rp.goto(URL); rp.wait_for_timeout(700); rp.click('#startBlank')
        cmd(rp, 'macula on RRD 10 to 2 with HST at 12, lattice 7 to 8, phakic')
        rp.fill('#review input[aria-label="Your name or initials"]', 'J. Resident')
        rp.fill('#review input[aria-label="Case label"]', 'Case 3')
        rp.click('#review button:has-text("Send for review")'); rp.wait_for_timeout(500)
        link = rp.input_value('.rv-link')
        print('resident link:', link[:60] + '…', len(link), 'chars')
        resident_original = findings(rp)

        # ---------- fellow: has a drawing of their own first ----------
        fel = b.new_context(viewport={'width': 1360, 'height': 1000}); fp = fel.new_page(); watch(fp, 'fellow')
        fp.goto(URL); fp.wait_for_timeout(700); fp.click('#startBlank'); cmd(fp, 'RD from 3 to 6 macula on')
        own = findings(fp)
        fp.goto(link); fp.wait_for_timeout(900)          # same document: arrives through hashchange
        print('fellow bar:', fp.inner_text('#reviewBar').replace('\n', ' | '))
        print('address bar cleaned:', '#r=' not in fp.url)
        print('fellow sees:', findings(fp))
        cmd(fp, 'macula off')
        # move the tear from 12 to 1 by hand
        sx, sy = cpt(fp, 268, 12); ex, ey = cpt(fp, 268, 1)
        fp.mouse.move(sx, sy); fp.mouse.down(); fp.mouse.move(ex, ey, steps=10); fp.mouse.up(); fp.wait_for_timeout(250)
        cmd(fp, 'remove the lattice')
        # comment pinned on the tear
        fp.click('#reviewBar button:has-text("Comment")'); fp.wait_for_timeout(100)
        x, y = cpt(fp, 262, 1); fp.mouse.click(x, y); fp.wait_for_timeout(250)
        fp.locator('#review .rv-cm textarea').last.fill('The tear is at 1, at the posterior vitreous base — look along the higher border (Lincoff rule 1).')
        fp.click('#reviewBar button:has-text("Comment")'); x, y = cpt(fp, 30, 6); fp.mouse.click(x, y); fp.wait_for_timeout(200)
        fp.locator('#review .rv-cm textarea').last.fill('Macula is off — the border crosses the fovea.')
        fp.fill('#review textarea[aria-label="Overall feedback"]', 'Good map overall. Re-check macular status with the 90 D lens.')
        fp.fill('#review input[aria-label="Your name"]', 'Dr Fellow')
        changes = fp.evaluate("() => [...document.querySelectorAll('#review .rv-ch')].map(e => e.innerText.replace(/\\n/g, ' '))")
        print('fellow changes:', changes)
        print('fellow count:', fp.inner_text('#revCount'))
        fp.screenshot(path='scratch/rv1_fellow.png')
        fp.click('#reviewBar button:has-text("Original")'); fp.wait_for_timeout(250)
        print('original view, hand drawing paused:', fp.is_disabled('#handBtn'))
        fp.locator('.chart-card').screenshot(path='scratch/rv2_fellow_original.png')
        fp.click('#reviewBar button:has-text("Corrected")'); fp.wait_for_timeout(200)
        fp.click('#review button:has-text("Send back to resident")'); fp.wait_for_timeout(500)
        back = fp.input_value('.rv-link')
        print('return link:', len(back), 'chars')
        # reload keeps the review in progress
        fp.reload(); fp.wait_for_timeout(700)
        print('review survives reload:', fp.is_visible('#reviewBar'), fp.inner_text('#revCount'))
        # exit (two clicks) brings the fellow's own drawing back
        fp.click('#review button:has-text("Exit review")'); fp.wait_for_timeout(100)
        fp.click('#review button:has-text("Click again")'); fp.wait_for_timeout(300)
        print('fellow own drawing restored:', findings(fp) == own, findings(fp))

        # ---------- resident receives ----------
        rp.goto(back); rp.wait_for_timeout(900)
        print('resident bar:', rp.inner_text('#reviewBar').replace('\n', ' | '))
        print('feedback:', rp.inner_text('#review .rv-fb'))
        print('comments:', rp.evaluate("() => [...document.querySelectorAll('#review .rv-cm')].map(e => e.innerText.replace(/\\n/g, ' '))"))
        rp.screenshot(path='scratch/rv3_resident.png')
        rp.click('#reviewBar button:has-text("Mine")'); rp.wait_for_timeout(250)
        rp.locator('.chart-card').screenshot(path='scratch/rv4_resident_mine.png')
        rp.click('#reviewBar button:has-text("Corrected")'); rp.wait_for_timeout(150)
        rp.click('#review button:has-text("Keep the corrected drawing")'); rp.wait_for_timeout(300)
        print('resident keeps corrected:', findings(rp), '| review closed:', not rp.is_visible('#reviewBar'))
        print('note:', rp.text_content('#note')[:200])
        # export with corrections while reviewing
        # ---------- hostile and damaged links ----------
        def b64u(bs): return base64.urlsafe_b64encode(bs).decode().rstrip('=')
        bomb = zlib.compressobj(9, zlib.DEFLATED, -15); data = bomb.compress(b'{"v":1,"o":' + b' ' * 30_000_000) + bomb.flush()
        evil = {'v': 1, 'st': 'reviewed', 'case': '<img src=x onerror=alert(1)>', 'reviewer': 'x' * 900,
                'o': {'eye': 'OS', 'findings': [{'type': 'hst', 'id': 1, 'hour': 12}, {'type': '__proto__', 'id': 2}]},
                'c': {'eye': 'OS', 'findings': [{'type': 'cat', 'key': 'constructor', 'id': 3}, {'type': 'rd', 'id': 4, 'path': {'pts': [[0, 0]] * 5000}}]},
                'cm': [{'at': [0, 0], 'text': '<script>alert(1)</script>'}]}
        tests = {'damaged': 'zAAAA', 'bomb': 'z' + b64u(data), 'evil': 'j' + b64u(json.dumps(evil).encode())}
        hp = b.new_context(viewport={'width': 1000, 'height': 900}).new_page(); watch(hp, 'hostile')
        hp.on('dialog', lambda d: (errs.append('DIALOG ' + d.message), d.dismiss()))
        for name, code in tests.items():
            hp.goto('about:blank'); t0 = time.time(); hp.goto(URL + '#r=' + code); hp.wait_for_timeout(1200)
            print(f'{name}: review opened={hp.is_visible("#reviewBar")}, toast="{hp.inner_text("#toast")[:60]}", {time.time() - t0:.1f}s')
            if name == 'evil':
                print('   escaped case label:', hp.inner_text('#reviewBar').split('|')[0][:80], '| findings:', findings(hp))
        # ---------- phone layout ----------
        mob = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); mp = mob.new_page(); watch(mp, 'mobile')
        mp.goto(back); mp.wait_for_timeout(900)
        print('mobile no horizontal scroll:', mp.evaluate('document.documentElement.scrollWidth') <= 390)
        mp.locator('#reviewCard').screenshot(path='scratch/rv5_mobile_card.png')
        mp.screenshot(path='scratch/rv6_mobile_top.png')
        b.close()
finally:
    srv.terminate()
print('\n'.join(errs) or 'no console errors')
