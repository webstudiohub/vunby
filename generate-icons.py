import math
from PIL import Image, ImageDraw

NAVY = (0, 61, 107)
GOLD = (245, 192, 0)
WHITE = (255, 255, 255)


def diamond_points(cx, cy, half_diag):
    return [(cx, cy - half_diag), (cx + half_diag, cy), (cx, cy + half_diag), (cx - half_diag, cy)]


def draw_symbol(draw, cx, cy, scale, leg_color, bowl_color, diamond_color, stroke_scale=24):
    def pt(x, y):
        return (cx + x * scale, cy + y * scale)

    stroke_w = max(1, int(stroke_scale * scale))
    draw.line([pt(-59.5, -43), pt(-9.5, 47)], fill=leg_color, width=stroke_w)
    draw.line([pt(-9.5, 47), pt(22.5, -3)], fill=leg_color, width=stroke_w)
    for (x, y) in [(-59.5, -43), (-9.5, 47), (22.5, -3)]:
        r = stroke_w / 2
        px, py = pt(x, y)
        draw.ellipse([px - r, py - r, px + r, py + r], fill=leg_color)

    r1 = 22 * scale
    r2 = 24 * scale
    b1 = pt(35.5, -25)
    b2 = pt(32.5, 9)
    draw.ellipse([b1[0] - r1, b1[1] - r1, b1[0] + r1, b1[1] + r1], fill=bowl_color)
    draw.ellipse([b2[0] - r2, b2[1] - r2, b2[0] + r2, b2[1] + r2], fill=bowl_color)

    dcx, dcy = pt(22.5, -3)
    half_diag = 13 * scale * math.sqrt(2)
    draw.polygon(diamond_points(dcx, dcy, half_diag), fill=diamond_color)


def make_icon(size, maskable=False, path=None):
    img = Image.new("RGB", (size, size), NAVY)
    draw = ImageDraw.Draw(img)
    # Ícone "maskable" precisa de uma margem de segurança maior (o SO pode
    # recortar em círculo/squircle) — símbolo menor e mais centralizado.
    scale = (size / 210) * (0.72 if maskable else 0.92)
    draw_symbol(draw, size / 2, size / 2, scale, WHITE, WHITE, GOLD)
    img.save(path)


import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT_DIR, exist_ok=True)

sizes = [192, 512]
for s in sizes:
    make_icon(s, maskable=False, path=os.path.join(OUT_DIR, f"icon-{s}.png"))
    make_icon(s, maskable=True, path=os.path.join(OUT_DIR, f"icon-{s}-maskable.png"))

# Apple touch icon (iOS não usa manifest para o ícone de tela inicial)
make_icon(180, maskable=False, path=os.path.join(OUT_DIR, "apple-touch-icon.png"))

# Favicon simples (32px) — reaproveita o mesmo símbolo
make_icon(32, maskable=False, path=os.path.join(OUT_DIR, "favicon-32.png"))

print("done —", OUT_DIR)
