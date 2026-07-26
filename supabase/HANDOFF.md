# Habbo Dungeons — V2 Supabase Migration Runbook (Lovable)

> **READ THIS FIRST.** Multiplayer (presence, trade, parties, co-op) is **UNTESTED
> against a real backend.** It has only been proven to *load* and to keep the
> solo-local game working. It is **not verified as working** until you complete
> the **POST-DEPLOY VERIFICATION** checklist at the bottom of this file. Do not
> tell anyone "multiplayer works" until that checklist passes end to end.

The same static client runs two ways (selected by hostname in `js/backend.js`):
`localhost` → the old Node `server.js` (`/api/*` + `/ws`); **any other host
(Lovable) → Supabase** (Edge Functions + Realtime). On Lovable you are always on
the Supabase path.

There are **23 edge functions**: the 19 listed in §3 plus the four `duel-*` added
later (§3a).

> **Currently OUT OF DATE on the live project `cswyarorrvzbunodiftf`** — three
> migrations and four functions are in git but were never applied/deployed. See
> **§5, "What is still undeployed"**, which also records which deploy paths
> actually work from this machine and which need a human. Git does not deploy
> this backend; pushing `supabase/` changes files and nothing else.

---

## 1. Drop this repo into the Lovable-connected GitHub repo WITHOUT nuking Lovable's `supabase/`

Lovable owns two things in its repo you must not clobber:
- `supabase/config.toml` → its **`project_id`** line points at your real project ref.
- any `supabase/migrations/*` Lovable already generated.

Do the merge, not a blind overwrite:

1. **Copy everything EXCEPT `supabase/config.toml`** from this repo into the
   Lovable repo root: `index.html`, `css/`, `js/`, `assets/`, `data/` (optional),
   and all of `supabase/functions/` + `supabase/migrations/`.
   - Do **NOT** copy `node_modules/`, `server/`, `server.js`, `tools/`, `tests/`.
     They are the old Node backend and dev-only; harmless but pointless on Lovable.
   - `supabase/functions/node_modules/` and `supabase/functions/deno.lock` are a
     local Deno cache — safe to omit; Supabase re-resolves on deploy.
2. **Reconcile `supabase/config.toml`:** keep **Lovable's `project_id`**. From
   *this* repo's `config.toml`, copy in these blocks if Lovable's is missing them:
   - `[auth]` / `[auth.email]` (email OTP, confirmations off)
   - `[realtime] enabled = true`
   - every `[functions.<name>]` block with its `verify_jwt` value (these are load-
     bearing — see §3; four functions **must** stay `verify_jwt = false`).
   If in doubt, take this repo's `config.toml` verbatim and change only the
   `project_id =` line to match Lovable's real ref.
3. Commit + push. Let Lovable build. It serves the **root as static files — there
   is no Vite/npm build step.** Confirm the canvas title screen loads and you can
   start a solo run (this proves the static drop worked before any backend exists).

---

## 2. Apply the schema migration

File: **`supabase/migrations/20260725000000_v2_backend.sql`** (one migration; it is
idempotent — every table/policy is `IF NOT EXISTS` / guarded, so re-running is safe).

Apply it one of two ways:
- **Lovable:** let Lovable pick up the new migration and run it, **or**
- **SQL editor:** paste the whole file into the Supabase SQL editor and run once.

Then sanity-check it took:
```sql
select count(*) from information_schema.tables
where table_schema='public'
  and table_name in ('profiles','inventory','stash_gold','room_presence',
  'room_messages','parties','party_members','party_invites','trades',
  'trade_offers','room_layouts','user_roles','rate_limits','battle_states');
-- expect 14
```

### If it fails, it will almost certainly be one of these two blocks:

**(a) `pg_cron` (top of file + the `cron.schedule(...)` at the very bottom).**
Both are wrapped in `EXCEPTION WHEN OTHERS THEN NULL`, so a plan without pg_cron
should **skip silently, not abort.** If your Supabase somehow still errors on
`create extension pg_cron`, delete those two `do $$ ... end $$;` blocks and re-run.
Consequence: no auto-reap of stale presence — cover it in §3 by scheduling the
`presence-reap` function instead. Verify the schedule exists (if pg_cron is on):
```sql
select jobname, schedule from cron.job where jobname='reap-stale-presence';
```

