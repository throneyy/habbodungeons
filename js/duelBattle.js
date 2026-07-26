// PvP duels, step 2: the actual battle, host-authoritative.
//
// The hard rule this file exists to honour: js/battle.js does NOT learn about
// PvP. There is no duel branch in the engine, no second damage path, no
// "isPvP" anywhere in the combat maths. The HOST builds ONE ordinary Battle in
// which its own unit is team 'player' and the guest's is team 'enemy', and the
// engine plays it exactly as it plays a dungeon room. Two teams, two phases,
// one authority — which is what the co-op relay (js/coopBattle.js) already
// assumes, so this is a subclass of it rather than a parallel implementation:
//
//   CoopLeader   -> DuelHost    authority: validates + executes every command
//   CoopMember   -> DuelGuest   replica: renders the host's stream, sends taps
//
// The ONE engine change a duel needs is that the enemy phase must not call
// js/ai.js, because the enemy team is a person: Battle takes `enemyAi: false`,
// which leaves `_enemy` null (no ticker, nothing planned, nothing moved) and
// the phase simply waits until the guest's relayed command arrives. The host
// closes it with endEnemyPhase() once their unit is done, the same way it
// closes the player phase with endPlayerPhase().
//
// Ownership is the SAME validation co-op already ships: handleCommand()
// refuses a command whose unit this client doesn't own, whose unit is already
// spent, or whose phase isn't live. Duels reuse it verbatim and override two
// one-line hooks — commandable() (in a duel BOTH teams are commandable, since
// both are players) and phaseFor() (a unit acts in the phase named after its
// team). That is the entire difference, and it is why "the guest cannot act
// during the host's phase" and "the guest cannot command the host's unit" are
// enforced by code that co-op has been running for months.
//
// The guest sees the mirror image: its own unit sits on the host's 'enemy'
// team, so DuelGuestController declares myTeam 'enemy' and renders that unit
// as the player's own — same engine state, opposite seat.
//
// Transport: the room channel's `duel-relay` broadcast (js/supabaseNet.js).
// Not the user:<id> mailbox — Realtime's write policy admits only `room:%` and
// `party:%` topics, and duellists are guaranteed room-mates because the server
// checked exactly that at challenge AND at accept (_shared/duelFlow.ts).
//
// THE FIGHT HAPPENS WHERE THE PLAYERS ARE STANDING. There is no arena and no
// scene change: the Battle is built over the CURRENT room — its heightmap, its
// furni, its props — and the duellists fight from the tiles they are actually
// on. Nobody leaves the explore view, so bystanders keep watching the room and
// the two duellists simply gain a battle UI over the top of it.
//
// Two things have to be pinned for that to be safe, because "the current room"
// is a different object on each client:
//
//   ROOM IDENTITY  the start frame carries roomId, and the guest REFUSES a duel
//                  whose room is not the one it is standing in. Without it a
//                  guest who walked through a door mid-countdown would fight in
//                  a room the host is not simulating.
//   BLOCKED TILES  the host snapshots every blocked tile at GO and ships it.
//                  Both engines then run over the SAME obstacle set via
//                  duelRoomView(), so a move that is legal on one client cannot
//                  be illegal on the other. Furni moves, gates open and props
//                  are toggled; a snapshot is the only way the two agree.
//
// Live players are deliberately NOT part of that set. Remote avatars never
// block a battle tile (Battle.unitAt only knows its own two units), so a
// bystander cannot stand on a tile to grief it — and the snapshot is taken
// from room.blockers, which holds props, never people.
import { Battle } from './battle.js';
import { Unit } from './units.js';
import { CoopLeader, CoopMember, SpectateController } from './coopBattle.js';
import { hpTint } from './battleController.js';
import { figureSprites } from './monsterSprites.js';
import { rotationBetween } from './pathfinder.js';
import { tileDistance } from './classes.js';

export const DUEL_CIDS = ['p0', 'e0']; // host unit, guest unit

/** Every blocked tile in a room, as sorted "x,y" keys. Props and furni only —
 *  `room.blockers` never holds players. Sorted so two snapshots of the same
 *  room compare equal as strings. */
