## Goal

Apply the real changes from `habbodungeons-main.zip` to the Lovable project and publish to `habbodungeons.com`.

## What's actually in the zip

After diffing the zip against the current project (ignoring lockfiles, `.git`, `node_modules`):

**Truly changed files (6):**
- `src/components/BattleStage.tsx`
- `src/components/GridRenderer.tsx`
- `src/components/HabboAvatarSprite.tsx`
- `src/lib/Utils/habbo.ts`
- `supabase/functions/generate-story-node/index.ts`
- `supabase/functions/resolve-story-choice/index.ts`

**New files (2):**
- `README_PATCH_NOTES.md`
- `supabase/migrations/20260611000000_add_story_memory.sql` (adds `story_memory jsonb` column to `battle_states`, additive/non-breaking)

**Apparent additions to ignore (51 files):**
The zip contains `src/components/UI/*` (capital `UI`) alongside the existing `src/components/ui/*` (lowercase). This is a case-insensitive-filesystem artifact from unzipping on macOS/Windows — the file contents are the same shadcn primitives. Copying them in would create a duplicate folder on Linux, break `@/components/ui/...` imports, and bloat the repo. **Skip these.**

## Files I will NOT overwrite (despite the "full replace" answer)

These are Lovable-managed and would break the project:
- `.env` (auto-generated `VITE_SUPABASE_*`)
- `src/integrations/supabase/client.ts` and `types.ts` (auto-generated)
- `supabase/config.toml` (auto-generated)
- `bun.lock`, `bun.lockb`, `package-lock.json` (managed by sandbox)
- `.git/` (never)
- `src/components/UI/` casing duplicates (see above)

If a `package.json` change exists I'll diff it and apply only real dependency changes via `bun add`.

## Steps

1. **Apply the 6 changed source files** verbatim from the zip:
   - `src/components/BattleStage.tsx`
   - `src/components/GridRenderer.tsx`
   - `src/components/HabboAvatarSprite.tsx`
   - `src/lib/Utils/habbo.ts`
   - `supabase/functions/generate-story-node/index.ts`
   - `supabase/functions/resolve-story-choice/index.ts`
2. **Copy** `README_PATCH_NOTES.md` into the repo root.
3. **Run the new migration** `20260611000000_add_story_memory.sql` via the migration tool (adds `story_memory` column with default `'{}'::jsonb` to `public.battle_states`).
4. **Redeploy the two edge functions** that changed (`generate-story-node`, `resolve-story-choice`) so the new `story_memory` field is read/written in production.
5. **Verify** preview builds cleanly and check console/network for runtime errors on `/battle` and any story flow.
6. **Run security scan**, address any critical findings introduced by the migration (none expected — column is additive, RLS already on `battle_states`).
7. **Publish** to `habbodungeons.com` (verify title/meta/OG are still relevant first; update if stale).

## Risks / notes

- The new column is additive with a default, so existing rows and code paths keep working.
- If, after I read the changed edge functions, they reference any other DB column/table not present today, I'll stop and flag before deploying.
- If you actually want a literal byte-for-byte mirror of the zip (including the duplicate `UI/` folder and overwriting auto-generated Lovable files), say so and I'll redo this — but it will almost certainly break the build.
