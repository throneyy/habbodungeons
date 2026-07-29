# Habbo Dungeons v2 — Roadmap

The reboot: from v1's AI-story multiple-choice CRPG (HabboDungeons.com, Lovable) to a
**Vandal Hearts-style tactics RPG** built on the authentic Habbo movement foundation
in this repo.

## Locked design decisions (interview 2026-07-01)

| Decision | Choice |
| --- | --- |
| Turn system | Vandal Hearts phases — command whole squad, then enemy phase |
| Squad control | Solo squad now; battle state architected so co-op can slot in later |
| Story system | Demoted to optional hand-authored map events between battles + dialogue scenes |
| Codebase | Grow this foundation (vanilla JS engine); v1 site untouched until v2 beats it |
| Art | Real Habbo assets; build a pipeline to obtain FULL sprite sheets (all directions + animation frames) — v1's monster images are partial wiki rips |
| Carry over from v1 | 8 classes + stats, Origins Fishing/Gardening skill trees, items & loot, Habbo motto-linking (day one), 38-monster bestiary |
| First playable | Full dungeon run (3 linked battles + map event + loot) |
| Tactics DNA | ALL: height/terrain advantage, class triangle, map gimmicks, varied objectives |
| Backend | New Supabase project in Cody's own account (MCP-managed) |
| Live v1 site | Leave running as-is |
| Setting | Fresh start — new story/world written for the reboot; reuse monsters where they fit |

## Milestones

### M1 — Battle engine core  ✅ DONE (2026-07-01)
One winnable Vandal Hearts battle on the Crypt map. Shipped:
- Multi-unit system (`js/units.js` Unit extends Avatar): team, class, stats, per-turn flags
- Player phase / enemy phase state machine (`js/battle.js`), turn counter, win/lose
- Move-range BFS with unit occupancy (pass allies, block enemies) + blue overlay + path walk on 500ms ticks
- Attack: melee + ranged with min-range, Chebyshev range, line-of-sight (`js/classes.js hasLineOfSight`)
- Deterministic damage v0: `max(1, atk-def)` × class-triangle × height modifier (no RNG yet — tactics first)
- Enemy AI v0 (`js/ai.js`): target weakest reachable foe, move into range, attack
- Renderer refactor (`js/game.js`): depth-sorted multi-unit draw, overlays, HP bars, selection ring, pluggable controllers
- Battle UI (`js/battleController.js`): tap-to-select/move/attack, Wait, Cancel, End Turn, phase banner, roster, combat log
- Explore/Battle mode toggle; leader rendered as the real Habbo avatar, others as class tokens
- Enemies use v1 bestiary names on placeholder tokens (full sprites = M4)
- Tests: `tests/battle.test.js` (34 checks) + `tests/pathfinder.test.js` (27) all green; verified in-browser

### M2 — Full dungeon run  ✅ DONE (2026-07-02) — first playable
A complete run: 5 nodes (battle → event → battle → event → boss) on the
"Descent into the Frostkeep" dungeon. Shipped:
- Persistent roster (`js/run.js`): HP/XP/level/equipment carry across battles; a
  downed hero is out for the run; party wipe = defeat. Live Units instantiated
  per battle from roster members and written back after.
- Squad builder (pick up to 4 of 8 classes; leader = your Habbo avatar)
- Loot + equipment (`js/items.js`): 3 slots, 5 rarities, depth-weighted drops
  rescaled to the tactics economy; equip/unequip with HP clamp
- Camp between battles: equip, Rest (heal for gold, once per camp), Descend
- Map events (`js/events.js`): 3 authored choice encounters, 2 fixed slots per run
- Skills v0: Cleric **Heal**, Bard **Inspire** (green skill overlay + engine hook)
- All 8 classes playable with distinct move/range/stat profiles
- Local save/resume (`stage` marker resumes mid-camp, not a re-fight)
- Run flow (`js/runController.js`) + full UI overlays (title, builder, event,
  camp, victory/defeat) in `js/main.js`
- Tests: `tests/run.test.js` (40 checks) + M1's 61 all green; full run verified
  in-browser (squad build → 3 battles → events → loot/equip → victory) incl.
  save/resume and the defeat screen
- Balance note: naive play can wipe on battle 2; competent play (hold formation,
  Cleric heals) clears the run. Tuning is M5.

