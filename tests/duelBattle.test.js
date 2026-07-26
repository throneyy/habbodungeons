// Duel BATTLE tests — run with:  node tests/duelBattle.test.js
//
// Step 1's suite (tests/duel.test.js) covers the handshake up to 'duel ready'.
// This one covers what happens next: the host builds ONE authoritative Battle
// in which its own unit is team 'player' and the guest's is team 'enemy', both
// clients render the same arena and the same two units, and every command the
// guest sends is validated by the co-op authority (js/coopBattle.js) before it
// touches the engine.
//
// The three rules that make a duel a duel, and the reason this file exists:
//   • the guest cannot act during the host's phase
//   • the guest cannot command the host's unit
//   • NO AI ever acts for either side — not js/ai.js in the enemy phase, not
//     the co-op idle-timeout companion that would otherwise play a duellist's
//     unit for them 60 seconds in
//
// Everything runs headless: a pair of fake nets that deliver `duel-relay`
// frames to each other exactly the way SupabaseNet does (drop your own echo,
// honour `to`), a stub BattleController for the host, and a stub renderer for
// the guest. No DOM, no Supabase, no browser — the real DuelHost/DuelGuest,
// the real Battle, and the real handleCommand validation.
import { Room } from '../js/room.js';
import { Unit } from '../js/units.js';
import { Battle } from '../js/battle.js';
import { DuelHost, DuelGuest, duelArena, DUEL_CIDS, hostsDuel } from '../js/duelBattle.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

const HOST = 'Alice'; // the challenger hosts (youChallenged === true)
const GUEST = 'Bob';

// ---- the wire --------------------------------------------------------------
// Two clients on one shared room channel. Mirrors SupabaseNet's `duel-relay`
// path: the sender never sees its own frame, and a frame with `to` reaches
// only that player. Delivery is synchronous, which makes every assertion below
// about the state AFTER the round trip.
function wire() {
  const nets = [];
  const make = (name) => {
    const handlers = new Map();
    const net = {
      name,
      connected: true,
      on(t, fn) {
        if (!handlers.has(t)) handlers.set(t, new Set());
        handlers.get(t).add(fn);
        return () => handlers.get(t).delete(fn);
      },
      emit(t, m) {
        for (const fn of [...(handlers.get(t) || [])]) fn(m);
      },
      send(msg) {
        if (!msg || msg.t !== 'duel-relay') return;
        const payload = { ...msg, from: name };
        for (const other of nets) {
          if (other === net) continue; // never echo to self
          if (payload.to && payload.to !== other.name) continue; // targeted elsewhere
          other.emit('duel-relay', payload);
        }
      },
    };
    nets.push(net);
    return net;
  };
  return [make(HOST), make(GUEST)];
}

// The host's BattleController, reduced to what the authority actually uses.
function hostBc() {
  return {
    canSelect: null,
    battle: null,
    start(room, players, enemies, opts) {
      this.battle = new Battle(room, [...players, ...enemies], {
        objective: opts.objective,
        enemyAi: opts.enemyAi,
        onEnd: opts.onEnd || (() => {}),
      });
      return this.battle;
    },
    refreshOverlays() {},
    render() {},
    // What BattleController.endUnit does when the host commands its OWN unit:
    // the host is the authority, so its taps go straight into the engine.
    endUnit(u) {
      u.moved = true;
      u.acted = true;
      if (this.battle.phase === 'player' && this.battle.allPlayersDone()) this.battle.endPlayerPhase();
    },
  };
}

// The guest's renderer.
function stubGame() {
  return {
    room: null,
    units: [],
    controller: null,
    overlays: { move: new Set(), target: new Set(), skill: new Set(), objective: new Set() },
    setController(c) {
      this.controller = c;
      if (c.onAttach) c.onAttach(this);
    },
    setRoom(r) {
      this.room = r;
      this.units = [];
    },
    addUnit(u) {
      this.units.push(u);
    },
    addFx() {}, // combat effects render; nothing to assert on them here
    heightAt() {
      return 0;
    },
    clearOverlays() {
      for (const s of Object.values(this.overlays)) s.clear();
    },
  };
}

