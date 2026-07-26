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
| `Habbo Dungeons/` (**hub**) | `lovable-main` | 5170 | 8600 | `hb` |
| `hd-trees/duel/` | `feat/duel` | 5171 | 8700 | `dl` |
| `hd-trees/party-invite/` | `fix/party-invite-delivery` | 5172 | 8800 | `pi` |
| `hd-trees/profiles-unique/` | `fix/profiles-unique-username` | 5173 | 8900 | `pu` |
| `hd-trees/test-infra/` | `chore/test-harness` | 5174 | 9000 | `ti` |
| `hd-trees/combat/` | `feat/class-weapons` | 5175 | 9100 | `cb` |

`hd-trees/` is a **sibling** of the repo, not a child: a nested worktree would
show up in `git status`, in Vite's watcher, and in the test runner's
`readdirSync` discovery.

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
