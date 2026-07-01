
# HabboDungeon Rebuild - SOP (Claude Sonnet 4.5 / "Fable 5" build)

A step-by-step standard operating procedure to rebuild the project from a blank Lovable project. Phase 1 (the grid + Habbo walk engine + Origins API integration) is the first and most detailed section, because you want it correct before any combat, story, or dungeon systems are layered on.

---

## 0. Ground Rules (apply to every phase)

- **Stack:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui. Lovable Cloud (Supabase) for auth, DB, edge functions, storage.
- **No hardcoded colors** in components; all tokens live in `index.css` + `tailwind.config.ts`.
- **No em-dashes**, no iOS emojis in UI, pixel art rendered at native resolution (`image-rendering: pixelated`, no CSS upscaling of sprite frames).
- **One feature per prompt.** Never bundle "grid + combat + story" in a single request. Verify each phase visually before moving on.
- **After each phase:** commit via Lovable, screenshot the working state, write a short note in `README_PATCH_NOTES.md`.

---

## Phase 1 - Habbo-Authentic Grid, Walking, and Origins API (DO THIS FIRST)

Goal at end of Phase 1: an empty isometric room where a real Habbo avatar (fetched from Origins API by username) walks tile-by-tile with correct 8-direction facing, using BFS pathfinding around blocked tiles - visually indistinguishable from classic Habbo movement.

### 1.1 Data model & types

Create `src/lib/grid/types.ts`:

```text
GridPosition   { x: number; y: number }
TileVariant    "floor" | "wall" | "door" | "hole" | "seat"
Tile           { id, position, walkable, height, variant }
RoomModel      { cols, rows, tiles, doorTile, spawnTile }
Direction      0..7  (0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW)
```

Constants (match Habbo retro):
- `TILE_WIDTH = 64`, `TILE_HEIGHT = 32` (2:1 iso ratio)
- `STEP_MS = 500` per tile (classic Habbo walk speed)
- `HEIGHT_STEP = 32` (for future stair support - stub only in Phase 1)

### 1.2 Isometric math (`src/lib/grid/iso.ts`)

```text
gridToScreen({x,y}, heightZ=0):
  screenX = (x - y) * (TILE_WIDTH / 2)
  screenY = (x + y) * (TILE_HEIGHT / 2) - heightZ * HEIGHT_STEP
screenToGrid(sx, sy):  standard inverse
zIndexFor({x,y}, heightZ): (x + y) * 1000 + heightZ  // painter's algorithm
```

Add `centerRoomOffset(cols, rows, containerW, containerH)` so the diamond always sits centered inside its stage box.

### 1.3 Pathfinding (`src/lib/grid/pathfinding.ts`)