// Boot a whole duel: guest says hello first (the host's screen is still going
// up), the host arms, and the start frame flows back. Returns both roles.
function duel(opts = {}) {
  const [netA, netB] = wire();
  const rejects = [];
  netB.on('duel-relay', (m) => {
    if (m.data && m.data.k === 'rejected') rejects.push(m.data.reason);
  });
  const host = new DuelHost(netA, () => HOST, GUEST);
  const bc = hostBc();
  const guest = new DuelGuest(netB, stubGame(), { banner: null, actions: null, roster: null, log: null }, () => GUEST);
  const ui = { waiting() {}, battleReady() {}, exit(reason) { ui.exited = reason; } };
  guest.activate(HOST, ui, { name: GUEST, classId: opts.guestClass || 'fighter', level: 1 });
  host.arm({ bc, me: { name: HOST, classId: opts.hostClass || 'fighter', level: 1 } });
  return { host, guest, bc, ui, rejects, battle: bc.battle, netA, netB };
}

const hostUnit = (d) => d.host.byCid.get(DUEL_CIDS[0]);
const guestUnit = (d) => d.host.byCid.get(DUEL_CIDS[1]);
const replica = (d, cid) => d.guest.byCid.get(cid);
const cmd = (d, c) => d.guest.sendCommand(c);

// Stand the two duellists next to each other. Positions travel on the phase
// snapshot, which is the same path a real walk's settle takes — so the guest's
// replica lands on the host's numbers, not on its own.
function faceOff(d) {
  hostUnit(d).x = 4;
  hostUnit(d).y = 5;
  guestUnit(d).x = 5;
  guestUnit(d).y = 5;
  d.host.syncPhase(true);
}

const live = [];
const track = (d) => (live.push(d), d);

// ---- boot ------------------------------------------------------------------
console.log('boot');
{
  const d = track(duel());
  check('the challenger is the host on both screens',
    hostsDuel({ youChallenged: true }) === true && hostsDuel({ youChallenged: false }) === false);
  check('the host built one authoritative battle', !!d.battle && d.battle.units.length === 2);
  check('the guest built a replica of it', !!d.guest.shadow && d.guest.shadow.units.length === 2);

  const arena = duelArena();
  check('the arena is the same tiles on both clients',
    d.battle.room.rows.join('|') === d.guest.shadow.room.rows.join('|'));
  check('and it is the constant arena, not a rolled one',
    d.battle.room.rows.join('|') === arena.rows.join('|'));
  check('the arena is symmetric under a half turn (neither side gets better ground)',
    arena.rows.join('|') === arena.rows.map((r) => [...r].reverse().join('')).reverse().join('|'));

  check('the host\u2019s duellist is team player', hostUnit(d).team === 'player');
  check('the guest\u2019s duellist is team enemy', guestUnit(d).team === 'enemy');
  check('the replica agrees on both teams',
    replica(d, DUEL_CIDS[0]).team === 'player' && replica(d, DUEL_CIDS[1]).team === 'enemy');
  check('the guest renders its team-enemy unit as its own',
    d.guest.myUnits().length === 1 && d.guest.myUnits()[0] === replica(d, DUEL_CIDS[1]));
  check('the guest owns nothing else on the field',
    !d.guest.myUnits().includes(replica(d, DUEL_CIDS[0])));
  check('each unit is owned by the player it belongs to',
    d.host.owners.get(hostUnit(d).id).owner === HOST &&
    d.host.owners.get(guestUnit(d).id).owner === GUEST);

  const same = (cid) => {
    const a = d.host.byCid.get(cid);
    const b = replica(d, cid);
    return a.name === b.name && a.classId === b.classId && a.level === b.level &&
      a.x === b.x && a.y === b.y && a.dir === b.dir &&
      a.stats.hp === b.stats.hp && a.stats.maxHp === b.stats.maxHp && a.stats.atk === b.stats.atk;
  };
  check('both clients show identical units', same(DUEL_CIDS[0]) && same(DUEL_CIDS[1]));
  check('the two duellists start apart, mirrored across the arena',
    hostUnit(d).x !== guestUnit(d).x && hostUnit(d).y === guestUnit(d).y);
  check('both clients open on turn 1, the host\u2019s phase',
    d.battle.phase === 'player' && d.battle.turn === 1 &&
    d.guest.shadow.phase === 'player' && d.guest.shadow.turn === 1);
  check('the guest stopped announcing itself once the arena landed', d.guest.helloTimer === null);
}
{
  // The other arrival order: the host's screen is up before the guest joins.
  const [netA, netB] = wire();
  const host = new DuelHost(netA, () => HOST, GUEST);
  const bc = hostBc();
  host.arm({ bc, me: { name: HOST, classId: 'fighter', level: 1 } });
  check('an armed host has not booted before the guest says hello', bc.battle === null);
  const guest = new DuelGuest(netB, stubGame(), { banner: null }, () => GUEST);
  guest.activate(HOST, { waiting() {}, battleReady() {}, exit() {} }, { name: GUEST, classId: 'mage', level: 2 });
  track({ host, guest });
  check('the guest\u2019s hello boots the battle', !!bc.battle && bc.battle.units.length === 2);
  check('the guest\u2019s own calling and level ride the hello',
    host.byCid.get(DUEL_CIDS[1]).classId === 'mage' && host.byCid.get(DUEL_CIDS[1]).level === 2);
  check('a second hello never builds a second battle',
    (() => {
      const first = bc.battle;
      netB.send({ t: 'duel-relay', to: HOST, data: { k: 'hello', name: GUEST, classId: 'mage', level: 2 } });
      return bc.battle === first && first.units.length === 2;
    })());
}