**(b) The Realtime RLS block (`create policy ... on realtime.messages`, ~line 460).**
Both policies are guarded with `when undefined_table then null`, so if the
`realtime.messages` table isn't present the migration **won't fail — it will
silently skip them.** That is the trap: the migration "succeeds" but **private
channels get no read/write policy**, and every `user:` / `party:` topic the client
subscribes to (trade + party + co-op prompts) will be **denied**. Presence/movement
still work (the `room:` channel is not private), so you'll think it's fine until
trade/party silently do nothing. Confirm the two policies actually exist:
```sql
select policyname from pg_policies
where schemaname='realtime' and tablename='messages';
-- expect: "realtime read own topics" and "realtime write allowed topics"
```
If they're missing: ensure **Realtime is enabled** for the project, then re-run
just that block from the migration file. You must also have **Realtime
Authorization** turned on (Dashboard → Realtime → Settings) so RLS on
`realtime.messages` is enforced for private channels.

Also confirm the publication picked up the tables clients subscribe to:
```sql
select tablename from pg_publication_tables where pubname='supabase_realtime';
-- expect room_presence, room_messages, party_members, party_invites, parties,
--        trades, trade_offers, room_layouts, battle_states
```

---

## 3. Deploy the 19 edge functions + set secrets

Deploy all functions (Lovable's Supabase integration deploys `supabase/functions/*`,
or run `supabase functions deploy` if you use the CLI). The full set:

| # | Function | verify_jwt | Notes |
|---|---|---|---|
| 1 | `verify-habbo-link` | **false** | motto-ownership check; guests link without sign-in |
| 2 | `sync-habbo-skills` | **false** | Fishing/Gardening levels; guests sync without sign-in |
| 3 | `fetch-habbo-profile` | **false** | public profile lookup (infostand mottos, avatar) |
| 4 | `habbo-imaging` | **false** | CORS proxy for avatar PNGs (canvas-safe) |
| 5 | `stash-bank` | true | bank run loot + gold |
| 6 | `save-room-layout` | true | admin-only furniture save |
| 7 | `presence-heartbeat` | true | refresh a room_presence row |
| 8 | `presence-reap` | **false** | cron-invoked stale-row eviction |
| 9 | `party-invite` | true | |
| 10 | `party-accept` | true | |
| 11 | `party-decline` | true | |
| 12 | `party-leave` | true | |
| 13 | `party-disband` | true | |
| 14 | `trade-open` | true | |
| 15 | `trade-offer` | true | |
| 16 | `trade-retract` | true | |
| 17 | `trade-accept` | true | |
| 18 | `trade-confirm` | true | runs the atomic swap |
| 19 | `trade-cancel` | true | |

**The four `verify_jwt = false` functions (1–4, 8) are deliberate.** 1–3 must accept
anonymous callers so guests can link/sync/lookup exactly like the old solo-local
flow (they write profile rows only when a JWT is present). 4 must be public so the
sprite loader and infostands can fetch avatars before sign-in. 8 is invoked by the
scheduler with the service key. If the deploy resets these to `true`, guests can't
link and avatars won't render — re-assert them from `config.toml`.

### Secrets (read straight from the function source)

Only **three** env vars exist in the code, and **two of them you cannot and must
not set** — Supabase injects them automatically:

- `SUPABASE_URL` — **auto-injected** (reserved). Used by `_shared/client.ts` and
  `_shared/realtime.ts` (all mutation + broadcast functions).
- `SUPABASE_ANON_KEY` — **auto-injected** (reserved). Used by `_shared/client.ts`.
- `SUPABASE_SERVICE_ROLE_KEY` — **auto-injected** (reserved). Used by
  `_shared/client.ts` (service writes) and `_shared/realtime.ts` (edge-function
  broadcasts). *Any secret name starting with `SUPABASE_` is reserved; you cannot
  create it — it's already there.*

The **only secrets you set yourself**, both **optional**, both used only by
`_shared/habbo.ts` (so they matter for functions 1, 2, 3):

- `BOBBA_API_KEY` — **strongly recommended.** Without it, Fishing/Gardening skill
  levels come back **0** (Origins exposes none; Bobba is the only source) and the
  motto fallback returns empty when Origins-direct is unreachable. Get it from
  bobba.me → API. Set it:
  `supabase secrets set BOBBA_API_KEY=<key>` (or Dashboard → Edge Functions → Secrets).
- `ORIGINS_API_BASE` — optional override; defaults to
  `https://origins.habbo.com/api/public`. Leave unset unless you need to repoint it.

No other function needs any secret. `save-room-layout`, `presence-*`, all `party-*`
and all `trade-*` rely solely on the auto-injected trio.

