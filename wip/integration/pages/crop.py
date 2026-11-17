# Crop a region out of a screenshot: crop.py in.png out.png x y w h [scale]
import sys
from PIL import Image
src, out, x, y, w, h = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7])
im = Image.open(src).crop((x, y, x + w, y + h))
if len(sys.argv) > 7:
    s = float(sys.argv[7]); im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
im.save(out)
