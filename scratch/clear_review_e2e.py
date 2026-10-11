"""Clear while a teaching review is open: it asks what to clear, and 'Clear and close' leaves a clean chart (no review marks)."""
import subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3', '-m', 'http.server', '8770', '--bind', '127.0.0.1'], cwd='dist/site', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8770/'
errs, fails = [], []
def check(name, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))
    if not ok: fails.append(name)
def watch(pg, tag):
    pg.on('pageerror', lambda e: errs.append(f'{tag} PAGEERROR {e}'))
    pg.on('console', lambda m: errs.append(f'{tag} {m.type}: {m.text}') if m.type in ('error', 'warning') and 'willReadFrequently' not in m.text else None)
def cmd(pg, t): pg.fill('#cmd', t); pg.press('#cmd', 'Enter'); pg.wait_for_timeout(250)
def findings(pg): return pg.evaluate("() => [...document.querySelectorAll('#findings .f-title')].map(e => e.textContent)")
def bar_buttons(pg): return pg.evaluate("() => [...document.querySelectorAll('#reviewBar button')].map(b => b.textContent)")
def reviewing(pg): return pg.is_visible('#reviewBar')
BASE = {}
def review_marks(pg):
    """review-red rings or the purple ghost outline painted on the chart, beyond what a blank chart of that size has (vessels)"""
    w = pg.evaluate("document.querySelector('#chart').width")
    return max(0, _marks(pg) - BASE.get(w, 0))
def baseline(pg):
    BASE[pg.evaluate("document.querySelector('#chart').width")] = _marks(pg)
def _marks(pg):
    return pg.evaluate("""() => { const c = document.querySelector('#chart'), x = c.getContext('2d', { willReadFrequently: true }), d = x.getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i+1], b = d[i+2];
        if ((Math.abs(r - 200) < 14 && Math.abs(g - 56) < 14 && Math.abs(b - 47) < 14) || (Math.abs(r - 104) < 12 && Math.abs(g - 78) < 12 && Math.abs(b - 160) < 12)) n++; }
      return n; }""")
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        # resident sends a drawing
        rp = b.new_context(viewport={'width': 1360, 'height': 1000}).new_page(); watch(rp, 'resident')
        rp.goto(URL); rp.wait_for_timeout(700); baseline(rp)
        cmd(rp, 'macula on RRD 10 to 2 with HST at 12, lattice 7 to 8')
        sent = findings(rp)
        rp.click('#review button:has-text("Send for review")'); rp.wait_for_timeout(400); link = rp.input_value('.rv-link')

        # reviewer who already had a drawing of their own
        fp = b.new_context(viewport={'width': 1360, 'height': 1000}).new_page(); watch(fp, 'fellow')
        fp.goto(URL); fp.wait_for_timeout(700); cmd(fp, 'RD from 3 to 6 macula on'); own = findings(fp)
        fp.goto(link); fp.wait_for_timeout(900)
        cmd(fp, 'macula off'); corrected = findings(fp)
        fp.click('#clear'); fp.wait_for_timeout(200)
        check('reviewer Clear asks first', 'Clear the chart?' in fp.inner_text('#reviewBar'), ' | '.join(bar_buttons(fp)))
        check('nothing cleared yet', findings(fp) == corrected)
        fp.click('#reviewBar button:has-text("Cancel")'); fp.wait_for_timeout(150)
        check('Cancel keeps everything', findings(fp) == corrected and 'Clear the chart?' not in fp.inner_text('#reviewBar'))
        fp.click('#clear'); fp.keyboard.press('Escape'); fp.wait_for_timeout(150)
        check('Esc cancels', 'Clear the chart?' not in fp.inner_text('#reviewBar'))
        fp.click('#clear'); fp.click('#reviewBar button:has-text("Undo my corrections")'); fp.wait_for_timeout(250)
        check('Undo my corrections → drawing as sent, still reviewing', findings(fp) == sent and reviewing(fp), fp.inner_text('#revCount'))
        cmd(fp, 'macula off')
        fp.click('#clear'); fp.click('#reviewBar button:has-text("Redraw from scratch")'); fp.wait_for_timeout(250)
        check('Redraw from scratch → empty, still reviewing, originals marked removed', not findings(fp) and reviewing(fp) and review_marks(fp) > 50, fp.inner_text('#revCount'))
        check('Clear still usable on the emptied review chart', not fp.is_disabled('#clear'))
        cmd(fp, 'RD 9 to 1 macula on')
        cmd(fp, 'clear'); fp.wait_for_timeout(150)
        check('saying “clear” also asks', 'Clear the chart?' in fp.inner_text('#reviewBar') and findings(fp) == ['RD 9 → 1 · 4 clock hours'], ' | '.join(bar_buttons(fp)))
        fp.click('#reviewBar button:has-text("Clear and close the review")'); fp.wait_for_timeout(300)
        check('Clear and close → blank chart, review closed', not findings(fp) and not reviewing(fp))
        check('no review marks left on the chart', review_marks(fp) < 20, review_marks(fp))
        fp.locator('.chart-card').screenshot(path='scratch/cr1_after_close.png')
        check('Clear disabled again on a blank chart', fp.is_disabled('#clear'))
        fp.click('#undo'); fp.wait_for_timeout(200)
        check('Undo → the corrected drawing, as a normal drawing', findings(fp) == ['RD 9 → 1 · 4 clock hours'] and not reviewing(fp) and review_marks(fp) < 20, findings(fp))
        fp.click('#undo'); fp.wait_for_timeout(200)
        check('Undo again → your own drawing from before the review', findings(fp) == own, findings(fp))
        fp.reload(); fp.wait_for_timeout(700)
        check('after reload: no review comes back', not reviewing(fp) and findings(fp) == own)

        # resident receiving corrections
        fp.goto(link); fp.wait_for_timeout(900); cmd(fp, 'macula off')
        fp.click('#review button:has-text("Send back to resident")'); fp.wait_for_timeout(400); back = fp.input_value('.rv-link')
        rp.goto(back); rp.wait_for_timeout(900)
        rp.click('#clear'); rp.wait_for_timeout(150)
        check('resident Clear asks, two choices', bar_buttons(rp) == ['Clear and close the review', 'Cancel'], ' | '.join(bar_buttons(rp)))
        rp.click('#reviewBar button:has-text("Clear and close the review")'); rp.wait_for_timeout(300)
        check('resident: blank chart, review closed, no marks', not findings(rp) and not reviewing(rp) and review_marks(rp) < 20, review_marks(rp))

        # phone layout of the question
        mp = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2).new_page(); watch(mp, 'mobile')
        mp.goto(URL); mp.wait_for_timeout(700); baseline(mp)
        mp.goto(link); mp.wait_for_timeout(900); cmd(mp, 'macula off'); mp.evaluate('scrollTo(0, 0)')
        mp.tap('#clear'); mp.wait_for_timeout(200)
        mp.locator('#reviewBar').scroll_into_view_if_needed(); mp.locator('#reviewBar').screenshot(path='scratch/cr2_phone_ask.png')
        check('phone: no sideways scroll', mp.evaluate('document.documentElement.scrollWidth') <= 390)
        mp.tap('#reviewBar button:has-text("Clear and close the review")'); mp.wait_for_timeout(300)
        check('phone: blank chart, no marks', not findings(mp) and not reviewing(mp) and review_marks(mp) < 20, review_marks(mp))
        b.close()
finally:
    srv.terminate()
print('\n'.join(errs) or 'no console errors')
print('ALL PASS' if not fails and not errs else f'{len(fails)} FAILED')
