"""Crops the tile mockup source images down to just their photographic
background (above the pre-rendered icon/title/description block), resizes,
and converts to WebP for use as tile background-images.

The live tile component (src/views/home.js) renders its own icon badge,
title, underline, description, and chevron on top via CSS/HTML -- so the
source mockups' baked-in badge/text has to be cropped out first. Two things
were tried and rejected before landing on "crop above the badge":
  - No crop at all (full square) leaves the mockup's own baked-in title and
    description text sitting right behind the live copy, at a different
    position/font -- reads as visibly doubled text.
  - Cropping to just above the *text* (keeping the badge) leaves the
    mockup's own large badge circle+icon as a visible "ghost" duplicate of
    the live badge, even under the gradient -- it's a bigger, differently
    positioned shape, not just faint text, so it doesn't disappear the way
    the text does.
Cropping above the badge avoids both. It does mean the usable strip is
short/wide (photo-only region ends well before the square canvas does),
so at the near-square tile aspect ratio this now ships at, object-fit:
cover has to crop a fair amount off the sides -- that's a real limit of
these baked-mockup sources, not something tunable away in CSS (see
per-tile object-position comment in components.css).

Source files (not committed — see .gitignore) live in the repo root:
  spotters_log_ui.jpg, astroweather_ui.jpg, dso_search_ui.jpg, astro_planner_ui.jpg

Run with: python scripts/process_tile_images.py
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_DIR = os.path.join(ROOT, "public", "assets", "tiles")

# All source mockups share the same ~1404x1407 canvas, but the badge circle
# doesn't start at exactly the same y on every one (it's composited over each
# photo individually) -- measured badge-top per image, each with a ~5px
# safety margin above it.
OUT_WIDTH = 1000
QUALITY = 78

SOURCES = {
    "spotters_log_ui.jpg": ("spotters-log.webp", 518),
    "astroweather_ui.jpg": ("astro-weather.webp", 517),
    "dso_search_ui.jpg": ("dso-search.webp", 535),
    "astro_planner_ui.jpg": ("astro-planner.webp", 531),
}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for src_name, (out_name, crop_height) in SOURCES.items():
        src_path = os.path.join(ROOT, src_name)
        if not os.path.exists(src_path):
            print(f"skip (not found): {src_name}")
            continue

        img = Image.open(src_path).convert("RGB")
        w, h = img.size
        cropped = img.crop((0, 0, w, min(crop_height, h)))

        out_h = round(cropped.height * (OUT_WIDTH / cropped.width))
        resized = cropped.resize((OUT_WIDTH, out_h), Image.LANCZOS)

        out_path = os.path.join(OUT_DIR, out_name)
        resized.save(out_path, "WEBP", quality=QUALITY, method=6)
        size_kb = os.path.getsize(out_path) / 1024
        print(f"wrote {out_path} ({resized.width}x{resized.height}, {size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
