# Working in this repo (six parallel agents)

Six GG Coder terminals share one git object store through **git worktrees**. One
worktree per in-flight feature, one branch per worktree, **one agent per
worktree**. This exists because a single shared working tree produced duplicated
commits (two agents authoring patch-identical work), diverged history, and
analyses that were wrong by the time they were written because the tree moved
underneath them.

## Layout

| Worktree | Branch | Dev port | `HD_PORT_BASE` | e2e slug |
| --- | --- | --- | --- | --- |
| `C:\Users\codyj\Desktop\Habbo Dungeons\` (**hub**) | `lovable-main` | 5170 | 8600 | `hb` |
| `C:\Users\codyj\hd-trees\duel\` | `feat/duel` | 5171 | 8700 | `dl` |
| `C:\Users\codyj\hd-trees\party-invite\` | `fix/party-invite-delivery` | 5172 | 8800 | `pi` |
| `C:\Users\codyj\hd-trees\profiles-unique\` | `fix/profiles-unique-username` | 5173 | 8900 | `pu` |
| `C:\Users\codyj\hd-trees\test-infra\` | `chore/test-harness` | 5174 | 9000 | `ti` |
| `C:\Users\codyj\hd-trees\combat\` | `feat/class-weapons` | 5175 | 9100 | `cb` |

`hd-trees\` lives at `C:\Users\codyj\hd-trees\` — **outside the repo folder**,
not inside it. It used to sit next to the repo on the Desktop; it was moved up to
the user profile with `git worktree move` (never a filesystem move, which leaves
every `.git` pointer dangling in both directions). The exact parent does not
matter and neither does the sibling relationship — what matters is that it is not
*under* `Habbo Dungeons\`, because a nested worktree would show up in
`git status`, in Vite's watcher, and in the test runner's `readdirSync`
discovery.

**Never rename a leaf directory.** `duel`, `party-invite`, `profiles-unique`,
`test-infra` and `combat` are load-bearing names: `tests/e2e/lib.mjs` derives the
e2e slug from the worktree directory name (`WORKTREES[DIR]`, where `DIR` is the
last path segment), and `PORT_BASES` keys off that slug in turn. A renamed leaf
misses the lookup and falls through to the default `hb` — the HUB's slug — so the
worktree silently seeds the hub's player names and binds the hub's ports instead
of failing. Moving the tree elsewhere is free; renaming its last segment is not.
Use `HD_SLUG` / `HD_PORT_BASE` if a directory name ever genuinely has to change.

## Rules

1. **The hub is integration-only.** `fetch`, `merge --ff-only`, `push`, and
   resolving divergence. No agent edits files there. This is the single rule that
   prevents duplicate commits — two agents cannot author the same change if
   neither holds the file the other is editing.
2. **Stay in your worktree.** Never `cd` into another agent's worktree to "just
   check something"; read it through git (`git show <branch>:<path>`) instead.
3. **Never `git add -A`** unless you have personally verified every path it would
   stage. Untracked feature work from an unfinished branch has been swept into
   commits this way before.
4. **Rebase onto `lovable-main` from your own worktree**, never from the hub.
5. Branches conflict in `js/supabaseNet.js`, `js/main.js` and `README.md` when
   they merge back. Expected and cheap — far cheaper than shared-tree
   contamination.

## Install

`bun` is the package manager (`packageManager` is pinned in `package.json`).
`node_modules` is gitignored, so every worktree installs its own.

- Do **not** run the first `bun install` in six terminals at once. Stagger them;
  after the first, the global cache at `%LOCALAPPDATA%\bun\install\cache` makes
  the rest fast.
- `embedded-postgres` (108 MB of native Postgres binaries) is declared **only**
  on `feat/duel`, so only that worktree pays for it. It needs a postinstall
  script, which bun blocks by default — `trustedDependencies` in that branch's
  `package.json` allows it. Without it the binaries never hydrate and the duel
  e2e fails with a bare `undefined`.
- Playwright browsers are **machine-global** (`%LOCALAPPDATA%\ms-playwright`,
  resolved by `findChromium()`). Do not "fix" this into a per-worktree path.
- PostgREST lives in `.gg/bin/` which is gitignored, so it does not travel to a
  new worktree. `feat/duel` re-runs `npm run test:e2e:setup` once.

## Tests

Unit suites are pure — run them freely, in parallel, any time.

**The e2e suites are not.** They drive real browsers against the **live** shared
Supabase project, so `tests/run-suites.mjs` takes a **machine-wide lock** for the
whole e2e run. A second worktree's run waits and prints who holds it. A lock
whose owning pid is gone is reclaimed automatically — never delete a lock
directory by hand, because an agent that has learned to delete locks will
eventually delete a live one.

Three things are namespaced per worktree, all derived from the worktree
**directory name** (see `tests/e2e/lib.mjs`) so nothing has to be exported by
hand:

- **Player names** — `e2eName('InvA')` → `pi-InvA`. Mandatory, not tidiness:
  `profiles.habbo_username` now has a unique index on `lower(btrim(...))`, so two
  worktrees seeding the same name is a hard `23505`. Before that index it was
  silent corruption — four rows once claimed `InvA`/`InvB`, and because
  `userByName()` resolves with `.ilike().maybeSingle()` (which *errors* on
  multiple matches rather than picking one), **both** accounts became permanently
  uninvitable while the API reported `"no such player"`.
  Hyphen, never underscore: `_` is a single-character wildcard in `ILIKE`.
- **Ports** — `portFor(offset)`, fixed per worktree, deliberately **not**
  OS-assigned. `partyInviteError` reuses persistent browser profiles, and
  localStorage is scoped to origin *including port*; a shifting port silently
  yields a fresh unauthenticated session every run.
- **Browser profiles** — `tests/e2e/.profiles/` resolves relative to the suite
  file, so each worktree gets its own. Gitignored: they contain live Supabase
  refresh tokens.

### Anonymous sign-ins are a shared, exhaustible quota

Supabase allows **30 anonymous sign-ins per hour per IP** — a token bucket
refilling one token every two minutes — and all six worktrees share one IP and
one project. Namespacing does **not** help here; only the lock and restraint do.

Only `partyInviteError` reuses its session. Every other Supabase-backed suite
calls `browser.newContext()` and mints ~2 fresh anon users **per run**, and
`js/supabaseNet.js` signs in anonymously on any page without a session. A full
six-worktree e2e pass can therefore exceed the refill rate.

**Recognising exhaustion**, because it has two very different faces:

- In `seedProfile` it is explicit: `profile seed failed: no supabase session
  (Request rate limit reached)`.
- **Everywhere else it is silent.** `js/supabaseNet.js` catches the failure,
  warns into the *page* console (`anonymous sign-in failed — multiplayer off`),
  and degrades to offline. The suite then times out waiting for presence or a
  roster and reports something like `A sees B in the room → FAIL`, which is
  indistinguishable from a broken feature.

**Rule: any e2e presence/roster timeout → grep the captured page logs for
`anonymous sign-in failed` before touching feature code.**

## Git does not deploy the backend

**Pushing `supabase/functions/` updates the files in the Lovable project. It does
NOT redeploy the running runtime.** Pushing `supabase/migrations/` never applies
anything at all. Both need a manual trigger, and until you pull one the server
keeps executing whatever it executed before, while git shows your fix as landed.

This is not a suspicion. Both halves were established the hard way:

- **Migrations.** `profiles.class_id` was declared in git for over a day and the
  live database still answered `42703: column does not exist`. The
  `habbo_username` unique index sat unapplied until it was pasted into the SQL
  editor by hand. Of 58 files in `supabase/migrations/`, only three govern the
  live schema — the rest are superseded by the V2 reset, which opens with
  `drop table … cascade`.
- **Functions.** A `deployedAt` marker was added to `party-invite`'s success
  response and pushed to both branches. Ten minutes later the live function was
  still returning a bare `{ ok: true }`. Meanwhile `gpt-engineer-app[bot]`
  reacted to that same push within two minutes by regenerating `bun.lock` on
  `main` — so the integration is watching, and `main` is the branch it watches.
  It leaves the backend alone. It rebuilds the frontend for the *Lovable*
  project only — see the frontend gap below, which is a separate hole.

**To actually deploy:**

- **Functions** — ask in Lovable chat, or `supabase functions deploy <name>`
  (needs a personal access token; `.env` holds only the publishable anon key, so
  the CLI cannot deploy with what is in the repo). Never run a bare
  `supabase functions deploy` with no name: it deploys *every* function,
  including unfinished ones belonging to other worktrees.

  The Lovable-chat route is **confirmed working**: after a deploy was requested
  there, `private:true` began delivering (`partyInviteError` went green on the
  assertion it had never once reached) and `userByName`'s new throw appeared as
  a live HTTP 500. So the gap is only the AUTOMATIC trigger — asking explicitly
  does deploy. Push first, then ask, then verify: a deploy request ships what is
  in the Lovable project at that moment, not what is in your worktree.
- **Migrations** — paste the file into the Supabase SQL editor. Write them
  idempotently (`if not exists`, `exception when duplicate_object`) so a second
  application is a no-op, and never assume an earlier migration in the directory
  has run — read a questionable column through `to_jsonb(row)` rather than naming
  it, or a missing column aborts the whole file at parse time.

### …and it does not republish the frontend either

**Pushing to `main` updates the Lovable project and its `*.lovable.app` preview
host. It does NOT republish habbodungeons.com.** The custom domain serves
whatever bundle was last *published* — a separate, manual action — so the
reaction you can observe on a push (Lovable ingesting the commit) is not the
one that reaches players.

Measured on `de579d5` (the `:npc` save fix):

| Time | What happened |
| --- | --- |
| 02:29:37Z | pushed to `main` |
| 02:30:26Z | Lovable regenerated the `og:image` at `id-preview-de579d5e…` — the NEW sha |
| 02:38:32Z | habbodungeons.com still served `/assets/index-B79oKSXq.js` — the OLD bundle |

So the integration had ingested the commit within 49 seconds and *still* had
not put it in front of a user nine minutes later. Anything inferred from
"the push was picked up" is worthless: publish is what ships.

**Verifying it landed: the entry-chunk hash.** Vite content-hashes the entry
chunk, so `/assets/index-<hash>.js` in the served HTML changes whenever *any*
module in the graph changes. That makes it a free, zero-instrumentation version
marker — no `DEPLOY_MARKER` field needed:

```bash
curl -s https://habbodungeons.com/ | grep -o 'src="/assets/[^"]*"'
```

Same hash as before your push → **hard proof the deploy did not land**, and
every client-side fix in it is untested. Different hash → the bundle is new.
Do not read the `og:image` sha, the preview host, or a green push as evidence:
all three moved for `de579d5` while the live bundle did not.

**To actually publish:** ask in Lovable (the Publish button / chat), the same
way functions are deployed. Push first, then ask, then re-check the hash.
### Verifying a deploy landed: the version marker

Do not infer a deploy from the absence of an error. Temporarily add a field to a
response that no previously deployed build could return, push, wait, then call
the live function and look for it:

```ts
const DEPLOY_MARKER = "2026-07-26-ab12cd";   // date + random suffix
return json({ ok: true, deployedAt: DEPLOY_MARKER });
```

Present → the pipeline reached the server. Absent → it is running old code and
every fix to that function is untested. Revert the marker once it has answered;
a diagnostic has no business in an API response.

The trick generalises: to tell whether *any* server-side change is live, find an
input whose OLD and NEW behaviour differ unmistakably. Comparing error *wording*
usually fails — `userByName`'s "no such player" is byte-identical before and
after its error-handling fix, because on a genuine miss both versions see
`error: null` and return `null`. What discriminates is an input that forces the
query to error: `.ilike()` treats `%` as a wildcard, so the name `pi-Inv%`
matches two rows, `maybeSingle()` raises PGRST116, and old code answers HTTP 200
`"no such player"` where new code throws HTTP 500.

**Two traps when probing from a browser:**

- An unhandled 500 never passes through `_shared/cors.ts`, so it carries no
  `Access-Control-Allow-Origin` and a page `fetch` dies as an opaque
  `TypeError: Failed to fetch`. Call the function from Node instead — no CORS —
  or you will misread a live throw as a network fault.
- The Realtime broadcast endpoint returns **202 even when RLS silently discards
  the write** (confirmed: a client POST to its own `user:` topic returns 202 and
  delivers nothing, because the write policy admits only `room:%` and `party:%`).
  `realtime.ts`'s `if (!res.ok)` therefore cannot fire for an RLS drop, so the
  absence of a `[broadcast] … FAILED` line in the logs is **not** evidence that a
  broadcast succeeded.

## File ownership

### 1. Push every coherent chunk immediately, even unfinished

The moment a change stands on its own, commit it on your branch and **push**.
Not when it is polished, not when the feature is done — immediately. Unpushed
work is invisible to the other five agents, and invisible work gets done twice.
A branch on `origin` is also the only thing that stops another agent rewriting
your commits; a local-only branch has no claim on anything.

This is not a style preference. It is the direct cause of the two worst messes
in this repo's short history:

- **`410e469` duplicated `b90774a`.** Two agents wrote the same AGENTS.md
  deploy-gap section, byte for byte, because the first sat unpushed in the hub
  while the second was written from scratch. Same patch-id
  (`9cb07503d4efd4ec`), different parents. The rebase that reconciled them
  printed `skipped previously applied commit 410e469` — git discarded work
  somebody had actually done, and that was the *good* outcome.
- **`tests/run-suites.mjs` was created twice**, on two branches, each with a
  feature the other lacked: quarantine mode on one, the machine-wide e2e lock on
  the other. Neither agent could see the other's file. Merging them by hand
  afterwards was strictly harder than either original, and a naive "pick a side"
  resolution would have silently deleted a working capability.

Both had one cause: work that existed only on somebody's disk. Push early and a
collision surfaces as a merge conflict in seconds instead of a duplicated
afternoon.

### 2. Before creating a new file, check whether a branch already creates it

`git status` cannot see another worktree. Fetch and ask:

```bash
git fetch origin
git for-each-ref --format='%(refname)' refs/remotes/origin |
  while read b; do
    git ls-tree -r --name-only "$b" | grep -qx 'tests/run-suites.mjs' && echo "$b"
  done
