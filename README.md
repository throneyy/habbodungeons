# Habbo Dungeons

A **Vandal Hearts-style tactics RPG** built on **authentic Habbo Hotel Origins**
movement, tiles and avatars. See `ROADMAP.md` for the full plan; this README
covers what's playable today.

**Now playable (M2): a full dungeon run.** Build a party (up to 4 of 8 classes,
led by your Habbo), then descend through the Frostkeep: three tactics battles
chained with choice events, loot, and a camp to equip and heal between fights.
Squad HP/XP/gear carry across battles, a party wipe ends the run, and progress
saves so you can Continue later. A free-walk **Explore** mode is kept as a
movement testbed.

**New in M3: your real Habbo matters.** Open **Habbo Account** to link your
Habbo: Origins account (put a one-time code in your motto — the server verifies
it against the live Origins profile), then sync: your **Fishing** and
**Gardening** levels unlock two battle skill trees — **Water** (Net, Foam
Barrier, Tidal Wave, Whirlpool, Deep Sea Beast) and **Nature** (Sapling Barrier,
Life Wave, Nature's Blessing, Decaying Flowers, Thorns) — that your linked
avatar wields in battle. Sign in (optional email code) to save your runs to the
cloud; everything still works fully offline.

**New in M4: real Habbo monsters, props and combat effects.** Enemies are no
longer tokens: beasts are **authentic Habbo pet rigs** (all 8 directions, walk
cycles, corpse poses, recolour palettes) extracted from the official pet SWFs
by a zero-dependency pipeline in `tools/`, and humanoid enemies are
**habbo-imaging avatars wearing real catalogue outfits** (Skeleton Outfit,
Light Guardian armour + Crown of Frost, Wizard robes, Zombie Eyes). Battle
maps are dressed with **Fantasy Village furni** (barrels, supply chests, rune
stones…) that block movement AND arrows — furni is cover now. Attacks lob
projectiles and pop damage numbers. Theming is dungeon data, not engine code:
any pet + tint + figure combination is one line in `js/dungeon.js`.

Start `node server.js`, open http://localhost:8471, and pick **New Run**.

## Run it

```
node server.js
```

then open http://localhost:8471. (The Node server is required — it also
proxies the Habbo Origins API, which doesn't allow direct browser calls.)

### Habbo profile data (motto verification & skills)

The server resolves a player's live Habbo: Origins profile (figure, **motto**,
Fishing/Gardening) from two sources, in priority order:

1. **`origins.habbo.com/api/public/users` — the authoritative Origins API,
   with the live motto.** This is what habbodungeons.com reads server-side. It
   works from a clean/cloud IP (i.e. a **deployed** server); many *residential*
   IPs can't reach the `/api/public` path and the connection just drops, which
   is why there's a fallback.
2. **Bobba (`bobba.me/api`) — a public Origins mirror.** Fallback for
   figure/motto **and the only source of Fishing/Gardening levels** (Origins
   exposes none, so these are always merged in from Bobba). Bobba caches
   profiles and re-syncs on its own cooldown, so a *just-changed* motto can lag
   by a few minutes.

**Deployed (recommended):** nothing to configure — the server hits Origins
directly and verifies live mottos instantly. A Bobba key is still recommended
so skill levels resolve; provide it via `BOBBA_API_KEY` or `data/bobba-key.txt`.

**Local dev on a blocked network:** Origins-direct fails fast and the server
falls back automatically. If a residential IP can't reach Origins, Bobba's
mirror lags by a cache cooldown — so a *just-set* motto won't verify. To read a
live motto locally, the server can also use habbodungeons.com's public edge
function (`fetch-habbo-profile`), which resolves Origins server-side from a
clean IP. It's a third party's service (convenience stopgap, not for
production): enable by placing their anon key in `data/hd-proxy-key.txt` (or
`HD_PROXY_KEY`); disable with `HD_PROXY=0`. A deployed server hitting Origins
directly doesn't need it.

Get a free Bobba key at https://bobba.me (API section) for skill levels:

```
set BOBBA_API_KEY=bobba_xxx           # env var (Windows: setx, or inline)
# or
echo bobba_xxx > data/bobba-key.txt   # git-ignored file
```

Without a key the keyless Bobba host still returns figure/skills but an **empty
motto**, so verification can't work locally. If Verify says "code not found" but
you've set your motto, either you're on a residential IP hitting Bobba's cache
(wait a few minutes) or you're not deployed yet.

Relevant env vars: `BOBBA_API_KEY`, `HD_PROXY=0` (disable the live-motto
stopgap), `ORIGINS_DIRECT=0` (skip Origins-direct, e.g. faster local dev),
`ORIGINS_API_BASE` (override the Origins base URL / point at an internal
mirror), `PORT`.

Tests for the movement rules:

```
node tests/pathfinder.test.js
```

## Controls

