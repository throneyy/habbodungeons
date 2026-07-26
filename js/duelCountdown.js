// The duel countdown's clock — pure, deterministic, and shared by both sides.
//
// The server never ticks anything: duel-accept stamps ONE absolute instant
// (`startsAt`) on the challenger's row and broadcasts it, with the derived
// `goAt`, verbatim to both players. Each client then renders the 3-2-1-GO
// purely as a function of (goAt, now), so two screens showing the same duel
// show the same number at the same moment — no "start now" message, no drift,
// no way for one side to begin swinging early.
//
// ...as long as `now` is the SAME now. A shared anchor measured against two
// disagreeing clocks is no anchor at all: a machine whose clock is minutes off
// (misconfigured, a stale RTC, a different timezone offset applied wrongly, or
// simply set forward on purpose to reach GO first) would hit every phase at its
// own private moment. So the client never ticks on the raw wall clock — it
// takes the `serverNow` the duel-state frame carries, derives its offset ONCE
// per duel via clockOffset(), and passes Date.now() + offset into duelPhase().
// That keeps duelPhase itself pure and now-taking (the whole point) while
// making "now" mean server time on every screen.
//
// Phases: 'lead' (accept landed, overlay up, first tick not yet due)
//         'countdown' (3 → 2 → 1)
//         'go' (the GO! flash)
//         'ready' (the duel-ready state — NO COMBAT YET, either side cancels)

export const COUNTDOWN_MS = 3000; // 3 ticks, one second each
export const GO_HOLD_MS = 700; // how long GO! stays up before 'ready'

/**
 * @param {{ startsAt?: string|number, goAt?: string|number, countdownMs?: number }} timeline
 *        the server's `duel-state` payload
 * @param {number} now  ms epoch (Date.now())
 * @returns {{ phase: 'lead'|'countdown'|'go'|'ready', tick: number, label: string, msLeft: number }}
 */
export function duelPhase(timeline, now) {
  const span = timeline && Number.isFinite(timeline.countdownMs)
    ? timeline.countdownMs
    : COUNTDOWN_MS;
  const startsAt = stamp(timeline && timeline.startsAt);
  const goAt = Number.isFinite(stamp(timeline && timeline.goAt))
    ? stamp(timeline.goAt)
    : startsAt + span;
  if (!Number.isFinite(goAt)) return { phase: 'ready', tick: 0, label: 'Duel ready', msLeft: 0 };

  const msLeft = goAt - now;
  if (Number.isFinite(startsAt) && now < startsAt) {
    return { phase: 'lead', tick: ticksFor(span), label: String(ticksFor(span)), msLeft };
  }
  if (msLeft > 0) {
    // ceil: the whole second in which "1" is on screen is still tick 1.
    const tick = Math.min(ticksFor(span), Math.ceil(msLeft / 1000));
    return { phase: 'countdown', tick, label: String(tick), msLeft };
  }
  if (msLeft > -GO_HOLD_MS) return { phase: 'go', tick: 0, label: 'GO!', msLeft };
  return { phase: 'ready', tick: 0, label: 'Duel ready', msLeft };
}

/**
 * How far this machine's clock sits from the server's, in ms — add it to
 * Date.now() to get server time. Measured once when a duel-state frame lands
 * (its `serverNow`) against the local clock at that moment, then held for the
 * session: re-deriving it per tick would let a clock that drifts (or is edited)
 * mid-countdown pull the phase around, which is exactly what this prevents.
 *
 * The one-way network delay is inside this figure (it reads a few tens of ms
 * "slow"), which is both harmless at second granularity and self-correcting in
 * the right direction: a laggier client sees GO a hair later, never earlier.
 *
 * Returns 0 when the frame carries no usable serverNow (an older payload), so
 * the countdown degrades to the raw local clock rather than to NaN.
 *
 * @param {string|number|undefined} serverNow  the frame's server timestamp
 * @param {number} localNow  Date.now() as read at the same moment
 */
export function clockOffset(serverNow, localNow) {
  const server = stamp(serverNow);
  if (!Number.isFinite(server) || !Number.isFinite(localNow)) return 0;
  return server - localNow;
}

/** Does this phase mean the duel is armed and waiting (no combat yet)? */
export const isReady = (p) => p.phase === 'ready';

const ticksFor = (span) => Math.max(1, Math.round(span / 1000));

function stamp(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Date.parse(v);
  return NaN;
}
