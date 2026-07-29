import { canStep, DIRECTIONS, rotationBetween } from './pathfinder.js';
import { computeDamage, heightMultiplier, hasLineOfSight, tileDistance, statsProfileFor } from './classes.js';
import { runEnemyTurn } from './ai.js';

// Vandal Hearts-style tactics battle. Phases:
//   'player' -> command every ready unit, then End Turn
//   'enemy'  -> AI moves each enemy in sequence (animated), then back to player
//   'won' / 'lost'
//
// The engine is pure state + a per-frame update(now) that advances animated
// movement and the enemy phase. It never touches the DOM; the controller reads
// state and renders. This keeps it server-representable for co-op later.
export class Battle {
  constructor(room, units, opts = {}) {
    this.room = room;
    this.units = units; // Unit[]
    this.phase = 'player';
    this.turn = 1;
    this.log = [];
    this.onChange = opts.onChange || (() => {});
    this.onLog = opts.onLog || (() => {});
    this.onEnd = opts.onEnd || (() => {}); // fired once with 'won' | 'lost'
    this.onFx = opts.onFx || (() => {}); // combat events for visual effects
    this.onPickup = opts.onPickup || (() => {}); // treasure collected (spec, unit)
    this.pickups = []; // treasure specs collected this battle
    // Victory/defeat condition — DATA from the battle node (js/dungeon.js),
    // engine stays generic. Default 'eliminate' preserves M1–M4 behaviour.
    this.objective = normalizeObjective(opts.objective);
    // Who drives the enemy phase. Normally js/ai.js does (every dungeon
    // battle). A DUEL passes false: the 'enemy' team is the other PLAYER, so
    // the phase must sit and wait for their relayed command instead of
    // planning one (js/duelBattle.js closes it via endEnemyPhase). This is the
    // engine's ONLY notion of PvP — it still just sees 'player' vs 'enemy',
    // with no second code path through any of the combat maths.
    this.enemyAi = opts.enemyAi !== false;
    this._ended = false;
    this._enemy = null; // enemy-phase progress state
    this.startPlayerPhase();
    this.logMsg(`Objective: ${this.objectiveText()}`);
    this.onChange();
  }

  // -------------------------------------------------------------- queries

  get players() {
    return this.units.filter((u) => u.team === 'player');
  }
  get enemies() {
    return this.units.filter((u) => u.team === 'enemy');
  }
  livingPlayers() {
    return this.players.filter((u) => u.alive);
  }
  livingEnemies() {
    return this.enemies.filter((u) => u.alive);
  }

  unitAt(x, y) {
    return this.units.find((u) => u.alive && u.x === x && u.y === y);
  }

  // Occupancy for movement: enemies of `unit` block tiles entirely; allies can
  // be moved through but not stopped on. Returns 'block' | 'ally' | null.
  occupancy(unit, x, y) {
    const other = this.unitAt(x, y);
    if (!other || other === unit) return null;
    return other.team === unit.team ? 'ally' : 'block';
  }

  logMsg(msg) {
    this.log.push(msg);
    this.onLog(msg);
  }

  // ------------------------------------------------------- move range / path

  // BFS flood-fill of every tile `unit` can reach this turn. Traverses through
  // allies but only unoccupied tiles are valid stops. Returns:
  //   { reach: Map<"x,y", dist>, prev: Map<"x,y", "x,y"> }
  computeMoveField(unit) {
    const key = (x, y) => `${x},${y}`;
    const reach = new Map();
    const prev = new Map();
    const startK = key(unit.x, unit.y);
    reach.set(startK, 0);
    if (unit.rootedThisTurn) return { reach, prev }; // rooted: only its own tile
    // simple queue BFS — uniform step cost, so first visit = shortest
    let frontier = [{ x: unit.x, y: unit.y, d: 0 }];
    while (frontier.length) {
      const next = [];
      for (const cur of frontier) {
        if (cur.d >= unit.stats.move) continue;
        for (const { dx, dy } of DIRECTIONS) {
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          const nk = key(nx, ny);
          if (reach.has(nk)) continue;
          if (!canStep(this.room, cur.x, cur.y, nx, ny)) continue;
          const occ = this.occupancy(unit, nx, ny);
          if (occ === 'block') continue; // can't pass an enemy
          reach.set(nk, cur.d + 1);
          prev.set(nk, key(cur.x, cur.y));
          next.push({ x: nx, y: ny, d: cur.d + 1 });
        }
      }
      frontier = next;
    }
    return { reach, prev };
  }

