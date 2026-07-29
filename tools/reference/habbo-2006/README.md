# 2006 Habbo reference scrape

A local copy of the 2006 habbohotel.com chrome (box slices, navi tabs, top bar,
promo frames) pulled from the Wayback Machine, kept as a visual reference for
our own retro UI work.

**The art is Sulake's copyright and is never committed.** `.gitignore` tracks
only this README, the two scripts and the manifest; `assets/` and the scraped
`index.html` stay local. That split is deliberate — the scripts are our own
work and are what make the scrape reproducible.

## Status as of 29 Jul 2026

**41 of 129 referenced files present. 88 missing.** The scrape is incomplete and
the original run **failed silently**: the old `fetch-assets.sh` printed `FAIL`
lines and still exited 0, and nothing compared the tree against the stylesheets,
so the gap went unnoticed.

Gaps by directory:

| Directory | Missing | Referenced |
| --- | ---: | ---: |
| `boxes-v2/` | 24 | 42 |
| `boxes/` | 21 | 24 |
| `navi/` | 9 | 11 |
| `(root)` | 7 | 7 |
| `box-scale/` | 6 | 16 |
| `top_bar/` | 4 | 4 |
| `promo_area/` | 4 | 4 |
| `content_bkg/` | 4 | 5 |
| `process/` | 3 | 3 |
| `popup/` | 2 | 2 |
| `nav/` | 2 | 2 |
| `logos/` | 1 | 1 |
| `china_hotels/` | 1 | 1 |
| `ads-scale/` | 0 | 6 |
| `bg_patterns/` | 0 | 1 |

`popup/` is empty, and `boxes-v2/` and `box-scale/` are missing most of their
corner slices — those are the 4×4 and 7×7 GIFs the rounded-box CSS needs, so
any box rendered from this reference currently has square corners.

Every one of the 41 present files was verified to be a real GIF, so nothing in
the tree is a saved error page.

## Known blocker: some URLs 404 at the known-good timestamps

Two failure modes, and they need different fixes:

1. **`web.archive.org` refusing connections.** Confirmed from a second network
   on 29 Jul 2026 — the whole host, including the CDX API, not just rate
   limiting. Nothing to do but retry later.
2. **Genuine 404s at the timestamps we try.** Independent of the outage:
   `blank.gif` returned 404 at all four fallback captures
   (`20061026230011`, `20061111152513`, `20061027124218`, `20060928123858`),
   and `box-scale/dblue-bl.gif` 404'd at every timestamp that answered at all.

The timestamps in `FALLBACK_TS` are the ones the stylesheets rewrote their own
`url()` references to, so they are known-good **for the stylesheets** — that
does not mean every image was captured in the same crawl. Those files need a
**CDX capture lookup** to find a timestamp that actually holds them:

```bash
curl -sS --max-time 60 \
  "https://web.archive.org/cdx/search/cdx?url=images.habbohotel.com/web/web-1.0.1_b39/images/box-scale/dblue-bl.gif&output=json&filter=statuscode:200&limit=20"
```

Feed any timestamp it returns to the fetcher as a `<ts>\ttab\t<url>` line (the
list format below). Wiring that lookup in as an automatic last resort is the
obvious next improvement and is **not** implemented.

## Resume

Run from anywhere; the scripts resolve their own directory:

```bash
bash hub/tools/reference/habbo-2006/fetch-assets.sh
```

It audits first, fetches **only** what is missing, re-audits, and **exits 1 with
a summary if anything is still absent**. Re-running is safe and cheap: present
files are skipped, so repeated passes only chip at the gap. Archive.org is
flaky, so several passes are expected.

Audit without fetching:

```bash
bash hub/tools/reference/habbo-2006/audit-assets.sh     # exit 1 if incomplete
```

## The two scripts

**`audit-assets.sh`** parses every `url()` in `assets/boxes.css`,
`assets/style.css` and `assets/ads.css`, resolves each to its local path, and
writes `assets-manifest.tsv` (status, path, bytes, kind, capture timestamp,
referencing sheets, original URL). A file counts as present only if it exists,
is non-empty, **and** is actually an image — archive.org can answer 200 with an
HTML error body, which would otherwise audit as fine. Missing and corrupt rows
go to `.missing-urls.txt` as `<timestamp>\t<url>`.

`style_custom_com.css` has no `url()` of its own, and `index.html`'s inline
`<img>` tags are page content rather than chrome, so both are out of scope.

**`fetch-assets.sh`** fetches that list serially and slowly (archive.org refuses
bursty parallel clients), trying the stylesheet's own capture timestamp first
and then the shared fallbacks. It rejects non-image responses instead of saving
them, then re-audits **against the stylesheets** rather than against the fetch
list — the only claim worth making is "the reference page has every file its CSS
asks for".
