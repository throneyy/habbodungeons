## Goals
1. Revert the recent 90° rotation so the dungeon grid is the wide horizontal diamond again (12 wide × 8 deep, classic 32×16 iso tile, container back to landscape).
2. Figure out why your Habbo isn't visible and fix it.

## Part 1 — Revert the rotation

In `src/components/DungeonBoardTiled.tsx`:
- Remove the local tall projection (`TILE_W=16`, `TILE_H=32`, `projectTile`, local `tileZ`) and the inline tile-drawing loop.
- Go back to importing `gridToScreen`, `calculateZIndex`, `ISO_TILE_WIDTH`, `ISO_TILE_HEIGHT` from `@/lib/isometricUtils`, and rendering tiles with `<GridRenderer>` from `./GridRenderer`.
- Restore `STAGE_W = (cols+rows)*16 = 320`, `STAGE_H = (cols+rows-1)*8 + 16 = 168`, with the corrected centered offset (`offset.x = (rows-1)*16 = 112`, `offset.y = 0`) so the diamond is no longer cut off bottom-right.
- Restore the original player/enemy slot tiles (players on right side of 12×8 board, enemies on left).
- Wrapper goes back to `aspect-[16/10]` landscape.

## Part 2 — Why your Habbo is missing (real cause is almost certainly NOT movement)

From the earlier screenshot you only saw a tiny generic skeleton-looking sprite. That is exactly what `DEFAULT_FIGURE` renders when `entity.figureString` is null. Path:

In `Battle.tsx` (~line 2877) the figureString is resolved in this order:
1. `entity.figureString` from the dungeon row
2. `battleData.players.find(p => p.userId === entity.id)?.figureString`
3. `profile?.habbo_profile_json?.figureString` (only if `entity.id === currentUserId`)

If all three are missing/mismatched, `PlayerToken` falls back to the hardcoded `DEFAULT_FIGURE`, which renders as the small grey figure you saw.

The walking/pathfinding system can't make a sprite invisible — `PlayerToken` always renders `<HabboAvatarSprite>` at its current tile. Worst case for movement is the avatar standing still on the home tile. So the "no habbo" issue is a data problem, not a movement bug.

### Diagnosis steps I'll run (read-only)
- Temporarily log inside `DungeonBoardTiled` for each player entity: `entity.id`, `entity.figureString`, the resolved figureString that gets passed to `HabboAvatarSprite`, and the computed `(left, top)` so we can see if it's offscreen or just rendering the default.
- Compare `entity.id` (in `dungeon.entities`) with `battleData.players[].userId` and with `currentUserId` to see which match is failing.
- Open the battle page and check the console output for one matched player.

### Likely fixes (pick after diagnosis)
- Most likely: `entity.id` is a slot id (`"slot-1"`) while `battleData.players[].userId` is the actual user UUID, so the `.find()` never matches and only entities owned by `currentUserId` get a figure. Fix by matching on a stable shared key (e.g. `slotId` ↔ `slotId`, or `username` ↔ `username`) in the Battle.tsx resolver.
- If `entity.figureString` is already on the row but not being read because the dungeon row only carries `figure_string` (snake_case), normalize the field when building the entities array.
- If `profile?.habbo_profile_json?.figureString` is the only available source and `entity.id !== currentUserId` for your own avatar, fix the id mismatch the same way.

## Technical summary
- File touched in Part 1: `src/components/DungeonBoardTiled.tsx` (revert only, no other components change).
- File touched in Part 2 after diagnosis: likely `src/pages/Battle.tsx` (figureString resolver in the `<DungeonBoard>` props), possibly the dungeon entity normalizer where rows come back from the backend.
- No changes to combat logic, movement BFS, edge functions, or DB schema.

## Open questions before I implement
1. After revert, do you want me to immediately ship the diagnostic logs and ask you to paste a console snippet, or do you want me to just guess-fix the id-mismatch path first (faster but might miss the real cause)?
2. Should the fallback `DEFAULT_FIGURE` stay (so you at least see a generic body when data is missing), or should I render nothing + a small "no avatar" warning while debugging?
