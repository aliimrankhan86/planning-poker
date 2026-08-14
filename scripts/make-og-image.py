"""Regenerate public/og-image.png, the 1200x630 card every unfurler shows.

The previous one was rendered when there was still a paid tier. It advertised
"8 free participants. 20 on Pro." and carried a PRO badge, both of which have
been false since the product went free for everyone, and three of its labels
were clipped by their own pills. Every string here is measured before it is
drawn, so nothing can silently overflow again.

Fonts come from public/fonts, converted from woff2 on the fly, so the card is
set in the same Outfit the site ships rather than a lookalike.

The wordmark is measured against the mark rather than positioned by eye: its
size is the site logo's word-to-mark ratio (28px word on a 48px mark) applied
to this card's 142px mark, and its baseline is derived from the rendered cap
box so the caps centre on the mark whatever the face's metrics happen to be.
PIL has no letter-spacing, so the site's -0.02em is not reproduced; drawing
per-character to fake it would cost the face's kerning pairs, which is the
worse trade at this size.

Run: python3 scripts/make-og-image.py     (needs Pillow, fonttools, brotli)
"""
import io
import os

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "public", "fonts")
W, H = 1200, 630

# Straight from src/design-system/tokens.css.
FELT_DEEP = (7, 17, 14)
FELT = (12, 26, 15)
FELT_MID = (18, 32, 24)
GOLD = (201, 146, 42)
GOLD2 = (232, 184, 75)
GOLD3 = (245, 208, 122)
CREAM = (238, 242, 236)
MUTED = (168, 186, 172)
# The wordmark's own two colours, so the card's logo is the site's logo. These
# are --text-on-felt and --brass-300, what .pp-logo--on-felt resolves to.
ON_FELT = (245, 251, 247)
BRASS_300 = (255, 217, 120)


def font(name, size):
    """Load a brand woff2 as a PIL font (fontTools does the decompression)."""
    f = TTFont(os.path.join(FONTS, name))
    f.flavor = None
    buf = io.BytesIO()
    f.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, size)


OUTFIT_REG = "outfit-v15-latin-regular.woff2"
OUTFIT_MED = "outfit-v15-latin-500.woff2"
OUTFIT_SEMI = "outfit-v15-latin-600.woff2"
OUTFIT_BOLD = "outfit-v15-latin-700.woff2"


# ── background: felt with a warm glow behind the mark ──────────────────────
img = Image.new("RGB", (W, H), FELT)
d = ImageDraw.Draw(img)
for y in range(H):  # vertical felt gradient
    t = y / H
    d.line(
        [(0, y), (W, y)],
        fill=tuple(round(FELT_DEEP[i] + (FELT_MID[i] - FELT_DEEP[i]) * t) for i in range(3)),
    )

glow = Image.new("RGB", (W, H), (0, 0, 0))
ImageDraw.Draw(glow).ellipse([-160, 120, 620, 900], fill=(70, 52, 12))
img = Image.blend(img, Image.blend(img, glow, 0.0), 0.0)
img = Image.composite(
    Image.blend(img, glow, 0.55).filter(ImageFilter.GaussianBlur(90)), img,
    Image.new("L", (W, H), 90),
)
d = ImageDraw.Draw(img)

# Hairline grid, the felt texture the app uses behind its hero.
for x in range(0, W, 60):
    d.line([(x, 0), (x, H)], fill=(20, 38, 28), width=1)
for y in range(0, H, 60):
    d.line([(0, y), (W, y)], fill=(20, 38, 28), width=1)

# Two columns with a hard boundary. The text column stops at TEXT_MAX and the
# deck starts at DECK_X, so copy can never run under the cards the way the
# previous card's did.
PAD = 72
TEXT_MAX = 700
DECK_X = 762

# ── the mark ───────────────────────────────────────────────────────────────
mark = Image.open(os.path.join(ROOT, "public", "logo512.png")).convert("RGBA")
MARK, MARK_Y = 142, 54
mark = mark.resize((MARK, MARK), Image.LANCZOS)
img.paste(mark, (PAD, MARK_Y), mark)

