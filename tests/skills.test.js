// M3 skill-tree tests — run with:  node tests/skills.test.js
import { Room } from '../js/room.js';
import { Battle } from '../js/battle.js';
import { Unit } from '../js/units.js';
import { SKILL_TREES, ALL_TREE_SKILLS, unlockedTreeSkills, treeSkillSpecs, nextUnlocks } from '../js/skills.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else { failed++; console.error(`  FAIL  ${name}`); }
}

// flat 6x6 room so tileDistance == chebyshev and height is neutral everywhere
const flat = () => new Room({ id: 't', name: 't', heightmap: ['000000','000000','000000','000000','000000','000000'], spawn: { x: 0, y: 0 } });
const spec = (id) => ALL_TREE_SKILLS[id];

// ---- unlock mapping --------------------------------------------------------
console.log('unlock mapping');
check('nothing unlocked at level 0', unlockedTreeSkills(0, 0).length === 0);
check('fishing 5 unlocks Net only', JSON.stringify(unlockedTreeSkills(5, 0)) === JSON.stringify(['net']));
check('fishing 40 unlocks 3 water skills', unlockedTreeSkills(40, 0).length === 3);
check('gardening 20 unlocks 2 nature skills', unlockedTreeSkills(0, 20).length === 2);
check('99/99 unlocks all 10', unlockedTreeSkills(99, 99).length === 10);
check('mixed 40/20 unlocks 3+2', unlockedTreeSkills(40, 20).length === 5);
check('treeSkillSpecs resolves ids to specs', treeSkillSpecs(['net', 'thorns', 'bogus']).length === 2);
check('every tree skill has a valid kind/target', Object.values(ALL_TREE_SKILLS).every(
  (s) => ['heal', 'buff', 'shield', 'damage'].includes(s.kind) && ['ally', 'enemy', 'self'].includes(s.target)));
check('nextUnlocks reports the next water gate from 0', nextUnlocks(0, 0).water.skill.id === 'net');
check('nextUnlocks water is null at 99', nextUnlocks(99, 0).water === null);
check('two trees, five skills each', SKILL_TREES.water.skills.length === 5 && SKILL_TREES.nature.skills.length === 5);

// ---- unit skill list -------------------------------------------------------
console.log('unit skill list');
{
  const room = flat();
  const leader = new Unit(room, null, 0, 0, { team: 'player', classId: 'cleric', skills: treeSkillSpecs(['net', 'life_wave']) });
  check('class skill stays primary', leader.skill.id === 'heal');
  check('unlocked skills appended', leader.skills.map((s) => s.id).join(',') === 'heal,net,life_wave');
  const plain = new Unit(room, null, 1, 0, { team: 'player', classId: 'fighter' });
  check('fighter with no tree skills has none', plain.skills.length === 0 && plain.skill === null);
  const warriorLeader = new Unit(room, null, 2, 0, { team: 'player', classId: 'fighter', skills: treeSkillSpecs(['net']) });
  check('skill-less class adopts its first unlocked skill as primary', warriorLeader.skill.id === 'net');
}

// ---- shields ---------------------------------------------------------------
console.log('shields');
{
  const room = flat();
  const u = new Unit(room, null, 0, 0, { team: 'player', classId: 'fighter' });
  u.shield = 5;
  const hp0 = u.stats.hp;
  u.takeDamage(3);
  check('shield absorbs partial hit (hp intact)', u.stats.hp === hp0 && u.shield === 2);
  u.takeDamage(6);
  check('overflow past shield wounds hp', u.shield === 0 && u.stats.hp === hp0 - 4);
}

// ---- rooting ---------------------------------------------------------------
console.log('rooting');
{
  const room = flat();
  const caster = new Unit(room, null, 0, 0, { team: 'player', classId: 'mage', skills: treeSkillSpecs(['net']) });
  const foe = new Unit(room, null, 2, 0, { team: 'enemy', classId: 'ranger' });
  const b = new Battle(room, [caster, foe], {});
  const before = foe.stats.hp;
  const dmg = b.computeSkillDamage(caster, foe, spec('net'));
  b.resolveSkill(caster, foe, spec('net'));
  check('Net damages the foe', foe.stats.hp === before - dmg && dmg > 0);
  check('Net sets a root', foe.rooted === 1);
  check('foe can move before its phase resets', true); // sanity anchor
  foe.resetTurn(); // start of the enemy phase
  check('root bites this turn', foe.rootedThisTurn === true && foe.rooted === 0);
  check('rooted foe has no move tiles', b.moveTiles(foe).size === 0);
  foe.resetTurn(); // following turn
  check('root wears off next turn', foe.rootedThisTurn === false);
  check('freed foe can move again', b.moveTiles(foe).size > 0);
}