### After deploy: seed the admin role

Room editing (`save-room-layout`) is gated on `has_role(auth.uid(),'admin')`. The
admin Habbo is **`throney`** (`ADMIN_NAMES` in `js/config.js`). That person must
**sign in once** (email OTP) so their `auth.users` row exists, then:
```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = '<admin email>'
on conflict do nothing;
```

### If pg_cron didn't schedule the reaper (from §2a)

Add a schedule that invokes the `presence-reap` function every ~15s (Dashboard →
Database → Cron, or a Scheduled Function). Without it, players who close the tab
linger as ghosts in the roster until their row ages out on the next write.

---

## 3a. The four `duel-*` functions

Added after the original 19. All four are declared in `config.toml` with
`verify_jwt = true`, which is both correct and the platform default: each one
calls `requireUser()` and returns its own `401 {ok:false, reason:"sign in
first"}`, so an anonymous caller is refused by the function rather than by the
gateway.

| # | Function | verify_jwt | Notes |
|---|---|---|---|
| 20 | `duel-challenge` | true | throw the gauntlet; validates same-room + both-free |
| 21 | `duel-accept` | true | re-validates, then stamps the ONE `starts_at` anchor |
| 22 | `duel-decline` | true | |
| 23 | `duel-cancel` | true | either side, any time before combat |

They need the `duels` table (`20260726120000_duels.sql`) — deploy the functions
**after** that migration, or every call fails on a missing relation.

---

## 4. Point the client at your Lovable project

`js/supabase.js` resolves the URL + anon key in this order: `window.HD_SUPABASE_URL`
/ `window.HD_SUPABASE_ANON_KEY` → `<meta>` tags → **baked placeholder default**
(`https://lxtbevayelblobqpqtku.supabase.co`). **You must override the placeholder**
or the client talks to the wrong project.

Easiest, no build step — add to `index.html` `<head>`, **before**
`<script type="module" src="js/main.js">`:

```html
<meta name="hd-supabase-url" content="https://<your-ref>.supabase.co" />
<meta name="hd-supabase-anon-key" content="<your-anon-public-key>" />
```

Use the project's **anon/public** key (safe to ship — RLS enforces access), never
the service-role key. Redeploy the static site.

Confirm in the browser console on the live Lovable URL:
```js
// should print YOUR ref, not lxtbevayelblobqpqtku
document.querySelector('meta[name="hd-supabase-url"]').content
```
and that the Network tab shows calls going to `https://<your-ref>.functions.supabase.co`.

---

## 5. What is still undeployed — and who can deploy it

Measured against the live project on 2026-07-26, with the anon key from `.env`.
Every claim below is a recorded HTTP response, not an assumption.

### The gap

| Item | Live state | Probe |
| --- | --- | --- |
| `20260726000000_add_class_id_to_profiles.sql` | **not applied** | `profiles?select=class_id` → `42703 column profiles.class_id does not exist` |
| `20260726120000_duels.sql` | **not applied** | `duels?select=id` → `PGRST205 Could not find the table 'public.duels'` |
| `20260726180000_profiles_unique_habbo_username.sql` | **partly applied** | the unique index EXISTS (a live e2e run hit `duplicate key ... profiles_habbo_username_lower_key`), so it was pasted by hand at some point; whether the whole file ran is unconfirmed — re-run it, it is idempotent |
| `duel-challenge/accept/decline/cancel` | **not deployed** | `POST` → **404** |

**404 vs 401 is the discriminator.** A deployed-but-auth-gated function answers
**401** (`party-invite`, `stash-bank` both do). **404** means the function is not
there at all. Do not read a 401 as "missing".

### Which deploy path works from a dev machine

Docker is **not** the blocker, and `supabase start` is not needed — nothing here
requires a local stack. Both remote paths are Docker-free:

- `supabase functions deploy <name> --project-ref <ref> --use-api` — `--use-api`
  bundles server-side, so no Docker daemon. **Needs a personal access token.**
- `supabase db push --db-url <postgres connection string>` — talks straight to
  the remote database, no Docker and no access token. **Needs the database
  password.**

**Neither credential exists in this repo or on this machine.** `.env` holds only
`VITE_SUPABASE_PUBLISHABLE_KEY`, whose JWT decodes to `"role":"anon"` — enough to
read through RLS and call functions, and nothing else. There is no
`SUPABASE_ACCESS_TOKEN` in the environment and no CLI login on disk
(`~/.supabase` holds only `telemetry.json`). Confirmed:

