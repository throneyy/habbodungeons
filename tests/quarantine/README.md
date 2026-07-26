# Quarantined test suites

These four suites are **recovered code that does not pass**. They run via
`npm run test:quarantine`, which reports failures but **always exits 0**, so a
suite in here can never block a commit or a green `npm test`.

Nothing in this directory is wired into `npm test`. `tests/run-suites.mjs`
enumerates only the files directly inside `tests/`, so a subdirectory is
excluded automatically.

## Where they came from

This repository has two unrelated histories. The current one is rooted at
`240ae44` ("Initial commit from template vite_react_shadcn_ts"); the original
vanilla project was rooted at `e246ef3` ("Baseline: initial commit of Habbo
Dungeons project"). `git merge-base` reports **no common ancestor**.

The README's Tests section was copied from the vanilla project by `0c4977f`
("Changes", a 1,861-file Lovable import) at a point when `tests/` did not exist
in this tree at all — so it documented five suites that had never been here.
`git log --all --full-history -- tests/pathfinder.test.js` returns zero commits.

The vanilla suites survived only as **unreachable stash objects** (`c4000eb`,
`284ba17` — "WIP on main", 25 Jul 03:15), recoverable but referenced by no
branch, and would have been destroyed by the next `git gc`. All eight were
recovered from `c4000eb`. Four passed clean and now live in `tests/`; these four
did not.

They were recovered verbatim apart from the depth fix the move required:
`'../js/…'` became `'../../js/…'`, and the two computed
`ROOT = dirname(import.meta.url) + '..'` constants gained a second `'..'`. No
assertion was altered — a quarantined suite is only worth keeping if it still
says what it originally said.

## Why each one is quarantined

### `battle.test.js` — 34 pass, 1 stale assertion
`ranger cannot hit adjacent (min range 2)` contradicts shipped behaviour.
Commit `9d6f0e4` deliberately gave the ranger a close-range dagger to plug the
range-1 dead zone, and shipped `tests/rangerCloseRange.test.js` as the
replacement coverage. **The assertion is wrong, not the code.**

*To promote:* delete that one assertion (its intent now lives in
`rangerCloseRange.test.js`) and move the file into `tests/`. This is the closest
of the four to being green.

### `gimmicks.test.js` — 43 pass, 1 failure
`kit floor art exists in the props library` reads
`assets/props/<id>/data.json`. This repo keeps prop art at
**`public/assets/props/`** (Vite serves `public/` at the URL root). The vanilla
project had it at `assets/`.

*To promote:* point the prop reads at `public/assets/props/` and confirm every
id the kits reference is present.

### `realms.test.js` — cannot start
Same path mismatch, but fatal at import time: it reads
`assets/props/index.json` while building its module-level fixtures, so it dies
before the first assertion.

*To promote:* same path fix as `gimmicks`.

### `sprites.test.js` — cannot start
Imports `tools/lib/pet.js`, `tools/lib/extract.js` and `tools/lib/wiki.js`.
**`tools/lib/` was never ported into this history** — the modules do not exist
in any reachable commit.

*To promote:* port `tools/lib/` from the vanilla baseline (also recoverable from
`c4000eb`), or rewrite the suite against the extraction helpers this repo
actually has.

## Promoting a suite

1. `node tests/quarantine/<name>.test.js` until it exits 0.
2. Move it to `tests/`, and undo the depth fix: `'../../js/…'` back to
   `'../js/…'`, and drop the extra `'..'` from any computed `ROOT`.
3. `npm test` — it is now blocking.
4. Update the README Tests block with its real check count, and delete its
   section here.