**A run**
- **New Run** → pick up to 4 classes (first is You, your Habbo). **Begin Descent**.
- Each battle: **tap your unit** → blue = move range, red = foes in range, green = skill targets.
  Tap a blue tile to move, a red foe to attack, or use **Skill** (Cleric Heal / Bard Inspire).
  **Wait** / **Cancel** / **End Turn** manage the phase.
- Between battles: a **camp** to equip loot and **Rest** (heal for gold), and **choice events**.
- Clear all three battles to win; a party wipe ends the run. Progress saves — **Continue Run** resumes it.

**Battle tactics**
- High ground = +20% damage, low ground −15%; class triangle: melee › ranged › magic › melee
- Ranged attacks need line-of-sight; equipment adds ATK/DEF/HP/SPD/MOV

**Explore mode** (movement testbed)
- **Click a tile** — walk there; **drag** — pan the camera

**Load your Habbo**
- Title name box — quick-load any Habbo Origins name to fight as that figure
- **Habbo Account** — link (motto code) + sync Fishing/Gardening → Origins skills,
  and optionally sign in to save runs to the cloud
- In battle, select your linked leader → the unlocked Water/Nature skills appear
  as action buttons (green = valid target; area/root/shield skills included)
- Console: `game`, `run`, `__debug` (e.g. `__debug.Identity.get()`)

## Tests

```
npm test                 # all 11 unit suites below (325 checks) — must pass
npm run test:quarantine  # known-broken recovered suites, advisory: never blocks
npm run test:e2e         # 7 browser suites (real Chromium, static server, ports)
```

Unit suites, each runnable on its own. Counts are the assertions each one
actually prints:

```
node tests/pathfinder.test.js          # movement rules: diagonals, drops, void corners (27 checks)
node tests/run.test.js                 # items, roster, save/resume, events, leader skills (49 checks)
node tests/skills.test.js              # Origins skill trees: unlocks, damage/AoE/shield/root (37 checks)
node tests/objectives.test.js          # win/lose per objective type, party wipe, turn limit (31 checks)
node tests/roomBots.test.js            # bot roster, pathing, chatter scheduling, hand items (75 checks)
node tests/consumableEffects.test.js   # the unified resolver through both target adapters (44 checks)
node tests/dailyReward.test.js         # daily-wheel streaks, claim windows, payout table (23 checks)
node tests/rangerCloseRange.test.js    # ranger close-range dagger, range-1 dead zone (13 checks)
node tests/defaultAvatarShoes.test.js  # fallback avatar: studded-sole (cleat) detector, baked sheet (18 checks)
node tests/buffInspire.test.js         # `buff` consumable kind and Inspire stacking (8 checks)
node tests/readmeTests.test.js         # guards this block: every suite listed, every count measured
```

Browser suites are `tests/e2e/*.e2e.mjs` (7 of them: presence, party/duel
delivery, cloud sync, room bots, daily reward, move tracking, tag bodies). They
need Chromium and bind real ports, so `run-suites.mjs` runs them sequentially.

### Quarantine

`tests/quarantine/` holds four suites recovered from an abandoned history that
**do not pass**: `battle` (34 pass, 1 assertion made stale by the ranger
close-range dagger), `gimmicks` (43 pass, 1 prop-path failure), and `realms` /
`sprites` (cannot start — prop paths, and a `tools/lib/` that was never ported).
`npm run test:quarantine` runs them and reports, but always exits 0, so a broken
suite can't gate a commit. `tests/quarantine/README.md` explains each failure
and what promoting it requires.

## What's authentic (and where it came from)