Reference implementation: [tetreum/habbo-server](https://github.com/tetreum/habbo-server) and [gurkengewuerz/habbo-imaging](https://github.com/) walk cycle. BFS in 4 or 8 directions (start with 4, upgrade to 8 later so the diagonal cost matches Habbo's `sqrt(2)` approximation):

```text
findPath(room, start, goal, blockedSet): GridPosition[] | null
findReachable(room, start, range, blockedSet): GridPosition[]
```

Rules:
- Never cross a non-walkable tile.
- Never end on an occupied tile (other avatar/enemy).
- Allow ending on a `door` or `seat` tile.

### 1.4 Direction resolver (`src/lib/grid/direction.ts`)

```text
dirFromDelta(dx, dy): Direction   // maps tile delta to 0..7
```

Exactly Habbo's convention:
```
dx=0, dy=-1 → 0 (N)
dx=1, dy=-1 → 1 (NE)
dx=1, dy=0  → 2 (E)
...
```

### 1.5 Habbo Imager wrapper (`src/lib/habbo/imager.ts`)

Use the official imager (same host your existing code already hits successfully):

```
https://www.habbo.com/habbo-imaging/avatarimage
  ?figure={figure}
  &direction={0-7}
  &head_direction={0-7}
  &action=std|wlk|sit|lay|wav|crr
  &gesture=std|sml|agr|sad|srp
  &size=s|m|l
  &frame={0-3}
  &img_format=png
  &hotel=COM
```

Export:
- `getAvatarUrl(figure, opts)`
- `WALK_FRAMES = [0,1,2,3]`
- `getWalkFrameUrls(figure, direction)`

### 1.6 Origins API integration

Two edge functions in `supabase/functions/`:

**`fetch-habbo-profile`** - `POST { username }`
- Calls `https://origins.habbo.com/api/public/users?name={username}`
- Returns `{ name, figureString, motto, uniqueId, memberSince, lastAccessTime }`
- Cache results in `habbo_profiles` table for 15 min.

**`fetch-habbo-skills`** - `POST { username }`
- Calls Bobba API (`https://api.bobba.me/get_habbo?username=...`) to get `fishingLevel`, `gardeningLevel`.
- Returns `{ fishingLevel, gardeningLevel }`.
- Store on `profiles` row with `last_habbo_skill_sync`.

DB tables (all with GRANT + RLS from the start):
```
habbo_profiles(username PK, figure, motto, unique_id, updated_at)
profiles(id PK ref auth.users, username, habbo_username, figure,
         motto, fishing_level, gardening_level, last_habbo_skill_sync)
```

Client wrapper: `src/lib/habbo/api.ts` exposes `fetchHabboProfile(username)` and `syncHabboSkills()`.

### 1.7 Sprite components

**`HabboAvatar.tsx`** - stateless renderer for one frame.
- Props: `figure, direction, action, gesture, frame, heightPx`.
- Renders one `<img>` from `getAvatarUrl`, feet-anchored (`translate(-50%,-100%)`), `image-rendering: pixelated`, no CSS scaling of the frame beyond the fixed `heightPx`.

**`WalkingAvatar.tsx`** - stateful wrapper.
- Props: `figure, path: GridPosition[], onArrive`.
- Internally: cycles `frame` 0..3 every `STEP_MS/4 = 125ms` while walking, sets `action="wlk"` while moving and `"std"` when idle, updates `direction` per step via `dirFromDelta`, and interpolates screen position linearly between the current and next tile's `gridToScreen` result across `STEP_MS`.
- Uses `requestAnimationFrame` (not CSS transitions) so pausing/re-pathing is instant.
- Preloads all 4 walk frames per direction on mount (prevents flicker).

### 1.8 Room renderer

**`RoomStage.tsx`**
- Renders the diamond of `<Tile>` divs from `RoomModel` using `clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)'`.
- Tiles are diamond-shaped, centered on their iso point, with a 1px semi-transparent border so grid lines are visible.
- Hover state highlights tile; on click emits `{gridPos}`.
- `z-index` from `zIndexFor` so avatars/props sort correctly.
- No background image in Phase 1 - solid dark blue, tiles on top. (Backgrounds are Phase 4.)

**`RoomController.tsx`**
- Holds `avatar.position` and `avatar.path` state.
- On tile click: compute `findPath(currentPos, clickedTile)`, hand to `WalkingAvatar`.
- Reachable tiles get a subtle highlight while hovering.

### 1.9 Phase 1 acceptance test

Standalone route `/room-test`:
1. Text input for Habbo username, "Load" button.
2. On load: fetch profile via `fetch-habbo-profile`, render a 10x10 room.
3. Avatar spawns on `spawnTile`.
4. Click any walkable tile - avatar walks the BFS path tile-by-tile, faces the right direction each step, cycles the walk sprite, stops on arrival.
5. Add one non-walkable tile in the middle - path routes around it.
6. Add a second avatar (any test figure) on a tile - path routes around it too and cannot end on it.
7. Motto and skill levels (fishing/gardening) render in a side panel.

Only after all 7 pass, move to Phase 2.

---

## Phase 2 - Rooms, Doors, and Multi-Entity Movement

- `RoomModel` loader from Supabase (`rooms` table): serialized tile grid per room.
- Door tile triggers navigate to another room.
- Support N entities in the room, each with their own `WalkingAvatar`, each pathfinding around the others.
- Add a simple in-room chat bubble above the walker (Habbo-style `<div>` above head, fades after 4s).
- Admin room editor: paint walkable/blocked/door tiles, save to DB.

## Phase 3 - Auth + Habbo Linking

- Email/password + Google auth (Lovable Cloud defaults).
- `/link-habbo` flow: user enters Habbo username, we set a random motto verification code, poll `fetch-habbo-profile` until motto matches, then persist `habbo_username` + `figure` to `profiles`.
- Skill sync button + auto-sync on link.

## Phase 4 - Dungeon Presentation Layer

- Dungeons are a themed skin over a `RoomModel` (icy floor tile variants, prop sprites on specific tiles).
- Bake decor as tile-anchored sprites, NOT a background image behind the grid. (This is the mistake we hit in the current build.)
- Optional dark backdrop behind the diamond for atmosphere - purely decorative, never carries gameplay meaning.

## Phase 5 - Combat System

- Turn manager, initiative order, actions: Move / Attack / Skill / Defend / Item.
- Movement action uses the same `WalkingAvatar` + BFS from Phase 1 - no new movement code.
- Attack range = adjacency check on the grid; if not adjacent, Attack is disabled until you Move first.
- Enemy sprites use `EnemySprite` with per-enemy scale factors so no enemy dwarfs the player.

## Phase 6 - AI Story Layer

- `generate-story-node` + `resolve-story-choice` edge functions using Lovable AI Gateway.
- Per-room lock (single-flight) so a room can only be generating one story node at a time.
- Preserve resolved story text while choices generate (fix for the "context wipe" bug in the current build).
- Combat-flavored choices in a no-enemy room must either be filtered out at generation time OR spawn an enemy from the dungeon's roster at resolve time.

## Phase 7 - Progression, Inventory, Store, Loot

Everything downstream: player_stats, inventory, item icons (generated via Lovable AI Gateway), merchant store (gold > silver), loot chests, daily books/summons, monster manual, party system, PvE servers.

## Phase 8 - Polish & Launch

- SEO metadata in `index.html`, security scan clean, RLS + GRANTs audited on every public table, publish to `habbodungeons.com`.

---

## Reference Repos to Mine for Phase 1

- **tetreum/habbo-server** - server-side walking + pathfinding logic.
- **gurkengewuerz/HabboSwfExtractor** and any "Habbo Nitro" repo - canonical direction indices and walk frame layout.
- **billsonnn/nitro-react** - modern React reference for iso rendering and avatar imager usage.
- Official imager: `https://www.habbo.com/habbo-imaging/avatarimage` (already used successfully by DailyLeaderboard/BattlePartyList in the current codebase - keep this, do not swap to third-party imagers).

---

## Deliverable of this SOP

Follow phases strictly in order. Do NOT let the AI start on combat, dungeons, or story until Phase 1's 7-point acceptance test passes on a fresh project. The current codebase's core problems (grid/background misalignment, invisible avatar, sliding movement) all trace back to skipping Phase 1 discipline.

## Technical Notes

- Everything in Phase 1 is client-side except the 2 edge functions in 1.6. No realtime, no combat state, no story tables yet - keep the schema minimal.
- Use `requestAnimationFrame` for avatar interpolation, not CSS `transition` - CSS transitions break the moment you re-path mid-walk.
- Preload walk frames per direction using `new Image()` on mount to eliminate the first-step flicker.
- Keep `RoomStage` purely presentational; all state (position, path, direction) lives in `RoomController` so it can later be lifted into a combat store without rewriting the renderer.