```

If a branch already owns the path, **do not create a second version**. Either
base your work on that branch or hand the change to it — a second file at the
same path is a merge conflict with a capability loss hiding inside it.

### Who owns which shared file

One branch owns each shared path. Send changes to the owner; do not fork it.

| Path | Owner branch |
| --- | --- |
| `tests/run-suites.mjs` | **`chore/test-harness`** |
| `tests/e2e/lib.mjs`, `tests/e2e/*.e2e.mjs` ports/slugs | `chore/test-harness` |
| `tests/quarantine/**`, recovered `tests/*.test.js` | `chore/recover-test-suites` |
| `js/consumableEffects.js`, `js/items.js`, `js/units.js` | `feat/buff-consumable` |
| `js/duelWindow.js`, `js/duelCountdown.js`, `supabase/functions/duel-*`, `_shared/duel*.ts` | `feat/duel` |
| `js/party.js`, `js/supabaseNet.js` send/error paths | `fix/party-invite-delivery` (merged) |
| `*_profiles_unique_habbo_username.sql`, `_shared/party.ts` | `fix/profiles-unique-username` |
| `js/classWeapons.js` | `feat/class-weapons` |
| `AGENTS.md`, `README.md` | no single owner — **fetch and rebase before editing** |

`AGENTS.md` and `README.md` are the two files every agent wants to touch, which
is exactly why `410e469` happened. Rebase onto `origin/main` first, every time.

Beware false clashes: `chore/recover-test-suites` is **stacked on**
`feat/buff-consumable` (it has that commit as an ancestor), so a path like
`tests/buffInspire.test.js` showing up on both is inherited, not duplicated.
Check with `git merge-base --is-ancestor A B` before assuming a conflict.