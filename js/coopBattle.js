// Co-op dungeon battles over the party relay (server/presence.js `relay`).
//
// Authority model: the LEADER's browser runs the whole simulation — enemy AI,
// RNG, tile effects — exactly today's battle code. Members send serialized
// unit commands up; the leader validates against the live engine (legal
// mover, legal target, member owns that unit) and executes; the resulting
// engine events (move paths, fx, log lines, phase snapshots) broadcast to
// every member, whose clients replay them onto a replica room.
//
// Replicas are cheap because dungeon content is deterministic: members
// rebuild the same room + enemies from (dungeonId, eventPicks, nodeIndex);
// only the player squad (figures, callings, owners) rides the start event.
//
// Resilience:
//   - member drop  -> their unit flips to AI (leader auto-acts it); a rejoin
//     re-claims it at the next turn boundary (targeted re-`start` + snapshot)
//   - leader drop  -> the server promotes the next member (party hand-off);
//     they rebuild a live Battle from the last turn-boundary snapshot and
//     take over the sim (fresh RNG — acceptable co-op resume)
//   - idle member  -> 60s into a player phase the leader's client AI acts
//     their unit, so battles can never stall
import { Battle } from './battle.js';
import { Unit } from './units.js';
import { buildDungeon } from './dungeon.js';
import { renderBattleFx, rosterBars } from './battleController.js';
import { figureSprites } from './monsterSprites.js';

export const TURN_TIMEOUT_MS = 60000; // idle member auto-act
export const CONFIRM_MS = 30000; // descend confirm window

// ---------------------------------------------------------------- leader side

export class CoopLeader {
  // net: shared Net; getName: () => my Habbo name
  constructor(net, getName) {
    this.net = net;
    this.getName = getName;
    this.members = new Map(); // lower name -> { name, status, classId, figure }
    this.onRoster = null; // squad-builder rerender hook
    this.battle = null;
    this.bc = null;
    this.cids = new Map(); // unit -> cid
    this.byCid = new Map(); // cid -> unit
    this.owners = new Map(); // member(roster) id -> { owner, figure }
    this.pendingMoves = new Set(); // member-commanded units mid-walk
    this.lastPhase = null;
    this.lastStart = null; // re-sent to rejoining members
    this.phaseStartedAt = 0;
    this.turnTimeoutMs = TURN_TIMEOUT_MS; // overridable (tests dial it down)
    // Does an idle player's unit get auto-acted by the companion AI? True for
    // co-op (a battle must never stall on someone who wandered off). A DUEL
    // sets it false: nothing may ever act for a duellist (js/duelBattle.js).
    this.autoAct = true;
    this.timer = null;
    this.confirmTimer = null;
    this.unsubs = this.subscribe();
  }

  // The net events this authority listens on. Split out so a subclass can
  // ride a different transport with the same brain: the duel host takes the
  // room channel's `duel-relay` instead of the party stream.
  subscribe() {
    const net = this.net;
    return [
      net.on('descend-ack', (m) => this.onAck(m)),
      net.on('relay', (m) => this.onRelay(m)),
      net.on('party', (m) => this.onPartyChange(m)),
    ];
  }

  // Announce the descent to the party; members get CONFIRM_MS to answer.
  announce(partyState, dungeonId) {
    this.members.clear();
    const me = String(this.getName() || '').toLowerCase();
    for (const m of partyState.members) {
      if (m.name.toLowerCase() === me) continue;
      this.members.set(m.name.toLowerCase(), { name: m.name, status: 'pending', classId: 'fighter', figure: m.figure });
    }
    this.net.send({ t: 'descend', dungeon: dungeonId });
    clearTimeout(this.confirmTimer);
    this.confirmTimer = setTimeout(() => {
      // silence = dropped from this descent (the party itself is intact)
      for (const m of this.members.values()) {
        if (m.status === 'pending') m.status = 'declined';
      }
      if (this.onRoster) this.onRoster();
    }, CONFIRM_MS);
  }

  // A member answered the confirm. The sender is `msg.from` — the name
  // SupabaseNet stamps on every party frame (send(): `{ ...msg, t, from }`),
  // the same field onRelay/handleCommand and the hello catch-up key off. It is
  // the ONLY identity on the wire here: CoopMember.activate/decline send just
  // { t, accept, classId, figure }, so reading msg.name found undefined, missed
  // every roster entry, and left every member 'pending' until the CONFIRM_MS
  // timer flipped them to 'declined' — the leader descended alone, always.
  onAck(msg) {
    const m = this.members.get(String(msg.from || '').toLowerCase());
    if (!m || m.status !== 'pending') return;
    m.status = msg.accept ? 'ready' : 'declined';
    if (msg.accept) {
      m.classId = msg.classId || 'fighter';
      if (msg.figure) m.figure = msg.figure;
    }
    if (this.onRoster) this.onRoster();
  }

  readyMembers() {
    return [...this.members.values()].filter((m) => m.status === 'ready');
  }

  // roster member id -> owning player (set by beginRun in main.js)
  setOwner(memberId, owner, figure) {
    this.owners.set(memberId, { owner, figure });
  }

  relay(data, to = null) {
    this.net.send(to ? { t: 'relay', data, to } : { t: 'relay', data });
  }

  // -------------------------------------------------------- battle authority

  // Called by RunController.toBattle (this.coop hook) with the live engine.
  battleStarted({ battle, bc, players, enemies, node, run }) {
    this.teardownBattle();
    const zoom = battle.room.zoom === 1 ? 'm' : 's';
    players.forEach((u, i) => this.link(u, `p${i}`));
    enemies.forEach((u, i) => this.link(u, `e${i}`));
    // members' units wear their real Habbo figures on the leader's screen too
    for (const u of players) {
      const own = this.owners.get(u.id);
      if (own && own.owner && own.figure && !u.useSprites) u.sprites = figureSprites(own.figure, zoom);
    }
    this.wireCapture(battle, bc);
    this.lastStart = {
      k: 'start',
      dungeonId: run.dungeon.id,
      eventPicks: run.eventPicks,
      seed: run.seed, // guests must regenerate the SAME seeded encounter
      battleNumber: run.battleNumber(),
      squadSize: players.length, // encounter was scaled to this many combatants
      nodeIndex: run.nodeIndex,
      battleName: node.name,
      players: players.map((u) => this.serializeUnit(u)),
      enemyCount: enemies.length,
      log: battle.log.slice(),
    };
    this.relay(this.lastStart);
    this.syncPhase(true);
  }

