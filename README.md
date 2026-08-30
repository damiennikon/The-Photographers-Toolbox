# The Photographer's Toolbox

A hub PWA that houses photography / astrophotography tools as tiles, opened
full-screen inside the shell. Stage 1: shell + iframe embedding only — no
tool code is migrated in yet.

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy

Pushes to `main` build via GitHub Actions and deploy straight to GitHub
Pages (`.github/workflows/deploy.yml`, using the official
`actions/upload-pages-artifact` + `actions/deploy-pages`). In the repo's
**Settings → Pages**, set **Source: GitHub Actions** (one-time setup).

The Vite `base` in `vite.config.js` is set to `/The-Photographers-Toolbox/` to
match this project's Pages URL. If the repo is ever renamed, update that
value (and the absolute paths in `public/manifest.json`) to match.

## Adding / updating tools

Edit `src/tools.config.js` — nothing else needs to change. Each entry is
either:

- `type: "iframe"` — opens full-screen at `#/tool/:id` in an `<iframe>`. If
  the target site can't be embedded (blocked by `X-Frame-Options` /
  `frame-ancestors`), the shell shows an "Open in new tab" fallback after a
  5s load timeout. If that fallback shows up often for a given tool, fix the
  response headers on that tool's own site rather than working around it
  here.
- `type: "placeholder"` — shows a "Coming soon" modal instead of navigating.

Each entry also has a `backgroundImage` (path under `public/`, used as the
tile's full-bleed photo) and a `bg` fallback gradient class — if
`backgroundImage` is missing or fails to load, the tile drops back to the
flat `pt-tile-bg--<bg>` gradient defined in `components.css` instead of
breaking the layout.

## Tile images

`public/assets/tiles/*.webp` are generated from the four full mockup images
(`spotters_log_ui.jpg` etc., kept out of git — see `.gitignore`) via
`scripts/process_tile_images.py`, which crops out the photographic top
portion (above the baked-in icon/title text, which the live tile component
re-renders on top) and converts to WebP. Re-run it if the source mockups
change:

```bash
python scripts/process_tile_images.py
```

## Icons

`public/icons/*.png` (16/32 favicon, 180 Apple touch icon, 192/512 manifest
icons) are static designed assets, referenced from `index.html` and
`public/manifest.json`. Replace them directly (matching filename/size) if
the logo changes — there's no generation step. `public/sw.js`'s
`SHELL_ASSETS` list also names them explicitly; bump `CACHE_VERSION` there
when replacing them so existing installs' cache-first service worker picks
up the new files instead of serving the old ones indefinitely.

## Explicitly out of scope for Stage 1

- Native migration of any tool's code into this shell
- Shared auth/state between tools
- Real settings functionality
- Astro Planner build-out (placeholder only)
- Unified caching across embedded tools (each keeps its own service worker)