| Mechanic | Value | Source |
| --- | --- | --- |
| Tile metrics | 64×32 px, 2:1 iso; public-room scale is half (32×16 + small avatars) | classic client renderers |
| Walk speed | 1 tile per 500ms tick, diagonals same cost | Habbo server tick |
| Walk animation | 4-frame cycle, 125ms per frame (one cycle per tile) | habbo-imaging `action=wlk` frames 0–3 |
| Facing | 8 directions, classic `rotationBetween` function | every Habbo server implementation |
| Max climb | 1.25 height units per step | Sulake blog “On Walking and Stacking” (2013) |
| Max drop | 4 units | same |
| Diagonals | never across a void corner; past ONE blocked corner ok; between TWO blocked corners forbidden | same |
| Stairs | auto-rendered as 4×0.25 steps where adjacent floors differ by exactly 1 | classic room models |
| Heightmaps | `x` = void, `0-9`/`a-w` = heights — same format as Habbo room models | classic room models |
| Avatars | rendered live by `www.habbo.com/habbo-imaging/avatarimage` from Origins figure strings | official imager, same as fan sites |
| Character data | `origins.habbo.com/api/public/users?name=…` (figure, motto), with Bobba mirror as fallback | official Origins public API + Bobba |
| Fallback avatar | the default Habbo look (`hr-100-61.hd-180-1.ch-210-66.lg-270-82.sh-300-62`) — std/sit/walk × 8 directions baked into `public/assets/avatar/default/`, so an unknown or still-loading avatar is a real Habbo even offline instead of a drawn placeholder. Shoes are `sh-300`, not the `sh-290` of every retro tool's sample look: imaging renders sh-290's *standing* sprite with a studded soccer-cleat sole while its walk/sit sprites are plain-soled, so the cleats show whenever an avatar idles — the baker now asserts a plain sole across all 48 frames | `tools/bake-default-avatar.mjs` off habbo-imaging |
| Fishing/Gardening levels | per-skill levels — Origins' own API exposes none (overall level/XP read 0) | Bobba community API `api.bobba.me/get_habbo` |
| Monster sprites | complete pet rigs — layers, per-frame anchors, 8 directions (mirrors resolved like the client), walk/`ded` cycles with authentic `frameRepeat` timing, palette recolours | official pet SWFs via the [habbo-downloader](https://github.com/higoka/habbo-downloader) mirror, composited per each SWF's `visualization`/`assets` XML |
| Humanoid enemies | avatars in real catalogue outfits — figure set ids resolved from `furnidata` clothing entries + `figuredata` part types | official gamedata + habbo-imaging |
| Map props | Fantasy Village floor furni (2022 medieval set), state-0 views + authentic `sd` drop shadows; props block walking and line-of-sight | official furni SWFs via the same mirror |
| Asset licensing | all Habbo art remains © Sulake Oy; this is an unaffiliated, non-commercial fan project using the same publicly served assets fansites do — nothing is redistributed beyond what the game needs to run | fan-project norms, same posture as the habbo-imaging rows above |

## Layout

```
server.js            zero-dep static server + Habbo backend:
                       /api/origins/*  profile lookup (Origins-direct → Bobba)
                       /api/link/verify  motto-code account verification
                       /api/habbo/skills Fishing/Gardening levels (via Bobba)
index.html, css/     UI shell
js/config.js         all the Habbo constants above
js/iso.js            screen projection (x-y, x+y, z)
js/room.js           heightmap room model + dynamic blockers
js/pathfinder.js     A* with Habbo step rules (canStep / findPath / rotation)
js/avatar.js         tick-accurate walking entity
js/sprites.js        habbo-imaging sprite sets (std + wlk, 8 dirs, m + s sizes)
js/game.js           canvas renderer: tiles, auto-stairs, overlays, depth-sorted units, controllers
js/rooms.js          demo dungeons (Crypt @ guest scale, Great Hall @ public scale)
js/habboApi.js       Origins API client (via proxy)

--- tactics layer (M1) ---
js/classes.js        8 class stat profiles, archetype triangle, height/LoS/damage math, skills
js/units.js          Unit (extends Avatar): team, class, stats+equipment, per-turn flags, XP/level, buffs
js/battle.js         Vandal Hearts phase engine: move BFS, attack + skill resolution, win/lose, enemy-phase ticker
js/ai.js             enemy AI v0 (target weakest reachable foe, close in, attack)
js/encounters.js     standalone Crypt demo encounter (kept for reference)
js/battleController.js  tap-to-command input, action menu (attack/skill/wait), phase banner, roster, log
js/exploreController.js free-walk sandbox (the original movement demo)

--- run layer (M2) ---
js/items.js          equipment catalog, rarities, equip math, depth-weighted loot rolling
js/run.js            persistent roster + inventory + gold, unit<->roster bridge, save/resume
js/events.js         authored map events (choice encounters) + slot picking
js/dungeon.js        the Frostkeep: 3 battle rooms (built via loops) + node sequence
js/runController.js  run flow: battles, camp/equip, events, victory/defeat, saves each step

--- habbo identity layer (M3) ---
js/skills.js         Water/Nature Origins skill trees + fishing/gardening→unlock map
js/identity.js       linked-Habbo identity: motto link, Bobba skill sync, cloud mirror
js/supabase.js       isolated Supabase client (esm.sh CDN, graceful offline degrade)
js/runStore.js       cloud run persistence (Supabase `runs`) + localStorage hydrate

--- asset pipeline (M4) ---
tools/fetch-pets.js     download all 35 pet SWFs from the habbo-downloader mirror
tools/extract-pets.js   pet SWF -> assets/monsters/{pet}/sheet.png + data.json
tools/extract-furni.js  furni SWF -> assets/props/{class}/ (fetches on demand)
tools/lib/              zero-dep SWF/XML/PNG readers + pet/furni compositors
tools/sprites.html      dev viewer: every rig × action × direction, anchor tuner
                        (http://localhost:8471/tools/sprites.html)
assets/monsters/        extracted, committed monster rigs the game loads
assets/props/           extracted, committed furni props
js/monsterSprites.js    runtime: packed-sheet frames + tints; figure registry
js/props.js             runtime: prop sheets (view + drop shadow per direction)
```

## Roadmap (the game layer on top)

- Monsters as `Avatar` subclasses using `room.block()` — the pathfinder and
  renderer already respect blockers
- Turn/tick-based combat on the 500ms room tick
- Items & loot using Habbo furni sprites; inventory
- Multi-room dungeon floors with doors; procedural heightmap generation
- Stats driven by the Origins API (level/XP/star gems already fetched)