  // Leader promotion: take over an already-live battle (replica units are
  // linked by the caller via byCid). No lastStart — late joiners only get
  // snapshots from here on.
  adoptBattle({ battle, bc, byCid }) {
    this.teardownBattle();
    for (const [cid, u] of byCid) {
      this.link(u, cid);
      // owners ride on the replica units (spec.owner from the old start)
      if (u.owner) this.owners.set(u.id, { owner: u.owner, figure: null });
    }
    this.wireCapture(battle, bc);
    this.lastStart = null;
    this.syncPhase(true);
  }

  // Shared authority wiring: command gating, movement + event capture.
  wireCapture(battle, bc) {
    this.battle = battle;
    this.bc = bc;
    // the leader commands their own unit + AI slots, never a member's
    bc.canSelect = (u) => {
      const own = this.owners.get(u.id);
      return !own || !own.owner || own.owner.toLowerCase() === String(this.getName()).toLowerCase();
    };
    // capture movement: every followPath (player taps AND enemy AI) relays
    for (const u of this.byCid.values()) {
      const orig = u.followPath.bind(u);
      u.followPath = (path) => {
        const ok = orig(path);
        if (ok) this.relay({ k: 'move', cid: this.cids.get(u), path });
        return ok;
      };
    }
    // capture engine events
    const origFx = battle.onFx;
    battle.onFx = (e) => {
      origFx(e);
      this.relay({ k: 'fx', ...this.serializeFx(e) });
    };
    const origLog = battle.onLog;
    battle.onLog = (m) => {
      origLog(m);
      this.relay({ k: 'log', msg: m });
    };
    const origEnd = battle.onEnd;
    battle.onEnd = (result) => {
      this.relay({ k: 'end', result });
      origEnd(result);
    };
    const origChange = battle.onChange;
    battle.onChange = () => {
      origChange();
      this.syncPhase();
    };
    this.lastPhase = null;
    this.phaseStartedAt = performance.now();
    this.timer = setInterval(() => this.tick(), 120);
  }


  link(unit, cid) {
    this.cids.set(unit, cid);
    this.byCid.set(cid, unit);
  }

  serializeUnit(u) {
    const own = this.owners.get(u.id) || {};
    return {
      cid: this.cids.get(u),
      classId: u.classId,
      name: u.name,
      level: u.level,
      x: u.x,
      y: u.y,
      dir: u.dir,
      stats: { ...u.stats },
      // Whether this unit has any skill at all. The skill LIST does not cross
      // the wire (a replica rebuilds class skills from classId, and never sees
      // the leader's Origins tree skills), so without this a leader whose class
      // has no skill of its own would show an MP bar on the host and none on a
      // guest. See rosterBars.
      castsSkills: (u.skills || []).length > 0,
      shield: u.shield,
      tag: u.tag,
      owner: own.owner || null,
      figure: u.useSprites ? own.figure || null : own.figure || null,
    };
  }

  serializeFx(e) {
    const out = { kind: e.kind };
    if (e.attacker) out.attacker = this.cids.get(e.attacker);
    if (e.caster) out.caster = this.cids.get(e.caster);
    if (e.target) out.target = this.cids.get(e.target);
    if (e.dmg != null) out.dmg = e.dmg;
    if (e.amount != null) out.amount = e.amount;
    if (e.killed != null) out.killed = e.killed;
    if (e.skill) out.skill = { name: e.skill.name, kind: e.skill.kind };
    if (e.spec) out.spec = { toggles: e.spec.toggles, gold: e.spec.gold, label: e.spec.label, kind: e.spec.kind };
    // authoritative stat echoes so replicas never drift
    if (e.attacker) out.aDir = e.attacker.dir;
    // The caster's pool, echoed for the same reason HP is: MP is spent inside
    // resolveSkill on the HOST's unit, so without this a guest's replica keeps
    // a full pool until the next phase snapshot and its disabled-button state
    // drifts from the host's.
    if (e.caster && e.caster.stats) out.cMp = e.caster.stats.mp;
    if (e.target && e.target.stats) {
      out.tHp = e.target.stats.hp;
      out.tShield = e.target.shield;
      // Root is an authoritative ECHO for the same reason HP is. serializeFx
      // deliberately strips a skill down to { name, kind }, so `status` never
      // crosses the wire and a replica could not re-derive a root even in
      // principle — it would show the damage and miss the fact that the victim
      // has just lost their next move.
      out.tRooted = e.target.rooted || 0;
    }
    return out;
  }

  unitSnapshot() {
    const units = [];
    for (const [cid, u] of this.byCid) {
      units.push({
        cid,
        x: u.x,
        y: u.y,
        dir: u.dir,
        hp: u.stats ? u.stats.hp : 0,
        maxHp: u.stats ? u.stats.maxHp : 0,
        mp: u.stats ? u.stats.mp : 0,
        maxMp: u.stats ? u.stats.maxMp : 0,
        shield: u.shield,
        rooted: u.rooted || 0,
        rootedThisTurn: !!u.rootedThisTurn,
        moved: u.moved,
        acted: u.acted,
        alive: u.alive,
      });
    }
    return units;
  }

  // Broadcast phase/turn changes with a full snapshot — the turn-boundary
  // truth replicas re-align to (and the promotion/resume seed).
  syncPhase(force = false) {
    const b = this.battle;
    if (!b) return;
    const key = `${b.phase}:${b.turn}`;
    if (!force && key === this.lastPhase) return;
    this.lastPhase = key;
    this.phaseStartedAt = performance.now();
    this.relay({ k: 'phase', phase: b.phase, turn: b.turn, units: this.unitSnapshot() });
  }

