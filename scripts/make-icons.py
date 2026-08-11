"""Regenerate the Point Poker icon set from the master brand mark.

The master is an edge-to-edge 3D render, so nothing is trimmed: the card stack
already touches all four sides. Everything below is a straight LANCZOS
downscale of that one file, which keeps the brushed-gold texture and the bevel
on the diamond at the sizes that can still show them.

The maskable variants are the exception. Android crops a maskable icon to a
circle or a squircle, so an edge-to-edge mark loses its card corners. Those get
the felt background and the mark inset into the 80% safe zone.

Run: python3 scripts/make-icons.py     (needs Pillow; nothing else imports it)
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "brand-mark-master.png")
OUT = os.path.join(ROOT, "public")

FELT = (12, 26, 15, 255)  # --bg #0c1a0f, the app's deepest forest green


def out(name):
    return os.path.join(OUT, name)


master = Image.open(SRC).convert("RGBA")


def square(img):
    """Pad to a square canvas so no downscale distorts the aspect."""
    w, h = img.size
    if w == h:
        return img
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return canvas


sq = square(master)


def scaled(size):
    return sq.resize((size, size), Image.LANCZOS)


# Transparent and edge-to-edge: browser tabs, apple-touch-icon, PWA "any".
for name, size in [("favicon-32.png", 32), ("logo192.png", 192), ("logo512.png", 512)]:
    scaled(size).save(out(name), optimize=True)

# The in-app nav mark, and the only icon on the page-load critical path.
# The largest any screen draws it is 56px (the join hero); nav is 44, footer 36,
# room header 34. 176px is 3.1x the biggest of those, so it is still sharp on a
# 3x display, and it costs 42 kB instead of the 91 kB a 264px source did. At
# 56px the two are indistinguishable: mean per-channel difference 0.62/255.
scaled(176).save(out("brand-mark.png"), optimize=True)

# 16/24/32/48 is every size a browser actually asks an .ico for. Including a
# 256px entry took the file from 10 kB to 133 kB for nothing.
scaled(48).save(out("favicon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48)])

# Maskable: felt plate, mark inset to the safe zone.
for name, size in [("logo192-maskable.png", 192), ("logo512-maskable.png", 512)]:
    plate = Image.new("RGBA", (size, size), FELT)
    inner = round(size * 0.78)
    mark = sq.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    plate.paste(mark, (offset, offset), mark)
    plate.save(out(name), optimize=True)

print(f"icons: regenerated 7 files in {OUT} from {os.path.basename(SRC)}")
