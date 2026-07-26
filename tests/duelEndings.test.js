// How a duel that is actually being FOUGHT comes to an end —
// run with:  node tests/duelEndings.test.js
//
// tests/duel.test.js covers the handshake (challenge, accept, decline, cancel):
// everything up to two players standing ready. This covers the other end, where
// the fight stops for a reason other than a knockout:
//
//   FORFEIT       either duellist yields
//   ABANDONMENT   the other one closed the tab, dropped their connection, or
//                 walked out of the room mid-fight
//
// Both settle through the same three steps, and each is asserted here:
//   1. the row reaches a TERMINAL status ('done', not 'cancelled' — a decided
//      fight is a different event from backing out of a handshake), so neither
//      player is left looking "already duelling"
//   2. each side is told from ITS OWN point of view (`youWon`), because one
//      shared payload would make one of the two screens lie
//   3. both players are free to duel again immediately
//
// The rule for "gone" is deliberately NOT a new one. presenceFresh +
// same-room is exactly what challengeFlow and acceptFlow already apply, so a
// closed tab, a dead socket and a walk-out are one definition with three
// triggers rather than three competing definitions.
//
// Same fake world as duel.test.js: the DuelStore port over plain objects, so
// the real flows run in Node.
import {
  challengeFlow,
  acceptFlow,
  forfeitFlow,
  claimFlow,
} from '../supabase/functions/_shared/duelFlow.ts';
import { PRESENCE_TTL_MS } from '../supabase/functions/_shared/duel.ts';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

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

const sentTo = (res, event, userId) =>
  res.sends.find((s) => s.event === event && s.userId === userId) || null;

/** Two players, mid-fight. */
async function fighting() {
  const w = world();
  const alice = w.add('Alice');
  const bob = w.add('Bob');
  await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  await acceptFlow(w.store, { id: bob.id }, { from: 'Alice' }, w.now);
  return { w, alice, bob };
}

// ---- forfeit ---------------------------------------------------------------
console.log('forfeit');
{
  const { w, alice, bob } = await fighting();
  const res = await forfeitFlow(w.store, { id: bob.id });
  check('forfeiting succeeds', res.status === 200 && res.body.ok === true);
  check('...and reports the duel ended', res.body.ended === true);
  check('the winner is the OTHER player', res.body.winner === 'Alice');
  check('the row reaches a terminal status', w.liveRow() === null);
  check('...specifically done, not cancelled \u2014 this fight was decided',
    w.duels[0].status === 'done');

  const toA = sentTo(res, 'duel-ended', alice.id);
  const toB = sentTo(res, 'duel-ended', bob.id);
  check('both sides are told', !!toA && !!toB);
  check('each is told from its OWN point of view',
    toA.payload.youWon === true && toB.payload.youWon === false);
  check('both agree who won and who lost',
    toA.payload.winner === 'Alice' && toB.payload.winner === 'Alice' &&
    toA.payload.loser === 'Bob' && toB.payload.loser === 'Bob');
  check('the reason names the forfeiter', /Bob forfeited/.test(toA.payload.reason));
  check('the payload identifies which duel', toA.payload.duel === w.duels[0].id);
}
{
  // The point of a terminal status: neither player stays "already duelling".
  const { w, alice, bob } = await fighting();
  await forfeitFlow(w.store, { id: alice.id });
  check('the loser can challenge again at once',
    (await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now)).body.ok === true);
  const w2 = await fighting();
  await forfeitFlow(w2.w.store, { id: w2.alice.id });
  check('and so can the winner',
    (await challengeFlow(w2.w.store, { id: w2.bob.id }, { name: 'Alice' }, w2.w.now)).body.ok === true);
}
{
  // A bystander cannot forfeit somebody else's duel \u2014 not because of a check
  // written for it, but because the duel is found from the CALLER's own id.
  // There is no duel id in the request to point somewhere else.
  const { w } = await fighting();
  const mallory = w.add('Mallory');
  const res = await forfeitFlow(w.store, { id: mallory.id });
  check('a bystander forfeiting is a no-op', res.body.ok === true && res.body.ended === false);
  check('...it does not end anyone else\u2019s duel', w.liveRow() !== null);
  check('...and tells nobody', res.sends.length === 0);
  check('the fight is still live', w.liveRow().status === 'countdown');
}
{
  const w = world();
  const solo = w.add('Solo');
  const res = await forfeitFlow(w.store, { id: solo.id });
  check('forfeiting with no duel is a no-op, not an error',
    res.status === 200 && res.body.ok === true && res.body.ended === false);
}