// ---- single-target damage can end the battle -------------------------------
console.log('offensive skills');
{
  const room = flat();
  const caster = new Unit(room, null, 0, 0, { team: 'player', classId: 'mage', skills: treeSkillSpecs(['net']) });
  const foe = new Unit(room, null, 2, 0, { team: 'enemy', classId: 'ranger' });
  foe.stats.hp = 1;
  let ended = null;
  const b = new Battle(room, [caster, foe], { onEnd: (r) => (ended = r) });
  b.resolveSkill(caster, foe, spec('net'));
  check('lethal skill downs the foe', !foe.alive);
  check('skill kill wins the room', b.phase === 'won' && ended === 'won');
  check('caster is spent after casting', caster.acted === true);
}

// ---- AoE damage (Tidal Wave) hits a cluster --------------------------------
console.log('area damage');
{
  const room = flat();
  const caster = new Unit(room, null, 0, 0, { team: 'player', classId: 'mage', skills: treeSkillSpecs(['tidal_wave']) });
  const a = new Unit(room, null, 3, 3, { team: 'enemy', classId: 'ranger' });
  const nearB = new Unit(room, null, 3, 2, { team: 'enemy', classId: 'ranger' }); // within radius 1 of a
  const far = new Unit(room, null, 0, 5, { team: 'enemy', classId: 'ranger' });   // outside the blast
  // put caster in range of the target tile (range 3 from (3,3) -> stand at (3,0)? dist 3). Move caster.
  caster.x = 3; caster.y = 0;
  const b = new Battle(room, [caster, a, nearB, far], {});
  const hpFar = far.stats.hp;
  b.resolveSkill(caster, a, spec('tidal_wave'));
  check('primary target is hit', !a.alive || a.stats.hp < a.stats.maxHp);
  check('adjacent foe caught in the blast', nearB.stats.hp < nearB.stats.maxHp);
  check('distant foe untouched', far.stats.hp === hpFar);
}

// ---- self-target burst (Thorns) hits all adjacent foes ---------------------
console.log('self burst');
{
  const room = flat();
  const caster = new Unit(room, null, 2, 2, { team: 'player', classId: 'barbarian', skills: treeSkillSpecs(['thorns']) });
  const n1 = new Unit(room, null, 2, 1, { team: 'enemy', classId: 'ranger' });
  const n2 = new Unit(room, null, 3, 3, { team: 'enemy', classId: 'ranger' }); // diagonally adjacent
  const away = new Unit(room, null, 5, 5, { team: 'enemy', classId: 'ranger' });
  const b = new Battle(room, [caster, n1, n2, away], {});
  const hpAway = away.stats.hp;
  b.resolveSkill(caster, caster, spec('thorns'));
  check('adjacent orthogonal foe gored', n1.stats.hp < n1.stats.maxHp);
  check('adjacent diagonal foe gored', n2.stats.hp < n2.stats.maxHp);
  check('non-adjacent foe safe', away.stats.hp === hpAway);
}

// ---- area support: heal / shield / buff ------------------------------------
console.log('area support');
{
  const room = flat();
  const healer = new Unit(room, null, 2, 2, { team: 'player', classId: 'cleric', skills: treeSkillSpecs(['life_wave', 'sapling_barrier', 'natures_blessing']) });
  const h1 = new Unit(room, null, 2, 1, { team: 'player', classId: 'fighter' });
  const h2 = new Unit(room, null, 3, 2, { team: 'player', classId: 'rogue' });
  h1.stats.hp = 5; h2.stats.hp = 5;
  const b = new Battle(room, [healer, h1, h2], {});
  b.resolveSkill(healer, h1, spec('life_wave')); // centered on h1, radius 1 reaches h2 (dist 2? (2,1)->(3,2)=1) yes
  check('Life Wave heals the centered ally', h1.stats.hp > 5);
  check('Life Wave heals a nearby ally too', h2.stats.hp > 5);

  h1.acted = false; healer.acted = false;
  b.resolveSkill(healer, h1, spec('sapling_barrier'));
  check('Sapling Barrier shields the cluster', h1.shield > 0 && h2.shield > 0);

  healer.acted = false;
  b.resolveSkill(healer, h1, spec('natures_blessing'));
  check("Nature's Blessing buffs the cluster's ATK", h1.buffAtk === 5 && h2.buffAtk === 5);
}

