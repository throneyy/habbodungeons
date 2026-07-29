import { Unit } from './units.js';
import { CLASSES } from './classes.js';
import { CONSUMABLES, ITEMS, sumBonuses } from './items.js';
import { treeSkillSpecs } from './skills.js';

export const SAVE_KEY = 'habbo-dungeons-run';
const SLOTS = ['weapon', 'armor', 'trinket'];

// A roster member is the PERSISTENT half of a unit — it survives across
// battles. Live Unit objects are instantiated from it per battle (bound to a
// room) and written back afterwards. hp of 0 means "downed for the rest of the
// run" (no mid-run revive; that's the roguelike stake).
export function makeMember(classId, name, opts = {}) {
  const cls = CLASSES[classId];
  return {
    id: opts.id || `m_${classId}_${Math.floor(Math.random() * 1e6)}`,
    classId,
    name: name || cls.name,
    level: opts.level || 1,
    xp: opts.xp || 0,
    hp: opts.hp != null ? opts.hp : maxHpOf(classId, opts.level || 1, opts.equipment),
    // MP starts full and is refilled at every camp (see writeBack). Carrying
    // wounds forward is the roguelike stake; carrying an empty pool forward
    // too would double the punishment and make the Cleric dead weight for the
    // back half of a run. A legacy save simply has no `mp` and gets a full
    // pool here — generous, never broken, and no save-version bump.
    mp: opts.mp != null ? opts.mp : maxMpOf(classId, opts.level || 1, opts.equipment),
    equipment: { weapon: null, armor: null, trinket: null, ...(opts.equipment || {}) },
    leader: !!opts.leader,
  };
}

export function maxHpOf(classId, level, equipment) {
  const base = CLASSES[classId].maxHp + (level - 1) * 4;
  const eq = sumBonuses(equipmentIds(equipment));
  return base + (eq.maxHp || 0);
}

// Mirrors maxHpOf for the skill pool. `maxMp` is a valid equipment bonus key,
// so a future "+MP trinket" needs no plumbing beyond the item itself.
export function maxMpOf(classId, level, equipment) {
  const base = (CLASSES[classId].maxMp || 0) + (level - 1) * 2;
  const eq = sumBonuses(equipmentIds(equipment));
  return base + (eq.maxMp || 0);
}

function equipmentIds(equipment = {}) {
  return SLOTS.map((s) => equipment[s]).filter(Boolean);
}

// Full effective stats for a member (for the squad/inventory UI).
export function memberStats(m) {
  const base = CLASSES[m.classId];
  const bump = m.level - 1;
  const eq = sumBonuses(equipmentIds(m.equipment));
  return {
    maxHp: base.maxHp + bump * 4 + (eq.maxHp || 0),
    maxMp: (base.maxMp || 0) + bump * 2 + (eq.maxMp || 0),
    atk: base.atk + bump + (eq.atk || 0),
    def: base.def + Math.floor(bump / 2) + (eq.def || 0),
    spd: base.spd + (eq.spd || 0),
    move: base.move + (eq.move || 0),
    range: base.range,
  };
}

export class Run {
  constructor({ squad, dungeon, eventPicks, unlockedSkills, seed }) {
    this.squad = squad; // roster members
    this.dungeon = dungeon; // { id, name, nodes }
    this.eventPicks = eventPicks || {}; // nodeIndex -> eventId (fixed for resume)
    // Encounter seed, rolled once at run start and serialized like eventPicks:
    // a resumed save regenerates byte-identical battles (encounterGen.js).
    this.seed = seed != null ? seed >>> 0 : (Math.random() * 0x100000000) >>> 0;
    // Origins tree-skill ids (Water/Nature) the leader has unlocked — see
    // identity.js. The leader unit is granted these at battle instantiation.
    this.unlockedSkills = unlockedSkills || [];
    this.nodeIndex = 0;
    this.inventory = []; // unequipped item ids
    this.gold = 0;
    this.rested = false; // one Rest per camp
    this.outcome = null; // null | 'won' | 'lost'
    this.stage = 'battle'; // 'battle' (doing/about to do node) | 'camp' (prep after a won battle)
    this.savedAt = null; // ISO timestamp of last save (for cloud-vs-local compare)
    this.onSave = null; // optional hook (UI layer injects cloud mirroring)
  }

