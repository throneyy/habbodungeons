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
  DuelHost, DuelGuest, DUEL_CIDS, DUEL_MAX_LEVEL, hostsDuel,
  placeDuellists, blockedSnapshot, duelRoomView, duelUnit, duellistSpec,
} from '../js/duelBattle.js';
import { DuelSpectator } from '../js/duelSpectator.js';
import { rotationBetween } from '../js/pathfinder.js';

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
  guest.activate(HOST, ui, {
    name: GUEST,
    classId: opts.guestClass || 'fighter',
    level: opts.guestLevel || 1,
    skillIds: opts.guestSkillIds || [],
    equipIds: opts.guestEquipIds || [],
    at: guestAt,
  });
  host.arm({
    bc,
    me: {
      name: HOST,
      classId: opts.hostClass || 'fighter',
      level: opts.hostLevel || 1,
      skillIds: opts.hostSkillIds || [],
      equipIds: opts.hostEquipIds || [],
    },
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

// Moves ANIMATE: handleCommand starts the walk and Avatar.update consumes one
// tile per WALK_MS tick, so a unit is not standing on its destination the
// instant the command returns. Drive the tick clock forward rather than
// sleeping — the walk is on a fixed tick timeline, not on wall-clock.
function settle(...units) {
  for (let t = 0; t < 40000; t += 500) {
    for (const u of units) u.update(t);
  }
  return units;
}

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

  // THE ONE THING PLACEMENT REPAIRS: two fighters on one tile. Remote players
  // do not block tiles, so everyone who walks into a room piles onto its spawn
  // — the first live duel opened with both fighters on (6,7), one sprite drawn
  // on top of the other.
  const stacked = placeDuellists(room, { x: 6, y: 7 }, { x: 6, y: 7 });
  check('two fighters on ONE tile are separated', dist(stacked[0], stacked[1]) >= 1);
  check('the host keeps the tile it was standing on',
    stacked[0].x === 6 && stacked[0].y === 7);
  check('the guest is moved the MINIMUM distance off it',
    dist(stacked[0], stacked[1]) === 1);
  check('and they are turned to face each other',
    stacked[0].dir === 0 && stacked[1].dir === 4);

  // EVERYTHING ELSE IS LEFT ALONE. A duel is fought in place: the fighters keep
  // the tiles they are standing on, however far apart, and walk to each other
  // on their turns. Forcing them together would delete the opening of every
  // duel and make range and positioning meaningless.
  const adjacent = placeDuellists(room, { x: 3, y: 3 }, { x: 4, y: 3 });
  check('fighters already adjacent are NOT moved',
    adjacent[0].x === 3 && adjacent[0].y === 3 && adjacent[1].x === 4 && adjacent[1].y === 3);
  check('they are still turned to face each other',
    adjacent[0].dir === 2 && adjacent[1].dir === 6);

  const apart = placeDuellists(room, { x: 1, y: 1 }, { x: 9, y: 8 });
  check('fighters ACROSS THE ROOM are left exactly where they stand',
    apart[0].x === 1 && apart[0].y === 1 && apart[1].x === 9 && apart[1].y === 8);
  check('...so the distance between them is preserved', dist(apart[0], apart[1]) === 8);
  check('...and they face each other across it',
    apart[0].dir === rotationBetween(1, 1, 9, 8) && apart[1].dir === rotationBetween(9, 8, 1, 1));

  const mid = placeDuellists(room, { x: 2, y: 5 }, { x: 7, y: 5 });
  check('a mid-range pair keeps its gap too', dist(mid[0], mid[1]) === 5);

  // Never onto furni: the other repair. liveRoom() blocks (9,9).
  const onFurni = placeDuellists(room, { x: 9, y: 9 }, { x: 3, y: 3 });
  check('a fighter standing on furni is moved off it',
    !room.isBlocked(onFurni[0].x, onFurni[0].y));
  check('...to an adjacent tile, not across the room',
    dist(onFurni[0], { x: 9, y: 9 }) === 1);
  check('...and the OTHER fighter is not disturbed',
    onFurni[1].x === 3 && onFurni[1].y === 3);

  // A host standing somewhere impossible still gets seated.
  const offMap = placeDuellists(room, { x: 99, y: 99 }, { x: 4, y: 4 });
  check('a host on an impossible tile is relocated onto real floor',
    !!offMap && room.inBounds(offMap[0].x, offMap[0].y) && !room.isBlocked(offMap[0].x, offMap[0].y));
  check('...and again the other fighter stays put',
    offMap[1].x === 4 && offMap[1].y === 4);

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
{
  // A duel thrown across the room STARTS across the room — movement is the
  // opening move, not something placement quietly did for you.
  const d = track(duel({ hostAt: { x: 2, y: 2 }, guestAt: { x: 8, y: 8 } }));
  const h = hostUnit(d);
  const g = guestUnit(d);
  check('the fighters start where they were standing',
    h.x === 2 && h.y === 2 && g.x === 8 && g.y === 8);
  check('...out of reach, so somebody has to walk',
    !d.battle.attackTargets(h).includes(g));
  check('both clients agree on that opening',
    replica(d, DUEL_CIDS[0]).x === 2 && replica(d, DUEL_CIDS[1]).x === 8);
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

// ---- the player's actual character travels into the duel --------------------
// duelUnit used to build a bare class template: opts.skills and opts.bonuses
// were never passed, so a duellist fought with no unlocked tree skills and no
// equipment stats. A spec carrying 'whirlpool' produced a unit with skills [].
// That made a duel a different, smaller game than a dungeon, and quietly
// deleted the reward for every hour spent levelling.
console.log('the character comes with you');
{
  const d = track(duel({
    guestClass: 'ranger', guestLevel: 7,
    guestSkillIds: ['whirlpool', 'net'],
    guestEquipIds: ['iron_sword'],
    hostAt: { x: 2, y: 5 }, guestAt: { x: 8, y: 5 },
  }));
  const g = guestUnit(d);

  // Through the HELLO: the guest describes itself, the host builds it.
  check('the guest\u2019s unlocked tree skills reached the host',
    (g.skills || []).map((s) => s.id).join(',') === 'whirlpool,net');
  check('...as real specs from the host\u2019s own skill table',
    (g.skills || []).every((s) => s.power > 0 && s.kind));
  check('the guest\u2019s level came with it', g.level === 7);
  check('the guest\u2019s calling came with it', g.classId === 'ranger');

  // Equipment shows up as STATS, which is the only way it can matter.
  const bare = duelUnit(liveRoom(), { name: 'B', classId: 'ranger', level: 7, x: 1, y: 1 }, 1);
  check('equipment bonuses raised the stats', g.stats.atk > bare.stats.atk);
  check('...and a ranger keeps its ranged reach', g.stats.range === 3 && g.stats.min === 2);

  // Through the START frame: the guest's own replica must be the same unit,
  // or the two clients disagree about what a skill even does.
  const r = replica(d, DUEL_CIDS[1]);
  check('the start frame carried the skills back to the guest',
    (r.skills || []).map((s) => s.id).join(',') === 'whirlpool,net');
  check('...and the level', r.level === 7);
  check('...and the equipment, as identical stats',
    r.stats.atk === g.stats.atk && r.stats.maxHp === g.stats.maxHp);
  check('both clients built the SAME fighter',
    JSON.stringify([r.classId, r.level, r.stats]) === JSON.stringify([g.classId, g.level, g.stats]));

  // And the frame a spectator reads carries it too.
  const spec = d.host.lastStart.units.find((u) => u.cid === DUEL_CIDS[1]);
  check('the start frame names the skills by id',
    JSON.stringify(spec.skillIds) === JSON.stringify(['whirlpool', 'net']));
  check('...and the equipment by id',
    JSON.stringify(spec.equipIds) === JSON.stringify(['iron_sword']));
  check('...and carries the authoritative stat block', spec.stats.atk === g.stats.atk);
}
{
  // The host's own character travels too (it never crosses a wire, but it must
  // not be dropped on the floor either).
  const d = track(duel({ hostClass: 'cleric', hostLevel: 4, hostSkillIds: ['net'] }));
  const h = hostUnit(d);
  check('the host keeps its class skill AND its tree skills',
    (h.skills || []).map((s) => s.id).join(',') === 'heal,net');
  check('the host\u2019s level applies', h.level === 4);
  check('the guest\u2019s replica of the host matches',
    (replica(d, DUEL_CIDS[0]).skills || []).map((s) => s.id).join(',') === 'heal,net');
}

// ---- ...and a lying guest cannot invent one --------------------------------
// The guest supplies its own stat block, so this is the trust boundary. The
// rule that makes it safe: THE WIRE CARRIES IDENTIFIERS, NEVER NUMBERS. Ids
// resolve through the receiver's own js/skills.js and js/items.js, so the worst
// a liar can do is claim a build they did not earn — never invent one.
console.log('a lying guest');
{
  const d = track(duel({
    guestLevel: 9999,
    guestSkillIds: ['__godmode', 'whirlpool'],
    guestEquipIds: ['__excalibur', 'a', 'b', 'c', 'd', 'e', 'f'],
  }));
  const g = guestUnit(d);
  check('an absurd level is clamped', g.level === DUEL_MAX_LEVEL);
  check('a skill that does not exist is dropped',
    (g.skills || []).map((s) => s.id).join(',') === 'whirlpool');
  check('equipment that does not exist grants nothing',
    g.stats.atk === duelUnit(liveRoom(), { name: 'x', classId: 'fighter', level: DUEL_MAX_LEVEL, x: 1, y: 1 }, 1).stats.atk);
  check('the duel still starts \u2014 a liar is corrected, not kicked', !!d.battle);
}
{
  // A fabricated skill OBJECT on the wire is ignored outright: duellistSpec
  // only ever reads skillIds, so there is no path for a { power: 9999 } blob to
  // reach the engine.
  const forged = duellistSpec({
    classId: 'fighter',
    level: 3,
    skills: [{ id: 'nuke', name: 'Nuke', kind: 'damage', target: 'enemy', range: 9, radius: 4, power: 9999 }],
    bonuses: { atk: 9999, maxHp: 9999 },
    stats: { atk: 9999, maxHp: 9999, hp: 9999 },
  });
  check('a forged skill object never survives normalisation', forged.skills === undefined);
  check('a forged bonus blob never survives either', forged.bonuses === undefined);
  check('nor a forged stat block', forged.stats === undefined);
  check('only ids and a clamped level come out',
    JSON.stringify(Object.keys(forged).sort()) ===
    JSON.stringify(['at', 'classId', 'equipIds', 'figure', 'level', 'skillIds']));

  const u = duelUnit(liveRoom(), {
    name: 'Evil', x: 1, y: 1, classId: 'fighter', level: 3,
    skills: [{ id: 'nuke', power: 9999 }],
    bonuses: { atk: 9999 },
  }, 1);
  const honest = duelUnit(liveRoom(), { name: 'Good', x: 2, y: 2, classId: 'fighter', level: 3 }, 1);
  check('a unit built from a forged spec is an ordinary fighter',
    u.stats.atk === honest.stats.atk && (u.skills || []).length === 0);
  check('an unknown class falls back rather than crashing',
    duelUnit(liveRoom(), { name: 'Z', x: 1, y: 1, classId: '__nope', level: 1 }, 1).classId === 'fighter');
}

// ---- tactical play: movement, range, skills --------------------------------
// Duels inherit the WHOLE command set from CoopLeader.handleCommand — move,
// attack, skill, wait — but every duel test so far has been fighter vs fighter,
// already adjacent, trading one melee swing. Movement, reach and skills have
// never been exercised in a duel at all, on either side of the relay.
//
// The gating is the interesting part. Ownership and phase are checked once, in
// handleCommand, ahead of the per-command-type branch, so "the guest cannot
// move during the host's phase" should hold for exactly the same reason "the
// guest cannot attack during the host's phase" holds. Should. That is what
// these assert.
console.log('tactical: movement');
{
  // Start them well apart so a move is actually required.
  const d = track(duel({ hostAt: { x: 2, y: 2 }, guestAt: { x: 8, y: 8 } }));
  const h = hostUnit(d);
  const g = guestUnit(d);
  check('placement left them far apart', Math.max(Math.abs(h.x - g.x), Math.abs(h.y - g.y)) > 1);
  check('...and out of attack reach', !d.battle.attackTargets(h).includes(g));

  // A fighter moves 4 (Chebyshev). The engine hands legality out as a Set of
  // "x,y" keys, and both clients must be asking the same question of the same
  // room.
  const hostTiles = d.battle.moveTiles(h);
  const guestView = d.guest.shadow.moveTiles(replica(d, DUEL_CIDS[0]));
  check('the host can move at all', hostTiles.size > 0);
  check('both clients agree on the host\u2019s legal move tiles EXACTLY',
    [...hostTiles].sort().join('|') === [...guestView].sort().join('|'));
  check('move range respects the class (fighter: 4)',
    [...hostTiles].every((k) => {
      const [x, y] = k.split(',').map(Number);
      return Math.max(Math.abs(x - h.x), Math.abs(y - h.y)) <= 4;
    }));

  // The GUEST moves its own unit, in its own phase, and the host's authority
  // executes it. The move is relayed, so the host's screen must land on the
  // same tile.
  d.battle.resolveAttack; // (no-op reference: attacks are covered elsewhere)
  d.bc.endUnit(h); // host waits out turn 1 -> enemy phase opens
  check('the guest\u2019s phase is open', d.battle.phase === 'enemy');

  const step = { x: g.x - 2, y: g.y - 2 };
  check('the target tile is legal for the guest',
    d.guest.shadow.moveTiles(replica(d, DUEL_CIDS[1])).has(`${step.x},${step.y}`));
  cmd(d, { type: 'move', cid: DUEL_CIDS[1], x: step.x, y: step.y });
  check('the guest\u2019s move was accepted', d.rejects.length === 0);
  check('the walk was started, not teleported', g.walking === true);
  settle(g, replica(d, DUEL_CIDS[1]));
  check('the host executed it on the authoritative unit',
    g.x === step.x && g.y === step.y);
  check('and the guest\u2019s replica shows the same tile',
    replica(d, DUEL_CIDS[1]).x === step.x && replica(d, DUEL_CIDS[1]).y === step.y);
  check('both clients agree on the unit\u2019s position after the move',
    g.x === replica(d, DUEL_CIDS[1]).x && g.y === replica(d, DUEL_CIDS[1]).y);
}
{
  // Beyond range is refused, and refused as a MOVE (not silently clamped).
  const d = track(duel({ hostAt: { x: 2, y: 2 }, guestAt: { x: 8, y: 8 } }));
  d.bc.endUnit(hostUnit(d));
  const g = guestUnit(d);
  const far = { x: g.x - 5, y: g.y - 5 }; // 5 > move 4
  check('the far tile really is outside the move set',
    !d.battle.moveTiles(g).has(`${far.x},${far.y}`));
  const was = { x: g.x, y: g.y };
  cmd(d, { type: 'move', cid: DUEL_CIDS[1], x: far.x, y: far.y });
  check('a move beyond range is refused', d.rejects[d.rejects.length - 1] === 'illegal move');
  check('...and the unit did not budge', g.x === was.x && g.y === was.y);
  check('...nor did the replica', replica(d, DUEL_CIDS[1]).x === was.x);

  // One move per turn.
  const near = { x: g.x - 1, y: g.y - 1 };
  cmd(d, { type: 'move', cid: DUEL_CIDS[1], x: near.x, y: near.y });
  settle(g);
  check('a legal move is accepted', g.x === near.x && g.y === near.y);
  cmd(d, { type: 'move', cid: DUEL_CIDS[1], x: near.x - 1, y: near.y });
  check('a second move in one turn is refused',
    d.rejects[d.rejects.length - 1] === 'already moved');
}
{
  // A move onto the other duellist's tile is not legal: the engine's own
  // occupancy rule, which must hold in a duel exactly as in a dungeon.
  const d = track(duel({ hostAt: { x: 4, y: 4 }, guestAt: { x: 5, y: 4 } }));
  const h = hostUnit(d);
  const g = guestUnit(d);
  check('neither duellist may stand on the other',
    !d.battle.moveTiles(h).has(`${g.x},${g.y}`) &&
    !d.battle.moveTiles(g).has(`${h.x},${h.y}`));
}
{
  // Blocked furni is excluded on BOTH clients — this is the obstacle snapshot
  // doing its job. liveRoom() blocks (9,9).
  const d = track(duel({ hostAt: { x: 8, y: 8 }, guestAt: { x: 2, y: 2 } }));
  const h = hostUnit(d);
  check('the host cannot walk onto furni', !d.battle.moveTiles(h).has('9,9'));
  check('...and the guest\u2019s client agrees it is illegal',
    !d.guest.shadow.moveTiles(replica(d, DUEL_CIDS[0])).has('9,9'));
  check('both move sets are identical around the obstacle',
    [...d.battle.moveTiles(h)].sort().join('|') ===
    [...d.guest.shadow.moveTiles(replica(d, DUEL_CIDS[0]))].sort().join('|'));
}

console.log('tactical: reach');
{
  // A ranger (range 3, min 2) shoots without closing. The whole point of the
  // class, and impossible to observe in a fighter-vs-fighter duel.
  const d = track(duel({
    hostClass: 'ranger', guestClass: 'fighter',
    hostAt: { x: 3, y: 5 }, guestAt: { x: 6, y: 5 },
  }));
  const h = hostUnit(d);
  const g = guestUnit(d);
  check('the ranger and its foe are 3 tiles apart',
    Math.max(Math.abs(h.x - g.x), Math.abs(h.y - g.y)) === 3);
  check('the ranger can attack WITHOUT moving', d.battle.attackTargets(h).includes(g));
  check('the guest\u2019s client agrees the shot is legal',
    d.guest.shadow.attackTargets(replica(d, DUEL_CIDS[0])).includes(replica(d, DUEL_CIDS[1])));

  const hp0 = g.stats.hp;
  d.battle.resolveAttack(h, g);
  check('the arrow lands from range', g.stats.hp < hp0);
  check('the ranger never moved', h.x === 3 && h.y === 5);
  check('both screens show the same HP after a ranged hit',
    g.stats.hp === replica(d, DUEL_CIDS[1]).stats.hp);
}
{
  // Melee out of range is refused. The fighter is the GUEST here so the
  // refusal travels the relay.
  const d = track(duel({ hostAt: { x: 2, y: 5 }, guestAt: { x: 7, y: 5 } }));
  d.bc.endUnit(hostUnit(d));
  const h = hostUnit(d);
  const g = guestUnit(d);
  check('the two are out of melee reach',
    !d.battle.attackTargets(g).includes(h));
  const hp0 = h.stats.hp;
  cmd(d, { type: 'attack', cid: DUEL_CIDS[1], target: DUEL_CIDS[0] });
  check('a melee attack out of range is refused',
    d.rejects[d.rejects.length - 1] === 'illegal target');
  check('...and nobody was hurt', h.stats.hp === hp0);
  check('...and the attacker was not spent', g.acted === false);
}
{
  // The ranger's dead zone: min 2 means an adjacent foe cannot be shot, and
  // the close-range dagger covers exactly that tile.
  const d = track(duel({
    hostClass: 'ranger', guestClass: 'fighter',
    hostAt: { x: 4, y: 5 }, guestAt: { x: 5, y: 5 },
  }));
  const h = hostUnit(d);
  const g = guestUnit(d);
  check('an adjacent foe is still attackable (the close-range dagger)',
    d.battle.attackTargets(h).includes(g));
  const hp0 = g.stats.hp;
  d.battle.resolveAttack(h, g);
  check('the dagger connects', g.stats.hp < hp0);
  check('both clients agree on the damage',
    g.stats.hp === replica(d, DUEL_CIDS[1]).stats.hp);
}

console.log('tactical: skills');
{
  // A cleric's Heal on itself: a skill with a target, a range and a real
  // effect, resolved through the relay by the guest.
  const d = track(duel({
    hostClass: 'fighter', guestClass: 'cleric',
    hostAt: { x: 4, y: 5 }, guestAt: { x: 5, y: 5 },
  }));
  const g = guestUnit(d);
  check('the guest\u2019s cleric has a skill', (g.skills || []).length > 0);

  // Wound it first so a heal has something to do.
  d.battle.resolveAttack(hostUnit(d), g);
  d.bc.endUnit(hostUnit(d));
  const hurt = g.stats.hp;
  check('the cleric took a wound', hurt < g.stats.maxHp);
  check('both clients see the wound', replica(d, DUEL_CIDS[1]).stats.hp === hurt);

  cmd(d, { type: 'skill', cid: DUEL_CIDS[1], skill: 0, target: DUEL_CIDS[1] });
  check('the skill was accepted', d.rejects.length === 0);
  check('Heal restored HP on the authoritative unit', g.stats.hp > hurt);
  check('the guest\u2019s replica shows the SAME HP after the skill',
    replica(d, DUEL_CIDS[1]).stats.hp === g.stats.hp);
  check('the skill spent the caster\u2019s turn', g.acted === true);
}
{
  // An AREA + ROOT skill (Whirlpool: radius 1, status rooted) cast by the
  // HOST, so the effect has to travel outward to the guest's replica.
  const d = track(duel({
    hostClass: 'fighter', guestClass: 'fighter',
    hostAt: { x: 4, y: 5 }, guestAt: { x: 5, y: 5 },
    // A REAL unlocked tree skill, by id — the same one a player grinds Fishing
    // 65 for. It resolves through js/skills.js on both clients, which is the
    // whole point: the wire carries the id, never the numbers.
    hostSkillIds: ['whirlpool'],
  }));
  const h = hostUnit(d);
  const g = guestUnit(d);
  const skill = (h.skills || [])[0];
  check('the host carries the area skill', !!skill && skill.id === 'whirlpool');
  check('the foe is a legal target', d.battle.skillTargets(h, skill).includes(g));

  const hp0 = g.stats.hp;
  d.battle.resolveSkill(h, g, skill);
  check('the area skill damaged the foe', g.stats.hp < hp0);
  check('...and rooted them', g.rooted > 0);
  check('both clients agree on the resulting HP',
    replica(d, DUEL_CIDS[1]).stats.hp === g.stats.hp);
  check('...and the guest’s client knows it is rooted',
    replica(d, DUEL_CIDS[1]).rooted > 0);
  // Root bites at the START of the victim's next phase (resetTurn resolves
  // `rootedThisTurn`), which is exactly when it matters: they lose the move
  // they were about to make, not one they already spent.
  d.bc.endUnit(hostUnit(d));
  check('the rooted duellist’s phase opened', d.battle.phase === 'enemy');
  check('a rooted duellist cannot move on the host’s board',
    d.battle.moveTiles(g).size <= 1);
  check('...and its own client agrees it is stuck',
    d.guest.shadow.moveTiles(replica(d, DUEL_CIDS[1])).size <= 1);
  const stuck = { x: g.x, y: g.y };
  cmd(d, { type: 'move', cid: DUEL_CIDS[1], x: g.x - 1, y: g.y });
  settle(g);
  check('...so a move command from it is refused', g.x === stuck.x && g.y === stuck.y);
}

console.log('tactical: ownership + phase gating');
{
  // The SAME two rules that gate attacks must gate moves and skills. If
  // handleCommand's checks sat inside the attack branch instead of ahead of
  // the type switch, these are the tests that would catch it.
  const d = track(duel({
    hostClass: 'fighter', guestClass: 'cleric',
    hostAt: { x: 3, y: 5 }, guestAt: { x: 6, y: 5 },
  }));
  const h = hostUnit(d);
  const g = guestUnit(d);
  check('it is the host\u2019s phase', d.battle.phase === 'player');

  // MOVE during the host's phase.
  const was = { x: g.x, y: g.y };
  cmd(d, { type: 'move', cid: DUEL_CIDS[1], x: g.x - 1, y: g.y });
  check('the guest cannot MOVE during the host\u2019s phase',
    d.rejects[d.rejects.length - 1] === 'not your phase');
  check('...and did not move', g.x === was.x && g.y === was.y);

  // SKILL during the host's phase.
  cmd(d, { type: 'skill', cid: DUEL_CIDS[1], skill: 0, target: DUEL_CIDS[1] });
  check('the guest cannot use a SKILL during the host\u2019s phase',
    d.rejects[d.rejects.length - 1] === 'not your phase');
  check('...and is not spent', g.acted === false);

  // The host's OWN unit, moved by the guest, in the host's phase.
  const hostWas = { x: h.x, y: h.y };
  cmd(d, { type: 'move', cid: DUEL_CIDS[0], x: h.x + 1, y: h.y });
  check('the guest cannot MOVE the host\u2019s unit',
    d.rejects[d.rejects.length - 1] === 'not your unit');
  check('...and it did not move', h.x === hostWas.x && h.y === hostWas.y);

  // ...and in the guest's own phase, the host's unit is still not theirs.
  d.bc.endUnit(h);
  check('the guest\u2019s phase is open', d.battle.phase === 'enemy');
  cmd(d, { type: 'move', cid: DUEL_CIDS[0], x: h.x + 1, y: h.y });
  check('the guest cannot MOVE the host\u2019s unit in its OWN phase either',
    d.rejects[d.rejects.length - 1] === 'not your unit');
  cmd(d, { type: 'skill', cid: DUEL_CIDS[0], skill: 0, target: DUEL_CIDS[0] });
  check('nor use the host\u2019s SKILLS',
    d.rejects[d.rejects.length - 1] === 'not your unit');
  check('the host is untouched throughout',
    h.x === hostWas.x && h.y === hostWas.y && h.acted === true);

  // A bystander trying the same tactical commands gets nothing at all.
  d.netM.send({ t: 'duel-relay', to: HOST, data: { k: 'cmd', type: 'move', cid: DUEL_CIDS[1], x: g.x - 1, y: g.y } });
  check('a bystander\u2019s MOVE does not land', g.x === was.x && g.y === was.y);
  d.netM.send({ t: 'duel-relay', to: HOST, data: { k: 'cmd', type: 'skill', cid: DUEL_CIDS[1], skill: 0, target: DUEL_CIDS[1] } });
  check('a bystander\u2019s SKILL does not land', g.acted === false);
  check('...and neither is answered with a refusal', d.heard.length === 0);
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