### M3 — Habbo identity online  ✅ DONE (2026-07-02)
Your real Habbo now matters in battle. Shipped:
- **Supabase backend** (new project `habbo-dungeons`, Cody's org): tables
  `profiles`, `habbo_link_codes`, `squads`, `runs`, `inventory`, all with
  Row-Level Security (each user reads/writes only their own rows — verified: anon
  reads return empty, anon writes are denied) + an auth trigger that seeds a
  profile row on sign-up. Email one-time-code auth (optional; offline still works).
- **Motto-code account linking** (`server.js` `POST /api/link/verify`): generate a
  `HD-XXXXX` code → user drops it in their Origins motto → server checks the live
  `origins.habbo.com` profile motto contains it (authoritative, proves ownership).
- **Fishing/Gardening → battle skills** (`js/skills.js`): Origins exposes **no**
  per-skill API (overall level/XP are 0 for everyone), so skills are read from
  **Bobba** (`api.bobba.me/get_habbo` → `mainDetails.fishingLevel/gardeningLevel`,
  proxied by `server.js` `GET /api/habbo/skills`). Levels unlock two 5-skill trees:
  **Water** (Net, Foam Barrier, Tidal Wave, Whirlpool, Deep Sea Beast) gated by
  fishing; **Nature** (Sapling Barrier, Life Wave, Nature's Blessing, Decaying
  Flowers, Thorns) gated by gardening. Only the leader (your linked avatar) wields
  them.
- **Battle engine generalised** (`js/battle.js`, `js/units.js`): the M2 heal/buff
  pattern extended to damage / shield / area-of-effect / self-burst skills, plus
  **shields** (absorb before HP) and **rooting** (skip a move). Multi-skill units
  get a skill menu (`js/battleController.js`).
- **Play as your real figure**: linking/sync set your leader's habbo-imaging avatar
  (`js/identity.js`), persisted to localStorage and mirrored to Supabase when
  signed in. A **Habbo Account** screen drives link → sync → skill display.
- **Runs server-representable** (`js/runStore.js`): `Run.serialize()` blobs persist
  to the `runs` table per user when signed in (one active slot, co-op-ready shape),
  with localStorage as the offline fallback; boot hydrates the newer of the two.
- Tests: `tests/skills.test.js` (37) + M2's `run.test.js` grew to 45 (leader-skill
  threading, save/resume of unlocked skills); **144 checks green**. Verified in
  browser: fuzzi (fishing 99/gardening 92) → all 10 skills unlocked → leader casts
  Net for 5 + root in a live battle.
- Known limits (M3.x/co-op): profile/skill writes are client-trusted after the
  server verify (move fully server-side with a service role when competitive/co-op
  lands); Bobba is a third-party cache (a player must have been scanned once);
  skill unlock thresholds are placeholders pending M5 balance.

### M4 — Full Habbo asset pipeline  ✅ DONE (2026-07-02)
Enemies are real Habbo art now, produced by an in-repo zero-dep pipeline. Shipped:
- **Asset research settled**: pet SWFs live on the official CDN
  (`images.habbo.com/gordon/{build}/{pet}.swf`, build via `external_variables`);
  per Cody's call we fetch from the **higoka/habbo-downloader GitHub mirror**
  instead (auto-refreshed every 3h). No official monster renderer exists —
  pets ARE the bestiary base. v1's 38 wiki-rip images abandoned.
- **Zero-dep extractor** (`tools/`, node builtins only): SWF tag parser
  (SymbolClass / DefineBinaryData / DefineBitsLossless2 + zlib), tiny XML
  reader, PNG encoder. `fetch-pets.js` + `extract-pets.js` compose every
  frame exactly like the client: layers in per-direction z-order, per-asset
  anchors, `source=` alias chains, mirrored directions (real art preferred —
  dragon ships a real dir-5), grayscale→palette recolours, implicit static
  layers + `frameRepeat` (newer rigs: monkey/kittenbaby/demonmonkey), LCM
  frame counts. **All 35 pets extracted** → `assets/monsters/{pet}/sheet.png`
  + `data.json` (committed; the game never hits any CDN for monsters).
- **Slicer successor**: slicing is fully automatic from the SWF XML;
  `tools/sprites.html` is the human layer — previews every rig × action ×
  direction on tiles, tints/ghost, and tunes per-pet `foot` anchors.
- **MonsterSprites runtime** (`js/monsterSprites.js`): AvatarSprites-compatible
  `.get(action, dir, rawTick)` returning packed-sheet frames with anchors;
  engine `std/wlk` map to rig `std/mv` (walk cycles honour each rig's own
  length + repeat on the 125ms tick), death shows real `ded` corpse art
  (hold-then-fade, wired into the previously-unused `dying` path). Tint =
  canvas multiply (theming stays dungeon DATA — no hard-coded winter).
- **Frostkeep bestiary live**: spider, cat (icy tint), dragon (ice tint) +
  humanoids as habbo-imaging avatars in real catalogue outfits — Skeleton
  Outfit (set 6248), Zombie Eyes (3603, doubles as the ghostly Wraith at
  0.62 alpha), Wizard robe/hat/beard (6275/6273/6271), Light Guardian armour
  + Crown of Frost (3448/3449/3859) for the boss. Set ids mined from
  furnidata clothing `customparams` + figuredata part types.
- **Fantasy Village props** (`tools/extract-furni.js`, per Cody: medieval set,
  62-piece line): 12 pieces extracted with authentic drop shadows →
  `assets/props/`; rooms declare `props:[{id,x,y,dir}]`, tiles auto-block,
  and **furni is cover** (blocks line-of-sight) — the M5 gimmick foundation.
- **Hit effects + projectiles**: engine `onFx` events (attack/skill/heal/
  shield/buff) → canvas bursts, rising damage floaters, arced projectiles
  coloured by archetype (ranged sand, magic blue, skills teal).