  // ------------------------------------------------------- member commands

  onRelay(msg) {
    const data = msg.data || {};
    if (data.k === 'cmd') this.handleCommand(msg.from, data);
    if (data.k === 'hello' && this.lastStart) {
      // a member (re)joined mid-battle: targeted catch-up
      this.relay(this.lastStart, msg.from);
      this.relay({ k: 'phase', phase: this.battle.phase, turn: this.battle.turn, units: this.unitSnapshot() }, msg.from);
    }
  }

  // Which units a remote client may ever command. Co-op: the player squad
  // only — the enemy team is this client's AI and is nobody else's to move.
  commandable(unit) {
    return unit.team === 'player';
  }

  // The phase a unit's owner may act in. Co-op commands only ever land in the
  // player phase; in a duel the guest's unit is team 'enemy' and acts in the
  // enemy phase, which is the whole reason this is a lookup and not a literal.
  phaseFor(unit) {
    return 'player';
  }

  // Validate + execute one member command against the live engine.
  handleCommand(from, cmd) {
    const b = this.battle;
    if (!b) return this.reject(from, 'not your phase');
    const unit = this.byCid.get(cmd.cid);
    if (!unit || !unit.alive || !this.commandable(unit)) return this.reject(from, 'no such unit');
    // Ownership before phase: both gates can be shut at once (a duellist
    // reaching for the OTHER player's unit is also reaching outside their
    // phase), and "not your unit" is the refusal that names what happened.
    const own = this.owners.get(unit.id);
    if (!own || !own.owner || own.owner.toLowerCase() !== String(from).toLowerCase()) {
      return this.reject(from, 'not your unit');
    }
    if (b.phase !== this.phaseFor(unit)) return this.reject(from, 'not your phase');
    if (unit.acted) return this.reject(from, 'unit already acted');

    if (cmd.type === 'move') {
      if (unit.moved || this.pendingMoves.has(unit)) return this.reject(from, 'already moved');
      const k = `${cmd.x},${cmd.y}`;
      if (!b.moveTiles(unit).has(k)) return this.reject(from, 'illegal move');
      const path = b.pathTo(unit, cmd.x, cmd.y);
      if (!path || !path.length) return this.reject(from, 'no path');
      unit.followPath(path); // relayed by the capture wrapper
      this.pendingMoves.add(unit);
    } else if (cmd.type === 'attack') {
      const target = this.byCid.get(cmd.target);
      if (!target || !b.attackTargets(unit).includes(target)) return this.reject(from, 'illegal target');
      b.resolveAttack(unit, target);
      this.afterCommand();
    } else if (cmd.type === 'skill') {
      const skill = (unit.skills || [])[cmd.skill || 0];
      if (!skill) return this.reject(from, 'no such skill');
      const target = skill.target === 'self' ? unit : this.byCid.get(cmd.target);
      if (!target || !b.skillTargets(unit, skill).includes(target)) return this.reject(from, 'illegal target');
      // The guest's client is not trusted, so MP is re-checked here for the
      // same reason the target is. resolveSkill's own guard is the backstop;
      // this one produces the honest reason instead of a silent no-op.
      if (!b.canAfford(unit, skill)) return this.reject(from, 'not enough MP');
      b.resolveSkill(unit, target, skill);
      this.afterCommand();
    } else if (cmd.type === 'wait' || cmd.type === 'endTurn') {
      unit.moved = true;
      unit.acted = true;
      this.afterCommand();
    } else {
      this.reject(from, `unknown command "${cmd.type}"`);
    }
  }

  reject(to, reason) {
    this.relay({ k: 'rejected', reason }, to);
  }

  afterCommand() {
    const b = this.battle;
    if (b.phase === 'player' && b.allPlayersDone()) b.endPlayerPhase();
    // A duel's enemy phase has no AI ticker to notice it is over (battle.js
    // enemyAi:false), so the authority closes it the same way it closes the
    // player phase: when every living unit of that team is done.
    else if (b.phase === 'enemy' && !b.enemyAi && b.allEnemiesDone()) b.endEnemyPhase();
    if (this.bc) {
      this.bc.refreshOverlays();
      this.bc.render();
    }
  }

  // 120ms authority tick: settle member moves, enforce the turn timeout,
  // and keep replicas' done-flags fresh (promotion resumes from these).
  tick() {
    const b = this.battle;
    if (!b) return;
    const flags = [...this.byCid.values()].map((u) => (u.moved ? 1 : 0) + (u.acted ? 2 : 0)).join('');
    if (flags !== this.lastFlags) {
      this.lastFlags = flags;
      this.relay({ k: 'phase', phase: b.phase, turn: b.turn, units: this.unitSnapshot() });
    }
    for (const u of [...this.pendingMoves]) {
      if (u.walking) continue;
      this.pendingMoves.delete(u);
      u.moved = true;
      b.unitSettled(u); // traps / switches / treasure fire server-of-record side
      if (!u.alive) u.acted = true;
      b.checkEnd();
      this.afterCommand();
    }
    // 60s idle members: the companion AI acts their unit so nothing stalls
    if (this.autoAct && b.phase === 'player' && performance.now() - this.phaseStartedAt > this.turnTimeoutMs) {
      const idle = [...this.byCid.values()].find(
        (u) => u.team === 'player' && u.alive && !u.done && this.ownedByMember(u) && !this.pendingMoves.has(u)
      );
      if (idle) autoActPlayer(b, idle, () => this.afterCommand());
    }
  }

  ownedByMember(u) {
    const own = this.owners.get(u.id);
    return !!(own && own.owner && own.owner.toLowerCase() !== String(this.getName()).toLowerCase());
  }

  // Party churn mid-battle: a departed member's unit flips to AI for the
  // rest of the battle (their next rejoin re-claims it via 'hello').
  onPartyChange(msg) {
    if (!this.battle) return;
    const present = new Set((msg.members || []).map((m) => m.name.toLowerCase()));
    for (const [id, own] of this.owners) {
      if (own.owner && !present.has(own.owner.toLowerCase())) {
        own.owner = null; // AI-controlled from here on
      }
    }
  }

