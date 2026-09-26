from PIL import Image
import numpy as np
from scipy import ndimage

SRC = '/Users/lucasnp/apollo-health/public/logo-512.png'
BG  = (253, 208, 115)
INK = (20, 22, 28)          # near-black, sampled from the original linework

im = Image.open(SRC).convert('RGB')
a  = np.array(im).astype(int); h, w, _ = a.shape
bg = np.array(BG)
ink = (np.abs(a - bg).sum(2) > 90)

cy, cx = h / 2, w / 2
Y, X = np.mgrid[0:h, 0:w]
r = np.sqrt((Y - cy) ** 2 + (X - cx) ** 2)
rect = lambda x0, y0, x1, y1: (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1)

# The wreath lives outside r=110. The syringe pokes through it, so carve a
# corridor for needle / barrel / flange (measured off the source at 512px).
protect = rect(213, 84, 226, 130) | rect(204, 126, 236, 183) | rect(199, 180, 241, 200)
keep = ink & ((r < 110) | protect)
keep &= Y < 358                                   # drop the inner-circle arc under the hooves

lab, n = ndimage.label(keep, structure=np.ones((3, 3), bool))
sizes = ndimage.sum(keep, lab, range(1, n + 1))
keep &= np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 60])   # speck removal

# Flatten to a clean 1-bit mark, then scale so content fills ~80% of the canvas
# (80% is the PWA maskable safe zone; the manifest ships logo-512 as maskable).
ys, xs = np.nonzero(keep)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
mw, mh = x1 - x0 + 1, y1 - y0 + 1
print(f'mark bbox {mw}x{mh} at ({x0},{y0})  -> was {100*max(mw,mh)/512:.0f}% of frame')

mark = Image.fromarray(np.where(keep, 255, 0).astype('uint8')[y0:y1 + 1, x0:x1 + 1], 'L')

SAFE = 0.80
for size in (512, 256, 192, 180, 128, 64, 32):
    target = int(size * SAFE)
    s = target / max(mw, mh)
    nw, nh = max(1, round(mw * s)), max(1, round(mh * s))
    m = mark.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGB', (size, size), BG)
    canvas.paste(Image.new('RGB', (nw, nh), INK), ((size - nw) // 2, (size - nh) // 2), m)
    canvas.save(f'out-logo-{size}.png')
    print(f'  logo-{size}.png  mark {nw}x{nh} = {100*max(nw,nh)/size:.0f}%')