- Tests: new `tests/sprites.test.js` (28) — rig math, extracted-data
  integrity vs sheet bounds, furni blocking/cover, fx events; **172 checks
  green** across 5 suites. Verified in-browser: battle 1 with animated
  bestiary, props, walk cycles, spider corpse, damage floaters.
- Palette decoding covers all four generations of pet palette formats
  (direct 256-entry AND compact-scaled with `[count, n-1|0xffff]` trailers,
  named `_palette_N` / `{pet}NN` / `{pet}_NN` / `cowpNN_breed` /
  `bodypalette_NNa`) — every pet renders in authentic colours; per-pet
  variant picks are data (`PALETTE_BY_PET`, tools/extract-pets.js).
- `tools/build-manual.js` generates `manual.html` — a self-contained
  presentable Monster Manual (bestiary stat blocks from live engine Units,
  card art cropped from the real sheets with in-game tints, full pet vault,
  props, provenance).
- M4.x leftovers: 32-size public-scale sheets unextracted (zoom-scaling 64
  works); pet gestures (agr/jmp) unused; multi-tile + wall furni; fx could
  adopt authentic Habbo effect sprites; cow/horse horn+hair palette channels
  approximated with the body palette. The `monster` pet SWF is a placeholder
  crate — excluded. Also available when wanted: fantasy_c22
  goblin/gnoll/jackalope statues as future static mini-bosses.