  // -------------------------------------------------------- progression

  get node() {
    return this.dungeon.nodes[this.nodeIndex] || null;
  }
  get totalBattles() {
    return this.dungeon.nodes.filter((n) => n.type === 'battle').length;
  }
  battleNumber() {
    // 1-based index among battle nodes up to and including the current node
    let n = 0;
    for (let i = 0; i <= this.nodeIndex && i < this.dungeon.nodes.length; i++) {
      if (this.dungeon.nodes[i].type === 'battle') n++;
    }
    return n;
  }
  advance() {
    this.nodeIndex++;
    this.rested = false;
    if (this.nodeIndex >= this.dungeon.nodes.length) this.outcome = 'won';
    return this.node;
  }

  livingSquad() {
    return this.squad.filter((m) => m.hp > 0);
  }
  downedSquad() {
    return this.squad.filter((m) => m.hp <= 0);
  }
  isWiped() {
    return this.livingSquad().length === 0;
  }

  // The revive consumable the backpack is carrying, or null. Found by EFFECT
  // rather than by id, so this stays true if a second revive item is ever added
  // — and so the camp button and the thing it spends can never disagree.
  reviveItem() {
    return this.inventory.find((id) => CONSUMABLES[id] && CONSUMABLES[id].effect.kind === 'revive') || null;
  }

  // Camp Revive, the sibling of canRest(): a crystal in the bag AND somebody to
  // spend it on. Both halves matter — resolveEffect refuses a revive with
  // nobody fallen, and consumeFromRun would then leave the item untouched, so a
  // button that ignored this would look broken rather than refuse honestly.
  canRevive() {
    return !!this.reviveItem() && this.downedSquad().length > 0;
  }

  // ------------------------------------------------------ battle bridge

  // Instantiate live Units for a battle. spawns is an array of {x,y,dir}.
  instantiateSquad(room, spawns) {
    const leaderSkills = treeSkillSpecs(this.unlockedSkills);
    return this.livingSquad().map((m, i) => {
      const sp = spawns[i % spawns.length];
      return new Unit(room, null, sp.x, sp.y, {
        id: m.id,
        team: 'player',
        classId: m.classId,
        name: m.name,
        level: m.level,
        xp: m.xp,
        hp: m.hp,
        mp: m.mp,
        bonuses: sumBonuses(equipmentIds(m.equipment)),
        useSprites: m.leader,
        skills: m.leader ? leaderSkills : [], // only your Habbo wields Origins skills
        dir: sp.dir ?? 4,
      });
    });
  }

  // Copy post-battle hp/xp/level from live units back into the roster.
  writeBack(units) {
    for (const u of units) {
      const m = this.squad.find((s) => s.id === u.id);
      if (!m) continue;
      m.hp = u.alive ? u.stats.hp : 0;
      m.xp = u.xp;
      m.level = u.level;
      // MP refills between battles. Done HERE rather than in the camp UI so it
      // holds for every path into camp, including a resumed save.
      m.mp = maxMpOf(m.classId, m.level, m.equipment);
    }
  }

  // ---------------------------------------------------------- economy

  addLoot(id) {
    if (ITEMS[id]) this.inventory.push(id);
  }
  addGold(n) {
    this.gold = Math.max(0, this.gold + n);
  }

  equip(memberId, itemId) {
    const m = this.squad.find((s) => s.id === memberId);
    const it = ITEMS[itemId];
    const idx = this.inventory.indexOf(itemId);
    if (!m || !it || idx < 0) return false;
    this.inventory.splice(idx, 1);
    const prev = m.equipment[it.slot];
    m.equipment[it.slot] = itemId;
    if (prev) this.inventory.push(prev);
    this.clampHp(m);
    return true;
  }

