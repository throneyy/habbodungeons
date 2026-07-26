// Duel challenge handshake tests — run with:  node tests/duel.test.js
//
// Covers the server-authoritative rules (supabase/functions/_shared/duelFlow.ts,
// the real code the duel-challenge / duel-accept / duel-decline / duel-cancel
// edge functions run) against an in-memory world, plus the shared countdown
// clock the two clients tick off one timestamp (js/duelCountdown.js).
//
// The four scenarios the flow has to get right:
//   • decline           — ask dropped, challenger told, both free again
//   • cancel mid-count   — the 3-2-1 killed from either side, both told
//   • target busy        — duelling / trading / in a battle, never queued
//   • target offline     — no presence row, or one older than the reaper's TTL
// plus the clock-skew defence: a client whose machine clock is wrong (or set
// forward on purpose) must still hit every phase at the same real moment as
// its opponent — otherwise the shared starts_at anchor buys nothing.
//
// Node runs the .ts flow module directly (type stripping); nothing here touches
// Deno, Postgres or Realtime — the flows return their broadcasts as data.
import {
  challengeFlow,
  acceptFlow,
  declineFlow,
  cancelFlow,
} from '../supabase/functions/_shared/duelFlow.ts';
import {
  DUEL_ASK_TTL_MS,
  DUEL_LEAD_IN_MS,
  DUEL_COUNTDOWN_MS,
  PRESENCE_TTL_MS,
} from '../supabase/functions/_shared/duel.ts';
import { duelPhase, clockOffset, GO_HOLD_MS } from '../js/duelCountdown.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

// ---- the fake world --------------------------------------------------------
// A tiny stand-in for profiles / room_presence / duels / trades / battle_states,
// implementing exactly the DuelStore port duelStore.ts implements over Postgres.
const T0 = Date.parse('2026-07-25T12:00:00.000Z');

function world() {
  let seq = 0;
  const players = new Map();
  const duels = [];
  const w = {
    now: T0,
    duels,
    add(name, opts = {}) {
      const p = {
        id: `u-${++seq}`,
        name,
        room: opts.room ?? 'lobby',
        present: opts.present !== false,
        lastSeen: opts.lastSeen ?? w.now,
        trading: !!opts.trading,
        battling: !!opts.battling,
      };
      players.set(p.id, p);
      return p;
    },
    rowFor: (id) => duels.find((d) => d.id === id) || null,
    liveRow: () => duels.find((d) => d.status === 'asked' || d.status === 'countdown') || null,
  };

  const iso = (ms) => new Date(ms).toISOString();
  const mine = (d, uid) => d.a_user === uid || d.b_user === uid;

  w.store = {
    async userByName(name) {
      for (const p of players.values()) {
        if (p.name.toLowerCase() === String(name).toLowerCase()) {
          return { id: p.id, habbo_username: p.name };
        }
      }
      return null;
    },
    async displayName(id) {
      return players.get(id)?.name ?? 'player';
    },
    async presenceOf(id) {
      const p = players.get(id);
      if (!p || !p.present) return null;
      return { room_id: p.room, last_seen: iso(p.lastSeen) };
    },
    async liveDuelOf(id) {
      return duels.find((d) => mine(d, id) && (d.status === 'asked' || d.status === 'countdown')) || null;
    },
    async countdownOf(id) {
      return duels.find((d) => mine(d, id) && d.status === 'countdown') || null;
    },
    async askBetween(from, to) {
      return duels.find((d) => d.status === 'asked' && d.a_user === from && d.b_user === to) || null;
    },
    async asksInvolving(id) {
      return duels.filter((d) => d.status === 'asked' && mine(d, id));
    },
    async insertAsk(row) {
      const d = { ...row, id: `d-${++seq}`, status: 'asked', starts_at: null, created_at: iso(w.now) };
      duels.push(d);
      return { ...d };
    },
    async startCountdown(id, startsAt) {
      const d = w.rowFor(id);
      if (!d) return null;
      d.status = 'countdown';
      d.starts_at = startsAt;
      return { ...d };
    },
    async endDuel(id, status) {
      const d = w.rowFor(id);
      if (d) d.status = status;
    },
    async dropAsk(id) {
      const i = duels.findIndex((d) => d.id === id && d.status === 'asked');
      if (i >= 0) duels.splice(i, 1);
    },
    async isTrading(id) {
      return !!players.get(id)?.trading;
    },
    async isBattling(id) {
      return !!players.get(id)?.battling;
    },
  };
  return w;
}

