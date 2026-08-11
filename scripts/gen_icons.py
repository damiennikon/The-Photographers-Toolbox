"""Generates the aperture-mark app icons (PNG) for the PWA manifest.
Run with: python scripts/gen_icons.py
Regenerate any time the mark's colors/proportions change in the mockup.
"""
import math
import os
from PIL import Image, ImageDraw

BG = (10, 14, 20, 255)      # #0a0e14
ACCENT = (224, 41, 58, 255)  # #e0293a
ACCENT_DIM = (160, 30, 43, 255)

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")


def draw_aperture(size):
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)

    cx, cy = size / 2, size / 2
    r_outer = size * 0.42
    r_inner = size * 0.16
    blade_count = 6
    stroke_w = max(2, round(size * 0.035))

    # outer ring
    draw.ellipse(
        [cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer],
        outline=ACCENT,
        width=stroke_w,
    )

    # aperture blades as lines from inner ring out toward the rim,
    # rotated evenly to echo the mockup's aperture glyph
    for i in range(blade_count):
        angle = (2 * math.pi / blade_count) * i - math.pi / 2
        x1 = cx + r_inner * math.cos(angle)
        y1 = cy + r_inner * math.sin(angle)
        x2 = cx + r_outer * 0.92 * math.cos(angle)
        y2 = cy + r_outer * 0.92 * math.sin(angle)
        draw.line([x1, y1, x2, y2], fill=ACCENT_DIM, width=stroke_w)

    # inner hub
    draw.ellipse(
        [cx - r_inner, cy - r_inner, cx + r_inner, cy + r_inner],
        outline=ACCENT,
        width=stroke_w,
    )

    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (192, 512):
        img = draw_aperture(size)
        path = os.path.join(OUT_DIR, f"icon-{size}.png")
        img.save(path)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
