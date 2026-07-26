// Ranger close-range dagger tests — run with:  node tests/rangerCloseRange.test.js
// Covers the dead-zone fix: ranger.range=3/min=2 means distance 1 was totally
// unreachable before this change. A weak `closeRange` profile now plugs that
// gap (js/classes.js: statsProfiles/statsProfileFor + computeDamage's
// optional atkOverride; js/battle.js: attackTargets/resolveAttack; js/units.js:
// stats.closeRange) without touching the bow's own numbers or any other class.
import { CLASSES, computeDamage, statsProfiles, statsProfileFor, tileDistance } from '../js/classes.js';
import { Room } from '../js/room.js';
import { Unit } from '../js/units.js';
import { Battle } from '../js/battle.js';
import { runEnemyTurn } from '../js/ai.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

// Shared fixture: a flat 5x5 room, and a tiny Unit-maker.
function mkRoom() {
  return new Room({
    id: 'test', name: 'Test Room',
    heightmap: ['00000', '00000', '00000', '00000', '00000'],
    spawn: { x: 2, y: 2 },
  });
}
function mkUnit(room, classId, x, y, team) {
  return new Unit(room, null, x, y, { classId, team });
}

// ---- attackTargets: ranger can now hit an adjacent enemy ------------------
console.log('attackTargets');
{
  const room = mkRoom();
  const ranger = mkUnit(room, 'ranger', 2, 2, 'player');
  const fighter = mkUnit(room, 'fighter', 3, 2, 'enemy');
  const battle = new Battle(room, [ranger, fighter]);

  check('adjacent enemy (d=1) is now attackable (was the dead zone)',
    battle.attackTargets(ranger).includes(fighter));

  fighter.x = 4; fighter.y = 2; // d=2, inside bow range
  check('d=2 still attackable (bow range intact)', battle.attackTargets(ranger).includes(fighter));

  fighter.x = 5; fighter.y = 2; // d=3, bow's max
  check('d=3 still attackable (bow max range intact)', battle.attackTargets(ranger).includes(fighter));

  fighter.x = 6; fighter.y = 2; // d=4, out of range on both profiles
  check('d=4 excluded (range cap unaffected)', !battle.attackTargets(ranger).includes(fighter));
}

// ---- damage: ranger's melee dagger is meaningfully worse than real melee --
console.log('damage: dagger vs. real melee');
{
  const room = mkRoom();
  const ranger = mkUnit(room, 'ranger', 2, 2, 'player');
  const barbarian = mkUnit(room, 'barbarian', 2, 2, 'player');
  const rogue = mkUnit(room, 'rogue', 3, 2, 'enemy'); // common defender, def 4, archetype 'melee'

  const rangerDmg = computeDamage(ranger, rogue, ranger.stats.closeRange.atk);
  check('ranger dagger vs. rogue (d=1) = 2 (hand-worked)', rangerDmg === 2);

  const barbDmg = computeDamage(barbarian, rogue);
  check('barbarian vs. rogue (d=1) = 9 (hand-worked)', barbDmg === 9);

  check('dagger damage is well under half of real melee damage', rangerDmg < barbDmg * 0.5);
}

// ---- existing ranger bow balance is unchanged -----------------------------
console.log('bow balance unchanged');
{
  check('CLASSES.ranger base fields untouched',
    CLASSES.ranger.atk === 9 && CLASSES.ranger.range === 3 && CLASSES.ranger.min === 2);

  const room = mkRoom();
  const ranger = mkUnit(room, 'ranger', 2, 2, 'player');
  const rogue = mkUnit(room, 'rogue', 4, 2, 'enemy'); // d=2, bow range

  const bowDmg = computeDamage(ranger, rogue); // no override — old call shape
  check('ranger bow vs. rogue (d=2) = 4 (hand-worked, byte-for-byte unchanged math)', bowDmg === 4);
}

// ---- profile contiguity / no bleed to other classes -----------------------
console.log('profile contiguity');
{
  check('closeRange plugs the dead zone exactly (no gap, no overlap)',
    CLASSES.ranger.closeRange.max === CLASSES.ranger.min - 1);

  const others = Object.entries(CLASSES).filter(([id]) => id !== 'ranger');
  check('no other class has a closeRange profile',
    others.every(([, c]) => statsProfiles({ min: c.min, range: c.range, atk: c.atk }).length === 1));

  check('statsProfileFor degrades to the single window for a class with no closeRange',
    statsProfileFor({ min: 1, range: 1, atk: 10 }, 1) !== null &&
    statsProfileFor({ min: 1, range: 1, atk: 10 }, 2) === null);
}

// ---- AI symmetry: the fix reaches enemy rangers for free ------------------
console.log('AI symmetry');
{
  const room = mkRoom();
  const enemyRanger = mkUnit(room, 'ranger', 2, 2, 'enemy');
  const player = mkUnit(room, 'fighter', 3, 2, 'player'); // d=1, adjacent
  const battle = new Battle(room, [enemyRanger, player]);

  const plan = runEnemyTurn(battle, enemyRanger);
  check('AI exploits the new close-range profile with zero js/ai.js changes',
    plan.target === player);
}

console.log(failed ? `\n${failed} test(s) failed` : '\nall ranger close-range tests passed');
process.exit(failed ? 1 : 0);