export function blockedSnapshot(room) {
  return [...room.blockers.keys()].sort();
}

/** A read-only view of `room` whose blocked tiles are exactly `keys`.
 *
 *  Object.create keeps the real room as the prototype, so tiles, heights,
 *  bounds and props all read through unchanged and NOTHING is mutated — the
 *  explore renderer is still drawing this very room while the duel runs over
 *  the view. Only isBlocked is overridden, which is the one predicate the two
 *  engines must agree on tile for tile. */
export function duelRoomView(room, keys) {
  const blocked = new Set(keys || []);
  const view = Object.create(room);
  view.isBlocked = function isBlocked(x, y) {
    return !this.tile(x, y) || blocked.has(`${x},${y}`);
  };
  view.duelBlocked = blocked;
  return view;
}

/** Can a duellist stand here? Walkable floor, and not a tile the other one
 *  already holds. */
function standable(room, x, y, taken) {
  if (!room.inBounds(x, y) || room.isBlocked(x, y)) return false;
  return !(taken && taken.x === x && taken.y === y);
}

// Neighbours in a fixed order, so two clients handed the same inputs pick the
// same tile. Orthogonals first (a duel reads better square-on than cornered).
const NEIGHBOURS = [
  { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
  { dx: 1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
];

/** Where the two fighters start.
 *
 *  Remote players do not block tiles, so everyone who walks into a room piles
 *  onto its spawn: the first live duel opened with BOTH fighters on tile (6,7),
 *  rendering one sprite stacked on the other. A duel must never begin like
 *  that, so this is the rule:
 *
 *    • already apart, both standable, and within attack reach → fight exactly
 *      where you stand. This is the normal case and the whole point of an
 *      in-place duel.
 *    • otherwise → anchor on the host's tile (or the nearest standable tile to
 *      it) and seat the guest on the first free neighbour, facing each other.
 *
 *  Pure and deterministic: same room + same tiles in, same answer out. The HOST
 *  runs it and ships the result in the start frame, so agreement never depends
 *  on both clients computing it. */
export function placeDuellists(room, hostAt, guestAt) {
  const face = (a, b) => ({ ...a, dir: rotationBetween(a.x, a.y, b.x, b.y) });
  const apart = hostAt && guestAt && (hostAt.x !== guestAt.x || hostAt.y !== guestAt.y);
  if (
    apart &&
    standable(room, hostAt.x, hostAt.y) &&
    standable(room, guestAt.x, guestAt.y, hostAt) &&
    tileDistance(hostAt.x, hostAt.y, guestAt.x, guestAt.y) <= 1
  ) {
    return [face(hostAt, guestAt), face(guestAt, hostAt)];
  }

  // Anchor: the host's tile if it is usable, else the closest tile that is.
  let anchor = hostAt && standable(room, hostAt.x, hostAt.y) ? { x: hostAt.x, y: hostAt.y } : null;
  if (!anchor) anchor = nearestStandable(room, hostAt || room.spawn);
  if (!anchor) return null; // a room with nowhere to stand cannot host a duel

  for (const n of NEIGHBOURS) {
    const spot = { x: anchor.x + n.dx, y: anchor.y + n.dy };
    if (standable(room, spot.x, spot.y, anchor)) return [face(anchor, spot), face(spot, anchor)];
  }
  return null; // boxed in on all eight sides
}

// Outward ring search for a tile somebody can stand on.
//
// The origin is CLAMPED into the room first. A duellist whose reported tile is
// outside the map (a stale presence row, a client that walked through a door)
// would otherwise start the search miles away and the ring — bounded by the
// room's own size — would never reach any floor at all, so the duel refused
// itself with "no room to duel here" in a room that was mostly empty.
function nearestStandable(room, from) {
  const ox = Math.min(Math.max(from ? from.x : 0, 0), room.w - 1);
  const oy = Math.min(Math.max(from ? from.y : 0, 0), room.h - 1);
  if (standable(room, ox, oy)) return { x: ox, y: oy };
  for (let r = 1; r <= Math.max(room.w, room.h); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (standable(room, ox + dx, oy + dy)) return { x: ox + dx, y: oy + dy };
      }
    }
  }
  return null;
}

