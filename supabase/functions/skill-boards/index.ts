// skill-boards — today's top anglers and gardeners for the title screen.
//
// WHY SERVER-SIDE. The two source pages send no Access-Control-Allow-Origin, so
// the browser cannot read them directly however the request is shaped. This
// function is the CORS boundary: it fetches and parses upstream, and hands the
// client plain JSON it is allowed to read. The parse itself lives in
// ../_shared/skillBoards.ts, the one copy shared with the Node report tool and
// the unit suite.
//
// BE A GOOD GUEST. These are one hobbyist's sites and we are uninvited. Two
// rules follow: cache hard (15 minutes, below) and never retry a failure into a
// hammer. A stale board is worth infinitely more than being blocked.
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { BOARDS, fetchBoard, type BoardResult } from "../_shared/skillBoards.ts";

const TTL_MS = 15 * 60 * 1000;
const TTL_S = TTL_MS / 1000;

// Like _shared/cors.ts json(), plus the caching the shared helper deliberately
// does not impose on the mutating functions that use it.
function cached(body: unknown, maxAgeS: number): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${maxAgeS}, stale-while-revalidate=600`,
    },
  });
}

type Payload = { ok: boolean; boards: BoardResult[]; fetchedAt: string; stale?: boolean };

// Module-scope cache. Edge functions are not guaranteed a warm instance, so this
// is a BEST-EFFORT damper, not a guarantee of one upstream hit per 15 minutes:
// each live instance keeps its own copy and a cold start refetches. That is
// still the difference between a handful of requests an hour and one per page
// view, which is the whole point. The Cache-Control header below does the rest,
// letting the CDN and the browser absorb repeat views without reaching us.
let cache: Payload | null = null;
let cachedAt = 0;
// Collapses the stampede when several visitors land during one refresh: they
// all await the same in-flight promise instead of each starting a fetch.
let inFlight: Promise<Payload> | null = null;

async function refresh(): Promise<Payload> {
  const boards = await Promise.all(Object.values(BOARDS).map((b) => fetchBoard(b)));

  // A board with zero rows means the fetch failed or the markup moved. Serving
  // the last good payload beats serving an empty one that would render as "no
  // rankings" -- a wrong statement about the world, rather than an old one.
  const anyRows = boards.some((b) => b.rows.length > 0);
  if (!anyRows && cache) {
    console.warn("[skill-boards] refresh produced no rows; serving last good payload", {
      problems: boards.flatMap((b) => b.problems),
    });
    return { ...cache, stale: true };
  }

  // Log a partial break loudly: rows still render, but somebody should look.
  for (const b of boards) {
    if (b.problems.length) console.warn(`[skill-boards] ${b.skill}: ${b.problems.join("; ")}`);
  }

  return { ok: true, boards, fetchedAt: new Date().toISOString() };
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  const fresh = cache && Date.now() - cachedAt < TTL_MS;
  if (!fresh) {
    if (!inFlight) {
      inFlight = refresh()
        .then((p) => {
          // Only a payload with real rows resets the clock. A stale fallback
          // must expire promptly so the next caller retries upstream rather
          // than freezing yesterday's board in place for 15 more minutes.
          if (!p.stale) {
            cache = p;
            cachedAt = Date.now();
          }
          return p;
        })
        .catch((e) => {
          console.error("[skill-boards] refresh threw", e);
          // fetchBoard already swallows its own errors, so reaching here means
          // something unforeseen. Last good payload if we have one, else an
          // honest empty answer -- never a 500 into the title screen.
          if (cache) return { ...cache, stale: true };
          return { ok: false, boards: [], fetchedAt: new Date().toISOString(), stale: true };
        })
        .finally(() => {
          inFlight = null;
        });
    }
    const payload = await inFlight;
    // A stale payload gets a short TTL so the CDN comes back soon and retries
    // upstream; a good one gets the full 15 minutes.
    return cached(payload, payload.stale ? 60 : TTL_S);
  }

  // Serve the remainder of the current window, so a CDN entry never outlives
  // the cache it was minted from.
  const remainingS = Math.max(30, Math.round((TTL_MS - (Date.now() - cachedAt)) / 1000));
  return cached(cache as Payload, remainingS);
});