  // Tiles a unit may actually stop on (reachable AND unoccupied, excluding its
  // own tile). Set of "x,y".
  moveTiles(unit) {
    const { reach } = this.computeMoveField(unit);
    const out = new Set();
    for (const k of reach.keys()) {
      if (k === `${unit.x},${unit.y}`) continue;
      const [x, y] = k.split(',').map(Number);
      if (!this.unitAt(x, y)) out.add(k);
    }
    return out;
  }

  pathTo(unit, tx, ty) {
    const { reach, prev } = this.computeMoveField(unit);
    const goal = `${tx},${ty}`;
    if (!reach.has(goal)) return null;
    const path = [];
    let k = goal;
    while (k !== `${unit.x},${unit.y}`) {
      const [x, y] = k.split(',').map(Number);
      path.push({ x, y });
      k = prev.get(k);
      if (!k) return null;
    }
    return path.reverse();
  }

  // ----------------------------------------------------------- attacking

  // Enemy units this unit could hit from a given tile (defaults to current).
  attackTargets(unit, fromX = unit.x, fromY = unit.y) {
    const fromZ = this.room.heightAt(fromX, fromY);
    return this.units.filter((t) => {
      if (!t.alive || t.team === unit.team) return false;
      const d = tileDistance(fromX, fromY, t.x, t.y);
      if (!statsProfileFor(unit.stats, d)) return false;
      return hasLineOfSight(this.room, fromX, fromY, t.x, t.y, fromZ, t.tileZ);
    });
  }

  // XP for felling one foe. Tougher targets are worth more, so clearing a
  // level-3 boss beats farming level-1 chaff.
  //
  // Deliberately ONE function rather than the same expression written at each
  // kill site: skill kills used to pay a flat 10 while autoattack kills paid
  // this, so casting a skill was punished twice over - it cost MP AND it cost
  // XP. Two copies of a formula is what let them drift apart in the first
  // place.
  killXp(target) {
    return 10 + target.level * 5;
  }

  // Resolve attacker -> target. Returns a result summary for the UI.
  resolveAttack(attacker, target) {
    attacker.dir = rotationBetween(attacker.x, attacker.y, target.x, target.y) ?? attacker.dir;
    const buffed = attacker.buffAtk > 0;
    const d = tileDistance(attacker.x, attacker.y, target.x, target.y);
    const profile = statsProfileFor(attacker.stats, d);
    const dmg = computeDamage(attacker, target, profile ? profile.atk : undefined);
    attacker.buffAtk = 0; // Inspire is spent on this swing
    target.takeDamage(dmg);
    const killed = !target.alive;
    this.onFx({ kind: 'attack', attacker, target, dmg, killed });
    let leveled = false;
    if (killed) leveled = attacker.gainXp(this.killXp(target));
    this.logMsg(
      `${attacker.name}${buffed ? ' (inspired)' : ''} hits ${target.name} for ${dmg}` +
        (killed ? ` - ${target.name} falls!` : ` (${target.stats.hp}/${target.stats.maxHp})`)
    );
    if (leveled) this.logMsg(`${attacker.name} reaches level ${attacker.level}!`);
    attacker.moved = true;
    attacker.acted = true;
    this.checkEnd();
    this.onChange();
    return { dmg, killed, leveled };
  }

  // Living units of a team within Chebyshev radius of a tile (0 = just that tile).
  unitsInArea(cx, cy, radius, team) {
    return this.units.filter((u) => u.alive && u.team === team && tileDistance(cx, cy, u.x, u.y) <= radius);
  }

  // Valid targets for a skill (defaults to the unit's primary skill so M2 call
  // sites keep working). Ally skills return friendlies; enemy skills return
  // foes with line-of-sight; self skills (area-around-caster) return [unit].
  skillTargets(unit, skill = unit.skill, fromX = unit.x, fromY = unit.y) {
    if (!skill) return [];
    if (skill.target === 'self') return [unit]; // always castable; area resolves around caster
    const fromZ = this.room.heightAt(fromX, fromY);
    if (skill.target === 'enemy') {
      return this.units.filter((t) => {
        if (!t.alive || t.team === unit.team) return false;
        if (tileDistance(fromX, fromY, t.x, t.y) > skill.range) return false;
        return hasLineOfSight(this.room, fromX, fromY, t.x, t.y, fromZ, t.tileZ);
      });
    }
    // ally-targeted (heal / buff / shield)
    const single = !skill.radius; // single-target skills keep the M2 exclusions
    return this.units.filter((t) => {
      if (!t.alive || t.team !== unit.team) return false;
      if (single && skill.kind === 'heal' && t.stats.hp >= t.stats.maxHp) return false; // no over-heal
      if (single && skill.kind === 'buff' && (t === unit || t.buffAtk > 0)) return false; // buff someone else, once
      return tileDistance(fromX, fromY, t.x, t.y) <= skill.range;
    });
  }

