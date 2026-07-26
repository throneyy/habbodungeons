import { Battle } from './battle.js';
import { findPath, rotationBetween } from './pathfinder.js';
import { furniSprites } from './monsterSprites.js';
import { propSprites } from './props.js';

// Real projectile art per archetype (directional furni). Rangers loose the
// authentic Firing Arrow; magic/skill keep their procedural energy glow.
export const PROJ_SPRITE = { ranged: 'hween_c25_arrow' };

// Turns taps into Vandal Hearts commands and keeps the tile overlays + side
// panel in sync with the battle engine. Flow for one player unit:
//   tap your unit -> move range (blue) + attackable foes (red)
//   tap a blue tile -> walks there, then shows foes it can now hit
//   tap a red foe    -> attacks; turn ends
//   "Skill" (support classes) -> highlights allies (green); tap one to cast
//   "Wait" ends in place. "End Turn" hands the phase to the enemy.
// Battle outcome is reported via the onEnd passed to start(); the RunController
// takes over the screen from there.
export class BattleController {
  constructor(dom) {
    this.dom = dom; // { banner, actions, roster, log }
    this.game = null;
    this.battle = null;
    this.sel = null;
    this.moving = false;
    this.mode = 'normal'; // 'normal' | 'skill'
    this.activeSkill = null; // which skill is being targeted in 'skill' mode
    this.exit = null; // post-victory RP arrow: { x, y, onReach } (showExit)
    // Co-op: (unit) => bool — which player units THIS client may command
    // (the leader plays their own + AI slots; members' units are theirs).
    this.canSelect = null;
  }

  onAttach(game) {
    this.game = game;
  }
  onRoom() {}

  start(room, players, enemies, opts = {}) {
    this.game.setRoom(room);
    this.sel = null;
    this.moving = false;
    this.mode = 'normal';
    this.exit = null;
    if (this.dom.log) this.dom.log.innerHTML = '';
    for (const u of [...players, ...enemies]) this.game.addUnit(u);
    this.battle = new Battle(room, [...players, ...enemies], {
      objective: opts.objective,
      // duels pass false: the enemy team is the other player, so js/ai.js
      // must never plan its phase (js/duelBattle.js)
      enemyAi: opts.enemyAi,
      onChange: () => this.render(),
      onLog: (m) => this.appendLog(m),
      onEnd: opts.onEnd || (() => {}),
      onFx: (e) => this.showFx(e),
      onPickup: opts.onPickup || (() => {}),
    });
    // Mark the goal tile (reach/defend/escort) so the player can see the objective.
    const goal = this.battle.objective.tile;
    if (goal) this.game.overlays.objective.add(`${goal.x},${goal.y}`);
    this.render();
    return this.battle;
  }

  showFx(e) {
    if (this.game) renderBattleFx(this.game, e);
  }

  // ---------------------------------------------------- victory exit arrow

  // After a win the run drops a classic RP arrow at the room's exit tile:
  // walk the leader onto it to move on to the next room (runController wires
  // onReach to the camp screen). Pure presentation — rewards are already
  // banked when this appears.
  showExit(exit, onReach) {
    const room = this.game.room;
    const spec = { id: 'rp_arrow', x: exit.x, y: exit.y, dir: exit.dir ?? 2, walk: true };
    room.props.push(spec);
    this.game.props.push({ ...spec, ref: spec, sprites: propSprites('rp_arrow') });
    this.exit = { x: exit.x, y: exit.y, onReach };
    this.game.clearOverlays();
    this.game.overlays.objective.add(`${exit.x},${exit.y}`);
    this.render();
    // the winner may already be standing in the doorway (rampart escape)
    const u = this.strollUnit();
    if (u && u.x === exit.x && u.y === exit.y) this.fireExit();
  }

  // Who walks the victory lap: your Habbo (the sprites leader), or the first
  // survivor when the leader fell on the way to the win.
  strollUnit() {
    if (!this.battle) return null;
    const alive = this.battle.units.filter((u) => u.team === 'player' && u.alive);
    return alive.find((u) => u.useSprites) || alive[0] || null;
  }

  fireExit() {
    if (!this.exit) return;
    const cb = this.exit.onReach;
    this.exit = null;
    this.game.overlays.objective.clear();
    if (cb) cb();
  }

