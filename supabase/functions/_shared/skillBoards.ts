// Daily fishing/gardening leaderboards, scraped from the two Habbo Origins fan
// sites that publish them: habbofishing.com and habbogardening.com (both by
// ICE..Skater). THE ONE COPY of this parse logic -- Deno (the skill-boards edge
// function), the Node report tool and the unit suite all import this file.
// Node 24 strips the types on import, so everything below stays "erasable"
// syntax only: no enums, no parameter properties, no namespaces.
//
// WHY SCRAPE. Neither site has a JSON API. Both are Laravel + Livewire v3, and
// the ALL-TIME board on each homepage is a lazily-hydrated Livewire component:
// it arrives only after a POST to /livewire/update carrying a server-HMAC-signed
// snapshot blob, answers with rendered HTML rather than data, and sends no CORS
// headers at all. Unusable.
//
// The TODAY board is a different thing and the reason this file can be simple:
// /fishing-stats and /gardening-stats render "Top fishermen today" / "Top
// gardeners today" straight into the initial HTML. One plain GET, no session,
// no token, no JavaScript.
//
// STILL NOT A CONTRACT. This is someone else's page markup and it can change
// without warning. Every selector is the most semantic anchor available, and a
// parse failure yields an empty result plus a `problems` list -- never a throw,
// and never a half-built row that would render as "undefined". Callers must
// treat an empty board as normal. Their own footer calls the data "unofficial
// and may be incomplete".

export type BoardSpec = {
  skill: string;
  label: string;
  url: string;
  heading: string;
  stats: { total: string; today: string; avgXp: string };
  reference: string;
  credit: string;
};

export type BoardRow = { rank: number; username: string; xpGained: number };

export type BoardResult = {
  skill: string;
  label: string;
  url: string;
  credit: string;
  stats: Record<string, number | null>;
  rows: BoardRow[];
  problems: string[];
  // Set ONLY when the request itself failed (timeout, DNS, refused, non-2xx).
  // Absent when a page was fetched but did not parse. The caller retries on
  // this and nothing else: a timeout is worth another go, but re-requesting a
  // page whose markup moved just doubles our load on their server for the same
  // wrong answer.
  fetchError?: string;
};

export const BOARDS: Record<string, BoardSpec> = {
  fishing: {
    skill: "fishing",
    label: "Top Anglers Today",
    url: "https://habbofishing.com/fishing-stats",
    heading: "Top fishermen today",
    // Header stat cards, keyed by their exact <h5 class="card-title"> text.
    stats: { total: "Total Fishers", today: "Fishers Today", avgXp: "Avg. XP Gain Today" },
    reference: "habbofishing-fishing-stats.html",
    credit: "habbofishing.com",
  },
  gardening: {
    skill: "gardening",
    label: "Top Gardeners Today",
    url: "https://habbogardening.com/gardening-stats",
    heading: "Top gardeners today",
    stats: { total: "Total Gardeners", today: "Gardeners Today", avgXp: "Avg. XP Gain Today" },
    reference: "habbogardening-gardening-stats.html",
    credit: "habbogardening.com",
  },
};

// A browser User-Agent is required: both sites sit behind a filter that answers
// a bare curl/Deno UA with a challenge page instead of the document.
export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#039": "'", "#39": "'",
};

function decode(s: string): string {
  return s
    .replace(/&(#\d+|[a-z]+);/gi, (m: string, e: string) => {
      const k = ENTITIES[e.toLowerCase()] ?? ENTITIES[e];
      if (k !== undefined) return k;
      return /^#\d+$/.test(e) ? String.fromCharCode(Number(e.slice(1))) : m;
    })
    .trim();
}

const stripTags = (s: string): string => decode(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));

// "63,842 XP" / "+695,420 XP" -> 63842 / 695420. Returns null (never NaN) when
// there are no digits, so a changed format reads as "missing" downstream.
function toInt(s: string): number | null {
  const digits = String(s).replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

// Slice out the one card whose <h5> is `heading`, up to the next card heading.
// Anchoring on the HEADING TEXT rather than a position or a class is the single
// most important robustness decision here: the two pages do NOT share a card
// order (fishing carries an extra "Derby Statistics" block that gardening lacks
// entirely), so any nth-card indexing would silently read the wrong numbers on
// one of them.
function sectionAfterHeading(html: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const h = html.search(new RegExp(`<h[45][^>]*>\\s*${escaped}\\s*<`, "i"));
  if (h < 0) return null;
  const next = html.slice(h + 1).search(/<h[45][^>]*>/i);
  return next < 0 ? html.slice(h) : html.slice(h, h + 1 + next);
}

// Header stats: <h5 class="card-title">LABEL</h5><p class="display-6 fw-bold">VALUE</p>
// Matched as a pair so a label can never pick up another card's value.
//
// The capture groups are [^<]* and NOT [\s\S]*?. A lazy any-character group
// looks equivalent but is not: when the <p> check fails the engine backtracks
// and expands the group PAST the closing </h5> into the next one, welding two
// unrelated cards together. That really happened here -- fishing's frenzy
// banner carries an <h5 class="card-title mb-0"> with no stat under it, and the
// lazy version silently produced the key "Fishing Frenzy starts soon ... Tota"
// with the value 4,554, so "Total Fishers" read as missing. Refusing to cross a
// '<' makes the pairing structural instead of a matter of luck.
export function parseHeaderStats(
  html: string,
  labels: Record<string, string>,
): { stats: Record<string, number | null>; problems: string[] } {
  const found: Record<string, string> = {};
  const re =
    /<h5[^>]*class="[^"]*card-title[^"]*"[^>]*>([^<]*)<\/h5>\s*<p[^>]*class="[^"]*display-6[^"]*"[^>]*>([^<]*)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) found[stripTags(m[1])] = stripTags(m[2]);

  const stats: Record<string, number | null> = {};
  const problems: string[] = [];
  for (const key of Object.keys(labels)) {
    const label = labels[key];
    const raw = found[label];
    if (raw === undefined) {
      stats[key] = null;
      problems.push(`header stat "${label}" not found`);
    } else {
      stats[key] = toInt(raw);
      if (stats[key] === null) problems.push(`header stat "${label}" had no number: ${raw}`);
    }
  }
  return { stats, problems };
}

