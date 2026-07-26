// Tonic-vs-Inspire regression tests — run with:  node tests/buffInspire.test.js
// The `buff` consumable kind (js/consumableEffects.js) deliberately does NOT
// live in `buffAtk`, because that field is Inspire's and is read two ways:
//   js/battle.js skillTargets  — `t.buffAtk > 0` means "already inspired,
//                                 pick someone else"
//   js/battle.js resolveAttack — `buffAtk = 0`, spent on the very first swing
// So a tonic parked there would lock the Bard out of the drinker AND evaporate
// on the next attack. These tests pin both behaviours with a buffed unit.
import { CLASSES, computeDamage } from '../js/classes.js';
import { Room } from '../js/room.js';
import { Unit } from '../js/units.js';
import { Battle } from '../js/battle.js';
import { resolveEffect, battleTargets } from '../js/consumableEffects.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

function mkRoom() {
  return new Room({
    id: 'test', name: 'Test Room',
    heightmap: ['00000', '00000', '00000', '00000', '00000'],
    spawn: { x: 2, y: 2 },
  });
}
const mkUnit = (room, classId, x, y, team, opts = {}) =>
  new Unit(room, null, x, y, { classId, team, ...opts });
const fakeRun = () => ({ squad: [], inventory: [], save() {} });

// ---- Inspire still targets a tonic-buffed ally -----------------------------
console.log('Inspire eligibility');
{
  const room = mkRoom();
  const bard = mkUnit(room, 'bard', 2, 2, 'player');
  const hero = mkUnit(room, 'fighter', 3, 2, 'player', { useSprites: true }); // the leader drinks
  const foe = mkUnit(room, 'rogue', 4, 4, 'enemy');
  const battle = new Battle(room, [bard, hero, foe]);

  resolveEffect({ kind: 'buff', stat: 'atk', n: 3 }, battleTargets(fakeRun(), battle));
  check('the tonic landed on the hero, not on buffAtk',
    hero.stats.atk === CLASSES.fighter.atk + 3 && hero.buffAtk === 0);
  check('a tonic-buffed ally is STILL a legal Inspire target',
    battle.skillTargets(bard).includes(hero));

  battle.resolveSkill(bard, hero);
  check('Inspire applies on top of the tonic', hero.buffAtk === CLASSES.bard.skill.power);
  check('and an already-inspired ally drops out of the target list (unchanged)',
    !battle.skillTargets(bard).includes(hero));
}

// ---- the swing spends Inspire but keeps the tonic --------------------------
console.log('Inspire spend');
{
  const room = mkRoom();
  const hero = mkUnit(room, 'fighter', 2, 2, 'player');
  const foe = mkUnit(room, 'rogue', 3, 2, 'enemy');
  const battle = new Battle(room, [hero, foe]);

  resolveEffect({ kind: 'buff', stat: 'atk', n: 3 }, battleTargets(fakeRun(), battle));
  hero.buffAtk = 5;
  const expected = computeDamage(hero, foe); // reads stats.atk + buffAtk
  const { dmg } = battle.resolveAttack(hero, foe);
  check('the swing counts tonic AND Inspire together', dmg === expected);
  check('Inspire is spent on that swing (unchanged)', hero.buffAtk === 0);
  check('the tonic survives the swing', hero.stats.atk === CLASSES.fighter.atk + 3);

  const after = computeDamage(hero, foe);
  check('the next swing is tonic-only, still above base',
    after < dmg && after > computeDamage(mkUnit(room, 'fighter', 2, 2, 'player'), foe));
}

console.log(failed ? `\n${failed} test(s) failed` : '\nall buff/Inspire tests passed');
process.exit(failed ? 1 : 0);
