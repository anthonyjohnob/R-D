"""Imported by the classic-layout end-to-end suites: every browser context they open runs R/D's classic layout
(the simple layout is the default and has its own suite, shell_e2e.py)."""
from playwright.sync_api._generated import Browser
_new_context = Browser.new_context
def _ctx(self, *a, **k):
    ctx = _new_context(self, *a, **k)
    ctx.add_init_script('window.__rdClassic = true;')
    return ctx
def _page(self, *a, **k):
    return _ctx(self, *a, **k).new_page()
Browser.new_context = _ctx
Browser.new_page = _page