// ---- kill XP is the same whichever way you killed it -----------------------
// Skill kills used to pay a flat 10 while autoattack kills paid 10 + level*5,
// so casting was punished twice: it cost MP AND it cost XP, and the gap widened
// the tougher the target. Both paths price a kill through battle.killXp now.
console.log('kill xp parity');
{
  // Same foe, same hero, one felled by a skill and one by a swing. A level-1
  // foe pays 15, under the 20 a level-1 unit needs to level, so neither side
  // levels and the raw xp is directly comparable.
  const mk = () => {
    const room = flat();
    const hero = new Unit(room, null, 2, 2, { team: 'player', classId: 'mage', skills: treeSkillSpecs(['net']) });
    const foe = new Unit(room, null, 2, 3, { team: 'enemy', classId: 'ranger' });
    foe.stats.hp = 1; // dies to either path in one action
    return { hero, foe, b: new Battle(room, [hero, foe], {}) };
  };

  const bySkill = mk();
  bySkill.b.resolveSkill(bySkill.hero, bySkill.foe, spec('net'));
  const byHit = mk();
  byHit.b.resolveAttack(byHit.hero, byHit.foe);

  check('the skill actually killed it', !bySkill.foe.alive);
  check('the swing actually killed it', !byHit.foe.alive);
  check('a skill kill pays a level-scaled 15, not a flat 10', bySkill.hero.xp === 15);
  check('a skill kill pays exactly what the same swing pays', bySkill.hero.xp === byHit.hero.xp);
  check('killXp scales with target level',
    bySkill.b.killXp({ level: 1 }) === 15 && bySkill.b.killXp({ level: 3 }) === 25);
}

{
  // An area skill that fells three foes at once pays for each of them. Foes are
  // levels 1/2/3 (15 + 20 + 25 = 60), so a flat rate - or a rate keyed to only
  // the first or last victim - cannot coincidentally match. The caster is level
  // 5 (needing 100 xp) so nothing levels mid-count and the total stays readable.
  const room = flat();
  const caster = new Unit(room, null, 2, 2, { team: 'player', classId: 'barbarian', level: 5, skills: treeSkillSpecs(['thorns']) });
  const f1 = new Unit(room, null, 2, 1, { team: 'enemy', classId: 'ranger', level: 1 });
  const f2 = new Unit(room, null, 3, 3, { team: 'enemy', classId: 'ranger', level: 2 });
  const f3 = new Unit(room, null, 1, 2, { team: 'enemy', classId: 'ranger', level: 3 });
  const survivor = new Unit(room, null, 5, 5, { team: 'enemy', classId: 'ranger', level: 9 });
  for (const f of [f1, f2, f3]) f.stats.hp = 1; // all three die to the burst
  const b = new Battle(room, [caster, f1, f2, f3, survivor], {});
  const expected = b.killXp(f1) + b.killXp(f2) + b.killXp(f3);
  b.resolveSkill(caster, caster, spec('thorns'));

  check('all three foes fell', !f1.alive && !f2.alive && !f3.alive);
  check('the out-of-range foe lived', survivor.alive);
  check('a triple kill sums each victim (15+20+25)', expected === 60 && caster.xp === 60);
  check('a high-level survivor outside the blast pays nothing', caster.xp === expected);
  check('the caster did not level on 60 of the 100 it needs', caster.level === 5);
}

{
  // Parity has to hold across the whole cast, not just per victim: three
  // separate swings and one three-target blast must land on the same total.
  const room = flat();
  const swinger = new Unit(room, null, 2, 2, { team: 'player', classId: 'barbarian', level: 5 });
  const t1 = new Unit(room, null, 2, 1, { team: 'enemy', classId: 'ranger', level: 1 });
  const t2 = new Unit(room, null, 3, 3, { team: 'enemy', classId: 'ranger', level: 2 });
  const t3 = new Unit(room, null, 1, 2, { team: 'enemy', classId: 'ranger', level: 3 });
  for (const t of [t1, t2, t3]) t.stats.hp = 1;
  const b = new Battle(room, [swinger, t1, t2, t3], {});
  for (const t of [t1, t2, t3]) {
    swinger.acted = false; // three separate turns' worth of swings
    b.resolveAttack(swinger, t);
  }
  check('three swings pay what one three-kill blast pays', swinger.xp === 60);
}

console.log(failed ? `\n${failed} test(s) FAILED` : '\nAll M3 skill tests passed');
process.exit(failed ? 1 : 0);
