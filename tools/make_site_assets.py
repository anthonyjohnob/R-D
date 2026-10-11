"""Icons, favicon and social-preview image for the R/D website, rendered from src/logo.svg and the chart.
Run after build.py (the preview image uses dist/R-D.html). Writes site/icons/* and site/og.png."""
import pathlib, re
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parent.parent
logo = (root / 'src' / 'logo.svg').read_text()
# a standalone logo: resolve the page's CSS hooks to the light-theme colours
inner = re.sub(r'^<svg[^>]*>', '', logo.strip()).rsplit('</svg>', 1)[0]
inner = inner.replace('class="logo-script"', 'fill="#124C78"').replace(' class="logo-line-end"', '')
VB = '-12 -4 303 192'
BG = '#F6F5F2'

def icon_svg(size, logo_w, rounded):
    lw = size * logo_w
    lh = lw * 192 / 303
    x, y = (size - lw) / 2, (size - lh) / 2 + size * 0.015
    rect = f'<rect width="{size}" height="{size}" rx="{size * 0.22 if rounded else 0}" fill="{BG}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">{rect}'
            f'<svg x="{x:.1f}" y="{y:.1f}" width="{lw:.1f}" height="{lh:.1f}" viewBox="{VB}">{inner}</svg></svg>')

out = root / 'site' / 'icons'
out.mkdir(parents=True, exist_ok=True)
(out / 'favicon.svg').write_text(icon_svg(64, 0.86, True))
targets = [  # name, px, logo width fraction, rounded corners
    ('icon-192.png', 192, 0.80, True), ('icon-512.png', 512, 0.80, True),
    ('icon-maskable-512.png', 512, 0.62, False),           # Android crops to a circle: keep the logo in the safe zone
    ('apple-touch-icon.png', 180, 0.72, False),            # iOS rounds the corners itself
    ('favicon-32.png', 32, 0.90, True),
]
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, px, lw, rounded in targets:
        pg = b.new_page(viewport={'width': px, 'height': px}, device_scale_factor=1)
        pg.set_content(f'<html><body style="margin:0;background:transparent">{icon_svg(px, lw, rounded)}</body></html>')
        pg.screenshot(path=str(out / name), omit_background=True, clip={'x': 0, 'y': 0, 'width': px, 'height': px})
        pg.close()
    # social preview: the logo, a line of text and the example chart
    pg = b.new_page(viewport={'width': 900, 'height': 900}, device_scale_factor=1)
    pg.goto((root / 'dist' / 'R-D.html').as_uri()); pg.wait_for_timeout(900)
    for c in ('fovea splitting RRD from 10 to 5 with a horseshoe tear at 12', 'lattice from 7 to 8'):   # the app opens blank
        pg.fill('#cmd', c); pg.press('#cmd', 'Enter'); pg.wait_for_timeout(250)
    chart = pg.evaluate("() => document.querySelector('#chart').toDataURL('image/png')")
    pg.close()
    pg = b.new_page(viewport={'width': 1200, 'height': 630}, device_scale_factor=1)
    fonts = (root / 'site' / 'fonts').as_uri()
    pg.set_content(f'''<html><head><style>
      @font-face {{ font-family: AH; src: url({fonts}/atkinson-hyperlegible-latin-400-normal.woff2); }}
      @font-face {{ font-family: AH; font-weight: 700; src: url({fonts}/atkinson-hyperlegible-latin-700-normal.woff2); }}
      body {{ margin: 0; width: 1200px; height: 630px; background: {BG}; font-family: AH, sans-serif; color: #13324F; display: flex; align-items: center; overflow: hidden; }}
      .l {{ width: 610px; padding: 0 0 0 70px; }}
      .l svg {{ width: 300px; height: auto; display: block; margin-bottom: 26px; }}
      h1 {{ font-size: 44px; line-height: 1.12; margin: 0 0 18px; font-weight: 700; }}
      p {{ font-size: 25px; line-height: 1.4; margin: 0; color: #44566A; }}
      img {{ width: 560px; height: 560px; margin-left: 10px; border-radius: 26px; box-shadow: 0 14px 40px rgba(19,50,79,.14); }}
    </style></head><body><div class="l"><svg viewBox="{VB}">{inner}</svg>
      <h1>Retinal detachment drawing, by voice, text or hand</h1>
      <p>Standard colour code · Lincoff break analysis · evidence-based repair options · works offline</p></div>
      <img src="{chart}"></body></html>''')
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(root / 'site' / 'og.png'))
    b.close()
print('icons:', sorted(x.name for x in out.iterdir()))
