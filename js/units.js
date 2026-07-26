import { Avatar } from './avatar.js';
import { CLASSES } from './classes.js';

let NEXT_ID = 1;

// A combatant on the battle grid. Extends Avatar, so it walks on the exact
// same 500ms Habbo tick and renders through the same pipeline. Adds team,
// class, stats and the per-turn moved/acted flags the phase system reads.
export class Unit extends Avatar {
  constructor(room, sprites, x, y, opts = {}) {
    super(room, sprites, x, y, opts.dir ?? 4);
    this.id = opts.id ?? `u${NEXT_ID++}`;
    this.team = opts.team || 'player'; // 'player' | 'enemy'
    this.classId = opts.classId || 'fighter';
    this.cls = CLASSES[this.classId];
    this.name = opts.name || this.cls.name;
    // Skills: the class skill (Heal/Inspire) plus any unlocked Origins tree
    // skills passed in (leader only — Water/Nature, see skills.js). `skill`
    // stays as the primary/default so single-skill call sites keep working.
    const extra = opts.skills || [];
    this.skills = [...(this.cls.skill ? [this.cls.skill] : []), ...extra];
    this.skill = this.skills[0] || null;
    this.buffAtk = 0; // temporary Inspire/Blessing bonus, consumed on next attack
    this.buffs = []; // lasting stat buffs from consumables ({ stat, n }) — see applyBuff
    this.shield = 0; // absorbs incoming damage before HP (Foam/Sapling Barrier)
    this.rooted = 0; // turns of root remaining (Net/Whirlpool) — can't move
    this.rootedThisTurn = false; // resolved at resetTurn: rooted for THIS phase
    this.useSprites = opts.useSprites ?? false; // true = habbo-imaging avatar
    this.ghost = opts.ghost || 0; // spectral render alpha (0 = solid)
    // Objective role tag (data-driven, e.g. 'boss' for a slay target, 'vip'
    // for a defend/escort unit). null for a plain combatant. Read by
    // battle.evaluateObjective + objective-aware AI; never by the render layer.
    this.tag = opts.tag || null;
    this.level = opts.level || 1;
    this.xp = 0;

    const base = this.cls;
    const bump = this.level - 1; // +1 stat-ish per level (see levelUp)
    const eq = opts.bonuses || {}; // summed equipment bonuses (see items.js)
    const maxHp = base.maxHp + bump * 4 + (eq.maxHp || 0);
    this.stats = {
      maxHp,
      hp: opts.hp != null ? Math.min(opts.hp, maxHp) : maxHp, // carry wounds across battles
      atk: base.atk + bump + (eq.atk || 0),
      def: base.def + Math.floor(bump / 2) + (eq.def || 0),
      spd: base.spd + (eq.spd || 0),
      move: base.move + (eq.move || 0),
      range: base.range,
      min: base.min,
      closeRange: base.closeRange
        ? { min: base.closeRange.min, max: base.closeRange.max, atk: base.closeRange.atk + bump + (eq.atk || 0) }
        : null,
    };

    // Consumable buffs (tonics) fold straight into the live stats. Applied
    // after `stats` exists so construction and a mid-battle drink share code.
    for (const b of opts.buffs || []) this.applyBuff(b.stat, b.n);

    // Per-turn flags, reset at the start of each of this unit's phases.
    this.moved = false;
    this.acted = false;
  }

  // Add a lasting stat buff (a drunk tonic), effective immediately even on an
  // already-constructed unit. Deliberately NOT `buffAtk`: that field is
  // Inspire's single-swing bonus, zeroed by the next attack (battle.js) and
  // read as an eligibility flag by Inspire's targeting, so parking a lasting
  // value there would both vanish and lock the Bard out. Returns false for an
  // unbuffable stat or a non-numeric amount, so a malformed effect is refused
  // instead of writing NaN into the stat block.
  applyBuff(stat, n) {
    if (!this.stats) return false;
    if (stat !== 'atk' && stat !== 'def' && stat !== 'spd') return false;
    if (!Number.isFinite(n) || n === 0) return false;
    this.stats[stat] += n;
    // equipment atk feeds BOTH atk and closeRange.atk (see the constructor),
    // so the close-range profile has to move with it or a Ranger stepping into
    // melee would silently lose the buff.
    if (stat === 'atk' && this.stats.closeRange) this.stats.closeRange.atk += n;
    this.buffs.push({ stat, n });
    return true;
  }

  get alive() {
    return !this.stats || this.stats.hp > 0; // explore mode nulls stats (no HP)
  }

  get done() {
    return this.acted; // a unit's turn is over once it has acted (or waited)
  }

  // Height of the tile the unit currently stands on (for combat modifiers).
  get tileZ() {
    return this.room.heightAt(this.x, this.y);
  }

  resetTurn() {
    this.moved = false;
    this.acted = false;
    // A root applied last phase bites THIS phase, then wears off.
    this.rootedThisTurn = this.rooted > 0;
    if (this.rooted > 0) this.rooted--;
  }

  // Shields soak damage before HP does; whatever's left wounds the unit.
  takeDamage(n) {
    let dmg = n;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
    }
    this.stats.hp = Math.max(0, this.stats.hp - dmg);
    return this.stats.hp;
  }

  gainXp(n) {
    this.xp += n;
    const need = this.level * 20;
    if (this.xp >= need) {
      this.xp -= need;
      this.levelUp();
      return true;
    }
    return false;
  }

  levelUp() {
    this.level++;
    this.stats.maxHp += 4;
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 4);
    this.stats.atk += 1;
    if (this.level % 2 === 0) this.stats.def += 1;
  }
}
