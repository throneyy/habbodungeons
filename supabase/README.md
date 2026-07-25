# Habbo Dungeons — Supabase backend (V2 migration)

Everything the old Node process did (`server.js`, `server/*.js`, `/api/*`, `/ws`)
is re-homed here: **Postgres + RLS** (state), **Edge Functions** (authority), and
**Realtime** (sync). The V2 client ships unchanged as static files; only its
network layer was rewired (`js/backend.js` selects the backend by host).

The client runs two ways from the same source tree:

| Host | Backend | Auth | Multiplayer |
|---|---|---|---|
| `localhost` (Node dev) | `server.js` `/api/*` + `/ws` | HMAC token | ws presence hub |
| Lovable / `habbodungeons.com` | Supabase Edge Functions | Supabase JWT | Realtime + edge fns |

Force a mode for testing: `?backend=supabase` or `?backend=local` (also
`localStorage['hd-backend']`).

---

## What's here

```
supabase/
  config.toml                  # project + per-function verify_jwt config
  migrations/…_v2_backend.sql  # all tables, RLS, helpers, atomic trade swap, realtime authz
  functions/
    _shared/                   # cors, client, habbo profile fetch, party/trade/realtime helpers
    verify-habbo-link/  sync-habbo-skills/  fetch-habbo-profile/  habbo-imaging/
    stash-bank/  save-room-layout/  presence-heartbeat/  presence-reap/
    party-invite/ party-accept/ party-decline/ party-leave/ party-disband/
    trade-open/ trade-offer/ trade-retract/ trade-accept/ trade-confirm/ trade-cancel/
```

All 22 functions type-check with `deno check` (Deno 2.x).

---

## Deploy runbook (maps to the plan's 13 steps)

Steps 1–2 and every "Verify" gate that needs two live browsers / a real Habbo
account are **human actions** — they require Lovable + Supabase project access
this repo can't perform. The code artifacts for every step are complete.

1. **Lovable ↔ GitHub + static deploy** *(human, Lovable UI)*. Connect the repo;
   serve the root as static (`index.html`, `css/`, `js/`, `assets/`) — **no Vite
   build**. Verify the canvas title screen loads and solo-local play works.
2. **Point the client at the project.** Inject the project URL + anon key without
   a build step (see below). Verify the browser console shows an initialized
   client and a trivial `select` on `room_layouts` succeeds.
3. **Apply the schema + deploy functions** *(Supabase CLI)*:
   ```sh
   supabase link --project-ref <ref>
   supabase db push                     # runs migrations/…_v2_backend.sql
   supabase functions deploy            # all functions
   supabase secrets set BOBBA_API_KEY=…    # optional: skill levels + motto fallback
   # ORIGINS_API_BASE defaults to https://origins.habbo.com/api/public
   ```
4. **Seed the admin role** for whoever authors rooms (the `throney` account,
   `ADMIN_NAMES` in `js/config.js`). After that user has signed in once:
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = '<admin email>'
   on conflict do nothing;
   ```
5. **Schedule the presence reaper.** The migration tries `pg_cron` automatically;
   if unavailable, add a Dashboard cron (every ~15s) invoking `presence-reap`,
   or a Scheduled Function.
6. Steps 3–13 of the plan (identity → profiles → stash → layouts → presence →
   movement/chat → parties → co-op → trade) are already wired client-side; verify
   each against the live project per the plan's gates.

### Injecting the project URL + anon key (no build step)

`js/supabase.js` reads, in order: `window.HD_SUPABASE_URL` /
`window.HD_SUPABASE_ANON_KEY` → `<meta name="hd-supabase-url">` /
`<meta name="hd-supabase-anon-key">` → baked defaults. Easiest for Lovable —
add to `index.html` `<head>` before the module script:

```html
<meta name="hd-supabase-url" content="https://<ref>.supabase.co" />
<meta name="hd-supabase-anon-key" content="<anon-key>" />
```

---

## Downgraded guarantees (Step 12 checklist — review before cutover)

Moving from one long-lived authoritative process to stateless functions + RLS
trades some anti-cheat guarantees. These are **intentional** for a co-op PvE fan
game; combat authority (which matters) still runs in edge functions.

- [ ] **Movement is client-trusted (path A).** `moved` frames ride `room:<id>`
      broadcast with **no server validation**. The room model is advisory per
      client. Cheat surface: teleport / walk-through-walls / spoof your own
      position. Accepted because movement grants no combat advantage. (Path B —
      `submit-move` validated via a shared `buildRooms()` port — was rejected as
      ~1s-laggy and unplayable.)
- [ ] **No session kick.** The ws hub could disconnect a live abuser. Stateless
      functions can't. Mitigated by `rate_limits` per invocation + RLS.
- [ ] **No per-session frame caps / strike counter.** Replaced by
      `public.rate_limit_touch()` gates on each mutation function (stash-bank 2s,
      party-invite 1s, …) and RLS on `realtime.messages`.
- [ ] **~0.5–2s state latency** for party/trade sync (postgres_changes /
      broadcast) vs. the hub's instant RAM fanout. Ephemeral prompts
      (invited / trade-asked / …) use low-latency broadcast to compensate.
- [ ] **Identity is STRONGER:** the HMAC self-minted token is gone; every
      mutation authenticates with a real Supabase JWT and RLS keys on
      `auth.uid()`. Multiplayer is gated on a linked `habbo_username`.

Anti-scam trade invariants are **preserved**: any offer change resets both
accepts (`resetAccepts`), and the double-confirm swap is atomic
(`execute_trade` SECURITY DEFINER — both inventories move or neither does).