const sent = (res, event) => res.sends.filter((s) => s.event === event);
const sentTo = (res, event, userId) =>
  res.sends.find((s) => s.event === event && s.userId === userId) || null;

// A challenge that lands, followed by an accept. Returns everything needed to
// assert on the live duel.
async function handshake(opts = {}) {
  const w = world();
  const alice = w.add('Alice', opts.a);
  const bob = w.add('Bob', opts.b);
  const challenge = await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  const accept = await acceptFlow(w.store, { id: bob.id }, { from: 'Alice' }, w.now);
  return { w, alice, bob, challenge, accept };
}

// ---- the ask ---------------------------------------------------------------
console.log('challenge');
{
  const { w, alice, bob, challenge } = await handshake();
  check('challenge is accepted by the server', challenge.body.ok === true);
  check('an ask row is recorded for the pair', w.duels.length === 1 && w.duels[0].a_user === alice.id);
  check('the ask carries the shared room', w.duels[0].room_id === 'lobby');
  const toast = sentTo(challenge, 'duel-asked', bob.id);
  check('the target gets a duel-asked toast on their mailbox', !!toast);
  check('the toast names the challenger', toast && toast.payload.from === 'Alice');
  check('the challenger gets no toast of their own', !sentTo(challenge, 'duel-asked', alice.id));
}
{
  const w = world();
  const alice = w.add('Alice');
  w.add('Bob');
  const res = await challengeFlow(w.store, { id: alice.id }, { name: 'Nobody' }, w.now);
  check('an unknown name is refused', res.body.ok === false && res.body.reason === 'no such player');
  const self = await challengeFlow(w.store, { id: alice.id }, { name: 'Alice' }, w.now);
  check('you cannot challenge yourself', self.body.ok === false);
  check('no ask row survives a refused challenge', w.duels.length === 0);
}
{
  // Same room, enforced server-side (not by the client's room view).
  const w = world();
  const alice = w.add('Alice', { room: 'lobby' });
  w.add('Bob', { room: 'plaza' });
  const res = await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  check('a room-mate check blocks cross-room challenges',
    res.body.ok === false && res.body.reason === 'Bob is in another room');
  check('no ask row is created across rooms', w.duels.length === 0);
}