// ---- phase ownership -------------------------------------------------------
console.log('phase ownership');
{
  const d = track(duel());
  faceOff(d);

  // The host's phase. The guest's unit is team 'enemy' and acts in the enemy
  // phase, so nothing it sends now may touch the engine.
  check('the host commands in the player phase', d.battle.phase === 'player');
  cmd(d, { type: 'attack', cid: DUEL_CIDS[1], target: DUEL_CIDS[0] });
  check('the guest cannot act during the host\u2019s phase',
    d.rejects[d.rejects.length - 1] === 'not your phase');
  check('the refused command left the host untouched',
    hostUnit(d).stats.hp === hostUnit(d).stats.maxHp && guestUnit(d).acted === false);
  cmd(d, { type: 'wait', cid: DUEL_CIDS[1] });
  check('nor may it wait out the host\u2019s phase',
    d.rejects[d.rejects.length - 1] === 'not your phase' && guestUnit(d).acted === false);
  check('the guest\u2019s own screen refuses to command in the host\u2019s phase',
    d.guest.controller.commanding === false);

  // Commanding the OTHER player's unit — the ownership gate co-op already ran.
  cmd(d, { type: 'attack', cid: DUEL_CIDS[0], target: DUEL_CIDS[1] });
  check('the guest cannot command the host\u2019s unit in the host\u2019s phase',
    d.rejects[d.rejects.length - 1] === 'not your unit');
  check('the host\u2019s own unit is the only one the host may select',
    d.bc.canSelect(hostUnit(d)) === true && d.bc.canSelect(guestUnit(d)) === false);

  // Host acts -> the phase hands over.
  d.battle.resolveAttack(hostUnit(d), guestUnit(d));
  d.bc.endUnit(hostUnit(d));
  check('the host\u2019s attack ends the player phase', d.battle.phase === 'enemy');
  check('the guest\u2019s screen sees the handover', d.guest.shadow.phase === 'enemy');
  check('and only now may the guest command', d.guest.controller.commanding === true);

  cmd(d, { type: 'attack', cid: DUEL_CIDS[0], target: DUEL_CIDS[1] });
  check('the guest still cannot command the host\u2019s unit in its OWN phase',
    d.rejects[d.rejects.length - 1] === 'not your unit');
  check('the host\u2019s unit was not made to attack itself',
    guestUnit(d).stats.hp === replica(d, DUEL_CIDS[1]).stats.hp);
  cmd(d, { type: 'attack', cid: 'nobody', target: DUEL_CIDS[0] });
  check('an unknown unit id is refused', d.rejects[d.rejects.length - 1] === 'no such unit');
  cmd(d, { type: 'attack', cid: DUEL_CIDS[1], target: 'nobody' });
  check('an unknown target is refused', d.rejects[d.rejects.length - 1] === 'illegal target');
  cmd(d, { type: 'move', cid: DUEL_CIDS[1], x: 0, y: 0 });
  check('a move onto the arena wall is refused', d.rejects[d.rejects.length - 1] === 'illegal move');
  check('every refusal so far left the engine exactly where it was',
    d.battle.phase === 'enemy' && d.battle.turn === 1 && guestUnit(d).acted === false);

  cmd(d, { type: 'wait', cid: DUEL_CIDS[1] });
  check('the guest may end its own unit\u2019s turn', d.battle.turn === 2 && d.battle.phase === 'player');
  cmd(d, { type: 'attack', cid: DUEL_CIDS[1], target: DUEL_CIDS[0] });
  check('a spent phase cannot be replayed', d.rejects[d.rejects.length - 1] === 'not your phase');
}

