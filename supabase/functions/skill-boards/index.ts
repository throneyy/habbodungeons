// skill-boards — today's top anglers and gardeners for the title screen.
//
// WHY SERVER-SIDE. The two source pages send no Access-Control-Allow-Origin, so
// the browser cannot read them directly however the request is shaped. This
// function is the CORS boundary: it fetches and parses upstream, and hands the
// client plain JSON it is allowed to read. The parse itself lives in
// ../_shared/skillBoards.ts, the one copy shared with the Node report tool and
// the unit suite.
//
// BE A GOOD GUEST. These are one hobbyist's sites and we are uninvited. Cache
// hard, fetch both pages concurrently so neither waits on the other, and retry
// at most ONCE on a transport failure. A stale board is worth infinitely more
// than being blocked.
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { BOARDS, type BoardSpec, fetchBoard, type BoardResult } from "../_shared/skillBoards.ts";

const TTL_MS = 15 * 60 * 1000;
const TTL_S = TTL_MS / 1000;
// A board serving stale rows must expire quickly so the next caller retries
// upstream, instead of freezing an old board in place for a further 15 minutes.
const STALE_TTL_S = 60;
const RETRY_BACKOFF_MS = 750;

type CachedBoard = { result: BoardResult; fetchedAt: string; cachedAt: number };
type BoardPayload = BoardResult & { fetchedAt: string; stale: boolean };
type Payload = { ok: boolean; boards: BoardPayload[]; fetchedAt: string; stale: boolean };

// PER-BOARD cache, not one combined payload. The combined version had a nasty
// failure mode: if fishing timed out while gardening succeeded, the merged
// result still counted as "has rows", so an EMPTY Top Anglers panel was cached
// for the full 15 minutes and every visitor saw a blank board that we already
// knew good numbers for. Each board now keeps its own last-good rows and its
// own clock, so one site's bad afternoon cannot blank the other's panel -- or
// its own, for that matter.
const cache = new Map<string, CachedBoard>();
// Collapses the stampede per board: concurrent callers await the same in-flight
// refresh rather than each starting their own fetch.
const inFlight = new Map<string, Promise<BoardPayload>>();

function cachedResponse(body: unknown, maxAgeS: number): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${maxAgeS}, stale-while-revalidate=600`,
    },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetch one board, retrying ONCE on a transport failure. A page that came back
// but did not parse is not retried: the markup moved, and asking again would
// only double our load on their server for the same wrong answer.
async function fetchWithRetry(spec: BoardSpec): Promise<BoardResult> {
  const first = await fetchBoard(spec);
  if (!first.fetchError) return first;

  console.warn(`[skill-boards] ${spec.skill}: ${first.fetchError}; retrying once`);
  await sleep(RETRY_BACKOFF_MS);

  const second = await fetchBoard(spec);
  if (second.fetchError) {
    console.warn(`[skill-boards] ${spec.skill}: retry also failed: ${second.fetchError}`);
  }
  return second;
}

// Refresh one board, falling back to its own last-good rows.
async function refreshBoard(spec: BoardSpec): Promise<BoardPayload> {
  const previous = cache.get(spec.skill);
  let result: BoardResult;
  try {
    result = await fetchWithRetry(spec);
  } catch (e) {
    // fetchBoard swallows its own errors, so reaching here means something
    // unforeseen. Treat it as a failed board, not a failed request.
    const reason = `unexpected: ${(e as Error)?.message ?? e}`;
    console.error(`[skill-boards] ${spec.skill}: ${reason}`);
    result = {
      skill: spec.skill, label: spec.label, url: spec.url, credit: spec.credit,
      stats: {}, rows: [], problems: [reason], fetchError: reason,
    };
  }

  // ONLY a board that actually parsed rows is cached. Anything else leaves the
  // previous good entry (and its clock) untouched.
  if (result.rows.length > 0) {
    if (result.problems.length) {
      // Rows still render, but a partial break means somebody should look.
      console.warn(`[skill-boards] ${spec.skill}: ${result.problems.join("; ")}`);
    }
    const fetchedAt = new Date().toISOString();
    cache.set(spec.skill, { result, fetchedAt, cachedAt: Date.now() });
    return { ...result, fetchedAt, stale: false };
  }

  if (previous) {
    console.warn(
      `[skill-boards] ${spec.skill}: no rows (${result.problems.join("; ")}); ` +
        `serving last good rows from ${previous.fetchedAt}`,
    );
    // Last-good ROWS with the ORIGINAL timestamp, so the UI can say how old
    // they are rather than implying these numbers are current. The live
    // problems ride along so the failure is visible in the response, not only
    // in the logs.
    return {
      ...previous.result,
      problems: [...result.problems, `serving cached rows from ${previous.fetchedAt}`],
      fetchedAt: previous.fetchedAt,
      stale: true,
    };
  }

  // Nothing cached and nothing fetched: an honest empty board, never a 500.
  console.warn(`[skill-boards] ${spec.skill}: no rows and no cache: ${result.problems.join("; ")}`);
  return { ...result, fetchedAt: new Date().toISOString(), stale: true };
}

function boardPayload(spec: BoardSpec): Promise<BoardPayload> {
  const hit = cache.get(spec.skill);
  if (hit && Date.now() - hit.cachedAt < TTL_MS) {
    return Promise.resolve({ ...hit.result, fetchedAt: hit.fetchedAt, stale: false });
  }
  const running = inFlight.get(spec.skill);
  if (running) return running;

  const p = refreshBoard(spec).finally(() => inFlight.delete(spec.skill));
  inFlight.set(spec.skill, p);
  return p;
}

// How long this response stays valid: the shortest remaining window across the
// boards, so a CDN entry never outlives the freshest thing that must change.
function maxAgeFor(boards: BoardPayload[]): number {
  let lowest = TTL_S;
  for (const b of boards) {
    if (b.stale) {
      lowest = Math.min(lowest, STALE_TTL_S);
      continue;
    }
    const hit = cache.get(b.skill);
    const remaining = hit
      ? Math.round((TTL_MS - (Date.now() - hit.cachedAt)) / 1000)
      : STALE_TTL_S;
    lowest = Math.min(lowest, remaining);
  }
  return Math.max(30, lowest);
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  // Concurrent, so a slow site delays only the response, never the other board.
  const boards = await Promise.all(Object.values(BOARDS).map(boardPayload));

  const payload: Payload = {
    // ok reflects whether anything is actually renderable.
    ok: boards.some((b) => b.rows.length > 0),
    boards,
    fetchedAt: new Date().toISOString(),
    stale: boards.some((b) => b.stale),
  };
  return cachedResponse(payload, maxAgeFor(boards));
});