// ---- accept + the synced countdown -----------------------------------------
console.log('accept');
{
  const { w, alice, bob, accept } = await handshake();
  check('accept starts the countdown', accept.body.ok === true);
  check('the duel row goes to countdown', w.duels[0].status === 'countdown');
  const toA = sentTo(accept, 'duel-state', alice.id);
  const toB = sentTo(accept, 'duel-state', bob.id);
  check('both sides get a duel-state frame', !!toA && !!toB);
  check('both frames share ONE startsAt (the sync anchor)',
    toA.payload.startsAt === toB.payload.startsAt);
  check('both frames share ONE goAt', toA.payload.goAt === toB.payload.goAt);
  check('the anchor is stamped from the accept instant + lead-in',
    Date.parse(toA.payload.startsAt) === w.now + DUEL_LEAD_IN_MS);
  check('GO lands one countdown after the anchor',
    Date.parse(toA.payload.goAt) === w.now + DUEL_LEAD_IN_MS + DUEL_COUNTDOWN_MS);
  check('each side is told who it is facing',
    toA.payload.opponent === 'Bob' && toB.payload.opponent === 'Alice');
  check('each side knows who threw the gauntlet',
    toA.payload.youChallenged === true && toB.payload.youChallenged === false);

  // The clock is a pure function of (goAt, now) — so both clients, fed the
  // same frame, render the same number at the same instant.
  const at = (ms) => [duelPhase(toA.payload, ms).label, duelPhase(toB.payload, ms).label];
  const go = Date.parse(toA.payload.goAt);
  const same = (ms) => at(ms)[0] === at(ms)[1];
  check('the two clients tick in lockstep at every step',
    [go - 2900, go - 2000, go - 1500, go - 10, go + 100, go + 5000].every(same));
  check('3 → 2 → 1 counts down off the shared anchor',
    duelPhase(toA.payload, go - 2500).label === '3' &&
    duelPhase(toA.payload, go - 1500).label === '2' &&
    duelPhase(toA.payload, go - 500).label === '1');
  check('the lead-in holds on 3 before the first tick',
    duelPhase(toA.payload, w.now + 100).phase === 'lead');
  check('GO! flashes as the countdown expires',
    duelPhase(toA.payload, go + 10).phase === 'go');
  check('the countdown lands in the duel-ready state',
    duelPhase(toA.payload, go + GO_HOLD_MS + 1).phase === 'ready');
  check('duel-ready is a state, not a combat start (no further sends)',
    accept.sends.every((s) => s.event === 'duel-state'));
  check('both frames carry the server\u2019s own now (the skew reference)',
    toA.payload.serverNow === toB.payload.serverNow &&
    Date.parse(toA.payload.serverNow) === w.now);
}
{
  // trade-open's open-back shortcut: challenging back accepts.
  const w = world();
  const alice = w.add('Alice');
  const bob = w.add('Bob');
  await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  const back = await challengeFlow(w.store, { id: bob.id }, { name: 'Alice' }, w.now);
  check('challenging back accepts the pending ask', back.body.ok === true &&
    w.duels[0].status === 'countdown' && sent(back, 'duel-state').length === 2);
}
{
  const w = world();
  const alice = w.add('Alice');
  const bob = w.add('Bob');
  await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  const late = await acceptFlow(w.store, { id: bob.id }, { from: 'Alice' }, w.now + DUEL_ASK_TTL_MS + 1);
  check('a lapsed ask cannot be accepted', late.body.ok === true && late.body.duel === null);
  check('the lapsed ask is swept', w.duels.length === 0);
  check('a lapsed accept starts nothing', late.sends.length === 0);
}

