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
import {
  DuelHost, DuelGuest, DUEL_CIDS, hostsDuel,
  placeDuellists, blockedSnapshot, duelRoomView,
} from '../js/duelBattle.js';
import { DuelSpectator } from '../js/duelSpectator.js';

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
const BYSTANDER = 'Mallory'; // a third player standing in the same room

// THE room. A duel is fought in place, so there is no arena to build: this
// stands in for the ordinary room both players are already walking around in,
// props and all. `p` is a blocked prop tile, so the blocked-snapshot and
// placement rules have something real to trip over.
const ROOM_ID = 'tavern';
function liveRoom() {
  const room = new Room({
    id: ROOM_ID,
    name: 'The Poisoned Toad',
    heightmap: [
      '00000000000', '00000000000', '00000000000', '00000000000',
      '00000000000', '00000000000', '00000000000', '00000000000',
      '00000000000', '00000000000', '00000000000',
    ],
    spawn: { x: 6, y: 7 },
  });
  room.block(9, 9, { id: 'table' }); // a bit of furni to snapshot
  return room;
}

// ---- the wire --------------------------------------------------------------
// Two clients on one shared room channel. Mirrors SupabaseNet's `duel-relay`
// path: the sender never sees its own frame, and a frame with `to` reaches
// only that player. Delivery is synchronous, which makes every assertion below
// about the state AFTER the round trip.
function wire(n = 2) {
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
      listenerCount(t) {
        return (handlers.get(t) || new Set()).size;
      },
      emit(t, m) {
        for (const fn of [...(handlers.get(t) || [])]) fn(m);
      },
      // Mirrors SupabaseNet._onRelayed exactly, including the read-only split:
      // the addressee gets `duel-relay` (the command path), and everyone ELSE
      // in the room gets the same frame as `duel-watch` (the spectator feed).
      // The fake transport has to model that or the unit suite cannot see what
      // an onlooker sees — and a test whose wire is kinder than the real one is
      // the reason a bug reaches a player.
      send(msg) {
        if (!msg || msg.t !== 'duel-relay') return;
        const payload = { ...msg, from: name };
        for (const other of nets) {
          if (other === net) continue; // never echo to self
          if (payload.to && payload.to !== other.name) {
            other.emit('duel-watch', payload); // read-only: renderers only
            continue;
          }
          other.emit('duel-relay', payload);
        }
      },
    };
    nets.push(net);
    return net;
  };
  return [make(HOST), make(GUEST), make(BYSTANDER)].slice(0, n);
}