  // Free walking after the battle is won: tap anywhere reachable, the leader
  // strolls there (living units still block); landing on the arrow moves on.
  strollTap(tile) {
    if (this.moving) return;
    const u = this.strollUnit();
    const room = this.game.room;
    if (!u || !room) return;
    const blocked = [];
    for (const o of this.battle.units) {
      if (o !== u && o.alive && !room.blockers.has(`${o.x},${o.y}`)) {
        room.block(o.x, o.y, o);
        blocked.push(o);
      }
    }
    const path = findPath(room, u.x, u.y, tile.x, tile.y);
    for (const o of blocked) room.unblock(o.x, o.y);
    if (!path || !path.length) return;
    this.sel = u;
    this.moving = true;
    u.followPath(path);
  }

  // ------------------------------------------------------------- input

  get myPhase() {
    return this.battle && this.battle.phase === 'player';
  }

  select(unit) {
    if (this.sel) this.sel.selected = false;
    this.sel = unit;
    this.mode = 'normal';
    this.activeSkill = null;
    if (unit) unit.selected = true;
    this.refreshOverlays();
    this.render();
  }

  refreshOverlays() {
    const g = this.game;
    g.clearOverlays();
    const u = this.sel;
    if (!u || !this.myPhase) return;
    if (this.mode === 'skill') {
      for (const t of this.battle.skillTargets(u, this.activeSkill)) g.overlays.skill.add(`${t.x},${t.y}`);
      return;
    }
    if (!u.moved) for (const k of this.battle.moveTiles(u)) g.overlays.move.add(k);
    for (const t of this.battle.attackTargets(u)) g.overlays.target.add(`${t.x},${t.y}`);
  }

  onTap(tile) {
    if (this.exit && this.battle && this.battle.phase === 'won') return this.strollTap(tile);
    if (!this.myPhase || this.moving) return;
    const b = this.battle;
    const here = b.unitAt(tile.x, tile.y);
    const k = `${tile.x},${tile.y}`;

    if (this.mode === 'skill') {
      if (here && this.game.overlays.skill.has(k) && this.battle.skillTargets(this.sel, this.activeSkill).includes(here)) {
        b.resolveSkill(this.sel, here, this.activeSkill);
        this.endUnit();
      } else {
        this.mode = 'normal'; // tapping off cancels skill targeting
        this.activeSkill = null;
        this.refreshOverlays();
        this.render();
      }
      return;
    }

    if (!this.sel) {
      if (here && here.team === 'player' && !here.done && this.selectable(here)) this.select(here);
      return;
    }

    // in-range foe -> attack (before or after moving)
    if (here && here.team === 'enemy' && this.game.overlays.target.has(k)) {
      b.resolveAttack(this.sel, here);
      this.endUnit();
      return;
    }

    if (!this.sel.moved) {
      if (this.game.overlays.move.has(k)) {
        const path = b.pathTo(this.sel, tile.x, tile.y);
        if (path && path.length) {
          this.moving = true;
          this.game.clearOverlays();
          this.sel.followPath(path);
          this.render();
        }
        return;
      }
      if (here && here.team === 'player' && !here.done && this.selectable(here)) {
        this.select(here);
        return;
      }
      if (!here) this.select(null);
    }
  }

  selectable(unit) {
    return !this.canSelect || this.canSelect(unit);
  }

  // Take over an already-running battle (leader promotion: the new leader's
  // replica room + units are live in the Game; only the sim moves here).
  adopt(battle) {
    this.battle = battle;
    this.sel = null;
    this.moving = false;
    this.mode = 'normal';
    battle.onChange = () => this.render();
    battle.onLog = (m) => this.appendLog(m);
    battle.onFx = (e) => this.showFx(e);
    const goal = battle.objective.tile;
    if (goal) this.game.overlays.objective.add(`${goal.x},${goal.y}`);
    this.render();
    return battle;
  }

  onHover() {}