// One entry per <div class="col">, each wrapping a link to /player/<name>.
//
// Three independent anchors per row, deliberately redundant so a cosmetic change
// breaks at most one of them:
//   rank     first <span> whose text is only digits
//   username /player/<name> in the href -- canonical, URL-encoded
//   xpGained <span class="badge ...">+N XP</span>
//
// The username comes from the HREF rather than the visible <h6>: the href is the
// site's own canonical identifier and survives display truncation.
//
// RANK IS NOT KEYED ON A CLASS. The obvious selector is fishing's
// <span class="fw-bold text-dark rank">, but gardening renders the same badge as
// <span class="fw-bold text-dark"> with no `rank` at all -- the two sites share
// a design, not a template. A digits-only span is the property both actually
// hold, with document order as the backstop if even that changes.
export function parseTodayRows(
  sectionHtml: string,
): { rows: BoardRow[]; problems: string[] } {
  const rows: BoardRow[] = [];
  const problems: string[] = [];
  const cols = sectionHtml.split(/<div class="col">/i).slice(1);

  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const href = col.match(/href="https?:\/\/[^"]*\/player\/([^"?#]+)"/i);
    const rank = col.match(/<span[^>]*>\s*(\d[\d,]*)\s*<\/span>/i);
    const xp = col.match(/<span[^>]*class="[^"]*badge[^"]*"[^>]*>([^<]*)<\/span>/i);

    if (!href) {
      problems.push(`entry ${i + 1}: no /player/ link`);
      continue;
    }

    let username = href[1];
    try {
      username = decodeURIComponent(href[1]);
    } catch {
      /* malformed escape -- keep the raw segment rather than dropping the row */
    }
    const parsedRank = rank ? toInt(rank[1]) : null;
    const xpGained = xp ? toInt(xp[1]) : null;

    if (parsedRank === null) problems.push(`entry ${i + 1} (${username}): no rank`);
    if (xpGained === null) problems.push(`entry ${i + 1} (${username}): no XP badge`);

    // Rank is recoverable from document order; a row with no XP is not worth
    // showing, so only that one is fatal.
    if (xpGained === null) continue;
    rows.push({ rank: parsedRank ?? i + 1, username, xpGained });
  }
  return { rows, problems };
}

// Parse a whole stats page. Pure: HTML in, result out, no network -- so the
// saved tools/reference/*.html copies exercise exactly this path.
export function parseBoard(html: string, board: BoardSpec): BoardResult {
  const problems: string[] = [];
  const header = parseHeaderStats(html, board.stats);
  problems.push(...header.problems);

  const section = sectionAfterHeading(html, board.heading);
  let rows: BoardRow[] = [];
  if (!section) {
    problems.push(`section heading "${board.heading}" not found -- page structure changed`);
  } else {
    const parsed = parseTodayRows(section);
    rows = parsed.rows;
    problems.push(...parsed.problems);
    if (!rows.length) problems.push("section found but produced no rows");
  }

  return {
    skill: board.skill,
    label: board.label,
    url: board.url,
    credit: board.credit,
    stats: header.stats,
    rows,
    problems,
  };
}

// Fetch + parse one board. Never throws: a dead upstream comes back as an empty
// board carrying the reason, which is what lets the edge function fall back to
// its last good payload instead of 500-ing.
export async function fetchBoard(
  board: BoardSpec,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<BoardResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  // 20s, not the 8s this shipped with: habbofishing.com regularly takes well
  // over eight seconds to render /fishing-stats under load, and that cap was
  // aborting a request that would have succeeded. We are a background refresh
  // behind a cache, so waiting is nearly free -- a timeout costs a whole board.
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const empty = (reason: string): BoardResult => ({
    skill: board.skill,
    label: board.label,
    url: board.url,
    credit: board.credit,
    stats: {},
    rows: [],
    problems: [reason],
    fetchError: reason,
  });

  try {
    const res = await fetchImpl(board.url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return empty(`HTTP ${res.status}`);
    return parseBoard(await res.text(), board);
  } catch (e) {
    return empty(`fetch failed: ${(e as Error)?.message ?? e}`);
  }
}
