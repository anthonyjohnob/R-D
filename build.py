"""Assemble R/D from src/ into one self-contained page (artifact fragment + standalone file)."""
import pathlib, re
root = pathlib.Path(__file__).parent
src = root / 'src'
page = (src / 'page.html').read_text()
parts = {
    '/*@@CSS@@*/': (src / 'style.css').read_text(),
    '<!--@@LOGO@@-->': (src / 'logo.svg').read_text(),
    '/*@@CATALOG@@*/': (src / 'catalog.js').read_text(),
    '/*@@CORE@@*/': (src / 'core.js').read_text(),
    '/*@@RENDER@@*/': (src / 'render.js').read_text(),
    '/*@@RENDERCAT@@*/': (src / 'render-cat.js').read_text(),
    '/*@@BUCKLE@@*/': (src / 'buckle.js').read_text(),
    '/*@@HAND@@*/': (src / 'hand.js').read_text(),
    '/*@@APP@@*/': (src / 'app.js').read_text(),
}
for k, v in parts.items():
    assert k in page, k
    page = page.replace(k, v)
template = page                      # still holds the site placeholder
page = page.replace('<!--@@SITE_EXTRA@@-->\n', '')
assert '</script' not in ''.join(parts[k] for k in ('/*@@CATALOG@@*/', '/*@@CORE@@*/', '/*@@RENDER@@*/', '/*@@RENDERCAT@@*/', '/*@@BUCKLE@@*/', '/*@@HAND@@*/', '/*@@APP@@*/'))
out = root / 'dist'
(out / 'artifact').mkdir(parents=True, exist_ok=True)
(out / 'artifact' / 'R-D.html').write_text(page)
# standalone: real document with head/body
cut = page.index('</style>') + len('</style>')
head, body = page[:cut], page[cut:]
standalone = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
              '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
              + head + '\n</head>\n<body>' + body + '\n</body>\n</html>\n')
(out / 'R-D.html').write_text(standalone)
print('artifact', len(page), 'bytes; standalone', len(standalone), 'bytes')

# ------------------------------------------------------------------ website
# dist/site: the same page as a small static website — self-hosted fonts, installable (manifest + icons),
# offline (service worker), a privacy/terms section, and a social preview image. Deploy the folder as is.
import hashlib, json, shutil
site_src = root / 'site'
site = out / 'site'
if site.exists():
    shutil.rmtree(site)
site.mkdir(parents=True)
base = (root / 'site' / 'BASE_URL').read_text().strip() if (root / 'site' / 'BASE_URL').exists() else ''
html = template
gf = html[html.index('<link rel="preconnect" href="https://fonts.googleapis.com">'):html.index('<style>')]
html = html.replace(gf, (site_src / 'head.html').read_text().replace('@@BASE@@', base) + '\n')
html = html.replace('<style>\n', '<style>\n' + (site_src / 'fonts.css').read_text(), 1)
html = html.replace('<!--@@SITE_EXTRA@@-->\n', (site_src / 'privacy.html').read_text())
html = html.replace('</body>', '') if '</body>' in html else html
cut = html.index('</style>') + len('</style>')
head, body = html[:cut], html[cut:]
index = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
         '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
         + head + '\n</head>\n<body>' + body + '\n' + (site_src / 'sw-register.html').read_text() + '</body>\n</html>\n')
assert 'googleapis' not in index and 'gstatic' not in index, 'site must not load third-party fonts'
(site / 'index.html').write_text(index)
for d in ('fonts', 'icons'):
    shutil.copytree(site_src / d, site / d)
for f in ('manifest.webmanifest', 'og.png'):
    shutil.copy(site_src / f, site / f)
shell = ['./', 'manifest.webmanifest'] + [f'{d}/{x.name}' for d in ('fonts', 'icons') for x in sorted((site / d).iterdir()) if x.suffix in ('.woff2', '.png', '.svg')]
version = hashlib.sha256(''.join((site / f).read_bytes().hex()[:4000] for f in ['index.html']).encode() + index.encode()).hexdigest()[:10]
(site / 'sw.js').write_text((site_src / 'sw.js').read_text().replace('@@VERSION@@', version).replace('@@SHELL@@', json.dumps(shell)))
(site / '.nojekyll').write_text('')
(site / 'README.txt').write_text('''R/D website — deploy this folder as it is (static files, no server code).

Netlify: go to app.netlify.com/drop and drag this folder onto the page; sign in (free) to keep the site.
Cloudflare Pages: Workers & Pages → Create → Pages → Upload assets → choose this folder.
GitHub Pages: put these files in a repository, then Settings → Pages → Deploy from branch.

It must be served over https for dictation, offline use and "Add to Home Screen" to work.
Everything runs in the visitor's browser; nothing is uploaded or tracked.
''')
print('site', len(index), 'bytes; version', version, '; files', sum(1 for _ in site.rglob('*') if _.is_file()))