  update(now) {
    this.battle && this.battle.update(now);
    if (this.moving && this.sel && !this.sel.walking) {
      this.moving = false;
      // post-victory stroll: no turn bookkeeping, just the walk (and loot —
      // unitSettled still springs missed treasure on the way out)
      if (this.exit && this.battle.phase === 'won') {
        const u = this.sel;
        this.sel = null;
        this.battle.unitSettled(u);
        if (u.x === this.exit.x && u.y === this.exit.y) this.fireExit();
        return;
      }
      this.sel.moved = true;
      this.battle.unitSettled(this.sel); // tile effects: traps, switches, treasure
      if (!this.sel.alive) {
        // stepped onto a lethal trap — the unit's turn (and life) is over
        this.endUnit();
        return;
      }
      this.battle.checkEnd(); // a settled move may satisfy a reach/escort objective
      this.refreshOverlays();
      this.render();
    }
  }

  // ------------------------------------------------------------- commands

  // Can `unit` cast `skill` right now? (drives which skill buttons show)
  skillCastable(unit, skill) {
    if (skill.target === 'self') {
      if (skill.kind !== 'damage') return true;
      const foeTeam = unit.team === 'player' ? 'enemy' : 'player';
      return this.battle.unitsInArea(unit.x, unit.y, skill.radius || 0, foeTeam).length > 0;
    }
    return this.battle.skillTargets(unit, skill).length > 0;
  }

  enterSkill(skill) {
    if (!this.sel || this.sel.acted || !skill) return;
    // self / area-around-self skills have no tile to pick — cast immediately
    if (skill.target === 'self') {
      this.battle.resolveSkill(this.sel, this.sel, skill);
      this.endUnit();
      return;
    }
    if (!this.battle.skillTargets(this.sel, skill).length) return;
    this.activeSkill = skill;
    this.mode = 'skill';
    this.refreshOverlays();
    this.render();
  }

  endUnit() {
    if (this.sel) {
      this.sel.moved = true;
      this.sel.acted = true;
      this.sel.selected = false;
    }
    this.sel = null;
    this.mode = 'normal';
    this.game.clearOverlays();
    if (this.myPhase && this.battle.allPlayersDone()) this.battle.endPlayerPhase();
    this.render();
  }

  wait() {
    if (this.sel && !this.moving) this.endUnit();
  }

  cancel() {
    if (this.mode === 'skill') {
      this.mode = 'normal';
      this.activeSkill = null;
      this.refreshOverlays();
      this.render();
    } else if (this.sel && !this.sel.moved) {
      this.select(null);
    }
  }

  endTurn() {
    if (!this.myPhase) return;
    if (this.sel) this.sel.selected = false;
    this.sel = null;
    this.mode = 'normal';
    this.game.clearOverlays();
    this.battle.endPlayerPhase();
    this.render();
  }

  // ------------------------------------------------------------- panel

