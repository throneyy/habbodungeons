## Problem

`js/props.js` and `js/monsterSprites.js` fetch furni and monster art at runtime from `/assets/props/...` and `/assets/monsters/...`. In `vite dev` those paths resolve from the project root, so the preview looks fine. In the production build Vite only copies `public/` verbatim, and neither `assets/props/` nor `assets/monsters/` lives there, so on habbodungeons.com every `fetch('/assets/props/<id>/data.json')` and `<img src="/assets/props/<id>/sheet.png">` 404s and no furni renders in the dungeon.

This is the same class of bug we already fixed for the ribbon/HC-Club GIFs by moving `assets/ui/` into `public/`.

## Fix

Move the two runtime-loaded asset trees into `public/assets/` so Vite ships them:

- `assets/props/`  -> `public/assets/props/`
- `assets/monsters/` -> `public/assets/monsters/`

Leave `assets/fonts/` where it is - `css/style.css` references it with a relative `url('../assets/fonts/...')`, which Vite already bundles into the build as hashed assets.

No code changes needed: every consumer already uses the absolute `/assets/props/...` and `/assets/monsters/...` URLs those files will now be served from.

## Verify

1. `bun run build` and confirm `dist/assets/props/<some-id>/sheet.png` and `dist/assets/monsters/<some-id>/data.json` exist.
2. In the preview, load into a dungeon and confirm furni (chests, barrels, decor) and monster sprites render.
3. Publish and re-check on habbodungeons.com.
