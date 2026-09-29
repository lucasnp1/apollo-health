# Builds every logo asset from the original medallion (scripts/assets/
# logo-medallion-512.png): the rider on the horse, without the wreath, the
# rings or the ground, traced to a vector so it stays crisp at any size.
#
# Replaces logo-deborder.py, whose fixed radius (r < 110) sliced off the rear
# hoof and the tail tip, and which kept the medallion floor as a "ground" line.
#
# Needs: pillow numpy scipy potracer resvg-py
#   uv venv /tmp/logo && VIRTUAL_ENV=/tmp/logo uv pip install pillow numpy scipy potracer resvg-py
#   /tmp/logo/bin/python scripts/logo-build.py

import io
import os
import numpy as np
import potrace
import resvg_py
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'scripts/assets/logo-medallion-512.png')
PUB = os.path.join(ROOT, 'public')
BG, INK = '#FDD073', '#14161C'

a = np.array(Image.open(SRC).convert('RGB')).astype(int)
ink = np.abs(a - np.array((253, 208, 115))).sum(2) > 90
h, w = ink.shape
Y, X = np.mgrid[0:h, 0:w]
r = np.sqrt((Y - 256) ** 2 + (X - 256) ** 2)
rect = lambda x0, y0, x1, y1: (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1)
disk = lambda k: np.add.outer(np.arange(-k, k + 1) ** 2, np.arange(-k, k + 1) ** 2) <= k * k
FLOOR = 352   # the medallion floor band starts here (rows 352-356); hooves end above it

# 1. Everything inside the inner ring, plus the syringe, which pokes out the top.
syringe = rect(213, 84, 226, 130) | rect(204, 126, 236, 183) | rect(199, 180, 241, 200)
base = ink & ((r < 110) | syringe) & (Y < FLOOR)

# 2. The horse crosses the ring at the rear leg, the tail and the front hooves.
#    Rings and wreath are thin strokes; the horse is thick. Keep the thick ink
#    that touches the horse, grown back to its true edge.
thick = ndi.binary_opening(ink, structure=disk(3)) & (Y < FLOOR)
lab, n = ndi.label(thick & ~base, structure=np.ones((3, 3), bool))
near = ndi.binary_dilation(base, structure=np.ones((3, 3), bool), iterations=2)
back = np.isin(lab, [i for i in range(1, n + 1) if (near & (lab == i)).any()])
back = ndi.binary_dilation(back, structure=disk(3)) & ink & (Y < FLOOR) & (r < 140)
keep = base | back

# 3. Drop specks.
lab, n = ndi.label(keep, structure=np.ones((3, 3), bool))
sizes = ndi.sum(keep, lab, range(1, n + 1))
keep &= np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 60])

ys, xs = np.nonzero(keep)
m = keep[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
mh, mw = m.shape

# 4. Trace. potracer treats False as ink, hence the inversion.
parts = []
for c in potrace.Bitmap(~m).trace(turdsize=3, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.0, opticurve=True, opttolerance=0.2):
    d = [f'M{c.start_point.x:.2f},{c.start_point.y:.2f}']
    for s in c.segments:
        if s.is_corner:
            d.append(f'L{s.c.x:.2f},{s.c.y:.2f}L{s.end_point.x:.2f},{s.end_point.y:.2f}')
        else:
            d.append(f'C{s.c1.x:.2f},{s.c1.y:.2f} {s.c2.x:.2f},{s.c2.y:.2f} {s.end_point.x:.2f},{s.end_point.y:.2f}')
    parts.append(''.join(d) + 'Z')
PATH = ''.join(parts)


def svg(size, fill, bg=True):
    """The mark scaled uniformly to `fill` of a square, centred."""
    s = fill * size / max(mw, mh)
    tx, ty = (size - mw * s) / 2, (size - mh * s) / 2
    rect_bg = f'<rect width="{size}" height="{size}" fill="{BG}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
            f'{rect_bg}<g transform="translate({tx:.3f} {ty:.3f}) scale({s:.5f})">'
            f'<path fill="{INK}" fill-rule="evenodd" d="{PATH}"/></g></svg>')


# How much of the square the mark fills, per job:
#   512 maskable app icon: 80%, the launcher safe zone.
#   192/256 manifest + 180 apple-touch: 84%, rounded by the OS.
#   128 round avatars and the share card: 80%, must survive a circle crop.
#   32/64 favicons: 92%, a tab icon needs every pixel.
FILL = {512: 0.80, 256: 0.84, 192: 0.84, 180: 0.84, 128: 0.80, 64: 0.92, 32: 0.92}
for size, fill in FILL.items():
    png = resvg_py.svg_to_bytes(svg_string=svg(size, fill), width=size, height=size)
    Image.open(io.BytesIO(bytes(png))).convert('RGB').save(os.path.join(PUB, f'logo-{size}.png'), optimize=True)
    print(f'logo-{size}.png  fill {fill:.0%}')

# Header badges (rounded squares): a vector, so it is sharp at 28px and 56px alike.
with open(os.path.join(PUB, 'logo-badge.svg'), 'w') as f:
    f.write(svg(100, 0.88))
print('logo-badge.svg  fill 88%')