  // Can this unit pay for this skill? The SINGLE source of truth for MP
  // affordability — the button gate, enterSkill, the co-op/duel host
  // validators and resolveSkill's own guard all call this, so a rule change
  // lands in one place and clients cannot drift from the host.
  // A spec with no `cost` is free (see the spec-shape comment in skills.js),
  // and a unit with no stats (explore mode) can afford anything free.
  canAfford(unit, skill = unit.skill) {
    if (!skill) return false;
    const cost = skill.cost || 0;
    if (cost <= 0) return true;
    return Boolean(unit.stats) && unit.stats.mp >= cost;
  }

  // Skills read as "magic": pierce half the target's armor, then height matters.
  // Deterministic (no RNG), same as autoattacks.
  computeSkillDamage(attacker, target, skill) {
    const base = Math.max(1, skill.power - Math.floor(target.stats.def / 2));
    return Math.max(1, Math.round(base * heightMultiplier(attacker.tileZ, target.tileZ)));
  }

  // Resolve a skill on a target. Handles heal/buff/shield (allies) and damage
  // (enemies), each optionally as a radius blast. `skill` defaults to the unit's
  // primary skill (Heal/Inspire) so existing callers are unchanged.
  resolveSkill(unit, target, skill = unit.skill) {
    if (!skill) return null;
    // Refuse at the boundary, never mid-resolution: everything below mutates
    // HP, shields and the log, so a half-applied refusal would corrupt state
    // and desync co-op. `null` is the existing "nothing happened" contract.
    if (!this.canAfford(unit, skill)) return null;
    if (skill.cost && unit.stats) unit.stats.mp -= skill.cost;
    const cx = skill.target === 'self' ? unit.x : target.x;
    const cy = skill.target === 'self' ? unit.y : target.y;
    const radius = skill.radius || 0;
    const area = (team) => (radius > 0 ? this.unitsInArea(cx, cy, radius, team) : [target]);

    if (skill.kind === 'heal') {
      let total = 0;
      for (const a of area(unit.team)) {
        const before = a.stats.hp;
        a.stats.hp = Math.min(a.stats.maxHp, a.stats.hp + skill.power);
        total += a.stats.hp - before;
        this.onFx({ kind: 'heal', caster: unit, target: a, amount: a.stats.hp - before });
      }
      this.logMsg(`${unit.name} casts ${skill.name}${radius ? ' (area)' : ''} - heals ${total}.`);
    } else if (skill.kind === 'shield') {
      const allies = area(unit.team);
      for (const a of allies) {
        a.shield += skill.power;
        this.onFx({ kind: 'shield', caster: unit, target: a, amount: skill.power });
      }
      this.logMsg(`${unit.name} casts ${skill.name} - +${skill.power} shield to ${allies.length}.`);
    } else if (skill.kind === 'buff') {
      const amt = (skill.buff && skill.buff.atk) || skill.power;
      const allies = area(unit.team);
      for (const a of allies) {
        a.buffAtk = Math.max(a.buffAtk, amt);
        this.onFx({ kind: 'buff', caster: unit, target: a, amount: amt });
      }
      this.logMsg(`${unit.name} casts ${skill.name} (+${amt} ATK next hit) on ${allies.length}.`);
    } else if (skill.kind === 'damage') {
      unit.dir = rotationBetween(unit.x, unit.y, cx, cy) ?? unit.dir;
      const foeTeam = unit.team === 'player' ? 'enemy' : 'player';
      let kills = 0;
      let xp = 0;
      for (const f of area(foeTeam)) {
        if (!f || !f.alive) continue;
        const dmg = this.computeSkillDamage(unit, f, skill);
        f.takeDamage(dmg);
        if (skill.status && skill.status.rooted) f.rooted = Math.max(f.rooted, skill.status.rooted);
        const killed = !f.alive;
        if (killed) {
          kills++;
          // Per TARGET, not per kill: an area skill that fells a boss and two
          // rats is worth the boss plus the two rats, exactly what killing the
          // three of them one at a time would have paid.
          xp += this.killXp(f);
        }
        this.onFx({ kind: 'skill', caster: unit, target: f, dmg, skill });
        this.logMsg(`${unit.name}'s ${skill.name} hits ${f.name} for ${dmg}${killed ? ` - ${f.name} falls!` : ''}`);
      }
      if (kills) {
        // One gainXp call for the whole cast, matching the single call an
        // autoattack kill makes - gainXp only levels once per call, so paying
        // per kill in the loop would cap a triple kill at one level while the
        // same XP earned in one call could carry further.
        const leveled = unit.gainXp(xp);
        if (leveled) this.logMsg(`${unit.name} reaches level ${unit.level}!`);
      }
    }
    unit.moved = true;
    unit.acted = true;
    this.checkEnd(); // a damage skill can clear the room
    this.onChange();
    return { kind: skill.kind };
  }