# ── wordmark and copy ──────────────────────────────────────────────────────
# .pp-logo--lg sets a 28px word beside a 48px mark; this card's mark is 142.
f_brand = font(OUTFIT_SEMI, round(MARK * 28 / 48))
f_tag = font(OUTFIT_BOLD, 38)
f_body = font(OUTFIT_REG, 26)
f_pill = font(OUTFIT_MED, 23)
f_url = font(OUTFIT_MED, 25)

# Centre the caps on the mark, not the em box: "Point Poker" has one descender
# and no ascender above cap height, so the em box sits low and a fixed y drifts
# with the face. "PP" is cap top to baseline and nothing else.
cap_top, cap_bottom = d.textbbox((0, 0), "PP", font=f_brand)[1::2]
x, brand_y = PAD + MARK + 26, round(MARK_Y + MARK / 2 - (cap_top + cap_bottom) / 2)
d.text((x, brand_y), "Point", font=f_brand, fill=ON_FELT)
d.text((x + d.textlength("Point ", font=f_brand), brand_y), "Poker", font=f_brand, fill=BRASS_300)

d.text((PAD, 244), "Free planning poker for agile teams", font=f_tag, fill=CREAM)

BODY = [
    "Create a room, drop the link in your team chat,",
    "and everyone reveals at the same time.",
]
for i, line in enumerate(BODY):
    d.text((PAD, 304 + i * 38), line, font=f_body, fill=MUTED)

# Gold rule, measured against the copy it closes rather than a guessed width.
rule_w = max(d.textlength(line, font=f_body) for line in BODY)
d.rectangle([PAD, 394, PAD + rule_w, 397], fill=GOLD)

# ── fact pills. Measured, then drawn: the old card clipped three of these ──
PILLS = [
    ("Free for every team", GOLD3),
    ("20 per room", CREAM),
    ("Unlimited rounds", CREAM),
    ("No account", CREAM),
]
px, py, GAP = PAD, 438, 13
for label, colour in PILLS:
    w = d.textlength(label, font=f_pill) + 40
    if px + w > TEXT_MAX:  # wrap rather than run under the deck
        px, py = PAD, py + 56
    d.rounded_rectangle([px, py, px + w, py + 46], radius=23,
                        fill=(16, 34, 24), outline=(46, 74, 56), width=1)
    d.text((px + 20, py + 11), label, font=f_pill, fill=colour)
    px += w + GAP

d.text((PAD, 552), "pointpoker.app", font=f_url, fill=GOLD2)

# ── the deck, right column, vertically centred ─────────────────────────────
CARDS = [("3", MUTED), ("5", GOLD3), ("8", MUTED)]
cw, ch, cgap = 108, 164, 22
deck_w = 3 * cw + 2 * cgap
cy = (H - ch) // 2 - 18
for i, (value, colour) in enumerate(CARDS):
    top = cy + (-18 if i == 1 else 0)
    left = DECK_X + i * (cw + cgap)
    box = [left, top, left + cw, top + ch]
    is_pick = i == 1
    d.rounded_rectangle([box[0] + 5, box[1] + 9, box[2] + 5, box[3] + 9], radius=16,
                        fill=(6, 14, 11))
    d.rounded_rectangle(box, radius=16, fill=(19, 38, 28),
                        outline=GOLD2 if is_pick else (52, 78, 62), width=3 if is_pick else 2)
    pt = 60 if is_pick else 50
    f_val = font(OUTFIT_BOLD, pt)
    d.text((left + (cw - d.textlength(value, font=f_val)) / 2, top + (ch - pt) / 2 - 10),
           value, font=f_val, fill=colour)

f_cap = font(OUTFIT_MED, 22)
cap = "Everyone reveals together"
d.text((DECK_X + (deck_w - d.textlength(cap, font=f_cap)) / 2, cy + ch + 40),
       cap, font=f_cap, fill=MUTED)

out = os.path.join(ROOT, "public", "og-image.png")
img.save(out, optimize=True)
print(f"og-image: wrote {out} at {W}x{H}")