  unequip(memberId, slot) {
    const m = this.squad.find((s) => s.id === memberId);
    if (!m || !m.equipment[slot]) return false;
    this.inventory.push(m.equipment[slot]);
    m.equipment[slot] = null;
    this.clampHp(m);
    return true;
  }

  // Keep current hp/mp within the (possibly changed) max after equipment swaps
  // — unequipping a +MP trinket must not leave the pool above its ceiling.
  clampHp(m) {
    const st = memberStats(m);
    if (m.hp > st.maxHp) m.hp = st.maxHp;
    if (m.mp > st.maxMp) m.mp = st.maxMp;
  }

  // Camp Rest: heal living members by a fraction of max, once per camp, for gold.
  restCost() {
    return 10 + this.battleNumber() * 5;
  }
  canRest() {
    return !this.rested && this.gold >= this.restCost() && this.livingSquad().some((m) => m.hp < memberStats(m).maxHp);
  }
  rest() {
    if (!this.canRest()) return false;
    this.addGold(-this.restCost());
    for (const m of this.livingSquad()) {
      const max = memberStats(m).maxHp;
      m.hp = Math.min(max, m.hp + Math.ceil(max * 0.4));
    }
    this.rested = true;
    return true;
  }

  // ----------------------------------------------------------- persistence

  serialize() {
    this.savedAt = new Date().toISOString();
    return {
      v: 1,
      dungeonId: this.dungeon.id,
      nodeIndex: this.nodeIndex,
      eventPicks: this.eventPicks,
      seed: this.seed,
      unlockedSkills: this.unlockedSkills,
      gold: this.gold,
      rested: this.rested,
      inventory: this.inventory,
      outcome: this.outcome,
      stage: this.stage,
      savedAt: this.savedAt,
      squad: this.squad.map((m) => ({
        id: m.id, classId: m.classId, name: m.name, level: m.level,
        xp: m.xp, hp: m.hp, mp: m.mp, equipment: m.equipment, leader: m.leader,
      })),
    };
  }

  save() {
    const blob = this.serialize();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
    } catch (e) {
      /* storage may be unavailable; ignore */
    }
    // Optional cloud mirror, injected by the UI layer (keeps this module pure).
    if (this.onSave) {
      try {
        this.onSave(this, blob);
      } catch (e) {
        /* cloud is best-effort; never block local play */
      }
    }
  }

  static hasSave() {
    return !!localStorage.getItem(SAVE_KEY);
  }
  static clearSave() {
    localStorage.removeItem(SAVE_KEY);
  }

  // Rebuild a Run from a serialized blob (used by both the localStorage load
  // and the Supabase cloud load). buildDungeon(dungeonId, eventPicks) rebuilds
  // the node list from the saved id.
  static deserialize(d, buildDungeon) {
    if (!d) return null;
    const dungeon = buildDungeon(d.dungeonId, d.eventPicks || {});
    if (!dungeon) return null;
    // A save written before MP existed has no `mp` on its members, and this
    // path does not go through makeMember. Fill it in rather than bumping the
    // save version: an undefined pool would render as "undefined/20 MP" in
    // camp and read as 0 to canAfford, silently locking every skill.
    const squad = (d.squad || []).map((m) =>
      (m.mp != null ? m : { ...m, mp: maxMpOf(m.classId, m.level || 1, m.equipment) }));
    const run = new Run({
      squad, dungeon, eventPicks: d.eventPicks || {},
      unlockedSkills: d.unlockedSkills || [],
      seed: d.seed != null ? d.seed : 0, // legacy saves predate seeding
    });
    run.nodeIndex = d.nodeIndex || 0;
    run.gold = d.gold || 0;
    run.rested = !!d.rested;
    run.inventory = d.inventory || [];
    run.outcome = d.outcome || null;
    run.stage = d.stage || 'battle';
    run.savedAt = d.savedAt || null;
    return run;
  }

  static load(buildDungeon) {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    let d;
    try {
      d = JSON.parse(raw);
    } catch {
      return null;
    }
    return Run.deserialize(d, buildDungeon);
  }
}