  // ------------------------------------------------------------- phases

  startPlayerPhase() {
    this.phase = 'player';
    this.livingPlayers().forEach((u) => u.resetTurn());
    this.logMsg(`· Turn ${this.turn}: your move ·`);
    this.checkEnd(); // survive/defend turn counts resolve at the turn boundary
    this.onChange();
  }

  allPlayersDone() {
    return this.livingPlayers().every((u) => u.done);
  }

  allEnemiesDone() {
    return this.livingEnemies().every((u) => u.done);
  }

  endPlayerPhase() {
    if (this.phase !== 'player') return;
    this.applyEndTurnHazards('player'); // standing in fire bites as your phase closes
    if (this.phase !== 'player') return; // ...and may end the battle outright
    this.phase = 'enemy';
    this.livingEnemies().forEach((u) => u.resetTurn());
    // No AI ticker in a duel: the phase belongs to the other player, and the
    // only thing that can move a unit in it is a command they send.
    this._enemy = this.enemyAi
      ? { queue: this.livingEnemies().slice(), current: null, state: 'idle', until: 0 }
      : null;
    this.logMsg('· Enemy phase ·');
    this.onChange();
  }

  // Close an enemy phase nobody's AI ran (duels). Same boundary work
  // tickEnemyPhase does when its queue empties: burn, then hand back.
  endEnemyPhase() {
    if (this.phase !== 'enemy') return;
    this.applyEndTurnHazards('enemy');
    if (this.phase !== 'enemy') return; // the burn may have ended it
    this.turn++;
    this.startPlayerPhase();
  }

  // ------------------------------------------------------------- tile effects

  // Called whenever a unit finishes a move (player settle in the controller,
  // enemy settle in tickEnemyPhase). Dispatches the tile's effect, if any.
  // Effect specs are room DATA (js/dungeon.js); state (spent/on) lives on the
  // spec and resets with the room each battle.
  //   hazard   { dmg, status?, when?: 'enter'|'endTurn', once?, label? }
  //   switch   { toggles: [{x,y}], once?, label? }        (player-triggered)
  //   treasure { gold?, item?, label? }                   (player-only, once)
  unitSettled(unit) {
    const fx = this.room.effectAt(unit.x, unit.y);
    if (!fx || fx.spent || !unit.alive) return;
    if (fx.kind === 'hazard') {
      if ((fx.when || 'enter') === 'enter') this.applyHazard(fx, unit);
    } else if (fx.kind === 'switch') {
      if (unit.team === 'player') this.throwSwitch(fx, unit);
    } else if (fx.kind === 'treasure') {
      if (unit.team === 'player') this.collectTreasure(fx, unit);
    }
  }

  applyHazard(fx, unit) {
    const dmg = fx.dmg || 0;
    if (dmg) unit.takeDamage(dmg);
    if (fx.status && fx.status.rooted) unit.rooted = Math.max(unit.rooted, fx.status.rooted);
    if (fx.once) fx.spent = true;
    const killed = !unit.alive;
    this.onFx({ kind: 'hazard', target: unit, dmg, spec: fx });
    this.logMsg(
      `${unit.name} is caught by ${fx.label || 'a trap'}${dmg ? ` for ${dmg}` : ''}` +
        (fx.status && fx.status.rooted ? ' (rooted)' : '') +
        (killed ? ` - ${unit.name} falls!` : '')
    );
    this.checkEnd(); // a trap can down the last unit / the escort ward
    this.onChange();
  }