  // Run-level screens members can't see locally.
  screen(kind) {
    this.relay({ k: 'screen', kind });
  }

  // A roster member was revived between rooms — the leader cracked a Revival
  // Crystal at camp (RunController.renderCampBody). The leader owns the Run and
  // did that locally, so without this the member's client still holds the corpse
  // from the battle just fought and keeps rendering the fallen state.
  //
  // It rides the EXISTING phase frame rather than a channel of its own, because
  // that frame already carries exactly the fact in question: unitSnapshot()
  // stamps `alive` per unit, and the member's applyPhase already re-reads hp
  // from it. So the whole revive is expressible as "here is the snapshot again,
  // with that unit standing" — no new message kind, and no second definition of
  // what being alive means.
  //
  // The last battle's units are still linked here: teardownBattle only runs when
  // the NEXT battle starts, so at camp this.byCid still holds the finished
  // field, corpse included. That corpse is the thing the member is looking at.
  //
  // Returns whether a unit was actually found and re-broadcast.
  rosterRevived(member) {
    if (!member || !this.battle) return false;
    let unit = null;
    for (const u of this.byCid.values()) {
      if (u.id === member.id) { unit = u; break; }
    }
    if (!unit || !unit.stats) return false;
    // Match the roster, which is the authority between rooms (run.js wrote the
    // half-max hp); the unit is only the wire's view of it.
    unit.stats.hp = member.hp;
    this.syncPhase(true); // force: the phase/turn key has not moved
    return true;
  }

  // End of the whole descent (victory/defeat). shares: per-member loot info.
  descentOver(result, shares = null) {
    for (const m of this.readyMembers()) {
      this.relay({ k: 'over', result, share: shares ? shares[m.name.toLowerCase()] || null : null }, m.name);
    }
    this.end();
  }

  teardownBattle() {
    clearInterval(this.timer);
    this.timer = null;
    this.battle = null;
    this.bc = null;
    this.cids = new Map();
    this.byCid = new Map();
    this.pendingMoves.clear();
  }

  end() {
    this.teardownBattle();
    clearTimeout(this.confirmTimer);
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }
}

// Companion auto-act for an idle member's unit: attack in place, else move
// into range and attack, else wait. Mirrors ai.js tiers 1-2 from the player
// team's side, reusing the engine's own legality queries.
export function autoActPlayer(battle, unit, after) {
  const finish = () => {
    unit.moved = true;
    unit.acted = true;
    if (after) after();
  };
  const hitNow = battle.attackTargets(unit);
  if (hitNow.length) {
    battle.resolveAttack(unit, weakest(hitNow));
    if (after) after();
    return;
  }
  if (!unit.moved) {
    const { reach } = battle.computeMoveField(unit);
    let best = null;
    for (const [k, dist] of reach) {
      const [x, y] = k.split(',').map(Number);
      if (battle.unitAt(x, y) && !(x === unit.x && y === unit.y)) continue;
      const targets = battle.attackTargets(unit, x, y);
      if (!targets.length) continue;
      const target = weakest(targets);
      const score = dist * 100 + target.stats.hp;
      if (!best || score < best.score) best = { x, y, target, score };
    }
    if (best) {
      const path = battle.pathTo(unit, best.x, best.y);
      if (path && path.length) {
        unit.followPath(path);
        unit.moved = true;
        // the attack lands on the leader's next settle pass
        const settle = setInterval(() => {
          if (unit.walking) return;
          clearInterval(settle);
          battle.unitSettled(unit);
          const t = battle.attackTargets(unit);
          if (unit.alive && t.length) battle.resolveAttack(unit, weakest(t));
          else unit.acted = true;
          battle.checkEnd();
          if (after) after();
        }, 120);
        return;
      }
    }
  }
  finish();
}

function weakest(list) {
  return list.slice().sort((a, b) => a.stats.hp - b.stats.hp)[0];
}

// ---------------------------------------------------------------- member side

// Renders the leader's event stream onto a replica room and turns the
// member's taps into serialized commands for their own unit.
export class SpectateController {
  constructor(dom, member) {
    this.dom = dom; // { banner, actions, roster, log }
    this.member = member; // CoopMember (owns the net + replica state)
    this.game = null;
    this.sel = null;
    this.mode = 'normal';
    this.activeSkill = null;
    this.activeSkillIndex = 0;
  }

  onAttach(game) {
    this.game = game;
  }
  onRoom() {}

  get shadow() {
    return this.member.shadow;
  }

  myUnits() {
    return this.member.myUnits();
  }

  // The team this client's own units sit on, and therefore the phase it may
  // command in — the two share a name in the engine ('player' / 'enemy').
  // Co-op members always play the player team. A DUEL guest's own unit is the
  // host's team-'enemy' unit, which this client renders as its own: same
  // engine, same phase names, opposite seat (js/duelBattle.js).
  get myTeam() {
    return 'player';
  }

  get foeTeam() {
    return this.myTeam === 'player' ? 'enemy' : 'player';
  }

  get commanding() {
    return this.member.shadow && this.member.shadow.phase === this.myTeam;
  }

  onTap(tile) {
    const shadow = this.shadow;
    if (!shadow || !this.commanding) return;
    const here = shadow.unitAt(tile.x, tile.y);
    const k = `${tile.x},${tile.y}`;

    if (this.mode === 'skill') {
      if (here && this.game.overlays.skill.has(k)) {
        this.member.sendCommand({
          type: 'skill',
          cid: this.member.cidOf(this.sel),
          skill: this.activeSkillIndex,
          target: this.member.cidOf(here),
        });
        this.sel.acted = true; // optimistic; the phase snapshot is the truth
        this.deselect();
      } else {
        this.cancel();
      }
      return;
    }

    if (!this.sel) {
      if (here && this.isMine(here) && here.alive && !here.done) this.select(here);
      return;
    }

    if (here && here.team === this.foeTeam && this.game.overlays.target.has(k)) {
      this.member.sendCommand({ type: 'attack', cid: this.member.cidOf(this.sel), target: this.member.cidOf(here) });
      this.sel.acted = true; // optimistic; the phase snapshot is the truth
      this.deselect();
      return;
    }

    if (!this.sel.moved && this.game.overlays.move.has(k)) {
      this.member.sendCommand({ type: 'move', cid: this.member.cidOf(this.sel), x: tile.x, y: tile.y });
      this.sel.moved = true; // optimistic
      this.refreshOverlays();
      this.render();
      return;
    }
    if (here && this.isMine(here) && here.alive && !here.done) this.select(here);
    else this.deselect();
  }

