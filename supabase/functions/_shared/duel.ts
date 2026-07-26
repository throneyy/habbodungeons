// Shared duel types + the pure rules behind the challenge handshake — the
// duels table's counterpart to _shared/trade.ts.
//
// Everything here is PURE (no Deno, no network, no jsr imports) so the rules
// can be exercised straight from Node in tests/duel.test.js. The Postgres side
// lives in duelStore.ts; the decision-making lives in duelFlow.ts.
//
// The handshake mirrors Safe Trading exactly:
//   duel-challenge  → ask row (status 'asked') + a `duel-asked` toast on the
//                     target's user:<id> mailbox
//   duel-accept     → status 'countdown', starts_at stamped ONCE, both sides
//                     get the same `duel-state`
//   duel-decline    → ask row dropped, `duel-declined` back to the challenger
//   duel-cancel     → either side walks away, `duel-cancelled` to both

/** An ask goes stale after a minute, like a party invite (INVITE_TTL_MS). */
export const DUEL_ASK_TTL_MS = 60_000;
/** Lead-in between the accept landing and the "3" appearing, so both clients
 *  have their overlay up before the first tick. */
export const DUEL_LEAD_IN_MS = 700;
/** 3 → 2 → 1 → GO, one second a tick. */
export const DUEL_COUNTDOWN_MS = 3_000;
/** Presence rows older than this are dead sockets (presence-reap's TTL). */
export const PRESENCE_TTL_MS = 30_000;

export interface DuelRow {
  id: string;
  a_user: string;
  b_user: string;
  a_name: string;
  b_name: string;
  room_id: string;
  status: string; // asked | countdown | done | cancelled
  starts_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PresenceRow {
  room_id: string;
  last_seen: string;
}

/** A broadcast an edge function should push after the flow decides. Kept as
 *  data (not a side effect) so the flows stay pure and testable. */
export interface DuelSend {
  userId: string;
  event: string;
  payload: Record<string, unknown>;
}

export interface FlowResult {
  status: number;
  body: Record<string, unknown>;
  sends: DuelSend[];
}

export const isA = (d: DuelRow, userId: string) => d.a_user === userId;

/** The other side of a duel row. */
export const foeOf = (d: DuelRow, userId: string) =>
  isA(d, userId)
    ? { id: d.b_user, name: d.b_name }
    : { id: d.a_user, name: d.a_name };

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

/** A presence row still counts as "in the room" — anything older is a client
 *  that stopped heartbeating (offline), whether or not the reaper ran yet. */
export function presenceFresh(p: PresenceRow | null, nowMs: number): boolean {
  if (!p) return false;
  const seen = ms(p.last_seen);
  return Number.isFinite(seen) && nowMs - seen <= PRESENCE_TTL_MS;
}

/** Has an unanswered challenge lapsed? */
export function askFresh(d: DuelRow, nowMs: number): boolean {
  const born = ms(d.created_at);
  return Number.isFinite(born) ? nowMs - born <= DUEL_ASK_TTL_MS : true;
}

/** The countdown anchor: one absolute instant, stamped on the challenger's row
 *  at accept-time and broadcast verbatim to BOTH clients. `goAt` is derived, not
 *  stored — every client computes the same ticks from the same two numbers, so
 *  nobody's 3-2-1 runs ahead of the other's.
 *
 *  Both fields are normalised to canonical UTC ISO-8601. `startsAt` arrives
 *  here as whatever Postgres rendered the timestamptz as, which follows the DB
 *  session's TimeZone setting — locally that produced
 *  "2026-07-26T00:18:11.297-05:00" for a goAt of "2026-07-26T05:18:14.297Z":
 *  the same instant in two different notations, in one payload. Date.parse
 *  handles both, so nothing broke, but a wire format that shifts with a server
 *  setting is not something to leave in a sync anchor — and it makes the two
 *  fields impossible to compare as strings. */
export function duelTimeline(startsAtIso: string) {
  const startsAt = Date.parse(startsAtIso);
  return {
    startsAt: new Date(startsAt).toISOString(),
    goAt: new Date(startsAt + DUEL_COUNTDOWN_MS).toISOString(),
    countdownMs: DUEL_COUNTDOWN_MS,
  };
}

/** The per-side `duel-state` payload (trade.ts's pushTradeState shape). */
export function duelStateShape(d: DuelRow, forUserId: string) {
  const foe = foeOf(d, forUserId);
  const timeline = d.starts_at ? duelTimeline(d.starts_at) : null;
  return {
    duel: d.id,
    opponent: foe.name,
    room: d.room_id,
    stage: d.status === "countdown" ? "countdown" : d.status,
    challenger: d.a_name,
    youChallenged: isA(d, forUserId),
    ...(timeline ?? {}),
  };
}
