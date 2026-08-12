"""Converts the tile source images to WebP for use as tile background-images,
with no cropping or resizing beyond compression.

Earlier source images had text/badges/UI baked directly into the photo (by
the AI generator that made them), which forced a crop step here to keep
that baked-in content from doubling up with the live-rendered badge/title/
description in src/views/home.js. The current sources are plain photography
with nothing baked in, so no crop is needed -- object-fit: cover in
components.css handles fitting the square photo into the near-square tile
box directly.

Source files (not committed — see .gitignore) live in the repo root:
  spotters_log_ui.png, astroweather_ui.png, dso_search_ui.png, astro_planner_ui.png

Run with: python scripts/process_tile_images.py
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_DIR = os.path.join(ROOT, "public", "assets", "tiles")

# Source photos are ~1500x1500 -- cap the long edge on the way out purely to
# keep file size down for a background-image; this is not a crop.
MAX_DIMENSION = 1000
QUALITY = 78

SOURCES = {
    "spotters_log_ui.png": "spotters-log.webp",
    "astroweather_ui.png": "astro-weather.webp",
    "dso_search_ui.png": "dso-search.webp",
    "astro_planner_ui.png": "astro-planner.webp",
}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for src_name, out_name in SOURCES.items():
        src_path = os.path.join(ROOT, src_name)
        if not os.path.exists(src_path):
            print(f"skip (not found): {src_name}")
            continue

        img = Image.open(src_path).convert("RGB")
        w, h = img.size
        longest = max(w, h)
        if longest > MAX_DIMENSION:
            scale = MAX_DIMENSION / longest
            img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)

        out_path = os.path.join(OUT_DIR, out_name)
        img.save(out_path, "WEBP", quality=QUALITY, method=6)
        size_kb = os.path.getsize(out_path) / 1024
        print(f"wrote {out_path} ({img.width}x{img.height}, {size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