  isMine(unit) {
    return this.myUnits().includes(unit);
  }

  /** Has this client been knocked out of the fight? True once it owns units
   *  and none of them are still standing.
   *
   *  Deliberately NOT the same question as "nothing of mine can act": a unit
   *  that has merely acted is done for the turn and will be back next one,
   *  whereas hp 0 is permanent — js/run.js's roster commits to downed-for-the
   *  -rest-of-the-run, with no mid-run revive. Conflating the two is the bug
   *  this fixes: a dead member fell through to "Waiting for the party…" and
   *  waited for a turn that was never coming.
   *
   *  A member with no units at all (a spectator, or a replica mid-rebuild) is
   *  not fallen — they never had anything to lose. */
  get fallen() {
    const mine = this.myUnits();
    return mine.length > 0 && !mine.some((u) => u.alive);
  }

  /** Is this client out of the descent for good? True once it has held a hero
   *  at some point and now holds none.
   *
   *  This is the state AFTER `fallen`, and the two are deliberately separate
   *  because they promise different things. `fallen` means "your hero is down
   *  but this fight is still yours to watch"; out-of-run means "the party has
   *  moved on without you and no later battle will hand you a unit".
   *
   *  Derived, not announced: js/run.js's instantiateSquad only builds units for
   *  livingSquad(), so a member who was never revived simply stops appearing in
   *  the leader's `start` frame. Owning nothing is therefore the signal - the
   *  catch being that owning nothing is ALSO true of a spectator who never had
   *  a hero, which is why this leans on member.everHadUnit rather than on the
   *  empty roster alone.
   *
   *  Without it the member fell through to "Waiting for the party..." for the
   *  rest of the run: `fallen` returns false with no units (correctly - there
   *  is no corpse on THIS field to speak of), so the fallen branch could not
   *  catch them either, and they were promised a turn that could never come. */
  get outOfRun() {
    return !!this.member.everHadUnit && this.myUnits().length === 0;
  }

  /** Could this client command something right now? The footer hint teaches
   *  unit commands, so this - not any one sidelined state - is what decides
   *  whether showing it is honest.
   *
   *  Framed as a capability rather than as "fallen or out" because there are
   *  four ways to have nothing to tap and only two of them are those states:
   *  a plain spectator never had a hero, and at won/lost the battle is over for
   *  everyone. Enumerating states would have missed both. */
  get canCommand() {
    const shadow = this.shadow;
    if (!shadow) return false;
    if (shadow.phase !== 'player' && shadow.phase !== 'enemy') return false; // won/lost
    return this.myUnits().some((u) => u.alive);
  }

  /** A dead unit is not a live selection: its overlays point at moves it can
   *  never make and every action button acts on something that cannot act. */
  dropDeadSelection() {
    if (!this.sel || this.sel.alive) return;
    this.sel.selected = false;
    this.sel = null;
    this.mode = 'normal';
    this.activeSkill = null;
  }

  select(unit) {
    if (this.sel) this.sel.selected = false;
    this.sel = unit;
    this.mode = 'normal';
    if (unit) unit.selected = true;
    this.refreshOverlays();
    this.render();
  }

  deselect() {
    this.select(null);
  }

  cancel() {
    this.mode = 'normal';
    this.activeSkill = null;
    this.refreshOverlays();
    this.render();
  }

  enterSkill(skill, index) {
    if (!this.sel || this.sel.acted) return;
    if (this.shadow && !this.shadow.canAfford(this.sel, skill)) return;
    if (skill.target === 'self') {
      this.member.sendCommand({ type: 'skill', cid: this.member.cidOf(this.sel), skill: index });
      this.sel.acted = true;
      this.deselect();
      return;
    }
    this.activeSkill = skill;
    this.activeSkillIndex = index;
    this.mode = 'skill';
    this.refreshOverlays();
    this.render();
  }

  wait() {
    if (!this.sel) return;
    this.member.sendCommand({ type: 'wait', cid: this.member.cidOf(this.sel) });
    this.sel.acted = true;
    this.deselect();
  }

  refreshOverlays() {
    const g = this.game;
    this.dropDeadSelection();
    if (!g) return;
    g.clearOverlays();
    const u = this.sel;
    const shadow = this.shadow;
    if (!u || !shadow || !this.commanding) return;
    if (this.mode === 'skill') {
      for (const t of shadow.skillTargets(u, this.activeSkill)) g.overlays.skill.add(`${t.x},${t.y}`);
      return;
    }
    if (!u.moved) for (const k of shadow.moveTiles(u)) g.overlays.move.add(k);
    for (const t of shadow.attackTargets(u)) g.overlays.target.add(`${t.x},${t.y}`);
  }

  update(now) {
    // replica units animate through the normal Avatar tick (Game.loop);
    // nothing to simulate here — the leader's stream is the authority
  }

