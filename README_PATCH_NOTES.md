# Habbo Dungeons — full audit fix (security + JRPG balance + Habbo feel)

All 7 files keep their original repo paths: unzip over the project root and let
them overwrite, run the migration, deploy the two edge functions.

```
src/lib/Utils/habbo.ts
src/components/HabboAvatarSprite.tsx
src/components/BattleStage.tsx
src/components/GridRenderer.tsx
supabase/migrations/20260611000000_add_story_memory.sql   (comment updated only)
supabase/functions/generate-story-node/index.ts
supabase/functions/resolve-story-choice/index.ts
```

## 1) Security / integrity (resolve-story-choice)

- **Server-side holodice.** Dice are now rolled in the edge function with crypto
  randomness. Client-sent rolls are ignored. The roll comes back in the response
  (`diceRoll`, `diceCheck`) so the UI can animate the *real* dice.
- **Stored-choice validation.** The choice is looked up by `choiceId` in the
  story node already saved in `battle_states`. Its label, DC, and skillType are
  used — never the client's. This kills DC spoofing and prompt injection via
  `choiceLabel` in one move. (Legacy battles without a stored node fall back to
  hard-clamped client fields.)
- **Party writes fixed.** HP/MP, XP, level-ups, and loot now go to the ACTING
  user. Previously everything was written to the battle creator's row — in a
  server battle your wounds and your loot landed on whoever started the run.
- **Economy clamps.** `hpChange` ±30, `mpChange` ±20, max 2 items per choice,
  quantity 1-3, name length capped, type whitelisted. Failed checks can never
  award items (enforced in code, not just the prompt).
- **Optimistic concurrency.** The battle_states write only lands if the story
  node the choice answered is still present; a racing duplicate gets a 409
  before any stats/inventory are touched.
- **Rate limit** (2.5s) on choices, matching the one generation already had.

## 2) The generation race (generate-story-node + resolve)

The old "claim marker" never worked: resolve set `{generating:true}` after each
choice, but generate's atomic claim only matched `null` — so every room ate a
guaranteed 2-second sleep and concurrent requests *both* fell through and
generated (double AI cost, last write wins). Now:

- resolve sets the node to **null**, so generate's `.is(null)` claim is atomic.
- Stale claims (>20s, e.g. a crashed generator or old-format marker) are taken
  over atomically via a timestamp-compare update.
- Losing requests **poll** for the winner's result and never fall through.
- On generation failure the claim is released so the next request retries
  immediately.
- The final story write targets the battle row **ID** (it used to update every
  battle row for that user+dungeon, clobbering older runs).

## 3) Classic JRPG balance

- **Check XP actually awards.** The old code compared the dice *array* to the DC
  (`[3,4,2] >= 15` is always false in JS), so passing a check paid 0 XP. Fixed,
  and rebalanced: success pays `DC × 1.5`, so risk now beats walking (room XP
  alone used to be the optimal strategy).
- **Stats matter outside combat.** Each skillType maps to a stat (strength→ATK,
  stealth→SPD, endurance→DEF, social/lore→level) granting a +0..6 modifier on
  the roll. Builds and levels mean something in story mode.
- **Fail forward.** A near miss (failed by ≤2) is a partial success at a cost:
  no loot, possible small HP price, but progress is allowed and it pays 75% XP.
  The `margin` was already computed — now it does something.
- **Softened level curve.** `level² × 10` to next level (was `level³ × 10`,
  which hit a ~100-room wall around level 5). Room XP scales with depth and
  dungeon difficulty instead of a flat 15-25.
- **A real defeat state.** At 0 HP you faint: wake at 25% max HP, lose 10% of
  current XP, the room doesn't advance. No more "0 HP and the story shrugs".
- **Engine-decided encounters.** The room's encounter type (environment /
  discovery / NPC / rest / quest, enemy rooms and the finale are fixed) is
  rolled server-side and dictated to the model. Pacing is now a system, not a
  suggestion. Systems decide; the writer dresses.
- **Chronicle memory.** When the 14-beat cap overflows, the oldest beats are
  compressed into a running 1-2 sentence chronicle (cheap flash call,
  truncation fallback) instead of being silently dropped. Beats are deduped;
  the NPC cast is capped at 12.

## 4) Habbo authenticity (frontend)

- **Habbos walk, they don't glide.** Movement animates tile-by-tile along an
  8-directional BFS path through walkable tiles, ~240ms per step, facing each
  step's direction. The old single CSS slide cut diagonally through walls.
- **Depth sorting fixed.** Players and enemies use the same isometric z formula,
  so you can actually stand *behind* an enemy. (Players used to get +1000 and
  float in front of everything.)
- **Walk frames preload** per figure+direction, so the first walk cycle doesn't
  flicker while imager frames download.
- **Hotel support.** `getHabboFrameUrl`/`HabboAvatarSprite` accept a `hotel`
  ("ES", "COM.BR", ...) instead of hardcoding COM — pass the user's hotel from
  their linked Habbo profile when you have it.
- **Production-safe background.** The default battle background is a real Vite
  asset import; the `/src/assets/...` string 404'd in production builds.
- **Honest cursors.** Only actionable tiles (reachable during move phase, or
  editor mode) show pointer/hover effects.
- Two leftover theme leaks fixed: the frost-flavored treasure fallback text and
  the `roomType`/`room_type` mismatch that stopped treasure messages firing.

## 5) Prompt/AI reliability

- `response_format: json_object` on all AI calls.
- Removed `//` comments from JSON examples in the prompt (models copied them
  into output — likely your main source of parse failures).
- Fixed the broken 1,2,3,3,5,6 numbering in the story rules.
- resolve-story-choice now uses the same multi-attempt JSON repair as generate.
- Rate-limit rejections return 429 (not 500) so the client can distinguish.

## API contract notes (frontend follow-ups, files not in this bundle)

1. **Dice UI:** the client should stop rolling dice locally. Call
   `resolve-story-choice` with `{ battleId, choiceId }`; animate the dice from
   the response's `diceRoll` / `diceCheck` (which includes `modifier`,
   `partial`, `dc`, `total`). Legacy payload fields are still accepted.
2. **409 handling:** both functions can return 409 ("already processed" /
   "still generating") — treat as a soft retry/refresh, not an error toast.
3. **`fainted: true`** in the resolve response — show a faint/respawn moment.
4. If you ever rescale tiles toward classic Habbo 64×32 proportions, change
   `ISO_TILE_*` in `isometricUtils.ts` and `TILE_*` in `habbo.ts` together.

## Verification

- esbuild syntax check passes on all 6 code files.
- I could not run your full Vite build or Supabase deploy here (no
  node_modules), so run your normal build/deploy once after applying.
- Existing in-progress battles keep working: stored-node validation falls back
  for pre-deploy story nodes, and the stale-claim takeover absorbs old-format
  `{generating:true}` markers left by the previous resolve function.
