"""Generate src/logo.svg: glassy 'R' and 'D' (Nunito Black) with a navy brush slash, coral glow and underline."""
import math, pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

root = pathlib.Path(__file__).resolve().parent.parent
font = instantiateVariableFont(TTFont(root / 'fonts' / 'Nunito[wght].ttf'), {'wght': 900})
gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font['head'].unitsPerEm
SIZE, BASE = 150, 150
s = SIZE / upm

def glyph(ch, x):
    name = cmap[ord(ch)]
    pen = SVGPathPen(gs, ntos=lambda v: ('%.1f' % v).rstrip('0').rstrip('.'))
    gs[name].draw(TransformPen(pen, (s, 0, 0, -s, x, BASE)))
    bp = BoundsPen(gs); gs[name].draw(bp)
    xmin, ymin, xmax, ymax = bp.bounds
    return pen.getCommands(), (x + xmin * s, BASE - ymax * s, x + xmax * s, BASE - ymin * s)

R, rb = glyph('R', 0)
GAP = 10
# the slash is a small paintbrush: coral-loaded bristles at the bottom (touching the underline it just painted),
# a metal ferrule, and a navy handle leaning to the upper right
TIPX, TIPY, BL = rb[2] + 13, BASE + 20, 132
ANG = 19.0                                   # degrees clockwise from vertical
th = math.radians(ANG)
ux, uy = math.sin(th), -math.cos(th)         # unit vector tip -> handle end
def P(x, y):                                  # local (x across, y up the brush = negative) -> logo coords
    return (TIPX + x * math.cos(th) - y * math.sin(th), TIPY + x * math.sin(th) + y * math.cos(th))
end_pt = P(0, -BL)
brush = f'<g transform="translate({TIPX:.1f} {TIPY:.1f}) rotate({ANG}) scale(1.2 1)">' + f'''
<path d="M-6.4 -55 C-8 -70 -8 -84 -6.2 -96 L-3.4 -{BL - 3} Q0 -{BL + 1} 3.4 -{BL - 3} L6.2 -96 C8 -84 8 -70 6.4 -55 Z" class="logo-script"/>
<path d="M-4.6 -60 C-5.8 -72 -5.8 -84 -4.4 -95 L-2.4 -{BL - 6}" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="1.6" stroke-linecap="round"/>
<rect x="-7.4" y="-56" width="14.8" height="25" rx="2" fill="url(#rdFerr)"/>
<path d="M-7.4 -47.5H7.4M-7.4 -44.5H7.4" stroke="#5E6B78" stroke-opacity=".55" stroke-width="1"/>
<path d="M-6.8 -31.5 C-7.4 -20 -4.6 -9 0.6 0 C3.6 -8 7.6 -18 6.8 -31.5 Z" fill="url(#rdBris)"/>
<path d="M-3 -30 C-3.2 -21 -1.8 -12 0.4 -4 M0.6 -30 C0.8 -21 0.9 -12 0.8 -4 M3.8 -30 C3.6 -22 2.8 -14 1.6 -7" fill="none" stroke="#B9472F" stroke-opacity=".45" stroke-width=".9" stroke-linecap="round"/>
</g>'''
# right-most extent of the brush, so the D never touches it
brush_right = max(P(x, y)[0] for x in (-9.6, 9.6) for y in range(-BL, 1, 4))
D, db = glyph('D', 0)
dx_shift = brush_right + 12 - db[0]
D, db = glyph('D', dx_shift)
glass = R + ' ' + D
W = db[2]
cxD = (db[0] + db[2]) / 2; cxR = (rb[0] + rb[2]) / 2
line_x0, line_x1 = rb[0] + 2, db[2] - 2
vb_w = W + 26
svg = f'''<svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="-12 -4 {vb_w:.0f} 192" role="img" aria-label="R/D">
<defs>
<linearGradient id="rdG" gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="40" y2="160"><stop offset="0" stop-color="#D3EDFB"/><stop offset=".5" stop-color="#A3D3F2"/><stop offset="1" stop-color="#8CC3EA"/></linearGradient>
<radialGradient id="rdC1" gradientUnits="userSpaceOnUse" cx="{cxD + 30:.0f}" cy="160" r="96"><stop offset="0" stop-color="#FA8E72" stop-opacity=".95"/><stop offset=".55" stop-color="#F7A08C" stop-opacity=".45"/><stop offset="1" stop-color="#F7A08C" stop-opacity="0"/></radialGradient>
<radialGradient id="rdC2" gradientUnits="userSpaceOnUse" cx="{cxR + 30:.0f}" cy="162" r="50"><stop offset="0" stop-color="#FA8E72" stop-opacity=".8"/><stop offset="1" stop-color="#FA8E72" stop-opacity="0"/></radialGradient>
<linearGradient id="rdRim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="{W:.0f}" y2="160"><stop offset="0" stop-color="#78B7E2"/><stop offset=".78" stop-color="#6EAEDC"/><stop offset="1" stop-color="#E9775E"/></linearGradient>
<linearGradient id="rdSpec" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="rdLine" gradientUnits="userSpaceOnUse" x1="{line_x0:.0f}" y1="0" x2="{line_x1:.0f}" y2="0"><stop offset="0" stop-color="#F6866B"/><stop offset=".5" stop-color="#E9806C"/><stop offset="1" class="logo-line-end" stop-color="#2B5E8C"/></linearGradient>
<clipPath id="rdClip"><path d="{glass}"/></clipPath>
<filter id="rdSh" x="-10%" y="-10%" width="125%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#4F86B3" flood-opacity=".3"/></filter>
<linearGradient id="rdFerr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7F8C99"/><stop offset=".42" stop-color="#EEF2F5"/><stop offset=".62" stop-color="#C7D0D8"/><stop offset="1" stop-color="#6F7C89"/></linearGradient>\n<linearGradient id="rdBris" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#E35F45"/><stop offset=".55" stop-color="#F6866B"/><stop offset="1" stop-color="#F9B19E"/></linearGradient>\n<filter id="rdBl"><feGaussianBlur stdDeviation="2.4"/></filter>
</defs>
<g filter="url(#rdSh)"><path d="{glass}" fill="url(#rdG)" stroke="url(#rdRim)" stroke-width="5.5" stroke-linejoin="round" paint-order="stroke"/></g>
<g clip-path="url(#rdClip)">
<rect x="-10" y="0" width="{W + 20:.0f}" height="170" fill="url(#rdC1)"/><rect x="-10" y="0" width="{W + 20:.0f}" height="170" fill="url(#rdC2)"/>
<path d="{glass}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="8" filter="url(#rdBl)" transform="translate(2.5 3)"/>
<path d="{glass}" fill="none" stroke="#5C9DCE" stroke-opacity=".4" stroke-width="2.6" transform="translate(-1.6 -2)"/>
<ellipse cx="{W / 2:.0f}" cy="34" rx="{W * 0.55:.0f}" ry="28" fill="url(#rdSpec)" opacity=".5"/>
</g>
<path d="M{line_x0:.0f} 179 Q {(line_x0 + line_x1) / 2:.0f} 170 {line_x1:.0f} 174" fill="none" stroke="url(#rdLine)" stroke-width="7.5" stroke-linecap="round"/>
{brush}
</svg>
'''
(root / 'src' / 'logo.svg').write_text(svg)
print('R', rb, 'brush tip', (TIPX, TIPY), 'end', end_pt, 'D', db, 'viewBox w', vb_w)