/** One duellist as a Unit. `seat` 0 = host (team 'player'), 1 = guest (team
 *  'enemy'): the engine's two sides, handed out by who threw the gauntlet.
 *  The tile is never defaulted — an in-place duel has no spawn to fall back
 *  on, so a spec without one is a bug that should surface, not be papered
 *  over by dropping a fighter in a corner. */
export function duelUnit(room, spec, seat) {
  const u = new Unit(room, null, spec.x, spec.y, {
    team: seat === 0 ? 'player' : 'enemy',
    classId: spec.classId || 'fighter',
    name: spec.name || (seat === 0 ? 'Challenger' : 'Defender'),
    level: spec.level || 1,
    dir: spec.dir ?? 4,
  });
  if (spec.stats) u.stats = { ...spec.stats };
  u.owner = spec.owner || spec.name || null;
  u.duellist = true; // renderer/roster: this 'enemy' is a person
  if (spec.figure) u.sprites = figureSprites(spec.figure, room.zoom === 1 ? 'm' : 's');
  return u;
}

/** Who builds the authoritative Battle for this duel-state frame? The
 *  challenger, on both screens — `youChallenged` comes off the same row the
 *  server stamped, so the two clients can never both think they host. */
export const hostsDuel = (state) => !!(state && state.youChallenged);

// ------------------------------------------------------------------- host

export class DuelHost extends CoopLeader {
  // net: shared Net; getName: () => my Habbo name; opponent: their name
  constructor(net, getName, opponent) {
    super(net, getName);
    this.opponent = opponent;
    this.autoAct = false; // nothing may ever act for a duellist (step 3 owns forfeits)
    this.me = null; // my own duellist spec (set by arm())
    this.bc = null;
    this.pendingHello = null; // the guest arrived before the screen did
    this.onBoot = null; // (payload) => void — main.js reveals the battle panel
    this.onDuelEnd = null; // (result) => void — 'won' means the HOST won
    this.room = null; // the room we are BOTH standing in (set by arm())
    this.myTile = null; // where I am standing right now (set by arm())
  }

  // Only the duel relay: no descend/party stream is involved in a duel.
  subscribe() {
    return [this.net.on('duel-relay', (m) => this.onRelay(m))];
  }

  relay(data, to = null) {
    // Phase frames carry the two fighters' NAMES and the room, which nothing
    // else about a phase snapshot does (it is all cids and numbers).
    //
    // That is for the benefit of onlookers, not the guest. A spectator
    // (js/duelSpectator.js) learns who is fighting from the `start` frame — and
    // `start` is sent exactly once, so anyone whose client was not listening at
    // that instant could never begin watching: someone who walked into the room
    // mid-duel, or whose room channel finished subscribing a second late, saw
    // two statues for the rest of the fight. Phase frames repeat at every turn
    // boundary, so decorating them turns a missed start into a wait of one
    // turn instead of a permanent blackout.
    const payload = data && data.k === 'phase'
      ? { ...data, roomId: this.room ? this.room.id : null, fighters: [this.getName(), this.opponent] }
      : data;
    this.net.send({ t: 'duel-relay', data: payload, to: to || this.opponent });
  }

  // In a duel BOTH sides are players, so both teams take commands...
  commandable(unit) {
    return unit.team === 'player' || unit.team === 'enemy';
  }

  // ...each in the phase named after its team. The guest's unit is team
  // 'enemy', so its commands are only legal during the enemy phase — which is
  // exactly the "guest cannot act during the host's phase" rule, enforced by
  // co-op's own handleCommand rather than by anything written here.
  phaseFor(unit) {
    return unit.team === 'enemy' ? 'enemy' : 'player';
  }

  /** Screen is up: hold the live BattleController, my duellist spec, the room
   *  we are standing in and the tile I am on — then boot as soon as the guest
   *  says hello (or immediately if they already have). */
  arm({ bc, me, room, myTile }) {
    this.bc = bc;
    this.me = me;
    this.room = room;
    this.myTile = myTile;
    if (this.pendingHello) this.boot(this.pendingHello);
  }