```
$ npx supabase functions deploy duel-challenge --project-ref <ref> --use-api
Access token not provided. Supply an access token by running `supabase login`
or setting the SUPABASE_ACCESS_TOKEN environment variable.
```

That error arrives **before** any Docker check, which is the proof that
credentials are the blocker and Docker is a red herring.

### So a human has to do one of these

**Option 1 — Lovable chat (no credentials needed, confirmed to work).** Push
first, then ask Lovable's chat to deploy the functions. A deploy request ships
what is in the Lovable project *at that moment*, not what is in your worktree.
This route is established: a previous `party-invite` deploy requested this way
landed and turned a red e2e assertion green.

**Option 2 — SQL editor + CLI, for whoever holds the credentials.**

1. **Migrations — Dashboard → SQL Editor.** Paste each file whole and run, in
   this order (all three are idempotent; a second run is a no-op):
   1. `20260726000000_add_class_id_to_profiles.sql` (`add column if not exists`)
   2. `20260726120000_duels.sql` (`create table if not exists`, policy guarded
      with `exception when duplicate_object`, publication guarded)
   3. `20260726180000_profiles_unique_habbo_username.sql` (reads `class_id`
      through `to_jsonb(row)` precisely so it survives being run before #1)

   Or, with the database password: `supabase db push --db-url <conn string>`.

2. **Functions — with an access token from Dashboard → Account → Access Tokens:**
   ```bash
   export SUPABASE_ACCESS_TOKEN=sbp_...
   npx supabase functions deploy duel-challenge duel-accept duel-decline duel-cancel \
     --project-ref cswyarorrvzbunodiftf --use-api
   ```
   **Name the four functions explicitly.** A bare `functions deploy` deploys
   *every* function in the directory, re-rolling all 19 working ones for no
   reason. Never pass `--prune`.

3. **Re-assert the public gates.** §3 warns that a deploy can reset `verify_jwt`
   to `true`; that would break guest linking and avatar rendering. The five
   functions that must stay `false` are `verify-habbo-link`, `sync-habbo-skills`,
   `fetch-habbo-profile`, `habbo-imaging`, `presence-reap`. Check them with the
   probe in the next section — it needs no credentials.

### Verify the deploy landed (anon key only, no credentials)

```bash
URL=$(grep VITE_SUPABASE_URL .env | sed 's/.*=//' | tr -d '"\r')
KEY=$(grep PUBLISHABLE .env | sed 's/.*=//' | tr -d '"\r')

# schema: both must return data/[] rather than an error code
curl -s "$URL/rest/v1/profiles?select=class_id&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
curl -s "$URL/rest/v1/duels?select=id&limit=1"          -H "apikey: $KEY" -H "Authorization: Bearer $KEY"

# functions: 401 = deployed and gated (GOOD). 404 = still missing.
for f in duel-challenge duel-accept duel-decline duel-cancel; do
  echo "$f -> $(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/functions/v1/$f" \
    -H "apikey: $KEY" -H "content-type: application/json" -d '{}')"
done

# §3 gates: these five must NOT answer 401 with no Authorization header
for f in verify-habbo-link sync-habbo-skills fetch-habbo-profile habbo-imaging presence-reap; do
  echo "$f -> $(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/functions/v1/$f" \
    -H "apikey: $KEY" -H "content-type: application/json" -d '{}')"
done
```

The `duels` RLS is SELECT-only for participants by design (writes go through the
service role inside the `duel-*` functions). Once the table exists, confirm both
halves in the SQL editor:

```sql
select policyname, cmd from pg_policies
where schemaname='public' and tablename='duels';
-- expect exactly one row: "duels party read" / SELECT. Any INSERT/UPDATE/DELETE
-- policy here is a hole: it would let a client put itself in a duel, skip the
-- countdown, or restart it by writing the table directly.
```

Then `npm run test:e2e`. `classIdCloudSync.e2e.mjs` is the canary for migration
#1 and fails **only** on this gap.

---

## POST-DEPLOY VERIFICATION — do this in order, top to bottom

**Nothing below is proven until you run it against the live project.** Each step
gates the next: if identity fails, presence can't work; if presence fails, trade
and parties can't. Stop at the first failure and fix it before continuing.

You need: **two different Habbo: Origins accounts**, **two browsers/profiles**
(so two independent Supabase sessions), and the ability to set an Origins motto.

### Step A — Identity link (one browser)
1. On the live site, open the account/login flow and sign in with email OTP.
2. Enter your Habbo name; set the shown one-time code in your Origins **motto**;
   verify.
3. **Look for:** verify returns `ok:true` and your real avatar/figure renders.
   Then check the DB:
   ```sql
   select habbo_username, habbo_verified_at, fishing_level, gardening_level
   from public.profiles where habbo_username ilike '<your name>';
   ```
   `habbo_verified_at` set = link works; non-zero skill levels = Bobba key works.
4. **Most likely failure:** verify returns a reason string.
   - "Code not found in the motto yet" → motto not saved/propagated; wait, re-fetch.
   - Network/blank + skills always 0 → `BOBBA_API_KEY` missing/invalid (§3), or
     the function got redeployed as `verify_jwt=true` (guests/anon blocked).

### Step B — Presence in a room (both browsers)
1. Both accounts sign in and enter the **same Free Roam room**.
2. **Look for:** each browser sees the *other* player's avatar appear, and when one
   walks, the other sees it move within ~1s. Check the row exists:
   ```sql
   select name, room_id, x, y, last_seen from public.room_presence;
   ```
3. **Most likely failure:** you see yourself but never the other player.
   - Realtime not enabled, or the `supabase_realtime` publication is missing
     `room_presence` (§2, publication check).
   - Both browsers reusing the **same** session (must be separate accounts/profiles;
     the hub keys presence by user id and the newer login evicts the older).
   - Note: this step uses the **public** `room:` channel, so it works even if the
     private-topic RLS (§2b) is broken. **If presence works but Steps C/D don't,
     suspect §2b first.**

### Step C — Two-client trade (both browsers, same room)
1. Both players must have at least one bankable item (finish a short run so
   `stash-bank` populates `inventory`, or verify `select * from inventory`).
2. Player 1 taps Player 2 → **Trade**; Player 2 accepts the ask. Both add an item,
   both tick **agree**, then both **Confirm**.
3. **Look for, in order:** the ask prompt reaches Player 2; the trade window opens
   on both; an item added by one side appears on the other side within ~1s; ticking
   agree on one side shows as "agrees" on the other; after both confirm, both see
   "Trade completed!" and the items have **swapped owners**:
   ```sql
   select user_id, item_id from public.inventory order by user_id;   -- ownership flipped
   select status from public.trades order by created_at desc limit 1; -- 'done'
   ```
4. **Most likely failure:** the ask never arrives, or offers never show on the
   other side, or "agree" never reflects across → **the private-topic Realtime RLS
   is missing (§2b).** The `trade-*` functions write to `user:<uuid>` broadcast; if
   the read policy on `realtime.messages` doesn't exist, the partner's client is
   denied and sees nothing. Fix §2b, confirm Realtime Authorization is ON, retry.
   - If confirm errors with "trade failed, nothing was exchanged": the atomic
     `execute_trade` refused because an offered item no longer belonged to the
     offerer (double-spend guard working as intended) — re-open with items you own.

### Step D — Party + co-op battle (both browsers)
1. Player 1 taps Player 2 → **Invite to Party**; Player 2 accepts.
2. **Look for:** the invite prompt reaches Player 2; after accept, **both** see the
   party chip strip with both members and a ★ on the leader.
   ```sql
   select p.leader_id, m.name from public.party_members m
     join public.parties p on p.id=m.party_id;
   ```
3. Leader starts a **descent**; Player 2 gets the confirm prompt and accepts; play
   through one battle.
4. **Look for:** the descend prompt reaches the member; both clients enter the same
   battle; the leader's actions replay on the member's screen and vice-versa
   (co-op relay). Leaving/disbanding clears the strip on both.
5. **Most likely failure:**
   - Invite/party roster never updates on the other client → private `user:` topic
     RLS missing (§2b), same root cause as Step C.
   - Party forms but the **co-op battle desyncs or the member sees nothing** → the
     `party:<uuid>` private channel isn't authorized: check the `party:%` branch of
     the `realtime.messages` policies exists **and** that `public.in_party(...)` was
     created (it's a `SECURITY DEFINER` helper in the migration —
     `select public.in_party('<a party id>'::uuid, auth.uid());` should run without
     error). Co-op relay is leader-authoritative and rides that channel directly;
     no relay policy = a silent, empty battle for the member.

---

### Reminder
If any step above did not pass exactly as described, **multiplayer is still
untested/broken** for that feature. Solo-local play does not depend on any of this
and will keep working regardless.