// ---- clock skew ------------------------------------------------------------
// The anchor is only worth something if both sides measure it against the same
// clock. These drive the exact path js/duelWindow.js takes: derive the offset
// once from the frame's serverNow, then tick duelPhase(Date.now() + offset).
console.log('clock skew');
{
  const { w, alice, accept } = await handshake();
  const frame = sentTo(accept, 'duel-state', alice.id).payload;
  const landed = w.now; // the real instant the frame reaches both clients
  const go = Date.parse(frame.goAt);

  // A client whose machine clock is off by `drift` ms: every Date.now() it
  // reads is drift ms wrong, including the one used to measure the offset.
  const client = (drift) => {
    const skew = clockOffset(frame.serverNow, landed + drift); // measured once
    return {
      // what this client renders at real-world instant `real`
      at: (real) => duelPhase(frame, real + drift + skew),
      // what it WOULD render on the raw wall clock (the bug being fixed)
      raw: (real) => duelPhase(frame, real + drift),
      skew,
    };
  };

  const SKEW = 8000;
  const fast = client(SKEW); // clock 8s ahead
  const slow = client(-SKEW); // clock 8s behind
  const sync = client(0);

  check('the offset cancels the drift exactly',
    fast.skew === -SKEW && slow.skew === SKEW && sync.skew === 0);

  // Sample the whole duel at 100ms resolution: lead-in, 3-2-1, GO, ready.
  const samples = [];
  for (let t = landed; t <= go + 2500; t += 100) samples.push(t);
  const agree = (a, b, t) => a.at(t).phase === b.at(t).phase && a.at(t).label === b.at(t).label;

  check('a client 8s FAST ticks as an in-sync client, all the way through',
    samples.every((t) => agree(fast, sync, t)));
  check('a client 8s SLOW ticks as an in-sync client, all the way through',
    samples.every((t) => agree(slow, sync, t)));
  check('the fast and slow clients agree with EACH OTHER at every sample',
    samples.every((t) => agree(fast, slow, t)));

  // The moment that actually matters: nobody reaches GO early or late.
  const firstGo = (c) => samples.find((t) => c.at(t).phase === 'go');
  check('all three reach GO at the same real instant',
    firstGo(fast) === firstGo(sync) && firstGo(slow) === firstGo(sync) &&
    firstGo(sync) !== undefined);
  const firstReady = (c) => samples.find((t) => c.at(t).phase === 'ready');
  check('all three land in duel-ready at the same real instant',
    firstReady(fast) === firstReady(sync) && firstReady(slow) === firstReady(sync) &&
    firstReady(sync) !== undefined);
  check('the skewed clients show the same countdown digit mid-flight',
    fast.at(go - 1500).label === '2' && slow.at(go - 1500).label === '2');

  // Proof the correction is doing the work: on the raw clock (the old
  // Date.now() call) an 8s-fast client is already done before the other starts.
  check('WITHOUT the correction the fast client would be finished at GO time',
    fast.raw(go).phase === 'ready' && sync.raw(go).phase === 'go');
  check('WITHOUT the correction the slow client would still be waiting at GO',
    slow.raw(go).phase === 'lead');
  check('WITHOUT the correction fast and slow disagree for most of the duel',
    samples.filter((t) => fast.raw(t).label !== slow.raw(t).label).length > samples.length / 2);

  // A clock that drifts mid-countdown must not drag the phase around: the
  // offset is measured once and held (duelWindow.js keeps it on the session).
  const drifting = client(SKEW);
  const heldSkew = drifting.skew;
  const afterEdit = (real, newDrift) => duelPhase(frame, real + newDrift + heldSkew);
  check('an offset measured once is NOT re-derived from a clock edited mid-duel',
    afterEdit(go - 1500, SKEW).label === '2');
  check('a mid-duel clock jump only moves the cheater\u2019s own screen, not the anchor',
    Date.parse(frame.goAt) === go && frame.startsAt === sentTo(accept, 'duel-state', w.duels[0].b_user).payload.startsAt);
}
{
  // Degrade safely: an older frame with no serverNow falls back to the local
  // clock (offset 0) rather than poisoning every tick with NaN.
  check('a missing serverNow yields a zero offset', clockOffset(undefined, T0) === 0);
  check('an unparseable serverNow yields a zero offset', clockOffset('not a date', T0) === 0);
  check('a numeric serverNow works too', clockOffset(T0 + 5000, T0) === 5000);
  const noStamp = { startsAt: new Date(T0).toISOString(), goAt: new Date(T0 + 3000).toISOString() };
  check('a frame without serverNow still counts down on the local clock',
    duelPhase(noStamp, T0 + 1500).label === '2');
}

// ---- decline ---------------------------------------------------------------
console.log('decline');
{
  const w = world();
  const alice = w.add('Alice');
  const bob = w.add('Bob');
  await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  const res = await declineFlow(w.store, { id: bob.id }, { from: 'Alice' });
  check('decline succeeds', res.body.ok === true);
  check('the ask row is dropped', w.duels.length === 0);
  const back = sentTo(res, 'duel-declined', alice.id);
  check('the challenger is told (their wait toast resolves)', !!back);
  check('the refusal names who declined', back && back.payload.name === 'Bob');
  check('nobody is told to start a countdown', sent(res, 'duel-state').length === 0);

  // Both are free afterwards — a decline is not a lockout.
  const again = await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now + 1000);
  check('the pair can challenge again after a decline', again.body.ok === true);
  check('declining again after that ask still works',
    (await declineFlow(w.store, { id: bob.id }, { from: 'Alice' })).body.ok === true);
}
{
  const w = world();
  const alice = w.add('Alice');
  const bob = w.add('Bob');
  const none = await declineFlow(w.store, { id: bob.id }, { from: 'Alice' });
  check('declining a nonexistent ask is a quiet success',
    none.body.ok === true && none.sends.length === 0);
  check('declining an unknown challenger is a quiet success',
    (await declineFlow(w.store, { id: bob.id }, { from: 'Ghost' })).body.ok === true);
  check('decline needs a challenger name',
    (await declineFlow(w.store, { id: bob.id }, {})).status === 400);
  // A declined ask must not leave the challenger stuck "already duelling".
  await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  await declineFlow(w.store, { id: bob.id }, { from: 'Alice' });
  const carol = w.add('Carol');
  check('the challenger is free to challenge someone else',
    (await challengeFlow(w.store, { id: alice.id }, { name: 'Carol' }, w.now)).body.ok === true &&
    w.duels.some((d) => d.b_user === carol.id));
}