  render() {
    const dom = this.dom;
    const shadow = this.shadow;
    if (!dom.banner || !shadow) return;
    this.dropDeadSelection();
    const fallen = this.fallen;
    const out = this.outOfRun;
    const mineReady = !fallen && !out && this.myUnits().some((u) => u.alive && !u.done);
    // A sidelined member is still WATCHING a live fight, so the phase still
    // reads out - what changes is that it is no longer addressed to them. The
    // end-of-battle banners are left alone: won/lost is the party's outcome and
    // it outranks any one member's state.
    const live = shadow.phase === 'player' || shadow.phase === 'enemy';
    // Two ways to be a spectator, in order of finality. Out-of-run OUTRANKS
    // fallen: once the party has descended without you, "you have fallen" is
    // last battle's news and would imply this fight is still somehow yours.
    const aside = out ? 'out' : (fallen ? 'fallen' : null);
    const label = aside && live
      ? (out ? 'You are out of the run' : `Turn ${shadow.turn}, you have fallen`)
      : {
        player: mineReady ? `Turn ${shadow.turn}, your unit is ready` : `Turn ${shadow.turn}, party is moving`,
        enemy: `Turn ${shadow.turn}, enemy phase`,
        won: 'Victory!',
        lost: 'Defeated...',
      }[shadow.phase];
    dom.banner.innerHTML = `<b>${label}:</b> <span class="obj">Co-op: ${this.member.leaderName}'s descent</span>`;
    dom.banner.className = `banner ${shadow.phase}${aside && live ? ` ${aside}` : ''}`;

    dom.actions.innerHTML = '';
    if (out && live) {
      // The run goes on without them: no unit now and none coming, because
      // instantiateSquad only ever builds the living. Promise nothing.
      this.btn('You are watching your party finish the run', null, true);
    } else if (fallen && live) {
      // No revive, no rejoin, nothing to press - say so once, plainly, instead
      // of offering a wait that never ends.
      this.btn('You are watching the rest of the fight', null, true);
    } else if (shadow.phase === 'player') {
      if (this.mode === 'skill') {
        this.btn(`Tap a green target for ${this.activeSkill.name}`, null, true);
        this.btn('Back', () => this.cancel());
      } else if (this.sel) {
        if (shadow.attackTargets(this.sel).length) this.btn('Attack a red foe', null, true);
        (this.sel.skills || []).forEach((sk, i) => {
          if (!shadow.skillTargets(this.sel, sk).length && sk.target !== 'self') return;
          const label = sk.cost ? `${sk.name} (${sk.cost} MP)` : sk.name;
          // A hint from the replica's pool, not authority: the host re-checks
          // and answers 'not enough MP' if this seat is wrong.
          if (shadow.canAfford(this.sel, sk)) this.btn(label, () => this.enterSkill(sk, i));
          else this.btn(label, null, true);
        });
        this.btn('Wait', () => this.wait());
        this.btn('Cancel', () => this.deselect());
      } else if (mineReady) {
        this.btn('Tap your unit to command it', null, true);
      } else {
        this.btn('Waiting for the party…', null, true);
      }
    } else if (shadow.phase === 'enemy') {
      this.btn('Enemy phase…', null, true);
    }

    // The footer hint teaches unit commands ("Tap your unit -> blue to move").
    // To anyone with nothing to command it is instructions for a thing they do
    // not have: the action area directly above says there is nothing to press,
    // and then the hint tells them to tap a unit anyway. It comes back by
    // itself the moment they can command again (a camp revive does exactly
    // that), because this is recomputed on every render.
    if (dom.hint) dom.hint.style.display = this.canCommand ? '' : 'none';

    dom.roster.innerHTML = '';
    for (const u of shadow.units) {
      const row = document.createElement('div');
      row.className = `roster-row ${u.team}${u.alive ? '' : ' dead'}${u === this.sel ? ' sel' : ''}${u.done && u.alive ? ' done' : ''}`;
      row.innerHTML =
        `<span class="rname">${u.name}</span>` +
        `<span class="rcls">${u.cls.name}${u.team === 'player' ? ` L${u.level}` : ''}</span>` +
        rosterBars(u, false) +
        `<span class="rhpn">${u.alive ? u.stats.hp : '✕'}</span>`;
      dom.roster.appendChild(row);
    }

    // An out-of-run member's hero is not on this field at all (the leader's
    // start frame only lists the living), so the loop above cannot draw them
    // and their own name would simply be absent from their own roster.
    //
    // Keep them on it, greyed and struck out, using the details latched while
    // they still had a unit. Two reasons. It matches what the SAME player saw
    // one battle earlier, where the fallen state shows their corpse as a dead
    // row with a cross — vanishing entirely turns one continuous fact ("my hero
    // is down") into two unrelated-looking screens. And a roster that silently
    // drops you reads as a disconnect, which is precisely the wrong thing to
    // suggest to somebody who is still connected and still watching.
    const ghost = this.outOfRun ? this.member.lastHero : null;
    if (ghost && live) {
      const row = document.createElement('div');
      row.className = 'roster-row player dead ghost';
      row.innerHTML =
        `<span class="rname">${ghost.name}</span>` +
        `<span class="rcls">${ghost.cls} L${ghost.level}</span>` +
        '<span class="rhp"><span class="rhp-fill" style="width:0%"></span></span>' +
        '<span class="rhpn">✕</span>';
      dom.roster.appendChild(row);
    }
  }

  btn(label, fn, disabled = false) {
    const b = document.createElement('button');
    b.textContent = label;
    if (disabled) b.disabled = true;
    else b.addEventListener('click', fn);
    this.dom.actions.appendChild(b);
  }

  appendLog(msg) {
    if (!this.dom.log) return;
    const line = document.createElement('div');
    line.textContent = msg;
    this.dom.log.appendChild(line);
    this.dom.log.scrollTop = this.dom.log.scrollHeight;
    while (this.dom.log.childNodes.length > 60) this.dom.log.removeChild(this.dom.log.firstChild);
  }
}

