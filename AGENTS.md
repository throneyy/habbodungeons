# Working in this repo (parallel agents on git worktrees)

Several GG Coder terminals share one git object store through **git worktrees**.
One worktree per in-flight feature, one branch per worktree, **one agent per
worktree**. This exists because a single shared working tree produced duplicated
commits (two agents authoring patch-identical work), diverged history, and
analyses that were wrong by the time they were written because the tree moved
underneath them.

The layout below is the *current* one. It has changed before (the trees used to
live at `C:\Users\codyj\hd-trees\`, and the hub used to be a
`Desktop\Habbo Dungeons\` checkout of `integrate/harness-and-duel`) and this
document went stale for long enough to make an agent refuse a legitimate edit.
**Verify with `git worktree list` before trusting the table**, and fix it here if
it disagrees.

## Layout

Everything lives under `C:\Users\codyj\Desktop\HabboDungeons\`:

| Worktree | Branch | `HD_PORT_BASE` | e2e slug |
| --- | --- | --- | --- |
| `HabboDungeons\hub\` (**hub**) | `main` (tracks `origin/main`) | 8600 | `hb` |
| `HabboDungeons\trees\duel\` | `feat/duel` | 8700 | `dl` |
| `HabboDungeons\trees\test-infra\` | `chore/test-harness` | 9000 | `ti` |

There is **no per-worktree dev port**. `vite.config.ts` hardcodes `port: 8080`
for every tree, so two dev servers at once collide; only the `HD_PORT_BASE` e2e
ports above are namespaced. (An earlier table listed dev ports 5170–5175; no such
configuration ever existed.)

The retired `party-invite` (`pi`/8800), `profiles-unique` (`pu`/8900) and
`combat` (`cb`/9100) worktrees are **gone, not lost**: `fix/party-invite-delivery`,
`fix/profiles-unique-username` and `feat/class-weapons` are all ancestors of
`origin/main`. Their slugs are still mapped in `tests/e2e/lib.mjs`, which is
harmless — reuse the same slug if one is ever re-created.

`trees\` sits **beside the hub, never inside a worktree**. It is under the
`HabboDungeons\` container folder, which is fine; what must not happen is a
worktree nested *within* another worktree's checkout (e.g. under `hub\`), because
it would then show up in `git status`, in Vite's watcher, and in the test
runner's `readdirSync` discovery. Relocate only with `git worktree move`, never a
filesystem move — that leaves every `.git` pointer dangling in both directions.

**Never rename a leaf directory.** `duel` and `test-infra` are load-bearing
names: `tests/e2e/lib.mjs` derives the e2e slug from the worktree directory name
(`WORKTREES[DIR]`, where `DIR` is the last path segment), and `PORT_BASES` keys
off that slug in turn. A renamed leaf misses the lookup and falls through to the
default `hb` — the HUB's slug — so the worktree silently seeds the hub's player
names and binds the hub's ports instead of failing. The hub's own directory,
`hub`, is not in `WORKTREES` and reaches `hb` through exactly that fallback,
which is correct for the hub and only the hub. Moving a tree elsewhere is free;
renaming its last segment is not. Use `HD_SLUG` / `HD_PORT_BASE` if a directory
name ever genuinely has to change.

## Rules

1. **The hub is `main`, and is no longer integration-only — but it is
   path-restricted.** It was integration-only when it held a throwaway
   `integrate/*` branch; it now checks out `main` tracking `origin/main`, so it
   is the natural home for work no side branch owns.

   - **Allowed in the hub:** docs (`AGENTS.md`, `README.md`), and any path not
     listed against a branch with a **live worktree** in *Who owns which shared
     file* below.
   - **Not allowed in the hub:** paths owned by `feat/duel` or
     `chore/test-harness`. Those trees exist and hold uncommitted or unmerged
     work; editing their files here is exactly the duplicate-authorship failure
     this rule was written for. Ownership entries whose worktree is retired and
     whose branch is merged into `main` no longer restrict anything.
   - **A hub commit lands on `main` the moment you push**, which is the branch
     `gpt-engineer-app[bot]` watches and the one Lovable ingests. Keep hub
     commits small, self-contained and green; anything speculative belongs on a
     branch.
2. **Stay in your worktree.** Never `cd` into another agent's worktree to "just
   check something"; read it through git (`git show <branch>:<path>`) instead.
3. **Never `git add -A`** unless you have personally verified every path it would
   stage. Untracked feature work from an unfinished branch has been swept into
   commits this way before.
4. **Rebase onto `origin/main` from your own worktree.** The hub has nothing to
   rebase — it *is* `main`, so it only ever fast-forwards (`git pull --ff-only`).
   If the hub ever cannot fast-forward, someone pushed to `main` behind you:
   stop and reconcile, do not force. `origin/main`, not `lovable-main` — see
   “The rebase target is `origin/main`” below for why those differ.
5. Branches conflict in `js/supabaseNet.js`, `js/main.js` and `README.md` when
   they merge back. Expected and cheap — far cheaper than shared-tree
   contamination.

### The rebase target is `origin/main`

**`origin/main` and `origin/lovable-main` are different commits and drift apart
constantly** — measured on 2026-07-26, `origin/main` was 37 commits ahead of
`origin/lovable-main`, which held 1 commit of its own. A local `main` is a third
thing again whenever it is behind its remote; the hub's was once 7 behind,
having sat untouched since a `fetch` earlier that day. "Rebase onto main" is
therefore an ambiguous instruction, and the doc used to give both answers: this
rule said `lovable-main`, the file-ownership section said `origin/main`.

`origin/main` wins, and not by preference — it strictly contains the other. Every
branch tip that is contained anywhere is contained in it, and the one commit
`origin/lovable-main` appeared to hold alone (`9a9e77f`, promoting
`battle.test.js` out of quarantine) turned out to be a **patch-id twin** of
`f9613a6`, already on `origin/main`: the same change authored twice on two
branches, which is precisely the duplication rule 1 exists to prevent. Nothing is
stranded by rebasing onto `origin/main`.

Always the **remote-tracking** ref, freshly fetched. A local `main` is a snapshot
of whenever you last fetched, and `main` is also the branch
`gpt-engineer-app[bot]` pushes to unbidden (it regenerates `bun.lock` there), so
a stale local copy is not merely behind — it can be behind commits you never
wrote. `git fetch origin` first, every time:

```bash
git fetch origin && git rebase origin/main
```

Verify a claim about ancestry rather than assuming it, and mind the argument
order — `git merge-base --is-ancestor A B` asks whether **A is an ancestor of B**,
which is the reverse of how "does my branch descend from main" reads out loud.

## Install

`bun` is the package manager (`packageManager` is pinned in `package.json`).
`node_modules` is gitignored, so every worktree installs its own.

- Do **not** run the first `bun install` in every terminal at once. Stagger them;
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
whole e2e run. Another worktree's run waits and prints who holds it. A lock
whose owning pid is gone is reclaimed automatically — never delete a lock
directory by hand, because an agent that has learned to delete locks will
eventually delete a live one.

Three things are namespaced per worktree, all derived from the worktree
**directory name** (see `tests/e2e/lib.mjs`) so nothing has to be exported by
hand. The dev server port is **not** among them — it is 8080 everywhere:

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
refilling one token every two minutes — and every worktree shares one IP and one
project. Namespacing does **not** help here; only the lock and restraint do.

Only `partyInviteError` reuses its session. Every other Supabase-backed suite
calls `browser.newContext()` and mints ~2 fresh anon users **per run**, and
`js/supabaseNet.js` signs in anonymously on any page without a session. A full
e2e pass across every worktree can therefore exceed the refill rate.

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
anything at all. Until something triggers a deploy the server keeps executing
whatever it executed before, while git shows your fix as landed.

Functions now have that trigger — a GitHub Actions workflow, described below —
so this section is history for them and current for migrations. Read it anyway:
the workflow is a fix for the mechanism, not for the assumption, and “I pushed
it, therefore it is running” is still wrong for the database, for the frontend,
and for functions on any branch that is not `main`.

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

- **Functions** — **automatic.** `.github/workflows/deploy-functions.yml`
  deploys them on every push to `main` that touches `supabase/functions/**` or
  `supabase/config.toml`. Push and watch the Actions tab; there is nothing to
  ask for. See “The functions deploy workflow” below for what it will not do.
- **Migrations** — paste the file into the Supabase SQL editor. Write them
  idempotently (`if not exists`, `exception when duplicate_object`) so a second
  application is a no-op, and never assume an earlier migration in the directory
  has run — read a questionable column through `to_jsonb(row)` rather than naming
  it, or a missing column aborts the whole file at parse time.

### The functions deploy workflow

`.github/workflows/deploy-functions.yml`, `supabase/setup-cli@v3` with the CLI
pinned to `2.110.0`. It needs exactly one repository secret,
**`SUPABASE_ACCESS_TOKEN`** (a `sbp_…` personal access token) — the project ref
is not a secret and sits in the workflow as plaintext, because it is already in
`supabase/config.toml` and in every client URL. `.env` still holds only the
publishable anon key, so a local CLI deploy remains impossible without that
token; the workflow is now the supported route.

**It deploys an explicit list of all 25 functions, never a wildcard.** A bare
`supabase functions deploy` ships *every* directory under `supabase/functions/`,
including unfinished work from another worktree and the untracked
`node_modules/` that sits there locally. The CLI takes a variadic name argument
and skips its directory discovery entirely when names are given, so the list is
a structural guarantee rather than a convention. **`--prune` must never be
added**: it deletes functions present in the project but not locally.

**Adding a function means editing three places** — the directory, its
`[functions.<name>]` block in `config.toml`, and `FUNCTIONS:` in the workflow. A
guard step diffs all three and fails the build naming the odd one out, because
an explicit list that silently rots is the same failure as no deploy at all.

What it does **not** cover:

- **Migrations.** Still the SQL editor, by hand. The workflow never touches the
  database, which is also why it needs no `SUPABASE_DB_PASSWORD`.
- **The frontend.** Still a manual publish — see the next section, which is
  unchanged.
- **Proving the new code is live.** A green run means the CLI exited 0, which is
  strictly more than the Lovable-chat route ever told you (it could not fail
  visibly at all). It is still not evidence that the behaviour changed: for
  that, use the version marker below.

The **Lovable-chat route still works** and remains the fallback if the workflow
is broken or the token is missing: after a deploy was requested there,
`private:true` began delivering (`partyInviteError` went green on an assertion
it had never once reached) and `userByName`'s new throw appeared as a live HTTP
500. Push first, then ask — a chat deploy ships what is in the Lovable project
at that moment, not what is in your worktree.

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

**To actually publish:** ask in Lovable (the Publish button / chat). Push first,
then ask, then re-check the hash. Functions no longer work this way — they
deploy themselves on push — so a green Actions run says nothing whatever about
whether the frontend reached a player.
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
**Ownership only binds while the owner has a live worktree** — once a branch is
merged into `origin/main` and its tree is gone, its paths are ordinary files
anyone (including the hub) may edit.

| Path | Owner branch | Live worktree? |
| --- | --- | --- |
| `js/duelWindow.js`, `js/duelCountdown.js`, `supabase/functions/duel-*`, `_shared/duel*.ts` | **`feat/duel`** | yes — `trees/duel` (1 ahead of main) |
| `tests/run-suites.mjs` | **`chore/test-harness`** | yes — `trees/test-infra` |
| `tests/e2e/lib.mjs`, `tests/e2e/*.e2e.mjs` ports/slugs | **`chore/test-harness`** | yes — `trees/test-infra` |
| `tests/quarantine/**`, recovered `tests/*.test.js` | `chore/recover-test-suites` | no — merged |
| `js/consumableEffects.js`, `js/items.js`, `js/units.js` | `feat/buff-consumable` | no — merged |
| `js/party.js`, `js/supabaseNet.js` send/error paths | `fix/party-invite-delivery` | no — merged |
| `*_profiles_unique_habbo_username.sql`, `_shared/party.ts` | `fix/profiles-unique-username` | no — merged |
| `js/classWeapons.js` | `feat/class-weapons` | no — merged |
| `AGENTS.md`, `README.md` | no single owner — **pull before editing** | — |

Confirm "merged" rather than trusting the column; it is a snapshot:

```bash
git fetch origin && git merge-base --is-ancestor origin/<branch> origin/main
```

`AGENTS.md` and `README.md` are the two files every agent wants to touch, which
is exactly why `410e469` happened. Sync with `origin/main` first, every time —
rebase from a side worktree, fast-forward in the hub.

Beware false clashes: `chore/recover-test-suites` is **stacked on**
`feat/buff-consumable` (it has that commit as an ancestor), so a path like
`tests/buffInspire.test.js` showing up on both is inherited, not duplicated.
Check with `git merge-base --is-ancestor A B` before assuming a conflict.