  onRelay(msg) {
    // The duel stream rides the ROOM channel, so every player standing in the
    // room can send a duel-relay frame — this is the only place that says who
    // is actually in this duel. Without it a bystander could broadcast a
    // `hello` before the real guest and be seated as the duellist, or send
    // commands that handleCommand would weigh against `msg.from` alone.
    // The server named the pair at accept time (_shared/duelFlow.ts); nothing
    // in a frame's own payload gets a say in it.
    if (!this.fromOpponent(msg)) return;
    const d = msg.data || {};
    if (d.k === 'hello' && !this.battle) {
      // Guest is on the channel. Boot once; a repeat (their retry) is a no-op
      // until the battle exists, after which super's catch-up branch re-sends
      // the start frame to them.
      if (!this.bc) this.pendingHello = d;
      else this.boot(d);
      return;
    }
    super.onRelay(msg);
  }

  /** Is this frame from the player I am actually duelling? */
  fromOpponent(msg) {
    const from = String((msg && msg.from) || '').toLowerCase();
    return !!from && from === String(this.opponent || '').toLowerCase();
  }

  /** Build the one authoritative Battle over the room we are standing in, and
   *  stream it to the guest. */
  boot(hello) {
    this.pendingHello = null;
    if (this.battle || !this.bc || !this.me || !this.room) return null;

    // Snapshot the obstacles as they are at GO, then run BOTH engines over that
    // snapshot rather than over two independently-read rooms.
    const blocked = blockedSnapshot(this.room);
    const view = duelRoomView(this.room, blocked);

    // Where the two of them actually stand. Everyone piles onto the room spawn
    // (remote players do not block tiles), so this routinely has to separate
    // them — see placeDuellists.
    const spots = placeDuellists(view, this.myTile, hello.at || null);
    if (!spots) {
      this.relay({ k: 'refused', reason: 'no room to duel here' });
      if (this.onDuelEnd) this.onDuelEnd('aborted', 'There is no room to duel here.');
      return null;
    }

    const mine = duelUnit(view, { ...this.me, ...spots[0], owner: this.me.name }, 0);
    // Identity comes from the duel, never from the frame: `hello.name` is
    // just a string the sender chose. this.opponent is the name the server
    // put on the duel row, and it is what owns the unit and labels it.
    const theirs = duelUnit(view, { ...hello, ...spots[1], name: this.opponent, owner: this.opponent }, 1);
    const battle = this.bc.start(view, [mine], [theirs], {
      enemyAi: false, // the enemy phase belongs to a person, not to js/ai.js
      objective: { type: 'eliminate' },
      inPlace: true, // fight in the live room: do NOT rebuild the scene
      duel: { opponent: this.opponent },
      onEnd: (result) => this.onDuelEnd && this.onDuelEnd(result),
    });
    this.link(mine, DUEL_CIDS[0]);
    this.link(theirs, DUEL_CIDS[1]);
    this.owners.set(mine.id, { owner: mine.owner, figure: this.me.figure || null });
    this.owners.set(theirs.id, { owner: theirs.owner, figure: hello.figure || null });
    this.wireCapture(battle, this.bc);
    this.lastStart = {
      k: 'start',
      roomId: this.room.id, // the guest refuses anything that is not its room
      blocked, // ...and fights over exactly these obstacles
      opponent: this.getName(),
      units: [mine, theirs].map((u) => ({ ...this.serializeUnit(u), team: u.team })),
      log: battle.log.slice(),
    };
    this.relay(this.lastStart);
    this.syncPhase(true);
    if (this.onBoot) this.onBoot(this.lastStart);
    return battle;
  }
}

// ------------------------------------------------------------------ guest

/** The guest's input surface. Identical to the co-op member's, one seat over:
 *  its own unit is the host's team-'enemy' unit, so it commands in the enemy
 *  phase and its foes are team 'player'. */
export class DuelGuestController extends SpectateController {
  get myTeam() {
    return 'enemy';
  }