### M4.5 — Wiki furni-line importer  ✅ DONE (2026-07-02)
Paste Habbo Wiki lines, get every asset in the game's format.
- **`node tools/import-line.js <wiki-url | furniline-id | "Line Name"> [...]`**
  (`--dry` plan-only, `--force` re-extract) + **`tools/import.html`** paste page
  (textarea → `POST /api/dev/import` in server.js streams the CLI's output live).
- **Resolution facts (verified on real data)**: the furni-line wiki is
  **habboxwiki.com** (habbo.fandom.com has no line pages and Cloudflare-403s
  plain fetches; habboxwiki serves article HTML + `?action=raw` wikitext to
  Node). Wiki furni images are SWF asset dumps — **filenames are classnames**
  (`File:Fantasy_c22_barrel_64_a_0_0.png`) — so URL→items needs no name
  matching. **furnidata carries `furniline`** (16,856/17,091 room + 813/832
  wall records) = the line enumerator; `fantasy` line spans prefixes
  (fantasy_c22/c25/ltd22/r22, wisp_c23, clothing_*). Import set = UNION of
  page classnames + their furniline(s); plain names fuzzy-match line ids and
  list ambiguities instead of guessing. furnidata cached at
  `tools/swf/furnidata.json` (~9MB); colour variants (`base*N`, 4,785 records)
  collapse to one base SWF (colour set 0 baked, per-item picks stay data).
- **Index-merge bug fixed**: extract-furni.js AND extract-pets.js used to
  rebuild index.json from just the current batch — a subset run clobbered the
  library. Both now `mergeIndex()` (tools/lib/extract.js): untouched entries
  survive, updated ids field-merge (importer-stamped `name`/`line` survive a
  plain re-extract), missing dirs self-heal from data.json.
- **Compositor**: fully-animated items (no frame-0 assets, e.g.
  wisp_c23_lilwisp) now snapshot their first animation frame.
- **Proof import — Fantasy Village line complete**: 69/69 room items
  (12 kept, 57 new: tavern, guild hall, wizard's tower, market stall, sewers,
  LTD dragon, hero statue, wisps, clothing hangers...), 0 walls, 0 failures;
  props library 12 → **69 items / 288 views**, manual.html rebuilt.
  data.json + index entries now carry `name` + `line` from furnidata.
- Tests: +13 checks (merge semantics, wiki classname/title parsing on real
  markup, fuzzy line matching + ambiguity) — **185 green** across 5 suites.
- **Post-import at scale (same day)**: Cody imported 22 more lines →
  props library peaked at 1,880 items / 6,246 views across 23 lines, all 100%
  complete vs furnidata, zero failures. The suite caught one extractor defect
  at scale: `dirs` now records only directions that actually composed (the
  XML can declare dirs with no art — ads_pib draws only dir 4); 12 props
  re-extracted.
- **Curation pass (2026-07-02)**: Cody hand-pruned the imported library down to
  the keepers, tombstoning anything inappropriate/unusable. Final library =
  **694 items / 2,372 views across 22 lines** (1,186 ids tombstoned in
  deleted.json so line re-imports skip them; 73 creature overrides, 12 flagged
  `creature=true`). Deletions go through the guarded props.html endpoint, so
  index.json, on-disk dirs, and tombstones stay consistent and no
  game-referenced prop can be pruned. Audited clean at every snapshot: index ↔
  disk 1:1, every `dirs` entry composes, all frame rects in sheet bounds, all 10
  game refs present. Manual rebuilt = 2.7MB self-contained. (Counts track the
  live library — rerun `node tools/build-manual.js` after any further pruning to
  resync manual.html.)
- **Furni monsters**: creature/statue furni can be cast as foes —
  `FurniSprites` in js/monsterSprites.js (AvatarSprites-contract `get()`,
  static art, engine dirs snap via `nearestDir()` to the 1-4 views furni
  ship, tint/recolor/foot opts, dying-fade retires them — no corpse pose).
  Dungeon data casts via `LOOKS { prop: 'classname' }`. Frostkeep: nave +
  throne Skeleton slots swapped for **Greedy Goblin** and **Gnoll Sentinel**
  statues (same class/level — zero balance change); manual bestiary renders
  furni-look cards (10 foes). +10 checks → **195 green**.
- **Monster audit of the full library** (`tools/props.html`): every prop
  browsable with real art (lazy-rendered), search + line filter + a
  creatures-only heuristic (word-boundary names; ~284 candidates). Click a
  card → copies its `{ prop: '…' }` cast line. Standout casting stock from
  the imported lines: habboween 2017/2019 (Cursed Flame Knight, Mimic Chest,
  Zombie Grunt, Dormant Zombie, Hellfire/Cursed Dragons, Ravenous Werewolf,
  Burning Phantom, Living Slime, Spirit Owl, Witch Familiar, Wolf, Scarecrow,
  Infected Beast), ~60 Neopets creature figures (Aisha/Acara/Draik incl.
  Wraith Draik/Kougra/Lupe incl. Darigan/Shoyru incl. Robot/Uni/Eyrie/
  Kacheek/Xweetok/Cybunny/Esophagor + petpets), easter fairytale-forest set
  (Ravenous Wolf, Savage Hippogriff, Bear Owls, Arboreal/Aquifer Dragons,
  Fairy Prince, Forest Gnome), easter ancients (Jade Guardian, Royal
  Protector, Jade Dragon, Siren/Mermaid Rocks), nft2025 (Goblin Warrior,
  Reaper Gnome, Skeleton Butler, Red Devil + Penguin action figures w/ 8
  views, Robotik Croc/Otter/Penguin), gifts (Flaming Phoenix, Stone Knight,
  Green Alien, 6 Carps), Care Bears, 6 Fluffbys, vikings figureheads.

### M4.6 — Real projectile art  ✅ DONE (2026-07-02)
- Ranged attacks now loose the authentic **Firing Arrow** furni
  (`hween_c25_arrow`, habboween_2025) instead of a procedural dot. The furni
  ships all 8 directions; `battleController.showFx` hands the `proj` fx a
  loaded `FurniSprites` instance + the `rotationBetween(caster,target)` travel
  dir, and `game.js` draws that directional frame along the existing parabolic
  arc (glow-dot fallback stays for magic/skill shots). Engine stays generic —
  it renders whatever sprite it's handed; the arrow *choice* lives in the
  controller's `PROJ_SPRITE` map, and the props-browser delete-guard reads that
  map so the arrow can't be pruned out from under the game. +7 checks → 205.

### M5 — Tactics depth (the Vandal Hearts personality) — IN PROGRESS
Order agreed with Cody (2026-07-02): objectives → objective-aware AI → map
gimmicks → triangle tuning/promotions → ice slides last. Retrofit the 3
Frostkeep battles + add one showcase map; keep the wired prop-line for now.

- ✅ **Objective types** (`js/battle.js`): win/lose generalised past "eliminate
  all" into a DATA-driven `objective` on each battle node (engine stays generic;
  `normalizeObjective` fills defaults). Types: `eliminate` (default, preserves
  M1–M4), `slay` (kill a tagged foe — the boss), `survive N turns`, `reach`
  (get a unit — `who:'leader'|'any'` — to a tile), `defend` (hold a tile / keep
  a tagged unit alive N turns; enemy on the tile = breach/lose), `escort` (walk
  a tagged ward to a tile). Optional `turnLimit` deadline; total party wipe
  always loses. Evaluated at every attack/skill, each turn boundary
  (`startPlayerPhase`), and whenever a move settles (player settle in
  `battleController.update`, enemy settle in `tickEnemyPhase`). Units carry an
  `objectiveTag` (`units.js`) so boss/ward/leader are referenceable from data.
- ✅ **Objective UI**: banner shows live objective text with progress
  (`b.objectiveText()`), and a persistent pulsing gold **goal marker** overlay
  (`game.js overlays.objective`, set by the controller, survives selection
  churn) marks reach/defend/escort tiles. Per Cody, the banner is an
  **old-school 2006 Habbo chat bubble**: white/1px-black/rounded with a tail,
  set in the authentic **Volter** pixel font (assets/fonts/volter[-bold].otf,
  sourced via habbianos.github.io/fonts — NOT the modern Ubuntu/Ubuntu
  Condensed), anti-aliasing killed by the `#crispify` SVG filter in index.html.
  Gotcha: Volter maps em-dash/ellipsis to junk glyphs — bubble copy uses
  commas/parentheses/`...` instead.
- ✅ **Retrofit + new map** (`js/dungeon.js`, DATA only): battle 1 antechamber =
  eliminate (tutorial); battle 2 nave = **survive 3**; **new battle 3 "The
  Frozen Rampart"** = **reach the winch gate (5,1) with your leader** (two
  height-1 archer ledges, void-gapped approach, crystal cover); boss throne =
  **slay the Ice Knight Commander** (tagged `boss`). Run is now 6 nodes / 4
  battles (events still at indices 1,3). Verified in-browser: rampart goal is
  walkable + a 9-step path exists from spawn, reach win fires on arrival, full
  enemy phase runs clean.
