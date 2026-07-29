#!/usr/bin/env bash
# Audit the 2006 reference scrape: parse every url() in the stylesheets,
# resolve each to its local path, and report which files are present.
#
# Why this exists: the original scrape failed SILENTLY. fetch-assets.sh printed
# FAIL lines and exited 0 regardless, and nothing ever compared the tree against
# the stylesheets, so 88 of 129 referenced files were missing with no signal.
#
# Outputs (both regenerated on every run):
#   assets-manifest.tsv  one row per referenced file: status, path, bytes, kind,
#                        preferred capture timestamp, which stylesheets want it,
#                        original URL
#   /tmp/... or --urls-out    the fetch list for MISSING files only, as
#                        "<timestamp>\t<url>" so the fetcher can try the exact
#                        capture the stylesheet itself points at first
#
# Exit status: 0 when every referenced file is present, 1 when any is missing —
# so this doubles as the verifier fetch-assets.sh runs at the end.
#
# Usage:
#   bash audit-assets.sh [--urls-out FILE] [--manifest-out FILE] [--quiet]
set -u

BASE="$(cd "$(dirname "$0")" && pwd)"
ASSETS="$BASE/assets"
MANIFEST="$BASE/assets-manifest.tsv"
URLS_OUT="$BASE/.missing-urls.txt"
QUIET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --urls-out) URLS_OUT="$2"; shift 2 ;;
    --manifest-out) MANIFEST="$2"; shift 2 ;;
    --quiet) QUIET=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "audit-assets.sh: unknown argument $1" >&2; exit 2 ;;
  esac
done

# The stylesheets that drive the reference page. style_custom_com.css is a
# 2-rule override with no url() of its own; index.html's inline <img> tags are
# page content, not chrome, and are deliberately out of scope.
SHEETS="boxes.css style.css ads.css"

cd "$ASSETS" || { echo "audit-assets.sh: no assets dir at $ASSETS" >&2; exit 2; }
for s in $SHEETS; do
  [ -f "$s" ] || { echo "audit-assets.sh: missing stylesheet $s" >&2; exit 2; }
done

# ---- parse ------------------------------------------------------------------
# Every url() in these sheets is a wayback-rewritten absolute reference:
#   url(/web/<ts>im_/http://images.habbohotel.com/web/web-1.0.1_b39/images/<rel>)
# <ts> is the capture the stylesheet was served with, so it is the timestamp
# most likely to hold that asset. The local path is <rel>, mirroring the same
# stripping fetch-assets.sh does.
TMP="$(mktemp)"
trap 'rm -f "$TMP" "$TMP.sorted"' EXIT

for sheet in $SHEETS; do
  grep -o 'url([^)]*)' "$sheet" |
    sed -E "s/^url\(['\"]?//; s/['\"]?\)$//" |
    while IFS= read -r raw; do
      # capture timestamp, then the original (unrewritten) URL
      ts=$(printf '%s' "$raw" | sed -nE 's#^/web/([0-9]{14})im_/.*#\1#p')
      url=$(printf '%s' "$raw" | sed -E 's#^/web/[0-9]{14}im_/##')
      rel=$(printf '%s' "$url" | sed -E 's#^https?://[^/]+/##; s#^web/web-1\.0\.1_b39/images/##')
      # A url() that does not resolve to a path under images/ would silently
      # collide at the repo root; flag it rather than fetch it somewhere odd.
      case "$rel" in
        /*|*..*|http*) printf 'BADREF\t%s\t%s\t%s\n' "$sheet" "$url" "$rel" >&2; continue ;;
      esac
      printf '%s\t%s\t%s\n' "$rel" "${ts:-none}" "$sheet" >> "$TMP"
    done
done

sort -u "$TMP" > "$TMP.sorted"

# ---- manifest ---------------------------------------------------------------
# One row per unique path. A file counts as present only if it exists AND is
# non-empty AND is actually an image: the scrape can also "succeed" into an
# archive.org error page, which would otherwise audit as fine.
{
  printf 'status\tpath\tbytes\tkind\tcapture_ts\treferenced_by\turl\n'
  cut -f1 "$TMP.sorted" | sort -u | while IFS= read -r rel; do
    ts=$(awk -F'\t' -v r="$rel" '$1==r {print $2; exit}' "$TMP.sorted")
    refs=$(awk -F'\t' -v r="$rel" '$1==r {print $3}' "$TMP.sorted" | sort -u | paste -sd, -)
    url="http://images.habbohotel.com/web/web-1.0.1_b39/images/$rel"
    if [ -s "$rel" ]; then
      bytes=$(wc -c < "$rel" | tr -d ' ')
      kind=$(head -c 6 "$rel" | tr -d '\0')
      case "$kind" in
        GIF87a|GIF89a) status=PRESENT; kind="gif" ;;
        # PNG/JPEG would be fine too; anything else is almost certainly an
        # archive.org HTML error body saved under a .gif name.
        *) case "$(head -c 4 "$rel")" in
             $'\x89'PNG) status=PRESENT; kind="png" ;;
             *) status=CORRUPT; kind="not-an-image" ;;
           esac ;;
      esac
    else
      status=MISSING; bytes=0; kind="-"
      [ -e "$rel" ] && kind="empty-file"
    fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$status" "$rel" "$bytes" "$kind" "$ts" "$refs" "$url"
  done
} > "$MANIFEST"

# ---- fetch list for the gaps ------------------------------------------------
# "<preferred ts>\t<url>". CORRUPT rows are re-fetched too: a saved error page
# is a gap that merely looks filled.
awk -F'\t' 'NR>1 && ($1=="MISSING" || $1=="CORRUPT") {print $5 "\t" $7}' "$MANIFEST" > "$URLS_OUT"

# ---- summary ----------------------------------------------------------------
total=$(awk 'NR>1' "$MANIFEST" | wc -l | tr -d ' ')
present=$(awk -F'\t' 'NR>1 && $1=="PRESENT"' "$MANIFEST" | wc -l | tr -d ' ')
missing=$(awk -F'\t' 'NR>1 && $1=="MISSING"' "$MANIFEST" | wc -l | tr -d ' ')
corrupt=$(awk -F'\t' 'NR>1 && $1=="CORRUPT"' "$MANIFEST" | wc -l | tr -d ' ')

if [ "$QUIET" -eq 0 ]; then
  echo "referenced by $SHEETS: $total unique files"
  echo "  present  $present"
  echo "  missing  $missing"
  [ "$corrupt" -gt 0 ] && echo "  corrupt  $corrupt (saved but not an image)"
  if [ $((missing + corrupt)) -gt 0 ]; then
    echo
    echo "gaps by directory:"
    awk -F'\t' 'NR>1 && ($1=="MISSING"||$1=="CORRUPT") {n=split($2,p,"/"); print (n>1?p[1]:"(root)")}' "$MANIFEST" |
      sort | uniq -c | sort -rn | sed 's/^/  /'
  fi
  echo
  echo "manifest: $MANIFEST"
  [ $((missing + corrupt)) -gt 0 ] && echo "fetch list: $URLS_OUT"
fi

[ $((missing + corrupt)) -eq 0 ]