  throwSwitch(fx, unit) {
    let opened = 0;
    for (const t of fx.toggles || []) {
      if (this.room.toggleGate(t.x, t.y) !== null) opened++;
    }
    if (fx.once) fx.spent = true;
    fx.on = !fx.on;
    this.onFx({ kind: 'switch', target: unit, spec: fx });
    this.logMsg(`${unit.name} throws ${fx.label || 'the switch'}${opened ? ' - something rumbles open!' : ''}`);
    this.onChange();
  }

  collectTreasure(fx, unit) {
    fx.spent = true;
    this.pickups.push(fx);
    this.onFx({ kind: 'treasure', target: unit, spec: fx });
    this.logMsg(`${unit.name} finds ${fx.label || 'a hidden cache'}!`);
    this.onPickup(fx, unit);
    this.onChange();
  }

  // End-of-turn hazards (standing in fire) for one team, applied when that
  // team's phase closes.
  applyEndTurnHazards(team) {
    for (const u of this.units) {
      if (!u.alive || u.team !== team) continue;
      const fx = this.room.effectAt(u.x, u.y);
      if (fx && fx.kind === 'hazard' && !fx.spent && fx.when === 'endTurn') this.applyHazard(fx, u);
    }
  }

  // ------------------------------------------------------------- objectives

  unitByTag(tag) {
    return tag ? this.units.find((u) => u.tag === tag) : null;
  }

  // Player units that satisfy a reach objective's `who` ('leader' | 'any').
  // If 'leader' is asked for but the squad has none, fall back to any unit so
  // the objective can never soft-lock.
  reachers(o) {
    const living = this.livingPlayers();
    if (o.who === 'leader') {
      const leaders = living.filter((u) => u.useSprites || u.tag === 'leader');
      if (leaders.length) return leaders;
    }
    return living;
  }

  // Evaluate the win/lose condition. Returns 'won' | 'lost' | null (ongoing).
  // Called after every attack/skill, at each turn boundary, and whenever a
  // move settles — so position- and turn-based objectives resolve promptly.
  // A total party wipe always loses, regardless of objective.
  evaluateObjective() {
    if (!this.livingPlayers().length) return 'lost';
    const o = this.objective;
    const enemiesLeft = this.livingEnemies().length;
    const timeUp = (limit) => o.turnLimit && this.turn > o.turnLimit ? 'lost' : null;

    switch (o.type) {
      case 'slay': {
        const target = this.unitByTag(o.tag);
        if (target && !target.alive) return 'won';
        return timeUp();
      }
      case 'survive':
        if (!enemiesLeft) return 'won'; // cleared the threat early
        if (this.turn > o.turns) return 'won';
        return null;
      case 'reach':
        if (this.reachers(o).some((u) => u.x === o.tile.x && u.y === o.tile.y)) return 'won';
        return timeUp();
      case 'defend': {
        const guard = o.tag ? this.unitByTag(o.tag) : null;
        if (o.tag && (!guard || !guard.alive)) return 'lost'; // the protected one fell
        if (o.tile) {
          const occ = this.unitAt(o.tile.x, o.tile.y);
          if (occ && occ.team === 'enemy') return 'lost'; // tile breached
        }
        if (!enemiesLeft) return 'won'; // no one left to breach it
        if (this.turn > o.turns) return 'won';
        return null;
      }
      case 'escort': {
        const vip = this.unitByTag(o.tag);
        if (!vip || !vip.alive) return 'lost';
        if (vip.x === o.tile.x && vip.y === o.tile.y) return 'won';
        return timeUp();
      }
      case 'eliminate':
      default:
        return enemiesLeft ? timeUp() : 'won';
    }
  }

  checkEnd() {
    if (this._ended) return;
    const result = this.evaluateObjective();
    if (!result) return;
    this.phase = result;
    this.logMsg(result === 'won' ? `Victory! ${this.objectiveText(true)}` : this.defeatText());
    this._ended = true;
    this.onEnd(this.phase);
  }

