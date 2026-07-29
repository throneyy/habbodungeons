import { Battle } from './battle.js';
import { findPath, rotationBetween } from './pathfinder.js';
import { furniSprites } from './monsterSprites.js';
import { propSprites } from './props.js';
import { describeSkill, skillTooltip } from './skills.js';

// Real projectile art per archetype (directional furni). Rangers loose the
// authentic Firing Arrow; magic/skill keep their procedural energy glow.
export const PROJ_SPRITE = { ranged: 'hween_c25_arrow' };

// The roster HP bar is coloured by TEAM in css/style.css: green for the player
// squad, red for the enemy team. In a dungeon that reads correctly — red is the
// monsters. In a DUEL the enemy team is the other player, so a fighter at full
// health rendered a full red bar and read as nearly dead, on both screens at
// once (each client renders its opponent as the enemy team). Colour by HEALTH
// there instead, which is what a bar is for: green → amber → red as it drains.
// Returns an inline `background` declaration to append to the fill's style, or
// '' outside a duel so dungeon battles keep the stylesheet's team colours.
export function hpTint(frac, isDuel) {
  if (!isDuel) return '';
  const c = frac > 0.5 ? '#00813e' : frac > 0.25 ? '#d98b0b' : '#cc0100';
  return `;background:${c}`;
}

// The stacked HP-over-MP cell of a roster row. Shared by all three rosters
// (dungeon, co-op spectate, duel guest) so a Cleric's pool cannot read one way
// on the host's screen and another on a guest's.
// The MP bar is rendered only for a unit that can actually SPEND it. Every
// unit gets a pool (they all run through the same Unit and the same CLASSES
// table, monsters included), but no monster has a skill today - drawing a full
// blue bar on a goblin would promise magic that cannot be cast. `castsSkills`
// is the co-op replica's stand-in for a skill list it was never sent, so a
// leader's bar cannot show on the host and vanish on a guest.
// Deliberately slimmer than the HP bar: MP costs you a cast, HP costs you the
// unit.
export function rosterBars(u, isDuel) {
  const frac = u.stats ? Math.max(0, u.stats.hp / u.stats.maxHp) : 0;
  const casts = u.castsSkills != null ? u.castsSkills : (u.skills || []).length > 0;
  let html = `<span class="rhp"><span class="rhp-fill" style="width:${frac * 100}%${hpTint(frac, isDuel)}"></span></span>`;
  if (casts && u.stats && u.stats.maxMp > 0) {
    const mf = Math.max(0, Math.min(1, u.stats.mp / u.stats.maxMp));
    html += `<span class="rmp" title="${u.stats.mp}/${u.stats.maxMp} MP">` +
      `<span class="rmp-fill" style="width:${mf * 100}%"></span></span>`;
  }
  return `<span class="rbars">${html}</span>`;
}

// ---- skill copy, shared by all three seats ----------------------------------
// The dungeon controller, the co-op member and the duel guest each own their
// own tap loop and panel, but a skill has to READ the same in all three or the
// same spell teaches three different lessons. This is the single copy of that.

// The description card: what this spell does, in the panel, while you aim it.
// Appended into the action row (a full-width flex item) so no screen needed a
// new DOM node - the co-op and duel panels are the same markup.
export function appendSkillCard(container, skill) {
  const d = describeSkill(skill);
  if (!d || !container) return null;
  const card = document.createElement('div');
  card.className = `skill-card${skill.kind === 'damage' ? ' hostile' : ''}`;
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  card.innerHTML =
    `<b>${esc(skill.name)}</b>` +
    `<span class="skill-facts">${d.facts.map(esc).join(' \u00b7 ')}</span>` +
    `<span class="skill-effect">${esc(d.effect)}</span>` +
    d.notes.map((n) => `<span class="skill-note">${esc(n)}</span>`).join('');
  container.appendChild(card);
  return card;
}

