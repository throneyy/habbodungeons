#!/usr/bin/env bash
# Fetch 2006 Habbo box-chrome assets referenced by boxes.css / style.css / ads.css.
# Serial + slow: archive.org blocks bursty parallel clients (conn refused on :443).
#
# With no arguments it audits the tree first and fetches ONLY what is missing,
# then re-audits and FAILS LOUDLY if anything is still absent. The previous
# version printed FAIL lines and still exited 0, which is how 88 of 129 files
# went missing without anyone noticing.
#
# Usage:
#   bash fetch-assets.sh                # audit, fetch the gaps, verify, exit 1 if incomplete
#   bash fetch-assets.sh urls.txt       # fetch an explicit list (one per line)
#
# List format: "<capture-ts>\t<url>" (what audit-assets.sh emits) or a bare URL.
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
BASE="$(cd "$(dirname "$0")" && pwd)"

# Timestamps the stylesheets themselves rewrote their url() references to, so
# they are known-good captures. A per-URL timestamp from the list is tried
# FIRST — ads.css is served from 20061027124218, which is in none of these, and
# seeding the right capture is most of the difference between a hit and a miss.
FALLBACK_TS="20061026230011 20061111152513 20061027124218 20060928123858"

LIST="${1:-}"
# The verifier always writes its own list, never the caller's: clobbering an
# explicit input list mid-run would rewrite the very thing being retried.
VERIFY_LIST="$BASE/.missing-urls.txt"
if [ -z "$LIST" ]; then
  LIST="$VERIFY_LIST"
  echo "== auditing before fetch =="
  bash "$BASE/audit-assets.sh" --urls-out "$LIST"
  echo
fi
[ -f "$LIST" ] || { echo "fetch-assets.sh: no list at $LIST" >&2; exit 2; }

cd "$BASE/assets" || exit 2

if [ ! -s "$LIST" ]; then
  echo "nothing to fetch; every referenced asset is already present."
  exit 0
fi

want=$(grep -c . "$LIST" | tr -d ' ')
echo "== fetching $want missing file(s) =="

# Wait until the archive lets us back in.
until curl -sS --max-time 20 -o /dev/null "https://web.archive.org/"; do
  echo "throttled, sleeping 120s"; sleep 120
done

ok=0; skip=0; fail=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  # "<ts>\t<url>" from audit-assets.sh, or a bare URL.
  case "$line" in
    *"$(printf '\t')"*) pref_ts="${line%%	*}"; u="${line#*	}" ;;
    *) pref_ts=""; u="$line" ;;
  esac
  [ "$pref_ts" = "none" ] && pref_ts=""

  rel=$(echo "$u" | sed -E 's#^https?://[^/]+/##; s#^web/web-1\.0\.1_b39/images/##')
  [ -s "$rel" ] && { echo "SKIP $rel"; skip=$((skip + 1)); continue; }
  mkdir -p "$(dirname "$rel")"

  # Preferred capture first, then the shared fallbacks (deduped).
  got=""
  for ts in $pref_ts $FALLBACK_TS; do
    case " $got " in *" $ts "*) continue ;; esac
    got="$got $ts"
    if curl -sSL --fail --max-time 45 -A "$UA" "https://web.archive.org/web/${ts}im_/$u" -o "$rel" && [ -s "$rel" ]; then
      # archive.org can answer 200 with an HTML error body; that is a miss, not
      # a hit, and saving it is exactly how a gap starts looking filled.
      case "$(head -c 6 "$rel")" in
        GIF87a|GIF89a) echo "OK   $ts $rel"; ok=$((ok + 1)); break ;;
      esac
      case "$(head -c 4 "$rel")" in
        $'\x89'PNG) echo "OK   $ts $rel"; ok=$((ok + 1)); break ;;
      esac
      echo "BAD  $ts $rel (not an image)"
    fi
    rm -f "$rel"; sleep 2
  done
  [ -s "$rel" ] || { echo "FAIL $u"; fail=$((fail + 1)); }
  sleep 1
done < "$LIST"

echo
echo "== fetch summary =="
echo "  requested $want"
echo "  fetched   $ok"
[ "$skip" -gt 0 ] && echo "  skipped   $skip (already present)"
[ "$fail" -gt 0 ] && echo "  failed    $fail"

# Re-audit against the stylesheets, not against the fetch list: the list can be
# stale or partial, and the only claim worth making is "the reference page has
# every file its CSS asks for".
echo
echo "== verifying =="
if bash "$BASE/audit-assets.sh" --urls-out "$VERIFY_LIST"; then
  echo
  echo "COMPLETE: every referenced asset is present."
  exit 0
fi

echo
echo "INCOMPLETE: assets are still missing (see the manifest and the list above)."
echo "Re-run this script to retry; archive.org rate-limits and often yields more on a second pass."
exit 1