  render() {
    const dom = this.dom;
    const shadow = this.shadow;
    if (!dom.banner || !shadow) return;
    const mine = this.myUnits().find((u) => u.alive && !u.done);
    const foe = this.member.leaderName;
    const label = {
      enemy: mine ? `Turn ${shadow.turn}, your move` : `Turn ${shadow.turn}, waiting`,
      player: `Turn ${shadow.turn}, ${foe} is moving`,
      // 'won'/'lost' are the HOST's verdict: the engine speaks from their seat.
      won: `${foe} wins the duel.`,
      lost: `You beat ${foe}!`,
    }[shadow.phase];
    dom.banner.innerHTML = `<b>${label}:</b> <span class="obj">Duel vs ${foe}</span>`;
    dom.banner.className = `banner ${this.commanding ? 'player' : shadow.phase}`;

    dom.actions.innerHTML = '';
    if (this.commanding) {
      if (this.mode === 'skill') {
        this.btn(`Tap a green target for ${this.activeSkill.name}`, null, true);
        this.btn('Back', () => this.cancel());
      } else if (this.sel) {
        if (shadow.attackTargets(this.sel).length) this.btn('Attack a red foe', null, true);
        (this.sel.skills || []).forEach((sk, i) => {
          if (shadow.skillTargets(this.sel, sk).length || sk.target === 'self') {
            this.btn(sk.name, () => this.enterSkill(sk, i));
          }
        });
        this.btn('Wait', () => this.wait());
        this.btn('Cancel', () => this.deselect());
      } else if (mine) {
        this.btn('Tap your duellist to command it', null, true);
      }
    } else if (shadow.phase === 'player') {
      this.btn(`${foe} is moving...`, null, true);
    }

    dom.roster.innerHTML = '';
    for (const u of shadow.units) {
      const row = document.createElement('div');
      const side = u.team === this.myTeam ? 'player' : 'enemy'; // my duellist reads as mine
      row.className = `roster-row ${side}${u.alive ? '' : ' dead'}${u === this.sel ? ' sel' : ''}${u.done && u.alive ? ' done' : ''}`;
      const frac = u.stats ? Math.max(0, u.stats.hp / u.stats.maxHp) : 0;
      row.innerHTML =
        `<span class="rname">${u.name}</span>` +
        `<span class="rcls">${u.cls.name} L${u.level}</span>` +
        // same health-coloured bar as the host's roster: both duellists are
        // people, so neither side's bar may read red at full health
        `<span class="rhp"><span class="rhp-fill" style="width:${frac * 100}%${hpTint(frac, true)}"></span></span>` +
        `<span class="rhpn">${u.alive ? u.stats.hp : '\u2715'}</span>`;
      dom.roster.appendChild(row);
    }
  }
}

export class DuelGuest extends CoopMember {
  constructor(net, game, dom, getName) {
    super(net, game, dom, getName);
    this.helloTimer = null;
    this.endDelayMs = 1200; // let the killing blow land on screen first
    this.duelUnits = []; // what we added to the live scene, so we can take it back out
  }

  /** Join the host's duel: announce myself (with the tile I am standing on, so
   *  the host can seat us both), then render whatever comes back. */
  activate(hostName, ui, me) {
    this.deactivate();
    this.active = true;
    this.leaderName = hostName;
    this.ui = ui;
    this.me = me;
    this.unsubs = [
      this.net.on('duel-relay', (m) => this.onRelay(m)),
      this.net.on('close', () => this.exit('Connection lost.')),
    ];
    // The host may still be putting its screen up (or its channel may not have
    // finished subscribing), so the hello repeats until the start frame lands.
    const hello = () => this.net.send({
      t: 'duel-relay',
      to: hostName,
      data: {
        k: 'hello',
        name: this.getName(),
        classId: me.classId,
        figure: me.figure,
        level: me.level,
        at: me.at || null, // my tile: the host places us both from this
      },
    });
    hello();
    this.helloTimer = setInterval(() => (this.shadow ? this.stopHello() : hello()), 1500);
    if (this.ui.waiting) this.ui.waiting(`Facing <b>${esc(hostName)}</b>...`);
  }

