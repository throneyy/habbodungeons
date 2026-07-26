// M2 run-layer tests — run with:  node tests/run.test.js
// Minimal localStorage shim so run.js save/load works under Node.
globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
})();

import { Room } from '../js/room.js';
import { Battle } from '../js/battle.js';
import { Unit } from '../js/units.js';
import { sumBonuses, bonusText, rollItem, ITEMS } from '../js/items.js';
import { Run, makeMember, memberStats } from '../js/run.js';
import { buildDungeon, DUNGEON_ID, EVENT_NODE_INDICES } from '../js/dungeon.js';
import { EVENTS, pickEvents } from '../js/events.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}
// deterministic RNG (mulberry32)
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- items -----------------------------------------------------------------
console.log('items');
check('sumBonuses adds across equipment', (() => {
  const b = sumBonuses(['iron_sword', 'chainmail', 'vigor_charm']);
  return b.atk === 2 && b.def === 2 && b.maxHp === 6;
})());
check('bonusText reads cleanly', bonusText('iron_sword') === '+2 ATK');
check('rollItem is deterministic for a fixed seed', (() => {
  const a = rollItem(2, rng(42));
  const b = rollItem(2, rng(42));
  return a === b && ITEMS[a];
})());
check('deeper battles can roll rarer loot', (() => {
  const r = rng(7);
  let sawBetter = false;
  for (let i = 0; i < 200; i++) {
    const id = rollItem(3, r);
    if (['rare', 'epic', 'legendary'].includes(ITEMS[id].rarity)) sawBetter = true;
  }
  return sawBetter;
})());

// ---- roster / stats --------------------------------------------------------
console.log('roster & equipment');
{
  const m = makeMember('fighter', 'You', { leader: true });
  check('fresh member is full hp', m.hp === memberStats(m).maxHp);
  check('leader flag set', m.leader === true);
  const base = memberStats(m).atk;
  const run = new Run({ squad: [m], dungeon: buildDungeon(), eventPicks: {} });
  run.inventory.push('iron_sword');
  check('equip moves item out of inventory', run.equip(m.id, 'iron_sword') && run.inventory.length === 0);
  check('equipment raises effective ATK by +2', memberStats(m).atk === base + 2);
  check('unequip returns item to inventory', run.unequip(m.id, 'weapon') && run.inventory[0] === 'iron_sword');
  // hp clamp when swapping hp gear
  run.inventory.push('vigor_charm');
  run.equip(m.id, 'vigor_charm');
  m.hp = memberStats(m).maxHp; // full with +6
  run.unequip(m.id, 'trinket');
  check('hp clamps down after losing +HP gear', m.hp === memberStats(m).maxHp);
}

// ---- instantiate / writeback ----------------------------------------------
console.log('battle bridge');
{
  const room = new Room({ id: 't', name: 't', heightmap: ['0000', '0000', '0000'], spawn: { x: 0, y: 0 } });
  const m = makeMember('fighter', 'You', { leader: true });
  m.equipment.weapon = 'iron_sword';
  m.hp = 20; // carried wound
  const run = new Run({ squad: [m], dungeon: buildDungeon(), eventPicks: {} });
  const [u] = run.instantiateSquad(room, [{ x: 1, y: 1 }]);
  check('unit spawns at given tile', u.x === 1 && u.y === 1);
  check('equipment bonus applied to unit atk', u.stats.atk === m.level - 1 + 34 - 34 + 11 + 2); // base 11 +2
  check('carried wound respected (hp=20)', u.stats.hp === 20);
  check('leader uses sprites flag', u.useSprites === true);
  u.stats.hp = 12;
  u.xp = 15;
  run.writeBack([u]);
  check('writeBack copies hp/xp', m.hp === 12 && m.xp === 15);
  u.stats.hp = 0;
  run.writeBack([u]);
  check('dead unit downs the member (hp 0)', m.hp === 0);
  check('isWiped when all members down', run.isWiped());
}

// ---- rest / gold -----------------------------------------------------------
console.log('camp economy');
{
  const m = makeMember('fighter', 'You');
  m.hp = 5;
  const run = new Run({ squad: [m], dungeon: buildDungeon(), eventPicks: {} });
  check('cannot rest with no gold', !run.canRest());
  run.addGold(500);
  check('can rest when wounded + funded', run.canRest());
  const cost = run.restCost();
  const g0 = run.gold;
  run.rest();
  check('rest heals the party', m.hp > 5);
  check('rest deducts gold', run.gold === g0 - cost);
  check('rest is once per camp', !run.canRest());
}

// ---- events ----------------------------------------------------------------
console.log('events');
{
  const m = makeMember('fighter', 'You');
  m.hp = 10;
  const run = new Run({ squad: [m], dungeon: buildDungeon(), eventPicks: {} });
  EVENTS.shrine.choices[0].resolve(run); // pray -> heal
  check('shrine heal raises hp', m.hp > 10);
  const inv0 = run.inventory.length;
  EVENTS.cache.choices[0].resolve(run, rng(3)); // take supplies -> item
  check('cache grants an item', run.inventory.length === inv0 + 1);
  const gold0 = run.gold;
  EVENTS.wanderer.choices[1].resolve(run); // take pouch -> +40
  check('wanderer pouch grants gold', run.gold === gold0 + 40);
  const picks = pickEvents([1, 3], rng(9));
  check('pickEvents fills both slots distinctly', picks[1] && picks[3] && picks[1] !== picks[3]);
}