// ---- the challenger cancels mid-countdown ----------------------------------
console.log('cancel mid-countdown');
{
  const { w, alice, bob, accept } = await handshake();
  const frame = sentTo(accept, 'duel-state', alice.id).payload;
  const go = Date.parse(frame.goAt);
  const midway = go - 1500; // "2" is on both screens

  check('the countdown is genuinely mid-flight when we pull the plug',
    duelPhase(frame, midway).phase === 'countdown' && duelPhase(frame, midway).label === '2');

  const res = await cancelFlow(w.store, { id: alice.id });
  check('the challenger may cancel mid-countdown', res.body.ok === true && res.body.cancelled === true);
  check('the duel row is cancelled', w.duels[0].status === 'cancelled');
  check('BOTH sides are told, not just the target',
    !!sentTo(res, 'duel-cancelled', alice.id) && !!sentTo(res, 'duel-cancelled', bob.id));
  check('the reason names the quitter',
    sentTo(res, 'duel-cancelled', bob.id).payload.reason === 'Alice called off the duel');
  check('no duel-state trails the cancel', sent(res, 'duel-state').length === 0);
  check('the cancelled duel no longer blocks either player',
    (await w.store.liveDuelOf(alice.id)) === null && (await w.store.liveDuelOf(bob.id)) === null);
  const rematch = await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now + 5000);
  check('a rematch can be challenged immediately', rematch.body.ok === true);
}
{
  // The target's side of the same coin, and the ready state after GO.
  const { w, alice, bob, accept } = await handshake();
  const res = await cancelFlow(w.store, { id: bob.id });
  check('the target can also cancel mid-countdown', res.body.cancelled === true);
  check('the reason names the target as the quitter',
    sentTo(res, 'duel-cancelled', alice.id).payload.reason === 'Bob called off the duel');
  const frame = sentTo(accept, 'duel-state', bob.id).payload;
  check('cancelling works after GO too (the duel-ready state is cancellable)',
    duelPhase(frame, Date.parse(frame.goAt) + GO_HOLD_MS + 1).phase === 'ready' &&
    w.duels[0].status === 'cancelled');
}
{
  // Cancelling an unanswered ask folds the target's prompt.
  const w = world();
  const alice = w.add('Alice');
  const bob = w.add('Bob');
  await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  const res = await cancelFlow(w.store, { id: alice.id });
  check('cancelling a pending ask drops the row', w.duels.length === 0);
  check('the target is told so their ask toast folds',
    !!sentTo(res, 'duel-cancelled', bob.id));
  check('cancelling with nothing pending is harmless',
    (await cancelFlow(w.store, { id: alice.id })).sends.length === 0);
}