  // Human-readable objective, with live progress. `done` = past-tense summary.
  objectiveText(done = false) {
    const o = this.objective;
    // A caller may supply its own wording for both states. Used by duels, where
    // "Defeat all enemies" is dungeon-speak aimed at a person — the same defect
    // already fixed in the banner and the roster, and it reached the LOG too
    // (and through it the guest's screen, since the start frame replays the
    // host's log). Data, not a branch: the engine still has no notion of PvP.
    if (o.text) return done ? (o.doneText || o.text) : o.text;
    const left = Math.max(0, o.turns - (this.turn - 1)); // turns still to hold
    const plural = (n) => (n === 1 ? '' : 's');
    switch (o.type) {
      case 'slay':
        return done ? `${o.label || 'The target'} is slain.` : `Defeat ${o.label || 'the target'}`;
      case 'survive':
        return done ? 'You held out.' : `Survive ${left} more turn${plural(left)}`;
      case 'reach':
        return done ? 'You reached the goal.' : `Reach the marked tile${o.who === 'leader' ? ' with your leader' : ''}`;
      case 'defend':
        return done ? 'The line held.' : `Hold the marked tile (${left} turn${plural(left)} left)`;
      case 'escort':
        return done ? `${o.label || 'The ward'} is safe.` : `Escort ${o.label || 'the ward'} to the marked tile`;
      case 'eliminate':
      default:
        return done ? 'The room is clear.' : 'Defeat all enemies';
    }
  }

  defeatText() {
    if (!this.livingPlayers().length) return 'Your party has fallen…';
    const o = this.objective;
    if (o.type === 'defend') return 'The line is broken…';
    if (o.type === 'escort') return `${o.label || 'Your ward'} has fallen…`;
    if (o.turnLimit) return 'Time has run out…';
    return 'The battle is lost…';
  }

  // ------------------------------------------------------------- ticking

  // Called every render frame. Advances the enemy phase; player movement is
  // driven by each Unit's own Avatar.update (called by the renderer).
  update(now) {
    if (this.phase === 'enemy' && this.enemyAi) this.tickEnemyPhase(now);
  }

  tickEnemyPhase(now) {
    const e = this._enemy;
    if (!e) return;

    if (e.state === 'idle') {
      // grab the next living enemy
      let unit = e.queue.shift();
      while (unit && !unit.alive) unit = e.queue.shift();
      if (!unit) {
        this.applyEndTurnHazards('enemy'); // foes standing in fire burn too
        this._enemy = null;
        if (this.phase !== 'enemy') return; // the burn may have ended it
        this.turn++;
        this.startPlayerPhase();
        return;
      }
      e.current = unit;
      const plan = runEnemyTurn(this, unit); // { path, target }
      if (plan.path && plan.path.length) unit.followPath(plan.path);
      e.plan = plan;
      e.state = 'moving';
      e.until = now + 150; // small settle so a zero-move enemy still reads
      return;
    }

    if (e.state === 'moving') {
      if (e.current.walking) return; // let the Avatar finish its steps
      if (now < e.until) return;
      // arrived — tile effects fire first (a trap may fell the enemy mid-plan)
      this.unitSettled(e.current);
      if (this.phase !== 'enemy') { this._enemy = null; return; }
      if (!e.current.alive) {
        e.state = 'post';
        e.until = now + 350;
        return;
      }
      // attack if the plan found a target now in range
      const tgt = e.plan.target;
      if (tgt && tgt.alive && this.attackTargets(e.current).includes(tgt)) {
        this.resolveAttack(e.current, tgt);
      } else {
        // maybe something else is now reachable after moving
        const opportun = this.attackTargets(e.current)[0];
        if (opportun) this.resolveAttack(e.current, opportun);
        else e.current.acted = true;
      }
      this.checkEnd(); // an enemy may have just breached a defended tile
      e.state = 'post';
      e.until = now + 350; // beat between enemies so the player can follow
      return;
    }

    if (e.state === 'post') {
      if (now < e.until) return;
      if (this.phase === 'won' || this.phase === 'lost') {
        this._enemy = null;
        return;
      }
      e.state = 'idle';
    }
  }
}

// Fill an objective spec with defaults so the engine can trust its shape.
// Supported types (all DATA-driven from the battle node):
//   { type: 'eliminate' }                                  — clear the room (default)
//   { type: 'slay', tag, label }                           — kill the tagged foe
//   { type: 'survive', turns }                             — outlast N turns
//   { type: 'reach', tile:{x,y}, who?, turnLimit? }        — get a unit to a tile
//   { type: 'defend', tile:{x,y}|tag, turns, turnLimit? }  — hold a tile / keep a unit alive N turns
//   { type: 'escort', tag, tile:{x,y}, label, turnLimit? } — walk a ward to a tile
// `who`: 'leader' (default 'any'); `turnLimit`: optional lose-if-exceeded deadline.
export function normalizeObjective(o) {
  if (!o || !o.type) return { type: 'eliminate' };
  return { turns: 3, who: 'any', ...o };
}