export class CoopMember {
  // game: shared Game renderer; dom: battle panel elements; ui: screen hooks
  // from main.js { waiting(html), battleReady(), exit(reason, share) }
  constructor(net, game, dom, getName) {
    this.net = net;
    this.game = game;
    this.dom = dom;
    this.getName = getName;
    this.ui = null;
    this.active = false;
    this.leaderName = null;
    this.shadow = null; // query-only Battle over the replica units
    this.byCid = new Map(); // cid -> unit
    this.cidBack = new Map(); // unit -> cid
    this.controller = null;
    this.promoted = null; // CoopLeader after a leader hand-off
    // True while the party is on a between-rooms screen (camp / event) rather
    // than in a battle. A revive can only land here, and here the battle panel
    // is hidden behind the waiting overlay, so this is what decides whether a
    // revive needs ANNOUNCING or merely rendering.
    this.betweenRooms = false;
    // Have I ever held a hero in this descent? Latched on for the whole descent
    // once true, because it is what separates "the party left me behind" from
    // "I am only spectating": both own nothing, and only the first is out of the
    // run. Read by SpectateController.outOfRun. Cleared by deactivate(), i.e.
    // when the descent itself ends.
    this.everHadUnit = false;
    // Display details of the last hero this client owned: { name, cls, level }.
    // Latched with everHadUnit, and for the same reason - once the party moves
    // on without them the leader stops sending their unit at all, so this is
    // the only record left of who they were playing. Drawn as the greyed ghost
    // row on their own roster (SpectateController.render).
    this.lastHero = null;
    this.unsubs = [];
  }

  // Am I still standing? 'none' when I own no units at all, which is NOT the
  // same as being down: a spectator and a replica mid-rebuild both own nothing.
  myLiveness() {
    const mine = this.myUnits();
    if (!mine.length) return 'none';
    return mine.some((u) => u.alive) ? 'up' : 'down';
  }

  // Latch everHadUnit the moment a frame hands me a hero. Called after any
  // frame that can change what I own, so the fact is derived from the leader's
  // ordinary start/phase stream rather than from a message about my status.
  noteOwnership() {
    const mine = this.myUnits();
    if (!mine.length) return;
    this.everHadUnit = true;
    const u = mine[0];
    this.lastHero = {
      name: u.name,
      cls: (u.cls && u.cls.name) || u.classId || '',
      level: u.level || 1,
    };
  }

  // Member accepted the descend confirm: follow the leader's stream.
  activate(leaderName, ui) {
    this.deactivate();
    this.active = true;
    this.leaderName = leaderName;
    this.ui = ui;
    this.unsubs = [
      this.net.on('relay', (m) => this.onRelay(m)),
      this.net.on('party', (m) => this.onPartyChange(m)),
      this.net.on('close', () => this.exit('Connection lost.')),
    ];
    this.net.send({ t: 'descend-ack', accept: true, classId: this.ui.classId, figure: this.ui.figure });
    this.ui.waiting(`<b>${esc(leaderName)}</b> is opening the way down…`);
  }

  decline() {
    this.net.send({ t: 'descend-ack', accept: false });
  }

  deactivate() {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.active = false;
    this.shadow = null;
    this.byCid.clear();
    this.cidBack.clear();
    this.controller = null;
    this.betweenRooms = false;
    this.everHadUnit = false; // a new descent starts with no history
    this.lastHero = null;
    if (this.promoted) {
      this.promoted.end();
      this.promoted = null;
    }
  }

  exit(reason, share = null) {
    const ui = this.ui;
    this.deactivate();
    if (ui) ui.exit(reason, share);
  }

  cidOf(unit) {
    return this.cidBack.get(unit);
  }

  myUnits() {
    const me = String(this.getName() || '').toLowerCase();
    return [...this.byCid.values()].filter((u) => u.owner && u.owner.toLowerCase() === me);
  }

  sendCommand(cmd) {
    this.net.send({ t: 'relay', data: { k: 'cmd', ...cmd }, to: this.leaderName });
  }

  onRelay(msg) {
    if (this.promoted) return; // authority now — the CoopLeader handles relays
    const d = msg.data || {};
    switch (d.k) {
      case 'start':
        return this.buildReplica(d);
      case 'move':
        return this.applyMove(d);
      case 'fx':
        return this.applyFx(d);
      case 'log':
        return this.controller && this.controller.appendLog(d.msg);
      case 'phase':
        return this.applyPhase(d);
      case 'end':
        return this.applyEnd(d);
      case 'screen':
        return this.applyScreen(d);
      case 'over':
        return this.exit(d.result === 'won' ? 'The descent is complete!' : 'The descent has ended.', d.share);
      case 'rejected':
        return this.controller && this.controller.appendLog(`(command refused: ${d.reason})`);
    }
  }

  // Rebuild the deterministic room + enemies, then the squad from the wire.
  buildReplica(d) {
    const dungeon = buildDungeon(d.dungeonId, d.eventPicks || {});
    const node = dungeon && dungeon.nodes[d.nodeIndex];
    if (!node || node.type !== 'battle') return;
    this.betweenRooms = false; // a battle is starting: the panel is the screen again
    const room = node.makeRoom({ seed: d.seed ?? 0 });
    const enemies = node.makeEnemies(room, {
      seed: d.seed ?? 0,
      battleNumber: d.battleNumber ?? 1,
      squadSize: d.squadSize ?? 4,
    });
    this.byCid.clear();
    this.cidBack.clear();
    const zoom = room.zoom === 1 ? 'm' : 's';
    const players = (d.players || []).map((spec) => {
      const u = new Unit(room, null, spec.x, spec.y, {
        team: 'player',
        classId: spec.classId,
        name: spec.name,
        level: spec.level,
        dir: spec.dir,
        tag: spec.tag,
      });
      u.stats = { ...spec.stats };
      u.castsSkills = !!spec.castsSkills;
      u.shield = spec.shield || 0;
      u.owner = spec.owner || null;
      if (spec.figure) u.sprites = figureSprites(spec.figure, zoom);
      this.link(u, spec.cid);
      return u;
    });
    enemies.forEach((u, i) => this.link(u, `e${i}`));

    this.controller = new SpectateController(this.dom, this);
    this.game.setController(this.controller);
    this.game.setRoom(room);
    for (const u of [...players, ...enemies]) this.game.addUnit(u);
    // query-only engine over the same units: legality hints + banner text
    this.shadow = new Battle(room, [...players, ...enemies], { objective: node.objective });
    const goal = this.shadow.objective.tile;
    if (goal) this.game.overlays.objective.add(`${goal.x},${goal.y}`);
    if (this.dom.log) this.dom.log.innerHTML = '';
    for (const line of d.log || []) this.controller.appendLog(line);
    this.ui.battleReady(d.battleName);
    // Before the first render: whether I own a hero in THIS battle is what
    // decides between the ordinary UI and the out-of-run one.
    this.noteOwnership();
    this.controller.render();
  }