- ✅ **Objective-aware AI** (`js/ai.js`): a thin bias layer over the 3-tier plan
  — `reach` focuses the reacher (intercept the leader), `escort` hunts the ward,
  `defend` rushes the tile (breaching wins outright). `eliminate/survive/slay`
  keep the weakest-target baseline unchanged.
- Tests: new `tests/objectives.test.js` (31 checks — every type, wipe, turn
  limit, objective text, AI bias vs baseline) + `run.test.js` updated for the
  6-node/4-battle shape. **All 6 suites green.**
- ✅ **Map gimmicks** — generic per-tile effect/trigger hook; specifics stay
  DATA in js/dungeon.js. `Room` gains `effects: [{x,y,kind,...}]`
  (`effectAt`), per-prop `walk: true` (trap/plate/chest art you stand on —
  no block) and `gate: true` + `toggleGate(x,y)` (open = art hidden via the
  renderer's live `ref`, tile unblocked for walking AND line-of-sight).
  `Battle.unitSettled(unit)` dispatches on every move settle (player settle in
  battleController.update — a lethal trap ends the unit's turn; enemy settle in
  tickEnemyPhase before its attack — a trap can fell it mid-plan):
  **hazard** `{dmg, status?, when:'enter'|'endTurn', once?}` (endTurn burns
  when the standing team's phase closes, both teams), **switch**
  `{toggles:[{x,y}], once?}` (player-triggered, flips gates), **treasure**
  `{gold?, item?}` (player-only, once; banks immediately into the run via
  `onPickup` → addGold/addLoot + header refresh). Renderer draws pulsing inset
  markers on live effect tiles (hazard red / switch cyan / treasure gold);
  spent effects stop drawing. AI (js/ai.js `hazardPenalty`) treats stopping on
  a live trap as ~50 tiles of extra cost — avoids unless it's the only stop.
- ✅ **Frostkeep gimmick retrofit** (DATA): antechamber corner **treasure
  chest** (dng_treasure, 20g); nave flank-lane **spike traps** (5 dmg, enter)
  + a mid-approach **bonfire** (4 dmg, endTurn); **rampart rebuilt as the
  showcase** — a full chasm row spanned by one bridge tile barred by
  `hween_c17_portcullis`, opened by a **winch plate** (wf_tile1) up on the
  right archer ledge, plus a ledge cache (dng_treasure2, 25g) by the spider;
  throne stair flanks get **once-only falling rocks** (7 dmg,
  hween_c17_fallingrocks). All art from the curated library (floor/trap +
  floor/gate + wired-tile palettes the M4 audit staged for exactly this).
- ✅ **Gate polish + room-design pass** (Cody's playtest feedback, same day):
  the extractor now pulls furni **states + transition animations** (state 1 =
  open pose, state 100 = the play-once rise sequence → `s1_d*`/`t*_d*` frames,
  data.json `states`/`transition`); PropSprites gained `get(dir,state)` /
  `transition(dir,tick)` and the renderer plays the authentic portcullis RISE
  then holds it open (vanish is now only the no-open-art fallback). Props
  support **multi-tile footprints** (`tiles:[{x,y},…]` — blocks + toggles the
  whole footprint AND drives draw depth by deepest tile, fixing tile
  bleed-through; the portcullis is a real 1x2). **Corner stairs** implemented
  (`drawCornerStairTile` — perpendicular diff-1 descents wrap as L-bands like
  the real client; straight stairs face away from their backing tile). Rampart
  rebuilt as a cohesive **gatehouse**: cave-wall row (hween_c17 wall/pillar
  set) sealing the yard with void beyond, the open gate reads as a dark
  doorway INTO the keep (goal = the gateway tile), garrison supply-dump
  platform (barrel/arrows/coin = the treasure) and winch platform at **height
  2 with single h1 step entrances** (sheer faces never auto-stair, so stairs
  appear only where you're meant to climb). Design standards recorded in
  memory (habbo-dungeons-room-design).
- Tests: new `tests/gimmicks.test.js` (45 checks: walkable props, multi-tile
  gate block/LoS toggling via either tile, hazard enter/endTurn/once/lethal
  both teams, switch player-gating, treasure pickup/once/enemy-denied, AI trap
  avoidance + forced-stop, rampart pathability closed→open, flat-plate
  placement, portcullis state/transition extraction). **290 checks green
  across 7 suites.** Browser-verified: gatehouse composition, rise animation,
  corner stairs on the antechamber ridge, no bleed-through.
- ✅ **Room kits — the "beautiful dungeons" system** (Cody re-prioritized this
  as the most important part of M5). Rooms carry a `kit` (pure DATA):
  `floor` = a real furni floor item (2x2) tiled seamlessly across every tile
  top (per-tile diamond clip at the tile's own height, parity-anchored — the
  renderer's `drawFloorArt`); `palette` recolors the procedural stairs/sides/
  lines to match the art; `walls` draws classic boundary walls along the far
  edges (first floor tile of each row/column; interior pits never wall up;
  ONE uniform top line so plateaus don't notch it) — or `walls:false` for
  rooms that build their own from furni. Frostkeep kit = `dng_floor` dark
  flagstones + cold-stone palette; walls on everywhere but the rampart.
  `kit.floor` ids are covered by the server delete-guard.
- ✅ **Throne hall redesign** (room-design standards applied): flat h2 dais
  with sheer faces + ONE grand central staircase (`rows[3][6]` only), the
  **Cursed Throne** (hween_r17_lichthrone, same cursed set as the keep walls)
  with **blazing vikings torches** flanking it, boss moved to (6,2) standing
  BEFORE his seat, floor spike traps replace the floaty ceiling-rocks art.
  Art lesson: hween_c19_bewitchedcandles ships a black backboard,
  gothic_candles is unlit black iron — dark-palette rooms need LIT light
  props (vikings_torch / greek_c15_lamp).
- ✅ **Ambient furni animation** (Cody: "the candles are supposed to be
  animated"). The extractor now honours `frameRepeat` and pulls a resting
  LOOP for animated furni: state 0 if its sequences run >1 tick, else state 1
  for on/off items like torches (never for gates — their state 1 is the open
  pose). Ticks deduplicate to unique composed frames + a tick→frame `map` in
  data.json (`anim: {ticks, map}`); `PropSprites.animFrame(dir, tick)` +
  `animTicks`; the renderer cycles resting props on the authentic 125ms tick.
  vikings_torch = 6-frame burning loop, hween_c17_bonfire = 4-frame flame
  loop (both dirs). Honouring frameRepeat also corrected the portcullis rise
  to its authentic **16 ticks** (8 steps × repeat 2 — the old 8 was wrong).
- Tests: +4 kit checks, +5 ambient-anim checks in gimmicks.test.js →
  **299 green across 7 suites**. Browser-verified: all four rooms screenshot
  clean, torch flames visibly cycle between frames.
- ✅ **Kit range — "Trials of the Realms"** (the theming-breadth proof Cody
  asked for): a second playable dungeon (dungeon REGISTRY in js/dungeon.js —
  `DUNGEONS` metadata + `buildDungeon(id)` dispatch; title's squad builder
  gained a dungeon picker; save/resume already keyed off `dungeonId`). Four
  new kits, one showcase battle each, one objective type each:
  - **The Whispering Glade** (FOREST_KIT: easter_c19_forrestfloor, walls:false
    — the boundary is a living hedge of env_bushes + trees, deep-woods void
    beyond): *reach* the fairy ring (easter_c19_magicringtele) set into the
    hedge's one gap, flanked by luminescent flower lamps; toxic mushroom
    hazards, h1 knoll, woodland-critter cover. Foes: Ravenous Wolf, Savage
    Hippogriff, Bear Owl (fairytale-forest furni, all with idle loops).
  - **Court of the Ancients** (GREEK_KIT: greek_c15_floor marble + sandstone
    walls — the first BRIGHT room): *defend* the altar tile before the Master
    Monument for 4 turns. The h2 sanctum dais has TWIN corner stairs so the
    altar tile itself stays flat (single central stair would have made the
    defend tile an auto-stair — caught by the new tests). Foes: 2 Bronze
    Warriors, golden-tinted Nemean Lion (pet), Siren of the Ruin.
  - **Steelscar Mead Hall** (VIKING_KIT: vikings_floor dark timber): a
    straight *eliminate* brawl. The chief's longship overwinters along the
    west wall (3 gondola pieces), feast tables flank the 2x2 longfire pit
    (all four tiles burn on endTurn), high-seat dais with vikings_throne +
    burning torches + banners, cooking pit, hoard treasure. Foes: brown-
    tinted Hall Bear, 2 War Boars (pets), Odin's Raven (sw_raven).
  - **Den of the Bog Witch** (WITCH_KIT: hween_c19_crookedfloor + plum walls,
    boss): *slay* the Bog Witch — a habbo-imaging avatar in zombie skin +
    BLACK star-spangled wizard hat/robe (colour 61 ships a black cat on the
    brim). Skull throne + familiar + ghost-orbs on the dais, animated hearth
    + cauldron + crafting table, pumpkin-patch vine hazards (2x2, every tile
    grasps), satchel treasure. Foes: Ravenous Werewolf, Living Slime, Spirit
    Owl (all animated habboween furni).
  - 40+ props re-extracted so every lit/magic prop ships its ambient loop
    (fireplace 16t, cauldron/orbs/ring/lamps 24t...); creature furni gained
    idle loops too. server.js delete-guard + tools/build-manual.js now
    iterate the whole DUNGEONS registry (manual bestiary 10 → 23 foes).
  - **habbo-imaging proxy** (`/api/imaging` in server.js, IMAGING_URL now
    relative): habbo-imaging serves no CORS headers, so avatar PNGs tainted
    the canvas and broke canvas export; proxying makes them same-origin
    (with a small in-memory cache).
  - Tests: new `tests/realms.test.js` (60 checks: registry/back-compat, kit
    hex palettes + distinct floors, per-room design standards — walkable
    spawns/goals, flat interactive tiles by the auto-stair rule, multi-tile
    footprints vs real furni dims, objective pathability — ambient-loop
    regression on all lit props, realms Run serialize round-trip).
    **359 checks green across 8 suites.** Browser-verified: all four rooms
    screenshot-reviewed, dungeon picker → realms run boots battle 1 with
    objective banner + goal marker, reach win fires on arrival.
- ✅ **Per-template enemy identity + encounter curve** (2026-07-29,
  `js/encounterGen.js`, `js/dungeon.js`, `js/units.js`,
  `tests/encounters.test.js`): pool templates carry a `d` stat delta threaded
  to the Unit through the equipment-bonus path, so a Skeleton and a Gnoll
  Sentinel are different creatures instead of two names for the same level-1
  Fighter. Before this, `cost` bought nothing — the cost-5 elite Frost Wraith
  was the joint-weakest body in its pool and the cost-2 Skeleton the strongest.
  All 31 templates are now tuned to an explicit `templateThreat` score with
  per-cost targets the suite asserts. `battleBudget` scales by a squad POWER
  share (0.35/0.5/0.68/1) rather than headcount, and the boss node takes a
  share of the budget for minions plus a `bossScale` bulk delta instead of a
  flat subtraction that could go negative. Measured with
  `node tests/balanceSim.js --seeds=400`: full-run clear rate went
  **0 / 0 / 0 / 9.8% → 15.5 / 16.8 / 14.0 / 17.0%** across squad sizes 1–4, and
  battle 4 (the boss) from **0 / 0 / 0 / 33.9% → 55.4 / 48.9 / 56.6 / 61.8%**.
  Caveat that outranks all of it: composition still swings a size-4 run's clear
  rate from **3.0%** (fighter + three clerics) to **31.0%** (fighter, barbarian,
  ranger, mage) — far more than squad size does. Enemy skills with MP costs are
  deliberately phase 2: `js/ai.js` cannot cast, and teaching it to would give
  the sim's player side casting too, making both changes unmeasurable.
- ⏳ Remaining: more dressing passes as rooms need them; class-triangle tuning
  + tier-2 promotions; skill-unlock threshold tuning (`js/skills.js`
  placeholders); **ice slides last** (the movement-model change). Escort is
  engine- + AI-complete but unused by a map yet (needs a player-team NPC ward
  — a `makeAllies` node hook — to showcase). Kit variety for M6 themes is one
  data block away (mossy pavement, cobblestone, forest floors all in the
  library).

### M6 — Campaign & world
- New setting + story (pitch options first, then pick)
- Hand-authored campaign maps + VH-style dialogue scenes
- Town hub between missions: shop (v1 economy), squad management
- Bestiary placed where it fits the new world

### M7 — Launch
- Hosting + deploy; domain cutover from v1 when v2 clearly beats it
- Post-launch: co-op battles (M3 architecture pays off), PvP skirmish

## Current state — Origins skill trees & MP

Read from the code (`js/skills.js`, `js/classes.js`, `js/run.js`, `js/battle.js`,
`js/consumableEffects.js`), not from intent. Describes what runs today.

### The skill trees today

Two trees of five skills, each gated by a real Origins skill level, both
unlocking at the same thresholds — **5 / 20 / 40 / 65 / 90**:

| Tree | Gated by | Skills (gate, MP) |
| --- | --- | --- |
| **Water** | fishing | Net (5, 4) · Foam Barrier (20, 5) · Tidal Wave (40, 7) · Whirlpool (65, 8) · Deep Sea Beast (90, 12) |
| **Nature** | gardening | Sapling Barrier (5, 4) · Life Wave (20, 6) · Nature's Blessing (40, 7) · Decaying Flowers (65, 7) · Thorns (90, 10) |

`unlockedTreeSkills(fishing, gardening)` maps levels to ids, `treeSkillSpecs(ids)`
resolves ids to specs (dropping unknown ids), `nextUnlocks()` reports the next
locked skill per tree plus how many levels remain. Unlock thresholds are still
the M3 placeholders.

A spec is a superset of the class-skill shape in `classes.js`, so `battle.js`
resolves both through one path: `kind` (`heal`/`buff`/`shield`/`damage`),
`target` (`ally`/`enemy`/`self`), `range`, `radius` (0 = single tile, N =
Chebyshev blast around the target tile), `power`, optional `cost`, optional
`status` (only `{ rooted: 1 }` is used, by Net and Whirlpool) and optional
`buff` (only `{ atk: 5 }`, by Nature's Blessing).

**Who wields them.** In a dungeon run, only the leader: `instantiateSquad` passes
`skills: m.leader ? leaderSkills : []`. Every other squad member carries only
their class skill — and six of the eight classes have none, so only a Cleric or
Bard member has anything to cast at all. In duels both duellists get tree skills,
resolved from the receiving client's own tables rather than off the wire.

**How a cast resolves.** `skillTargets` returns `[unit]` for self-skills; enemy
skills need line-of-sight and range; ally skills need range, and single-target
(radius 0) ones additionally refuse a full-HP heal target and refuse to buff
yourself or an already-buffed ally. Damage is
`max(1, power - floor(def / 2))` scaled by height only — skills deliberately
pierce half of armour and, unlike autoattacks, ignore the class triangle. No RNG.
Heals clamp to maxHp, shields add to a pool that soaks before HP, buffs set
`buffAtk` to the higher of the existing and new value and are spent on the next
swing. Both kill paths price a kill through `battle.killXp(target)` =
`10 + level * 5`, so a skill kill pays exactly what a swing on the same target
pays; an area skill sums that per victim and awards it in one `gainXp` call. Any
resolved skill sets both `moved` and `acted`.

### What MP does today

Every class has a pool, not just the casters, because any class can be the run
leader and the leader is the one granted tree skills:

| | Fighter | Barbarian | Rogue | Ranger | Warlock | Mage | Bard | Cleric |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| maxMp (L1) | 10 | 10 | 10 | 12 | 16 | 18 | 18 | 20 |

Only two class skills exist and both are priced: Cleric **Heal** (12 power, 6 MP)
and Bard **Inspire** (+5 ATK, 4 MP).

- **Affordability** is decided in exactly one place, `battle.canAfford(unit, skill)`:
  no skill is false, a cost of 0 or an absent `cost` is always true, otherwise the
  unit needs `stats.mp >= cost`. The button gate, `enterSkill`, the co-op and duel
  host validators and `resolveSkill` itself all call it.
- **An omitted `cost` means free.** Only explicitly-priced skills are limited.
- **Refusal happens before any mutation.** `resolveSkill` returns `null` and
  changes nothing — no HP, no shield, no log line, and the unit has not acted.
- **Regeneration is +2 at the start of each of that unit's phases**, applied in
  `resetTurn` off the living-unit lists, so downed units regain nothing.
- **Scaling**: +2 maxMp per level and `maxMp` is honoured as an equipment-bonus
  key wherever `maxHp` is. A mid-battle `levelUp` raises the ceiling by 2 but does
  not refill the pool.
- **Persistence**: members start full; the pool rides into battle, is written back
  refilled to max by `writeBack`, is serialized as `mp`, and is backfilled to full
  when a pre-MP save is deserialized (no save-version bump). `clampHp` clamps the
  pool as well as HP after an equipment swap.

### How the two connect

Costs track the **unlock threshold**, not the power number, so Origins progress
buys reach rather than free power. The level-90 capstones cost 10–12 — Deep Sea
Beast at 12 is one cast from a Mage's full 18, and unaffordable at level 1 for
any melee class.

The melee pools are floored at 10 rather than lower specifically because Thorns
(the level-90 Nature capstone) bursts around the *caster* and costs 10 — the
classes that stand in a cluster of foes are its natural wielders, so a smaller
pool would have made the melee-shaped capstone uncastable by melee. A full melee
pool buys exactly one cast.

Against the Cleric's 6-MP Heal, a 20 pool is three opening casts and then, at +2
per turn, one sustained cast every three turns. HP carries wounds forward across
battles; MP does not carry an empty pool forward.

### Explicitly not built

- **No enemy ever casts.** `js/ai.js` never calls `resolveSkill`, and no enemy is
  granted a `skills` list. Enemy units still carry a pool (they run through the
  same `Unit` and `CLASSES` tables) — it is inert.
- **No consumable restores MP.** Effect kinds are `heal`, `healAll`, `revive`,
  `buff` and `xp` only; there is no MP potion, so the +2 per-phase regen is the
  only in-battle source. Camp `rest()` spends gold to heal HP and does not touch
  MP (the pool is already refilled by `writeBack`).
- **No item grants maxMp.** The bonus key is plumbed through `maxMpOf`,
  `memberStats` and `Unit`, but zero items in `js/items.js` define it.
- **No cooldowns.** MP and the one-action-per-turn rule are the only limiters; a
  unit with a full pool can cast the same skill on consecutive turns.
- **Basic attacks are free** — cost applies to skills only.
- **`rooted` is the only status a skill can apply**, and `atk` the only stat a
  skill buff can raise (`applyBuff` accepts atk/def/spd, but no skill uses def or
  spd).
- **Skill damage ignores the class triangle**, which autoattack damage applies.
  (Kill XP no longer differs between the two paths; damage still does.)
- **Non-leader squad members mostly have no use for their pool** — six of eight
  classes have no class skill and tree skills go to the leader only.
- **Unlock thresholds and costs are untuned by play.** The 5/20/40/65/90 gates are
  M3 placeholders; the numbers above are internally consistent but no balance pass
  has been run against them.

## v1 audit reference (2026-07-01)

v1 = Lovable React SPA + Supabase (Lovable-hosted, `cswyarorrvzbunodiftf`), 14 routes,
~20 edge functions (`generate-story-node`, `resolve-turn` w/ dice, `sync-habbo-skills`,
lobbies/parties, TTS, loot/store). Core loop was AI story nodes + dice choices +
menu combat (attack/skill/defend/item) — no movement or positioning. Keepers: Origins
skill-tree hook, 38-monster bestiary, 8 classes, items/economy, motto-linking flow.
AI content pipeline was cost-gated (custom dungeon generation disabled on the site).