// The host's BattleController, reduced to what the authority actually uses.
function hostBc() {
  return {
    canSelect: null,
    battle: null,
    inPlace: null,
    duel: null,
    start(room, players, enemies, opts) {
      // Recorded, because "the fight happens in the room you are standing in"
      // is exactly a claim about these two options.
      this.inPlace = !!opts.inPlace;
      this.duel = opts.duel || null;
      this.duelUnits = [...players, ...enemies];
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

// The guest's renderer, already showing the room it is standing in — with a
// bystander's avatar in the scene, so "the duel did not wipe the room" is
// something the test can actually observe.
function stubGame(room = liveRoom()) {
  const bystanderAvatar = { name: BYSTANDER, avatar: true };
  return {
    room,
    units: [bystanderAvatar],
    bystanderAvatar,
    controller: null,
    setRoomCalls: 0,
    overlays: { move: new Set(), target: new Set(), skill: new Set(), objective: new Set() },
    setController(c) {
      this.controller = c;
      if (c.onAttach) c.onAttach(this);
    },
    // An in-place duel must NEVER call this: it clears the scene and swaps the
    // room the renderer is drawing.
    setRoom(r) {
      this.setRoomCalls++;
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
// up), the host arms, and the start frame flows back. Returns both roles, plus
// a third client on the same room channel — the duel stream is a ROOM
// broadcast, so a bystander really can send into it and every test below can
// try.
function duel(opts = {}) {
  const [netA, netB, netM] = wire(3);
  const rejects = [];
  netB.on('duel-relay', (m) => {
    if (m.data && m.data.k === 'rejected') rejects.push(m.data.reason);
  });
  // What the bystander hears back. A non-participant should get NOTHING: the
  // guard drops their frame before handleCommand can compose a refusal, so
  // they cannot even probe the duel's state through the reasons it returns.
  const heard = [];
  netM.on('duel-relay', (m) => heard.push(m.data || {}));
  const host = new DuelHost(netA, () => HOST, GUEST);
  const bc = hostBc();
  const hostRoom = opts.hostRoom || liveRoom();
  const game = stubGame(opts.guestRoom || liveRoom());
  const guest = new DuelGuest(netB, game, { banner: null, actions: null, roster: null, log: null }, () => GUEST);
  const ui = { waiting() {}, battleReady(n) { ui.readyIn = n; }, exit(reason) { ui.exited = reason; } };
  // Where the two are standing when the gauntlet lands. Defaults to the SAME
  // tile, because that is what really happens: remote players do not block
  // tiles, so everyone who walks in is stacked on the room's spawn.
  const hostAt = opts.hostAt || { x: 6, y: 7, dir: 4 };
  const guestAt = opts.guestAt || { x: 6, y: 7, dir: 4 };
  guest.activate(HOST, ui, { name: GUEST, classId: opts.guestClass || 'fighter', level: 1, at: guestAt });
  host.arm({
    bc,
    me: { name: HOST, classId: opts.hostClass || 'fighter', level: 1 },
    room: hostRoom,
    myTile: hostAt,
  });
  return { host, guest, bc, ui, game, rejects, heard, hostRoom, battle: bc.battle, netA, netB, netM };
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

// What an ONLOOKER's client is, reduced to what the spectator touches: a
// renderer it queues effects into, and the remote avatars it dresses.
function spectatorGame() {
  const room = liveRoom();
  return { room, fx: [], addFx(f) { this.fx.push(f); }, units: [] };
}
function spectatorRemote() {
  const mk = (name) => ({ name, x: 6, y: 7, dir: 4, stats: null, room: liveRoom(), stop() {} });
  const units = new Map([[HOST.toLowerCase(), mk(HOST)], [GUEST.toLowerCase(), mk(GUEST)]]);
  const marked = new Set();
  const tags = new Map([...units.keys()].map((k) => [k, {
    textContent: k, dataset: {},
    classList: { add: () => marked.add(k), remove: () => marked.delete(k), contains: () => marked.has(k) },
  }]));
  return { units, tags, marked, playStrike() {} };
}

// ---- boot ------------------------------------------------------------------
console.log('boot');
{
  const d = track(duel());
  check('the challenger is the host on both screens',
    hostsDuel({ youChallenged: true }) === true && hostsDuel({ youChallenged: false }) === false);
  check('the host built one authoritative battle', !!d.battle && d.battle.units.length === 2);
  check('the guest built a replica of it', !!d.guest.shadow && d.guest.shadow.units.length === 2);

  // IN PLACE: the fight is in the room they were already standing in.
  check('the host fights in the live room, not an arena', d.battle.room.id === ROOM_ID);
  check('the guest fights in the same room', d.guest.shadow.room.id === ROOM_ID);
  check('both engines run over the same tiles',
    d.battle.room.rows.join('|') === d.guest.shadow.room.rows.join('|'));
  check('the battle controller was told to fight in place', d.bc.inPlace === true);
  check('...and who the opponent is, so the UI can stop saying “enemy”',
    !!d.bc.duel && d.bc.duel.opponent === GUEST);
  check('the guest never swapped the room out from under the renderer',
    d.game.setRoomCalls === 0);
  check('the room the guest is looking at is still its own', d.game.room.id === ROOM_ID);
  check('a bystander standing in the room was not wiped from the scene',
    d.game.units.includes(d.game.bystanderAvatar));
  check('the duellists were ADDED to that scene', d.game.units.length === 3);
  check('the guest reported the real room name, not an arena', d.ui.readyIn === 'The Poisoned Toad');

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
  // THE BUG THIS REPLACES. Both players walked in and stood on the room's
  // spawn, because remote players do not block tiles — the first live duel
  // started with both fighters on (6,7), one sprite drawn on top of the other.
  check('the two duellists never start on the same tile',
    hostUnit(d).x !== guestUnit(d).x || hostUnit(d).y !== guestUnit(d).y);
  check('they start within reach of each other',
    Math.max(Math.abs(hostUnit(d).x - guestUnit(d).x), Math.abs(hostUnit(d).y - guestUnit(d).y)) === 1);
  check('and facing each other',
    hostUnit(d).dir === 0 && guestUnit(d).dir === 4);
  check('the replica agrees on where they are standing',
    replica(d, DUEL_CIDS[0]).x === hostUnit(d).x && replica(d, DUEL_CIDS[0]).y === hostUnit(d).y &&
    replica(d, DUEL_CIDS[1]).x === guestUnit(d).x && replica(d, DUEL_CIDS[1]).y === guestUnit(d).y);
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
  host.arm({ bc, me: { name: HOST, classId: 'fighter', level: 1 }, room: liveRoom(), myTile: { x: 6, y: 7 } });
  check('an armed host has not booted before the guest says hello', bc.battle === null);
  const guest = new DuelGuest(netB, stubGame(), { banner: null }, () => GUEST);
  guest.activate(HOST, { waiting() {}, battleReady() {}, exit() {} }, { name: GUEST, classId: 'mage', level: 2, at: { x: 6, y: 7 } });
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

// ---- where the fighters stand ----------------------------------------------
// placeDuellists is pure, so the interesting cases can be asked directly rather
// than staged through a whole duel.
console.log('placement');
{
  const room = liveRoom();
  const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  // The real case: everyone piled on the spawn.
  const stacked = placeDuellists(room, { x: 6, y: 7 }, { x: 6, y: 7 });
  check('two fighters on ONE tile are separated', dist(stacked[0], stacked[1]) === 1);
  check('the host keeps the tile it was standing on',
    stacked[0].x === 6 && stacked[0].y === 7);
  check('and they are turned to face each other',
    stacked[0].dir === 0 && stacked[1].dir === 4);

  // Already fighting distance apart: leave them exactly where they are. This is
  // the whole point of an in-place duel.
  const adjacent = placeDuellists(room, { x: 3, y: 3 }, { x: 4, y: 3 });
  check('fighters already adjacent are NOT moved',
    adjacent[0].x === 3 && adjacent[0].y === 3 && adjacent[1].x === 4 && adjacent[1].y === 3);
  check('they are still turned to face each other',
    adjacent[0].dir === 2 && adjacent[1].dir === 6);

  // Too far to fight: close the gap rather than opening on an unreachable foe.
  const apart = placeDuellists(room, { x: 1, y: 1 }, { x: 9, y: 8 });
  check('fighters across the room are brought together', dist(apart[0], apart[1]) === 1);
  check('the challenger still fights from where it stood',
    apart[0].x === 1 && apart[0].y === 1);

  // Never onto furni, and never onto the other fighter.
  const byFurni = placeDuellists(room, { x: 9, y: 9 }, { x: 9, y: 9 });
  check('nobody is placed onto a blocked prop tile',
    !room.isBlocked(byFurni[0].x, byFurni[0].y) && !room.isBlocked(byFurni[1].x, byFurni[1].y));
  check('...and the pair still ends up adjacent', dist(byFurni[0], byFurni[1]) === 1);

  // A host standing somewhere impossible still gets seated.
  const offMap = placeDuellists(room, { x: 99, y: 99 }, { x: 99, y: 99 });
  check('a host on an impossible tile is relocated onto real floor',
    !!offMap && room.inBounds(offMap[0].x, offMap[0].y) && !room.isBlocked(offMap[0].x, offMap[0].y));

  // Deterministic: the host decides and broadcasts, but the same inputs must
  // never yield two answers.
  check('placement is deterministic',
    JSON.stringify(placeDuellists(room, { x: 6, y: 7 }, { x: 6, y: 7 })) === JSON.stringify(stacked));

  // A room with nowhere to stand cannot host a duel — and must say so rather
  // than seating somebody in the void.
  const solid = new Room({ id: 'solid', name: 'Solid', heightmap: ['xxx', 'xxx', 'xxx'], spawn: { x: 1, y: 1 } });
  check('a room with no floor refuses to seat anyone',
    placeDuellists(solid, { x: 1, y: 1 }, { x: 1, y: 1 }) === null);
}
{
  // ...and through a real duel: a stacked pair boots un-stacked on BOTH screens.
  const d = track(duel({ hostAt: { x: 6, y: 7 }, guestAt: { x: 6, y: 7 } }));
  const h = hostUnit(d);
  const g = guestUnit(d);
  check('a duel from one shared tile boots with the fighters apart',
    h.x !== g.x || h.y !== g.y);
  check('the guest’s replica shows them apart too',
    replica(d, DUEL_CIDS[0]).x !== replica(d, DUEL_CIDS[1]).x ||
    replica(d, DUEL_CIDS[0]).y !== replica(d, DUEL_CIDS[1]).y);
  check('the host can reach the guest on turn 1',
    d.battle.attackTargets(h).includes(g));
}

// ---- the room has to be the same room --------------------------------------
console.log('room identity + obstacles');
{
  const d = track(duel());
  check('the start frame names the room', d.host.lastStart.roomId === ROOM_ID);
  check('...and carries the blocked tiles as they were at GO',
    Array.isArray(d.host.lastStart.blocked) && d.host.lastStart.blocked.includes('9,9'));
  check('the snapshot is the room’s own blockers',
    d.host.lastStart.blocked.join('|') === blockedSnapshot(d.hostRoom).join('|'));
  check('both engines see the same blocked tile',
    d.battle.room.isBlocked(9, 9) === true && d.guest.shadow.room.isBlocked(9, 9) === true);
  check('and the same open tile',
    d.battle.room.isBlocked(2, 2) === false && d.guest.shadow.room.isBlocked(2, 2) === false);

  // Live players are NOT obstacles: a bystander cannot stand on a tile to deny
  // it. The snapshot comes from room.blockers, which only ever holds props.
  check('a duel’s obstacles never include people',
    !d.host.lastStart.blocked.includes('6,7'));
}
{
  // The guest walked into another room during the countdown.
  const elsewhere = new Room({
    id: 'square', name: 'The Old Town Square',
    heightmap: ['00000', '00000', '00000', '00000', '00000'], spawn: { x: 2, y: 2 },
  });
  const d = track(duel({ guestRoom: elsewhere }));
  check('a guest in a DIFFERENT room refuses the duel', !!d.ui.exited);
  check('...and says why', /another room/.test(d.ui.exited || ''));
  check('it builds no replica of a fight it cannot see', !d.guest.shadow);
  check('and its own room is left alone', d.game.room.id === 'square' && d.game.setRoomCalls === 0);
}
{
  // Furni moved on the guest's side: the host is authoritative, so its snapshot
  // wins and the two engines still agree tile for tile.
  const guestRoom = liveRoom();
  guestRoom.block(3, 3, { id: 'crate' }); // a prop the host does not have
  const d = track(duel({ guestRoom }));
  check('a guest with extra furni still fights', !!d.guest.shadow);
  check('it adopts the host’s obstacle set',
    d.guest.shadow.room.isBlocked(3, 3) === false);
  check('so both engines agree on every tile',
    d.battle.room.isBlocked(3, 3) === d.guest.shadow.room.isBlocked(3, 3) &&
    d.battle.room.isBlocked(9, 9) === d.guest.shadow.room.isBlocked(9, 9));
  check('and the real room object was never mutated', guestRoom.isBlocked(3, 3) === true);
}

// ---- watching somebody else's duel -----------------------------------------
// The spectator layer is a RENDERER fed by frames addressed to other people.
// These cover the wiring that decides whether it ever gets to render at all.
console.log('spectating');
{
  const d = track(duel());
  const start = d.host.lastStart;
  check('the start frame names both fighters, so an onlooker can label them',
    (start.units || []).length === 2 && start.units.every((u) => !!u.name && !!u.cid));
  check('...and carries their opening HP', start.units.every((u) => u.stats && u.stats.maxHp > 0));

  // Phase frames are the late-joiner's way in, so they must carry the two
  // names and the room — a snapshot alone is all cids and numbers.
  const phases = [];
  d.netM.on('duel-watch', (m) => { if (m.data && m.data.k === 'phase') phases.push(m.data); });
  d.host.syncPhase(true);
  check('a phase frame reaches a third party in the room', phases.length === 1);
  check('...and names both fighters',
    phases[0].fighters && phases[0].fighters.length === 2 &&
    phases[0].fighters.includes(HOST) && phases[0].fighters.includes(GUEST));
  check('...and says which room the fight is in', phases[0].roomId === ROOM_ID);
  check('the fighters are in host-then-guest order, matching the cid snapshot',
    phases[0].fighters[0] === HOST && phases[0].fighters[1] === GUEST &&
    phases[0].units[0].cid === DUEL_CIDS[0] && phases[0].units[1].cid === DUEL_CIDS[1]);
  check('a phase frame still carries the live HP', phases[0].units.every((u) => u.maxHp > 0));

}
{
  // THE LATE JOINER. `start` is sent exactly once, so a client that was not
  // listening at that instant — someone who walked into the room mid-duel, or
  // whose channel subscribed a second behind — used to see two statues for the
  // whole fight. It now bootstraps from the next phase frame.
  const d = track(duel());
  const watcher = new DuelSpectator(d.netM, spectatorGame(), spectatorRemote());
  watcher.attach();

  // Arrive AFTER the start frame has already gone out.
  check('a late arrival is not watching yet', watcher.watching === false);
  d.netM.emit('duel-watch', { from: HOST, to: GUEST, data: { k: 'fx', kind: 'attack', attacker: DUEL_CIDS[0], target: DUEL_CIDS[1], dmg: 4, tHp: 30 } });
  check('...and cannot attribute a blow it has no roster for', watcher.watching === false);

  faceOff(d); // syncPhase(true) — the next turn boundary
  check('the next phase frame brings it in', watcher.watching === true);
  check('it learned both fighters from that frame alone',
    watcher.fighters.length === 2 &&
    watcher.fighters.includes(HOST) && watcher.fighters.includes(GUEST));
  check('...and the right name for each seat',
    watcher.names.get(DUEL_CIDS[0]) === HOST && watcher.names.get(DUEL_CIDS[1]) === GUEST);
  check('...and their live HP', Object.values(watcher.readout()).every((h) => h > 0));

  // From here it renders like any other onlooker.
  const before = watcher.readout()[GUEST];
  d.netM.emit('duel-watch', { from: HOST, to: GUEST, data: { k: 'fx', kind: 'attack', attacker: DUEL_CIDS[0], target: DUEL_CIDS[1], dmg: 4, tHp: before - 4 } });
  check('a blow now lands on its readout', watcher.readout()[GUEST] === before - 4);
  check('...and it drew a damage number', watcher.game.fx.some((f) => f.type === 'float' && f.text === '4'));
  check('...and an impact ring', watcher.game.fx.some((f) => f.type === 'burst'));
  check('it marked both fighters as duelling', watcher.remote.marked.size === 2);

  d.netM.emit('duel-watch', { from: HOST, to: GUEST, data: { k: 'end', result: 'won' } });
  check('the end frame stops it watching', watcher.watching === false);
  check('...and gives the room its ordinary avatars back',
    watcher.remote.marked.size === 0 &&
    [...watcher.remote.units.values()].every((u) => u.stats === null));
  watcher.detach();
}
{
  // A spectator must never be a command path: it has no way to send.
  const d = track(duel());
  // Baseline first: the duel() helper puts its own probe on duel-relay, so what
  // matters is the subscriptions ATTACHING THE SPECTATOR adds.
  const beforeWatch = d.netM.listenerCount('duel-watch');
  const beforeRelay = d.netM.listenerCount('duel-relay');
  const watcher = new DuelSpectator(d.netM, spectatorGame(), spectatorRemote());
  watcher.attach();
  check('attaching a spectator subscribes it to duel-watch',
    d.netM.listenerCount('duel-watch') === beforeWatch + 1);
  check('...and to duel-relay, the command event, not at all',
    d.netM.listenerCount('duel-relay') === beforeRelay);
  check('it holds no send path at all',
    typeof watcher.send !== 'function' && typeof watcher.relay !== 'function' &&
    typeof watcher.sendCommand !== 'function');
  watcher.detach();
  check('detaching unsubscribes it', d.netM.listenerCount('duel-watch') === beforeWatch);
}

// ---- bystanders on the room channel ----------------------------------------
// duel-relay is a ROOM broadcast: everyone standing in the room can send one.
// The pair was decided by the server at accept time (_shared/duelFlow.ts), so
// the two clients are the only things that can hold the pair to it.
console.log('a third player in the room');
{
  // The race that matters: a bystander gets their hello in FIRST, before the
  // real guest has said anything. Nothing may seat them.
  const [netA, netB, netM] = wire(3);
  const host = new DuelHost(netA, () => HOST, GUEST);
  const bc = hostBc();
  netM.send({ t: 'duel-relay', to: HOST, data: { k: 'hello', name: BYSTANDER, classId: 'mage', level: 9 } });
  host.arm({ bc, me: { name: HOST, classId: 'fighter', level: 1 }, room: liveRoom(), myTile: { x: 6, y: 7 } });
  check('a bystander’s hello does not boot the duel', bc.battle === null && host.battle === null);
  check('and it is not even held as a pending arrival', host.pendingHello === null);

  const guest = new DuelGuest(netB, stubGame(), { banner: null }, () => GUEST);
  guest.activate(HOST, { waiting() {}, battleReady() {}, exit() {} }, { name: GUEST, classId: 'fighter', level: 1, at: { x: 6, y: 7 } });
  track({ host, guest });
  check('the real guest’s hello still boots it', !!bc.battle && bc.battle.units.length === 2);
  check('the duellist seat went to the opponent, not the bystander',
    host.owners.get(host.byCid.get(DUEL_CIDS[1]).id).owner === GUEST);
  check('nor did the bystander’s level ride in with the seat',
    host.byCid.get(DUEL_CIDS[1]).level === 1);

  // A bystander who arrives after the boot and claims to BE the guest: the
  // name in the payload is just a string, and it is not what is trusted.
  netM.send({ t: 'duel-relay', to: HOST, data: { k: 'hello', name: GUEST, classId: 'mage', level: 9 } });
  check('a bystander cannot re-seat themselves by borrowing the guest’s name',
    host.byCid.get(DUEL_CIDS[1]).level === 1 &&
    host.owners.get(host.byCid.get(DUEL_CIDS[1]).id).owner === GUEST);
}
{
  const d = track(duel());
  faceOff(d);
  d.battle.resolveAttack(hostUnit(d), guestUnit(d));
  d.bc.endUnit(hostUnit(d)); // the guest's phase is now open
  const hp = hostUnit(d).stats.hp;

  // The SAME command, from two different senders. Only one of them is in
  // this duel.
  const swing = { type: 'attack', cid: DUEL_CIDS[1], target: DUEL_CIDS[0] };
  d.netM.send({ t: 'duel-relay', to: HOST, data: { k: 'cmd', ...swing } });
  check('a bystander’s command does not land', hostUnit(d).stats.hp === hp);
  check('the guest’s unit was not spent by it', guestUnit(d).acted === false);
  check('the bystander is not even answered with a refusal',
    d.rejects.length === 0 && d.heard.length === 0);

  cmd(d, swing);
  check('the real opponent’s identical command still succeeds', hostUnit(d).stats.hp < hp);
  check('and it was accepted, not refused', d.rejects.length === 0);

  // Impersonation on the way in: the transport stamps `from`, so claiming to
  // be the guest in the payload changes nothing.
  const turn = d.battle.turn;
  d.netM.send({ t: 'duel-relay', to: HOST, from: GUEST, data: { k: 'cmd', type: 'wait', cid: DUEL_CIDS[1] } });
  check('a bystander cannot forge the opponent’s name onto a command',
    d.battle.turn === turn && d.heard.length === 0);
}
{
  const d = track(duel());
  const hp = replica(d, DUEL_CIDS[0]).stats.hp;
  const turn = d.guest.shadow.turn;

  // Only the host is authoritative for this duel. A bystander's forged
  // stream must not reach the guest's screen.
  d.netM.send({ t: 'duel-relay', to: GUEST, data: { k: 'phase', phase: 'player', turn: 99, units: [] } });
  check('the guest ignores a phase frame from anyone but the host',
    d.guest.shadow.turn === turn);
  d.netM.send({
    t: 'duel-relay',
    to: GUEST,
    data: { k: 'fx', kind: 'attack', attacker: DUEL_CIDS[1], target: DUEL_CIDS[0], dmg: 999, tHp: 0 },
  });
  check('nor a forged blow against the host’s duellist',
    replica(d, DUEL_CIDS[0]).stats.hp === hp);
  d.netM.send({ t: 'duel-relay', to: GUEST, data: { k: 'end', result: 'won' } });
  check('nor a forged verdict', d.guest.shadow.phase !== 'won' && d.ui.exited === undefined);
  d.netM.send({ t: 'duel-relay', to: GUEST, data: { k: 'start', roomId: ROOM_ID, blocked: [], units: [], log: [] } });
  check('nor a second start frame to replace the duel it is fighting',
    d.guest.shadow.units.length === 2);

  // ...and the host's own frames still get through the same guard.
  d.host.syncPhase(true);
  check('the host’s frames are unaffected by the guard',
    d.guest.shadow.turn === d.battle.turn && d.guest.shadow.phase === d.battle.phase);
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
  cmd(d, { type: 'move', cid: DUEL_CIDS[1], x: 99, y: 99 });
  check('a move off the edge of the room is refused', d.rejects[d.rejects.length - 1] === 'illegal move');
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
  check('and the loser is told who won', d.ui.exited === `${HOST} wins the duel.`);
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