  stopHello() {
    clearInterval(this.helloTimer);
    this.helloTimer = null;
  }

  deactivate() {
    this.stopHello();
    super.deactivate();
  }

  sendCommand(cmd) {
    this.net.send({ t: 'duel-relay', data: { k: 'cmd', ...cmd }, to: this.leaderName });
  }

  // Same room-channel exposure as the host's (see DuelHost.onRelay): only the
  // host is authoritative for this duel, so a frame from anyone else — a
  // bystander's forged `start`, `phase` or `end` — is not this duel's news.
  onRelay(msg) {
    const from = String((msg && msg.from) || '').toLowerCase();
    if (!from || from !== String(this.leaderName || '').toLowerCase()) return;
    super.onRelay(msg);
  }

  /** Rebuild both duellists over MY OWN room from the start frame.
   *
   *  There is no arena to construct: the fight is in the room I am already
   *  standing in, which the renderer is already drawing. Two things are
   *  therefore checked rather than assumed — that it really is the same room,
   *  and that its obstacles match the host's snapshot. */
  buildReplica(d) {
    const live = this.game.room;
    // REFUSE a duel that is not in my room. The host is simulating somewhere
    // else — every tile it calls legal would be a guess here.
    if (!live || !d.roomId || live.id !== d.roomId) {
      this.stopHello();
      this.exit(`That duel is in another room (${d.roomId || 'unknown'}).`);
      return;
    }
    this.stopHello();

    // Fight over the HOST's obstacle snapshot, not over my own reading of the
    // room: the host is the authority, so adopting its set makes a move that is
    // legal there legal here, by construction. A difference is worth knowing
    // about (somebody's furni moved), so say so rather than silently diverging.
    const mineNow = blockedSnapshot(live);
    const hostBlocked = d.blocked || mineNow;
    if (mineNow.join('|') !== hostBlocked.join('|')) {
      console.warn(
        `[duel] blocked-tile mismatch with the host (${mineNow.length} here, ` +
        `${hostBlocked.length} there) — adopting the host's snapshot`
      );
    }
    const room = duelRoomView(live, hostBlocked);

    this.byCid.clear();
    this.cidBack.clear();
    const units = (d.units || []).map((spec) => {
      const u = duelUnit(room, spec, spec.team === 'enemy' ? 1 : 0);
      u.shield = spec.shield || 0;
      this.link(u, spec.cid);
      return u;
    });
    this.controller = new DuelGuestController(this.dom, this);
    this.controller.duel = { opponent: this.leaderName };
    this.game.setController(this.controller);
    // NO setRoom: that would clear the scene and throw away every bystander,
    // prop and critter the explore view is holding. The duellists are simply
    // added to the room that is already on screen.
    for (const u of units) this.game.addUnit(u);
    this.duelUnits = units;
    // Query-only engine over the same units: legality hints and banner text.
    // enemyAi:false here too, so nothing on this screen can ever plan a turn.
    this.shadow = new Battle(room, units, { enemyAi: false, objective: { type: 'eliminate' } });
    if (this.dom.log) this.dom.log.innerHTML = '';
    for (const line of d.log || []) this.controller.appendLog(line);
    if (this.ui.battleReady) this.ui.battleReady(live.name);
    this.controller.render();
  }

  /** Take the duellists back out of the scene. The room itself is untouched —
   *  it was never replaced. */
  clearDuelUnits() {
    for (const u of this.duelUnits || []) {
      const i = this.game.units.indexOf(u);
      if (i >= 0) this.game.units.splice(i, 1);
    }
    this.duelUnits = [];
  }

  /** Somebody fell. The result is the HOST's verdict, because the host's
   *  engine is the one speaking: its 'won' is my defeat. */
  applyEnd(d) {
    super.applyEnd(d);
    const mine = d.result === 'lost'; // the host's player team lost = I won
    setTimeout(
      () => this.exit(mine ? 'You win the duel!' : `${this.leaderName} wins the duel.`),
      this.endDelayMs
    );
  }

  // A duel has no party: leadership never moves, and step 3 owns what happens
  // when somebody vanishes.
  onPartyChange() {}
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