// ---- skills ----------------------------------------------------------------
console.log('skills');
{
  const room = new Room({ id: 't', name: 't', heightmap: ['00000', '00000'], spawn: { x: 0, y: 0 } });
  const cleric = new Unit(room, null, 0, 0, { team: 'player', classId: 'cleric' });
  const ally = new Unit(room, null, 1, 0, { team: 'player', classId: 'fighter' });
  ally.stats.hp = 10;
  const b = new Battle(room, [cleric, ally], {});
  check('cleric can target a wounded adjacent ally', b.skillTargets(cleric).includes(ally));
  b.resolveSkill(cleric, ally);
  check('heal restores hp (capped)', ally.stats.hp === Math.min(ally.stats.maxHp, 22));
  check('healer is spent (acted)', cleric.acted === true);

  const bard = new Unit(room, null, 0, 1, { team: 'player', classId: 'bard' });
  const hitter = new Unit(room, null, 1, 1, { team: 'player', classId: 'fighter' });
  const foe = new Unit(room, null, 2, 1, { team: 'enemy', classId: 'ranger' });
  const b2 = new Battle(room, [bard, hitter, foe], {});
  b2.resolveSkill(bard, hitter);
  check('inspire sets a buff', hitter.buffAtk === 5);
  const hp0 = foe.stats.hp;
  b2.resolveAttack(hitter, foe);
  check('buffed attack lands and consumes the buff', hitter.buffAtk === 0 && foe.stats.hp < hp0);
}

// ---- origins skills on the leader -----------------------------------------
console.log('origins skills');
{
  const room = new Room({ id: 't', name: 't', heightmap: ['00000', '00000'], spawn: { x: 0, y: 0 } });
  const squad = [makeMember('fighter', 'You', { leader: true }), makeMember('ranger', 'Archer')];
  const run = new Run({ squad, dungeon: buildDungeon(), eventPicks: {}, unlockedSkills: ['net', 'life_wave'] });
  const units = run.instantiateSquad(room, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
  const leader = units.find((u) => u.useSprites);
  const other = units.find((u) => !u.useSprites);
  check('leader wields unlocked Origins skills', leader.skills.map((s) => s.id).sort().join(',') === 'life_wave,net');
  check('non-leader gets no Origins skills', other.skills.length === 0);
  check('unknown skill ids are dropped safely', (() => {
    const r2 = new Run({ squad: [makeMember('fighter', 'You', { leader: true })], dungeon: buildDungeon(), eventPicks: {}, unlockedSkills: ['bogus'] });
    return r2.instantiateSquad(room, [{ x: 0, y: 0 }])[0].skills.length === 0;
  })());
}

// ---- save / resume ---------------------------------------------------------
console.log('save / resume');
{
  const squad = [makeMember('fighter', 'You', { leader: true }), makeMember('mage', 'Mage')];
  const eventPicks = pickEvents(EVENT_NODE_INDICES, rng(1));
  const run = new Run({ squad, dungeon: buildDungeon(DUNGEON_ID, eventPicks), eventPicks, unlockedSkills: ['net', 'tidal_wave'] });
  run.addGold(77);
  run.inventory.push('frostbrand');
  run.equip(squad[1].id, 'frostbrand');
  run.advance(); // move off battle 1 to the event node
  run.save();

  const loaded = Run.load(buildDungeon);
  check('save/resume keeps node index', loaded.nodeIndex === 1);
  check('save/resume keeps gold', loaded.gold === 77);
  check('save/resume keeps equipment', loaded.squad[1].equipment.weapon === 'frostbrand');
  check('save/resume keeps dungeon (6 nodes)', loaded.dungeon.nodes.length === 6);
  check('save/resume keeps event picks', loaded.eventPicks[1] === eventPicks[1]);
  check('save/resume keeps unlocked Origins skills', loaded.unlockedSkills.join(',') === 'net,tidal_wave');
  // legacy save migration: pre-retheme frostkeep saves must still load
  const legacy = run.serialize(); // fresh valid blob…
  legacy.dungeonId = 'frostkeep'; // …stamped with the old id
  const migrated = Run.deserialize(legacy, buildDungeon);
  check('legacy frostkeep save still loads', !!migrated && migrated.dungeon.nodes.length === 6);
  check('legacy save migrates to the new id', migrated.dungeon.id === 'dungeon');

  Run.clearSave();
  check('clearSave removes the save', !Run.hasSave());
}

// ---- dungeon shape ---------------------------------------------------------
console.log('dungeon');
{
  const d = buildDungeon();
  check('dungeon has 6 nodes', d.nodes.length === 6);
  check('4 battle nodes', d.nodes.filter((n) => n.type === 'battle').length === 4);
  const last = d.nodes[d.nodes.length - 1];
  check('last node is the boss', last.type === 'battle' && last.boss === true);
  check('boss node carries a slay objective', last.objective && last.objective.type === 'slay');
  check('battle 1 has no explicit objective (defaults to eliminate)', !d.nodes[0].objective);
  const room = d.nodes[0].makeRoom();
  const foes = d.nodes[0].makeEnemies(room);
  check('battle 1 builds a room + enemies', room.w > 0 && foes.length === 3);
}

console.log(failed ? `\n${failed} test(s) FAILED` : '\nAll M2 tests passed');
process.exit(failed ? 1 : 0);