// ---- target already busy ---------------------------------------------------
console.log('target busy');
{
  const busyCase = async (opts, reason) => {
    const w = world();
    const alice = w.add('Alice');
    w.add('Bob', opts);
    const res = await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
    return res.body.ok === false && res.body.reason === reason && w.duels.length === 0;
  };
  check('a trading target is refused', await busyCase({ trading: true }, 'Bob is already trading'));
  check('a battling target is refused', await busyCase({ battling: true }, 'Bob is in a battle'));
}
{
  // Already duelling — both flavours: a live countdown and a pending ask.
  const w = world();
  const alice = w.add('Alice');
  const bob = w.add('Bob');
  const carol = w.add('Carol');
  await challengeFlow(w.store, { id: bob.id }, { name: 'Carol' }, w.now);
  await acceptFlow(w.store, { id: carol.id }, { from: 'Bob' }, w.now);
  const res = await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  check('a target already in a duel is refused',
    res.body.ok === false && res.body.reason === 'Bob is already duelling');
  check('the busy refusal creates no second duel row', w.duels.length === 1);
  check('the refusal pings nobody (no toast to the busy target)', res.sends.length === 0);
}
{
  const w = world();
  const alice = w.add('Alice');
  const bob = w.add('Bob');
  const carol = w.add('Carol');
  await challengeFlow(w.store, { id: carol.id }, { name: 'Bob' }, w.now); // Bob has a pending ask
  const res = await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  check('a target with a pending challenge is refused', res.body.ok === false);
  check('a second challenger cannot queue up on them', w.duels.length === 1);
}
{
  // The caller's own state is checked first, and phrased for them.
  const w = world();
  const alice = w.add('Alice', { trading: true });
  w.add('Bob');
  const res = await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  check('a trading challenger is refused',
    res.body.ok === false && res.body.reason === 'finish your trade first');
  const w2 = world();
  const a2 = w2.add('Alice', { battling: true });
  w2.add('Bob');
  check('a battling challenger is refused',
    (await challengeFlow(w2.store, { id: a2.id }, { name: 'Bob' }, w2.now)).body.reason ===
      'you are in a battle');
}
{
  // Busy is re-checked at ACCEPT time: the target may have started a trade
  // while the ask toast sat on their screen.
  const w = world();
  const alice = w.add('Alice');
  const bob = w.add('Bob');
  await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  w.store.isTrading = async (id) => id === alice.id; // Alice wandered into a trade
  const res = await acceptFlow(w.store, { id: bob.id }, { from: 'Alice' }, w.now + 2000);
  check('accepting a challenger who got busy is refused',
    res.body.ok === false && res.body.reason === 'Alice is already trading');
  check('the stale ask is swept on that refusal', w.duels.length === 0);
  check('no countdown starts', res.sends.length === 0);
}

// ---- target offline --------------------------------------------------------
console.log('target offline');
{
  const w = world();
  const alice = w.add('Alice');
  w.add('Bob', { present: false }); // no room_presence row at all
  const res = await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  check('a target with no presence row is offline',
    res.body.ok === false && res.body.reason === 'Bob is offline');
  check('no ask is left for an offline target', w.duels.length === 0);
  check('nothing is broadcast into the void', res.sends.length === 0);
}
{
  // A presence row older than the reaper's TTL is a dead socket, even before
  // presence-reap deletes it.
  const w = world();
  const alice = w.add('Alice');
  w.add('Bob', { lastSeen: T0 - PRESENCE_TTL_MS - 1 });
  const stale = await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  check('a stale presence row counts as offline',
    stale.body.ok === false && stale.body.reason === 'Bob is offline');

  const w2 = world();
  const a2 = w2.add('Alice');
  w2.add('Bob', { lastSeen: T0 - PRESENCE_TTL_MS + 1000 });
  check('a heartbeat inside the TTL is still online',
    (await challengeFlow(w2.store, { id: a2.id }, { name: 'Bob' }, w2.now)).body.ok === true);
}
{
  const w = world();
  const alice = w.add('Alice', { present: false });
  w.add('Bob');
  const res = await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  check('a challenger who is not in a room is refused',
    res.body.ok === false && res.body.reason === 'join a room first');
}
{
  // Offline is re-checked at accept: the challenger may have closed the tab
  // while the ask toast sat there.
  const w = world();
  const alice = w.add('Alice');
  const bob = w.add('Bob');
  await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  const gone = w.now + PRESENCE_TTL_MS + 1; // Alice stopped heartbeating
  const res = await acceptFlow(w.store, { id: bob.id }, { from: 'Alice' }, gone);
  check('accepting an offline challenger is refused',
    res.body.ok === false && res.body.reason === 'Alice is offline');
  check('the dead ask is swept', w.duels.length === 0);
  check('no countdown starts for a ghost', res.sends.length === 0);
}
{
  // And the target may have walked into another room before accepting.
  const w = world();
  const alice = w.add('Alice');
  const bob = w.add('Bob');
  await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  w.store.presenceOf = async (id) => ({
    room_id: id === bob.id ? 'plaza' : 'lobby',
    last_seen: new Date(w.now).toISOString(),
  });
  const res = await acceptFlow(w.store, { id: bob.id }, { from: 'Alice' }, w.now + 500);
  check('accepting from another room is refused',
    res.body.ok === false && res.body.reason === 'Alice is in another room');
  check('that ask is swept too', w.duels.length === 0);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall duel checks passed');
process.exit(failed ? 1 : 0);