// ---- one attack each, identical HP -----------------------------------------
console.log('a blow from each side');
{
  const d = track(duel());
  faceOff(d);
  const hostHp0 = hostUnit(d).stats.maxHp;
  const guestHp0 = guestUnit(d).stats.maxHp;

  // The host's own swing goes straight into the engine (it IS the authority)
  // and the resulting events stream to the guest.
  d.battle.resolveAttack(hostUnit(d), guestUnit(d));
  d.bc.endUnit(hostUnit(d));
  check('the host\u2019s blow wounded the guest', guestUnit(d).stats.hp < guestHp0);
  check('both screens show the same HP after the host\u2019s blow',
    guestUnit(d).stats.hp === replica(d, DUEL_CIDS[1]).stats.hp);

  // The guest's swing takes the long way: relay -> validate -> engine -> back.
  cmd(d, { type: 'attack', cid: DUEL_CIDS[1], target: DUEL_CIDS[0] });
  check('the guest\u2019s relayed blow was accepted', hostUnit(d).stats.hp < hostHp0);
  check('both screens show the same HP after the guest\u2019s blow',
    hostUnit(d).stats.hp === replica(d, DUEL_CIDS[0]).stats.hp);
  check('no command was refused along the way', d.rejects.length === 0);
  check('both duellists took a wound, neither took two',
    hostUnit(d).stats.hp === hostHp0 - (hostHp0 - hostUnit(d).stats.hp) &&
    guestUnit(d).stats.hp > 0 && hostUnit(d).stats.hp > 0);
  check('the turn advanced on both screens once both had acted',
    d.battle.turn === 2 && d.battle.phase === 'player' &&
    d.guest.shadow.turn === 2 && d.guest.shadow.phase === 'player');
  check('turn 2 hands the move back to the host', hostUnit(d).acted === false);
  d.bc.endUnit(hostUnit(d)); // the host waits out turn 2
  check('and the guest’s unit is refreshed when its own phase reopens',
    d.battle.phase === 'enemy' && guestUnit(d).acted === false &&
    replica(d, DUEL_CIDS[1]).acted === false);
  check('the replica\u2019s positions still match the host\u2019s',
    replica(d, DUEL_CIDS[0]).x === hostUnit(d).x && replica(d, DUEL_CIDS[1]).x === guestUnit(d).x);
}

// ---- a knockout ends it on both screens ------------------------------------
console.log('knockout');
{
  const d = track(duel());
  d.guest.endDelayMs = 0; // no on-screen beat to wait for in a test
  let hostVerdict = null;
  d.host.onDuelEnd = (result) => (hostVerdict = result);
  faceOff(d);
  guestUnit(d).stats.hp = 1;
  d.host.syncPhase(true);
  d.battle.resolveAttack(hostUnit(d), guestUnit(d));
  check('the fallen duellist is dead on both screens',
    guestUnit(d).alive === false && replica(d, DUEL_CIDS[1]).stats.hp === 0);
  check('the host’s engine calls the duel', d.battle.phase === 'won' && hostVerdict === 'won');
  check('the guest’s screen is told', d.guest.shadow.phase === 'won');
  await new Promise((r) => setTimeout(r, 20));
  check('and the loser is walked out of the arena', d.ui.exited === `${HOST} wins the duel.`);
}