// ---- abandonment -----------------------------------------------------------
console.log('abandonment');
{
  // Closed tab / dropped connection: the heartbeat stops and the row goes stale.
  const { w, alice, bob } = await fighting();

  const early = await claimFlow(w.store, { id: alice.id }, w.now);
  check('claiming while they are still here is REFUSED', early.body.ok === false);
  check('...and says why', /Bob is still here/.test(early.body.reason));
  check('...and settles nothing', w.liveRow() !== null);

  // The boundary matters: this is the same constant presence-reap uses.
  const edge = await claimFlow(w.store, { id: alice.id }, w.now + PRESENCE_TTL_MS);
  check('exactly at the TTL they still count as present', edge.body.ok === false);

  const res = await claimFlow(w.store, { id: alice.id }, w.now + PRESENCE_TTL_MS + 1);
  check('one ms past the TTL the win is awarded',
    res.body.ok === true && res.body.ended === true);
  check('to the player still standing', res.body.winner === 'Alice');
  check('the row is terminal', w.liveRow() === null && w.duels[0].status === 'done');

  const toA = sentTo(res, 'duel-ended', alice.id);
  const toB = sentTo(res, 'duel-ended', bob.id);
  check('both sides are told (the absent one, for when they reload)', !!toA && !!toB);
  check('each from its own side', toA.payload.youWon === true && toB.payload.youWon === false);
  check('the reason says disconnected', /Bob disconnected/.test(toA.payload.reason));
}
{
  // Presence row gone entirely (the reaper already swept it).
  const { w, alice } = await fighting();
  w.add('ignored');
  const bob = [...w.duels][0].b_user;
  const res0 = await claimFlow(w.store, { id: alice.id }, w.now);
  check('...still refused while present', res0.body.ok === false);
  // now vanish them
  const p = w.store.presenceOf;
  w.store.presenceOf = async (id) => (id === bob ? null : p(id));
  const res = await claimFlow(w.store, { id: alice.id }, w.now);
  check('a missing presence row counts as gone', res.body.ended === true);
  check('...and awards the win', res.body.winner === 'Alice');
  check('...reported as a disconnect',
    /disconnected/.test(sentTo(res, 'duel-ended', alice.id).payload.reason));
}
{
  // Walked out of the room mid-fight: the heartbeat is FINE, the room is wrong.
  // This is the case a pure "are they online?" rule would miss entirely.
  const { w, alice, bob } = await fighting();
  bob.room = 'forest';
  bob.lastSeen = w.now; // very much online, just not here

  const res = await claimFlow(w.store, { id: alice.id }, w.now);
  check('leaving the room mid-duel forfeits it', res.body.ended === true);
  check('the win goes to the player still in the room', res.body.winner === 'Alice');
  check('...and the reason distinguishes it from a disconnect',
    /Bob left the room/.test(sentTo(res, 'duel-ended', alice.id).payload.reason));
  check('the row is terminal', w.duels[0].status === 'done');
}
{
  // The abandoner cannot claim their OWN abandonment: the flow reads the
  // caller's OPPONENT's presence, never the caller's. This is what stops a
  // losing duellist stealing a win by asserting a disconnect.
  const { w, bob } = await fighting();
  bob.present = false;
  const res = await claimFlow(w.store, { id: bob.id }, w.now);
  check('a vanished player claiming gets nothing (their foe is present)',
    res.body.ok === false && /Alice is still here/.test(res.body.reason));
  check('...and the duel is untouched', w.liveRow() !== null);
}
{
  // Both gone. Degenerate, but it must still settle rather than leaving a row
  // live forever and both players permanently unable to duel.
  const { w, alice, bob } = await fighting();
  alice.present = false;
  bob.present = false;
  const res = await claimFlow(w.store, { id: alice.id }, w.now);
  check('a duel with nobody left still settles', res.body.ended === true);
  check('...and frees both players', w.liveRow() === null);
}
{
  const w = world();
  const solo = w.add('Solo');
  const res = await claimFlow(w.store, { id: solo.id }, w.now);
  check('claiming with no duel is a no-op', res.body.ok === true && res.body.ended === false);
}
{
  // An unanswered ASK is not a fight. Neither ending applies to it \u2014 that is
  // cancel/decline's job, and countdownOf is what keeps them apart.
  const w = world();
  const alice = w.add('Alice');
  const bob = w.add('Bob');
  await challengeFlow(w.store, { id: alice.id }, { name: 'Bob' }, w.now);
  check('forfeiting an unanswered ask does nothing',
    (await forfeitFlow(w.store, { id: alice.id })).body.ended === false);
  bob.present = false;
  check('nor can it be claimed as an abandonment',
    (await claimFlow(w.store, { id: alice.id }, w.now)).body.ended === false);
  check('the ask is still standing', w.liveRow().status === 'asked');
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall duel ending checks passed');
process.exit(failed ? 1 : 0);