// Turns taps into Vandal Hearts commands and keeps the tile overlays + side
// panel in sync with the battle engine. Flow for one player unit:
//   tap your unit -> move range (blue) + attackable foes (red)
//   tap a blue tile -> walks there, then shows foes it can now hit
//   tap a red foe    -> attacks; turn ends
//   a skill button   -> highlights its targets (green) and shows what the spell
//                       actually does; tap a highlighted tile to cast
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
    // A DUEL is fought in the room the players are already standing in
    // (js/duelBattle.js), so it passes inPlace and the scene is left alone:
    // setRoom would clear every bystander, prop and critter the explore view is
    // holding and replace the room the renderer is drawing. Dungeon battles
    // still build their room from scratch, which is what setRoom is for.
    if (!opts.inPlace) this.game.setRoom(room);
    this.sel = null;
    this.moving = false;
    this.mode = 'normal';
    this.exit = null;
    // Duel mode: the 'enemy' team is another PLAYER, so the UI must stop
    // speaking dungeon (see render()).
    this.duel = opts.duel || null;
    this.inPlace = !!opts.inPlace;
    this.duelUnits = opts.inPlace ? [...players, ...enemies] : [];
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
    room.addProp(spec); // walkable: stamps the footprint, blocks nothing
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
      const sk = this.activeSkill;
      // A self-centered skill has no target to pick: its own tile confirms it,
      // and the caster is the target the engine wants.
      const selfCast = sk.target === 'self' && this.game.overlays.skill.has(k);
      const picked = selfCast ? this.sel
        : (here && this.game.overlays.skill.has(k) && b.skillTargets(this.sel, sk).includes(here) ? here : null);
      if (picked) {
        b.resolveSkill(this.sel, picked, sk);
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
    if (!this.battle.canAfford(this.sel, skill)) return;
    // Self / area-around-self skills used to fire the instant the button was
    // pressed. That made the two most expensive spells in the game (Thorns at
    // 10 MP) the only ones a player could never read before paying: there was
    // no aiming step to show a description in. They now aim like everything
    // else - the painted blast IS the preview - and cast on a confirm.
    if (skill.target !== 'self' && !this.battle.skillTargets(this.sel, skill).length) return;
    this.activeSkill = skill;
    this.mode = 'skill';
    this.refreshOverlays();
    this.render();
  }

  // Confirm a self-centered cast (the button next to the painted blast).
  castSelf() {
    const sk = this.activeSkill;
    if (!this.sel || !sk || sk.target !== 'self') return;
    this.battle.resolveSkill(this.sel, this.sel, sk);
    this.endUnit();
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
    const foe = this.duel ? this.duel.opponent : null;
    // NB: bubble copy avoids em-dashes/ellipses — Volter maps them to odd glyphs.
    // A duel has no dungeon objective and no monsters: "enemy phase" and
    // "Defeat all enemies" are about a person standing in the room with you, so
    // name them instead.
    const label = this.duel ? {
      player: `Turn ${b.turn}, your move`,
      enemy: `Turn ${b.turn}, ${foe} is moving`,
      won: `You beat ${foe}!`,
      lost: `${foe} wins the duel.`,
    }[b.phase] : {
      player: `Turn ${b.turn}, your move`,
      enemy: `Turn ${b.turn}, enemy phase`,
      won: this.exit ? 'Victory! Walk onto the arrow to move on' : 'Victory!',
      lost: 'Defeated...',
    }[b.phase];
    // Old-school Habbo chat-bubble shape: bold "name" part, then the message.
    const showObj = b.phase === 'player' || b.phase === 'enemy';
    const obj = this.duel ? `Duel vs ${foe}` : b.objectiveText();
    this.dom.banner.innerHTML = showObj
      ? `<b>${label}:</b> <span class="obj">${obj}</span>`
      : `<b>${label}</b>`;
    this.dom.banner.className = `banner ${b.phase}`;

    this.dom.actions.innerHTML = '';
    if (b.phase === 'player') {
      if (this.mode === 'skill') {
        appendSkillCard(this.dom.actions, this.activeSkill);
        const noun = this.activeSkill.target === 'enemy' ? 'foe' : 'ally';
        this.btn(this.activeSkill.target === 'self'
          ? `Tap the green area to cast ${this.activeSkill.name}`
          : `Tap a green ${noun} for ${this.activeSkill.name}`, null, true);
        if (this.activeSkill.target === 'self') {
          this.btn(`Cast ${this.activeSkill.name}`, () => this.castSelf());
        }
        this.btn('Back', () => this.cancel());
      } else if (this.sel && !this.moving) {
        if (this.battle.attackTargets(this.sel).length) this.btn('Attack a red foe', null, true);
        // A skill you cannot pay for is shown DISABLED with its price, not
        // hidden: `skillCastable` hides a skill with no legal target, and a
        // button that vanishes because you are 1 MP short is indistinguishable
        // from one that has nothing to hit. The label is where the decision
        // gets made, so the cost is taught there.
        for (const sk of this.sel.skills || []) {
          if (!this.skillCastable(this.sel, sk)) continue;
          const label = sk.cost ? `${sk.name} (${sk.cost} MP)` : sk.name;
          // The full description also rides on the button itself, so a spell can
          // be read before it is paid for (and so a DISABLED one still explains
          // what the MP would have bought).
          if (this.battle.canAfford(this.sel, sk)) this.btn(label, () => this.enterSkill(sk), false, skillTooltip(sk));
          else this.btn(label, null, true, skillTooltip(sk));
        }
        this.btn('Wait', () => this.wait());
        if (!this.sel.moved) this.btn('Cancel', () => this.cancel());
      } else if (!this.moving) {
        this.btn('End Turn', () => this.endTurn());
      }
    }
    // Yielding is available on your own turn, from either seat, and is the ONLY
    // action in a duel that is not a battle command: it does not go through the
    // relay at all. The server ends the duel (duel-forfeit) and both clients
    // learn about it from their own mailbox, so a forfeit cannot be forged by
    // whoever happens to be hosting.
    if (this.duel && this.onForfeit && (b.phase === 'player' || b.phase === 'enemy')) {
      this.btn('Forfeit', () => this.onForfeit());
    }

    this.dom.roster.innerHTML = '';
    for (const u of b.units) {
      const row = document.createElement('div');
      row.className = `roster-row ${u.team}${u.alive ? '' : ' dead'}${u === this.sel ? ' sel' : ''}${u.done && u.alive ? ' done' : ''}`;
      // Levels: shown for your own squad, hidden for monsters (a goblin has no
      // meaningful level to a player) — but a DUELLIST is a person, and hiding
      // it made the same fighter read "Fighter" on one screen and "Fighter L1"
      // on the other.
      const lvl = this.duel || u.team === 'player' ? ` L${u.level}` : '';
      row.innerHTML =
        `<span class="rname">${u.name}</span>` +
        `<span class="rcls">${u.cls.name}${lvl}</span>` +
        rosterBars(u, !!this.duel) +
        `<span class="rhpn">${u.alive ? u.stats.hp : '✕'}</span>`;
      this.dom.roster.appendChild(row);
    }
  }

  btn(label, fn, disabled = false, title = '') {
    const b = document.createElement('button');
    b.textContent = label;
    if (title) b.title = title;
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