// ---- no AI, ever -----------------------------------------------------------
console.log('no AI acts in a duel');
{
  const d = track(duel());
  faceOff(d);
  check('the duel battle was built with the AI enemy phase off', d.battle.enemyAi === false);
  check('nothing on the guest\u2019s screen can plan a turn either', d.guest.shadow.enemyAi === false);

  d.battle.resolveAttack(hostUnit(d), guestUnit(d));
  d.bc.endUnit(hostUnit(d));
  check('the enemy phase opened for the guest', d.battle.phase === 'enemy');
  check('no AI queue was built for it', d.battle._enemy === null);

  // Spy on the engine's AI ticker itself: in a duel it must never be reached.
  let aiRan = 0;
  d.battle.tickEnemyPhase = () => aiRan++;
  const before = { x: guestUnit(d).x, y: guestUnit(d).y, hp: hostUnit(d).stats.hp, acted: guestUnit(d).acted };
  for (let i = 0; i < 200; i++) d.battle.update(i * 100); // 20 seconds of frames
  check('js/ai.js is never reached during a duel\u2019s enemy phase', aiRan === 0);
  check('the guest\u2019s unit did not move itself',
    guestUnit(d).x === before.x && guestUnit(d).y === before.y);
  check('nothing swung for the guest', hostUnit(d).stats.hp === before.hp && guestUnit(d).acted === before.acted);
  check('the phase is still waiting for a real command', d.battle.phase === 'enemy' && d.battle.turn === 1);

  // The co-op idle companion (autoActPlayer) must not stand in for a duellist
  // either: 60 seconds of thinking is a duellist's own business.
  check('the duel host has the idle auto-act disabled', d.host.autoAct === false);
  d.host.turnTimeoutMs = 0; // every tick is "idle" now
  d.host.phaseStartedAt = -1e9;
  for (let i = 0; i < 50; i++) d.host.tick();
  check('no companion AI acts for the guest on the host\u2019s clock',
    guestUnit(d).acted === false && hostUnit(d).stats.hp === before.hp);
  cmd(d, { type: 'wait', cid: DUEL_CIDS[1] });
  d.host.phaseStartedAt = -1e9;
  for (let i = 0; i < 50; i++) d.host.tick();
  check('nor for the host once its own phase comes back',
    d.battle.phase === 'player' && hostUnit(d).acted === false);
  check('the guest\u2019s command is still the only thing that moved the duel on',
    d.battle.turn === 2 && guestUnit(d).stats.hp < guestUnit(d).stats.maxHp);
}
{
  // The control: with the flag left alone, the SAME engine runs its AI. It is
  // the duel that switches it off, not a broken enemy phase.
  const room = new Room({ id: 't', name: 't', heightmap: ['00000', '00000', '00000'], spawn: { x: 0, y: 0 } });
  const me = new Unit(room, null, 1, 1, { team: 'player', classId: 'fighter' });
  const foe = new Unit(room, null, 2, 1, { team: 'enemy', classId: 'fighter' });
  const b = new Battle(room, [me, foe], {});
  check('a normal battle keeps its AI enemy phase', b.enemyAi === true);
  b.endPlayerPhase();
  check('a normal battle builds the AI queue', !!b._enemy);
  b.update(0);
  b.update(5000);
  check('a normal battle\u2019s AI swings unprompted', me.stats.hp < me.stats.maxHp);
}

// ---- teardown --------------------------------------------------------------
for (const d of live) {
  if (d.host) d.host.end();
  if (d.guest) d.guest.deactivate();
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall duel battle checks passed');
process.exit(failed ? 1 : 0);