  link(unit, cid) {
    unit.cid = cid;
    this.byCid.set(cid, unit);
    this.cidBack.set(unit, cid);
  }

  applyMove(d) {
    const u = this.byCid.get(d.cid);
    if (u) u.followPath(d.path || []);
  }

  applyFx(d) {
    const e = { kind: d.kind };
    if (d.attacker) e.attacker = this.byCid.get(d.attacker);
    if (d.caster) e.caster = this.byCid.get(d.caster);
    if (d.target) e.target = this.byCid.get(d.target);
    if (d.dmg != null) e.dmg = d.dmg;
    if (d.amount != null) e.amount = d.amount;
    if (d.skill) e.skill = d.skill;
    if (d.spec) e.spec = d.spec;
    // authoritative echoes
    if (e.attacker && d.aDir != null) e.attacker.dir = d.aDir;
    if (e.caster && e.caster.stats && d.cMp != null) e.caster.stats.mp = d.cMp;
    if (e.target && e.target.stats && d.tHp != null) {
      e.target.stats.hp = d.tHp;
      e.target.shield = d.tShield || 0;
      if (d.tRooted != null) e.target.rooted = d.tRooted;
    }
    // world side-effects replicas must mirror
    if (this.shadow) {
      if (d.kind === 'switch' && d.spec) {
        for (const t of d.spec.toggles || []) this.shadow.room.toggleGate(t.x, t.y);
      }
      if ((d.kind === 'treasure' || d.kind === 'hazard') && e.target) {
        const fx = this.shadow.room.effectAt(e.target.x, e.target.y);
        if (fx && (d.kind === 'treasure' || fx.once)) fx.spent = true;
      }
    }
    if (e.target || e.caster || e.attacker) renderBattleFx(this.game, e);
    if (this.controller) this.controller.render();
  }

  // Turn-boundary truth: snap every unit to the leader's snapshot.
  applyPhase(d) {
    if (!this.shadow) return;
    const was = this.myLiveness();
    this.shadow.phase = d.phase;
    this.shadow.turn = d.turn;
    this.lastSnapshot = d;
    for (const spec of d.units || []) {
      const u = this.byCid.get(spec.cid);
      if (!u) continue;
      if (!u.walking) {
        u.x = spec.x;
        u.y = spec.y;
        u.z = u.room.heightAt(spec.x, spec.y) || 0;
      }
      u.dir = spec.dir;
      if (u.stats) {
        u.stats.hp = spec.hp;
        u.stats.maxHp = spec.maxHp;
        // A legacy leader on an older build sends no mp; leaving the replica's
        // own value alone beats snapping the pool to 0 and disabling every
        // skill button the guest owns.
        if (spec.mp != null) u.stats.mp = spec.mp;
        if (spec.maxMp != null) u.stats.maxMp = spec.maxMp;
      }
      u.shield = spec.shield;
      // rootedThisTurn is what moveTiles actually reads, and it is resolved by
      // resetTurn on the AUTHORITY's units only — a replica never runs one, so
      // both halves ride the snapshot.
      if (spec.rooted != null) u.rooted = spec.rooted;
      if (spec.rootedThisTurn != null) u.rootedThisTurn = spec.rootedThisTurn;
      u.moved = spec.moved;
      u.acted = spec.acted;
      if (!spec.alive && u.stats) u.stats.hp = 0;
    }
    // Back from the dead. Inside a battle this is impossible (hp 0 is permanent
    // for the rest of the run), so it means the leader spent a Revival Crystal
    // at camp. Say so out loud: the member is parked on a "the party makes camp"
    // overlay with no view of the leader's backpack, so a silent revive is
    // indistinguishable from still being dead until the next battle starts —
    // which is exactly the gap this closes.
    if (this.betweenRooms && was === 'down' && this.myLiveness() === 'up' && this.ui) {
      this.ui.waiting(
        `<b>${esc(this.leaderName)}</b> revived you! Waiting for the descent to continue…`
      );
    }
    this.noteOwnership();
    if (this.controller) {
      this.controller.refreshOverlays();
      this.controller.render();
    }
  }

  applyEnd(d) {
    if (this.shadow) this.shadow.phase = d.result;
    if (this.controller) this.controller.render();
  }

  applyScreen(d) {
    this.betweenRooms = true;
    const label = d.kind === 'camp' ? 'The party makes camp' : 'The party weighs a choice';
    this.ui.waiting(`${label} · <b>${esc(this.leaderName)}</b> is deciding…`);
  }

  // Party churn: if the crown lands on ME mid-battle, take over the sim from
  // the last turn-boundary snapshot (leader-loss promotion).
  onPartyChange(msg) {
    if (!msg.leader) {
      this.exit('The party has disbanded.');
      return;
    }
    const me = String(this.getName() || '').toLowerCase();
    if (msg.leader.toLowerCase() === me && this.leaderName && this.leaderName.toLowerCase() !== me) {
      this.promote();
    } else {
      this.leaderName = msg.leader;
    }
  }

  // Become the authority: the replica room + units are already live; rebuild
  // a real Battle over them at the last snapshot and adopt it into a fresh
  // capture (fresh RNG from here — acceptable co-op resume).
  promote() {
    if (!this.shadow || !this.ui || !this.ui.promote) {
      this.exit('The leader has left the descent.');
      return;
    }
    const snapshot = this.lastSnapshot;
    const units = [...this.byCid.values()];
    const battle = this.shadow; // same engine instance: state already synced
    battle.onEnd = () => {};
    battle._ended = false;
    if (snapshot) {
      battle.turn = snapshot.turn;
    }
    if (battle.phase !== 'player') {
      // resume at the player phase from the boundary (never mid-enemy-AI)
      battle.startPlayerPhase();
    }
    const promotedName = this.leaderName;
    this.leaderName = this.getName();
    this.promoted = this.ui.promote({ battle, units, byCid: this.byCid, from: promotedName });
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
