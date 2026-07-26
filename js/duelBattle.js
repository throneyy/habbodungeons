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
import { Battle } from './battle.js';
import { Unit } from './units.js';
import { Room } from './room.js';
import { CoopLeader, CoopMember, SpectateController } from './coopBattle.js';
import { figureSprites } from './monsterSprites.js';

export const DUEL_ARENA_ID = 'duel-arena';
export const DUEL_CIDS = ['p0', 'e0']; // host unit, guest unit
/** Where each duellist stands. Index 0 is the host's, 1 the guest's: mirrored
 *  across the arena's centre so neither side starts with the better ground. */
export const DUEL_SPAWNS = [
  { x: 2, y: 5, dir: 2 },
  { x: 8, y: 5, dir: 6 },
];

// The arena's visual kit (DATA, same shape js/dungeon.js uses).
const ARENA_KIT = {
  floor: 'dng_floor',
  walls: { height: 3.4 },
  palette: {
    topA: '#565a63', topB: '#4e525a',
    sideSW: '#23262d', sideSE: '#32363f',
    line: 'rgba(8,9,12,0.45)',
    wallN: '#3b3744', wallW: '#4b4657', wallTrim: '#211d29',
  },
};

/** The duelling ground: 11x11, walled, flat, and symmetric under a half turn
 *  about its centre, so the two spawns are the same tile in different clothes.
 *  Deliberately built from CONSTANTS with no seed and no random dressing —
 *  "both clients show identical arena tiles" is then true by construction
 *  rather than by both sides happening to roll the same numbers. */
export function duelArena() {
  const w = 11;
  const h = 11;
  const rows = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      row += edge ? 'x' : '0';
    }
    rows.push(row);
  }
  // Two raised 2x2 pads, point-symmetric about the centre tile (5,5): high
  // ground is worth +20% damage (js/classes.js), so each duellist gets one
  // and the arena reads the same from either seat. 2..3 mirrors to 7..8.
  for (const [x0, y0] of [[2, 2], [7, 7]]) {
    for (let y = y0; y <= y0 + 1; y++) {
      rows[y] = rows[y].slice(0, x0) + '11' + rows[y].slice(x0 + 2);
    }
  }
  return new Room({
    id: DUEL_ARENA_ID,
    name: 'The Duelling Ground',
    zoom: 1,
    heightmap: rows,
    kit: ARENA_KIT,
    spawn: { x: DUEL_SPAWNS[0].x, y: DUEL_SPAWNS[0].y },
    spawnDir: DUEL_SPAWNS[0].dir,
  });
}

/** One duellist as a Unit. `seat` 0 = host (team 'player'), 1 = guest (team
 *  'enemy'): the engine's two sides, handed out by who threw the gauntlet. */
export function duelUnit(room, spec, seat) {
  const at = DUEL_SPAWNS[seat];
  const u = new Unit(room, null, spec.x ?? at.x, spec.y ?? at.y, {
    team: seat === 0 ? 'player' : 'enemy',
    classId: spec.classId || 'fighter',
    name: spec.name || (seat === 0 ? 'Challenger' : 'Defender'),
    level: spec.level || 1,
    dir: spec.dir ?? at.dir,
  });
  if (spec.stats) u.stats = { ...spec.stats };
  u.owner = spec.owner || spec.name || null;
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
  }

  // Only the duel relay: no descend/party stream is involved in a duel.
  subscribe() {
    return [this.net.on('duel-relay', (m) => this.onRelay(m))];
  }

  relay(data, to = null) {
    this.net.send({ t: 'duel-relay', data, to: to || this.opponent });
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

  /** Screen is up: hold my duellist spec and the live BattleController, then
   *  boot as soon as the guest says hello (or immediately if they already
   *  have). */
  arm({ bc, me }) {
    this.bc = bc;
    this.me = me;
    if (this.pendingHello) this.boot(this.pendingHello);
  }

  onRelay(msg) {
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

  /** Build the one authoritative Battle and stream it to the guest. */
  boot(hello) {
    this.pendingHello = null;
    if (this.battle || !this.bc || !this.me) return null;
    const room = duelArena();
    const mine = duelUnit(room, { ...this.me, owner: this.me.name }, 0);
    const theirs = duelUnit(room, { ...hello, owner: hello.name || this.opponent }, 1);
    const battle = this.bc.start(room, [mine], [theirs], {
      enemyAi: false, // the enemy phase belongs to a person, not to js/ai.js
      objective: { type: 'eliminate' },
      onEnd: (result) => this.onDuelEnd && this.onDuelEnd(result),
    });
    this.link(mine, DUEL_CIDS[0]);
    this.link(theirs, DUEL_CIDS[1]);
    this.owners.set(mine.id, { owner: mine.owner, figure: this.me.figure || null });
    this.owners.set(theirs.id, { owner: theirs.owner, figure: hello.figure || null });
    this.wireCapture(battle, this.bc);
    this.lastStart = {
      k: 'start',
      arena: DUEL_ARENA_ID,
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
      won: 'Defeated...', // 'won' is the HOST's win: the engine speaks their side
      lost: 'Victory!',
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
        `<span class="rhp"><span class="rhp-fill" style="width:${frac * 100}%"></span></span>` +
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
  }

  /** Join the host's duel: announce myself, then render whatever comes back. */
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
      data: { k: 'hello', name: this.getName(), classId: me.classId, figure: me.figure, level: me.level },
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

  /** Rebuild the host's arena and both duellists from the start frame. The
   *  arena is a constant and every unit rides the wire, so this is the same
   *  room and the same two units the host is simulating. */
  buildReplica(d) {
    this.stopHello();
    const room = duelArena();
    this.byCid.clear();
    this.cidBack.clear();
    const units = (d.units || []).map((spec) => {
      const u = duelUnit(room, spec, spec.team === 'enemy' ? 1 : 0);
      u.shield = spec.shield || 0;
      this.link(u, spec.cid);
      return u;
    });
    this.controller = new DuelGuestController(this.dom, this);
    this.game.setController(this.controller);
    this.game.setRoom(room);
    for (const u of units) this.game.addUnit(u);
    // Query-only engine over the same units: legality hints and banner text.
    // enemyAi:false here too, so nothing on this screen can ever plan a turn.
    this.shadow = new Battle(room, units, { enemyAi: false, objective: { type: 'eliminate' } });
    if (this.dom.log) this.dom.log.innerHTML = '';
    for (const line of d.log || []) this.controller.appendLog(line);
    if (this.ui.battleReady) this.ui.battleReady('The Duelling Ground');
    this.controller.render();
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