  render() {
    if (!this.battle || !this.dom.banner) return;
    const b = this.battle;
    // NB: bubble copy avoids em-dashes/ellipses — Volter maps them to odd glyphs.
    const label = {
      player: `Turn ${b.turn}, your move`,
      enemy: `Turn ${b.turn}, enemy phase`,
      won: this.exit ? 'Victory! Walk onto the arrow to move on' : 'Victory!',
      lost: 'Defeated...',
    }[b.phase];
    // Old-school Habbo chat-bubble shape: bold "name" part, then the message.
    const showObj = b.phase === 'player' || b.phase === 'enemy';
    this.dom.banner.innerHTML = showObj
      ? `<b>${label}:</b> <span class="obj">${b.objectiveText()}</span>`
      : `<b>${label}</b>`;
    this.dom.banner.className = `banner ${b.phase}`;

    this.dom.actions.innerHTML = '';
    if (b.phase === 'player') {
      if (this.mode === 'skill') {
        const noun = this.activeSkill.target === 'enemy' ? 'foe' : 'ally';
        this.btn(`Tap a green ${noun} for ${this.activeSkill.name}`, null, true);
        this.btn('Back', () => this.cancel());
      } else if (this.sel && !this.moving) {
        if (this.battle.attackTargets(this.sel).length) this.btn('Attack a red foe', null, true);
        for (const sk of this.sel.skills || []) {
          if (this.skillCastable(this.sel, sk)) this.btn(sk.name, () => this.enterSkill(sk));
        }
        this.btn('Wait', () => this.wait());
        if (!this.sel.moved) this.btn('Cancel', () => this.cancel());
      } else if (!this.moving) {
        this.btn('End Turn', () => this.endTurn());
      }
    }

    this.dom.roster.innerHTML = '';
    for (const u of b.units) {
      const row = document.createElement('div');
      row.className = `roster-row ${u.team}${u.alive ? '' : ' dead'}${u === this.sel ? ' sel' : ''}${u.done && u.alive ? ' done' : ''}`;
      const frac = Math.max(0, u.stats.hp / u.stats.maxHp);
      row.innerHTML =
        `<span class="rname">${u.name}</span>` +
        `<span class="rcls">${u.cls.name}${u.team === 'player' ? ` L${u.level}` : ''}</span>` +
        `<span class="rhp"><span class="rhp-fill" style="width:${frac * 100}%"></span></span>` +
        `<span class="rhpn">${u.alive ? u.stats.hp : '✕'}</span>`;
      this.dom.roster.appendChild(row);
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

// Translate combat events into renderer effects: ranged/magic attacks lob a
// projectile then flash the target; melee flashes immediately; support
// skills sparkle their targets. Colors follow the class archetype. Shared
// with the co-op spectate replay (js/coopBattle.js), which feeds it the same
// event shapes rebuilt from the leader's relay stream.
export function renderBattleFx(g, e) {
  const at = (u) => ({ x: u.x, y: u.y, z: u.tileZ });
  const PROJ = { ranged: '#e8d9a0', magic: '#9fc9ff' };
  if (e.kind === 'attack' || e.kind === 'skill') {
    const caster = e.attacker || e.caster;
    const dist = Math.max(Math.abs(caster.x - e.target.x), Math.abs(caster.y - e.target.y));
    const proj = e.kind === 'skill' ? '#8fe0c8' : PROJ[caster.cls.archetype];
    const flightMs = proj && dist > 1 ? 130 + dist * 55 : 0;
    if (flightMs) {
      const spriteId = e.kind === 'attack' ? PROJ_SPRITE[caster.cls.archetype] : null;
      const dir = rotationBetween(caster.x, caster.y, e.target.x, e.target.y);
      g.addFx({
        type: 'proj', from: at(caster), to: at(e.target), color: proj, dur: flightMs,
        sprite: spriteId ? furniSprites(spriteId) : null, dir,
      });
    }
    const impact = performance.now() + flightMs;
    g.addFx({ type: 'burst', ...at(e.target), color: e.kind === 'skill' ? '#8fe0c8' : '#ffd9a0', dur: 340, start: impact });
    g.addFx({ type: 'float', ...at(e.target), text: String(e.dmg), color: '#fff', dur: 800, start: impact });
  } else if (e.kind === 'heal') {
    g.addFx({ type: 'burst', ...at(e.target), color: '#7de08a', dur: 380 });
    if (e.amount) g.addFx({ type: 'float', ...at(e.target), text: `+${e.amount}`, color: '#8df09a', dur: 800 });
  } else if (e.kind === 'shield') {
    g.addFx({ type: 'burst', ...at(e.target), color: '#7ab8f0', dur: 380 });
    g.addFx({ type: 'float', ...at(e.target), text: `+${e.amount}`, color: '#9fd0ff', dur: 800 });
  } else if (e.kind === 'buff') {
    g.addFx({ type: 'burst', ...at(e.target), color: '#f6c343', dur: 380 });
    g.addFx({ type: 'float', ...at(e.target), text: `+${e.amount} ATK`, color: '#ffe08a', dur: 800 });
  } else if (e.kind === 'hazard') {
    g.addFx({ type: 'burst', ...at(e.target), color: '#e06a3a', dur: 380 });
    if (e.dmg) g.addFx({ type: 'float', ...at(e.target), text: String(e.dmg), color: '#ffb08a', dur: 800 });
  } else if (e.kind === 'switch') {
    g.addFx({ type: 'burst', ...at(e.target), color: '#8fd7e0', dur: 380 });
    for (const t of e.spec.toggles || []) {
      const z = g.room.heightAt(t.x, t.y);
      g.addFx({ type: 'burst', x: t.x, y: t.y, z, color: '#8fd7e0', dur: 500, start: performance.now() + 200 });
    }
  } else if (e.kind === 'treasure') {
    g.addFx({ type: 'burst', ...at(e.target), color: '#f6c343', dur: 420 });
    const txt = e.spec.gold ? `+${e.spec.gold}g` : '!';
    g.addFx({ type: 'float', ...at(e.target), text: txt, color: '#ffe08a', dur: 900 });
  }
}
