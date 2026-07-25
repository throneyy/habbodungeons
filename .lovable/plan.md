## Why it renders in preview but not on the published site

The V2 code is a static site (raw HTML + JS + CSS + GIFs) being served through a Vite build pipeline that was set up for a React SPA. In dev (the Lovable preview), Vite's dev server happily serves any file from the project root, so `assets/ui/logos/habbo-dungeons-club.gif`, `the-dungeon-ribbon.gif`, etc. all resolve.

The production build is different. Vite only emits into `dist/` files it can trace:

- Files linked from `index.html` (`css/style.css`, the JS entry)
- Files reached from those via CSS `url()` or JS `import` (this is why the Volter `.otf` font still ships and text is legible)
- Anything sitting in `public/`

The ribbon and HC-Club GIFs are referenced only as **runtime string URLs** from JS (`<img src="assets/ui/logos/…gif">` built by `js/main.js`, `js/roomBanner.js`, etc.). Vite can't see those references, so the files never make it into `dist/` and the published site 404s on them. The `<img>` tags render as broken/empty, which reads as "the ribbon/Habbo Club fonts aren't rendering."

No `public/` directory currently exists in the repo, confirming nothing is being copied verbatim into the build.

## Fix

Move the string-referenced static asset trees into `public/` so Vite copies them into `dist/` at the same relative path. URLs in the JS stay identical.

Moves:
- `assets/ui/` → `public/assets/ui/` (all the pre-generated ribbon, HC-Club, HC-Silver GIFs, `bg-tile.png`, `loading-habbos.gif`, icons)
- `data/` → `public/data/` (JSON files fetched at runtime by dungeon/item code)
- `manual.html` → `public/manual.html` (linked from footer/nav as a plain URL)

Leave in place (already handled by Vite):
- `assets/fonts/` — referenced by CSS `url(../assets/fonts/volter.otf)`, so Vite bundles it via the CSS pipeline.
- `css/`, `js/`, `src/` — linked from `index.html` and processed as build inputs.

## Verify

1. Run `bun run build` and confirm `dist/assets/ui/logos/habbo-dungeons-club.gif`, `dist/assets/ui/logos/the-dungeon-ribbon.gif`, and the rest of `dist/assets/ui/` exist.
2. Serve `dist/` locally, load the home page, and confirm the HC-Club "HABBO DUNGEONS" hero, the nav ribbon, and the "THE DUNGEON" / "TRIALS OF THE REALMS" ribbons render.
3. Publish. Load `https://habbodungeons.com/assets/ui/logos/habbo-dungeons-ribbon.gif` directly — it should return 200 image/gif.
4. Reload `https://habbodungeons.com/`; the ribbon and HC-Club art should now match what preview shows.

## Not covered by this fix

The Skyrim-style room-discovery banner (`js/roomBanner.js`) hotlinks `https://habbofont.net/font/habbo_ribbon/<room name>.gif` at runtime for arbitrary room names. If a specific browser blocks that (hotlink protection, HTTPS/CSP issue on the published origin), it will fall back to plain outlined Volter text. Fixing that is a separate task — say the word and I'll pre-generate GIFs for the fixed room-name list and commit them under `public/assets/ui/rooms/` so nothing depends on the third-party host at runtime.

## Technical notes

- Vite's default `publicDir` is `public/`, and no override is set in `vite.config.ts`. Files under `public/` are copied verbatim to `dist/` and served at web root during dev, so the existing runtime paths (`assets/ui/logos/foo.gif`) keep resolving identically before and after the move.
- No code changes are needed in `js/*` or CSS — the string paths in the source already assume web-root relative, which is exactly what `public/` provides.
- The move must use `mv` (or the equivalent) so git tracks the rename; deleting-and-recreating would lose history.
