// Encounter-generation tests — run with:  node tests/encounters.test.js
//
// encounterGen.js decides what a battle IS: which bodies, how many, how strong.
// Two things it got wrong went unnoticed for a long time because nothing here
// compared its outputs to its intentions:
//
//   1. COST BOUGHT NOTHING. A pool template was { look, name, classId, cost },
//      and dungeon.js built the Unit from classId + level alone — so every
//      template sharing a classId was literally the same monster. The cost-5
//      "elite" Frost Wraith was the JOINT-WEAKEST body in its pool and the
//      cost-2 Skeleton the strongest, i.e. cost and power ran backwards.
//      Per-template `d` deltas fixed that; this suite pins the fix by scoring
//      every template with the same combat maths the engine actually runs.
//
//   2. THE BUDGET CURVE INVERTED. Math.round made battle 3 harder per hero for
//      a squad of three than for a squad of two or four — recruiting made the
//      run worse. And the boss node subtracted a flat 6, which went NEGATIVE
//      for small squads and was silently absorbed downstream.
//
// So the assertions below are about contracts, not implementation details:
// threat rises with cost, elites are actually elite, no delta can ship a
// monster that is dead on spawn or immobile, pressure per hero never inverts,
// the minion budget is never negative, and the whole thing stays deterministic.
import {
  POOLS, ELITE_COST, COST_TARGETS, COST_TOLERANCE, BOSS_MINION_SHARE, BOSSES,
  templateThreat, templateStats, battleBudget, bodyCap, bossScale, squadPowerShare,
  generateEncounter,
} from '../js/encounterGen.js';
import { LOOK_KEYS } from '../js/dungeon.js';
import { Room } from '../js/room.js';
import { Unit } from '../js/units.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

const POOL_KEYS = Object.keys(POOLS);
const flat = (w, h) => new Room({
  id: 't', name: 't',
  heightmap: Array.from({ length: h }, () => '0'.repeat(w)),
  spawn: { x: 0, y: 0 },
});

// ---- cost buys power -------------------------------------------------------
console.log('cost buys power');
for (const key of POOL_KEYS) {
  const pool = POOLS[key];

  // Every template sits in the band its cost promises. This is the contract
  // that makes a budget point mean something.
  let banded = true;
  for (const t of pool) {
    const target = COST_TARGETS[t.cost];
    if (!target) { banded = false; break; }
    if (Math.abs(templateThreat(t) - target) / target > COST_TOLERANCE) banded = false;
  }
  check(`${key}: every template lands in its cost's threat band`, banded);

  // Ordering, not just banding: the cheapest body of a dearer tier must
  // out-threat the dearest body of a cheaper one, or a shopper is guessing.
  const byCost = new Map();
  for (const t of pool) {
    if (!byCost.has(t.cost)) byCost.set(t.cost, []);
    byCost.get(t.cost).push(templateThreat(t));
  }
  const costs = [...byCost.keys()].sort((a, b) => a - b);
  let rising = true;
  for (let i = 1; i < costs.length; i++) {
    if (Math.min(...byCost.get(costs[i])) <= Math.max(...byCost.get(costs[i - 1]))) rising = false;
  }
  check(`${key}: threat rises with cost across every tier`, rising);

  // ELITE_COST is a real threshold in the generator (elites may only join when
  // the leftover budget still buys two cheap bodies), so it had better be a
  // real threshold in the fiction too.
  const elites = pool.filter((t) => t.cost >= ELITE_COST).map(templateThreat);
  const rank = pool.filter((t) => t.cost < ELITE_COST).map(templateThreat);
  check(
    `${key}: every elite out-threatens every rank-and-file body`,
    elites.length > 0 && rank.length > 0 && Math.min(...elites) > Math.max(...rank)
  );
}

// ---- deltas produce a body you can actually fight --------------------------
console.log('\nevery template builds a fightable Unit');
{
  const room = flat(6, 6);
  let shippable = true;
  let named = true;
  let distinct = 0;
  const offenders = [];
  for (const key of POOL_KEYS) {
    for (const t of POOLS[key]) {
      const u = new Unit(room, null, 1, 1, {
        team: 'enemy', classId: t.classId, name: t.name, level: 1, bonuses: t.d,
      });
      // maxHp <= 0 spawns a corpse (`alive` is hp > 0); move 0 makes
      // computeMoveField return only the unit's own tile, i.e. a body that can
      // never take a step. Both are silent, both are shippable without a guard.
      const ok = u.stats.maxHp >= 8 && u.stats.hp > 0 && u.stats.move >= 1
        && u.stats.atk >= 1 && u.stats.range >= 1 && u.stats.min >= 1
        && u.stats.min <= u.stats.range;
      if (!ok) { shippable = false; offenders.push(`${key}/${t.name}`); }
      if (!LOOK_KEYS.includes(t.look)) named = false;
      if (t.d) distinct++;
    }
  }
  if (offenders.length) console.error(`        offenders: ${offenders.join(', ')}`);
  check('no template ships a unit that is dead on spawn or immobile', shippable);
  check('every template look resolves to a real dungeon.js LOOK', named);
  check('every template carries a stat delta (none left on bare class base)',
    distinct === POOL_KEYS.reduce((n, k) => n + POOLS[k].length, 0));
}

// Two templates of the same class must now be different creatures — the whole
// point of the delta pass. Before it, these five were one monster with five
// names.
{
  const room = flat(6, 6);
  const build = (t) => new Unit(room, null, 1, 1, {
    team: 'enemy', classId: t.classId, name: t.name, level: 1, bonuses: t.d,
  }).stats;
  const fighters = POOLS.dungeon.filter((t) => t.classId === 'fighter');
  const blocks = new Set(fighters.map((t) => {
    const s = build(t);
    return `${s.maxHp}/${s.atk}/${s.def}/${s.move}`;
  }));
  check(`dungeon's ${fighters.length} fighters are ${fighters.length} distinct stat blocks`,
    blocks.size === fighters.length);

  // The identity claims the pool comments make, asserted so a re-tune cannot
  // quietly delete them.
  const gnoll = build(POOLS.dungeon.find((t) => t.look === 'gnoll_sentinel'));
  const skeleton = build(POOLS.dungeon.find((t) => t.look === 'skeleton'));
  const undead = build(POOLS.dungeon.find((t) => t.look === 'restless_undead'));
  const siren = build(POOLS.ruin.find((t) => t.look === 'ruin_siren'));
  check('the Gnoll Sentinel is a wall (highest DEF in its pool)',
    gnoll.def === Math.max(...POOLS.dungeon.map((t) => templateStats(t).def)));
  check('the Skeleton is glass (fewer HP than the class base)', skeleton.maxHp < 34);
  check('the Restless Undead is slow enough to kite (move < class base)', undead.move < 4);
  check('the Siren out-ranges every bow in the game (range 4)', siren.range === 4);
}

// ---- budget curve ----------------------------------------------------------
console.log('\nbattleBudget');
{
  const BATTLES = [1, 2, 3, 4];
  const SIZES = [1, 2, 3, 4];

  let risesWithBattle = true;
  let risesWithSize = true;
  for (const size of SIZES) {
    for (let b = 2; b <= 4; b++) {
      if (battleBudget(b, size) < battleBudget(b - 1, size)) risesWithBattle = false;
    }
  }
  for (const b of BATTLES) {
    for (let s = 2; s <= 4; s++) {
      if (battleBudget(b, s) < battleBudget(b, s - 1)) risesWithSize = false;
    }
  }
  check('budget never falls as the battle number rises', risesWithBattle);
  check('budget never falls as the squad grows', risesWithSize);

  // The real contract is pressure per unit of squad POWER, not per head:
  // squadPowerShare says what fraction of a full squad's fighting strength a
  // party of N fields, and the budget is meant to track it. Dividing the two
  // must give roughly the same number at every size, or one roster length is a
  // trap — which is exactly what the old curve produced twice over (Math.round
  // made size 3 harder per hero than sizes 2 and 4 at battle 3; linear scaling
  // then made solo runs clear at 95.8% against a full squad's 64.5%).
  //
  // The tolerance is wide because the budgets are small integers: a size-1
  // battle-1 budget is 3 points, so one unit of Math.floor is a third of it.
  // Tightening it needs finer-grained costs (every cost and budget doubled),
  // which is out of scope; the band keeps the granularity explicit.
  const TOL = 0.2;
  let banded = true;
  let worstSpread = 0;
  for (const b of BATTLES) {
    const perPower = SIZES.map((s) => battleBudget(b, s) / squadPowerShare(s));
    const spread = (Math.max(...perPower) - Math.min(...perPower)) / Math.min(...perPower);
    worstSpread = Math.max(worstSpread, spread);
    if (spread > TOL) banded = false;
  }
  check(`pressure per unit of squad power is within ${TOL * 100}% across sizes ` +
    `(worst ${(worstSpread * 100).toFixed(1)}%)`, banded);

  // The size-1 cliff: the old flat floor of 4 pinned a soloist to the same
  // budget at every battle number, so his battle 4 was no harder than his
  // battle 1. The weight curve has to actually bite at both ends — a lone hero
  // carries more than a quarter of a battle (he is more than a quarter of the
  // squad) but never as much as half.
  check('a solo hero carries between a quarter and half of a full battle',
    BATTLES.every((b) => {
      const share = battleBudget(b, 1) / battleBudget(b, 4);
      return share > 0.25 && share < 0.5;
    }));

  // Small squads must still get a fight, not an empty room.
  const cheapest = Math.min(...POOL_KEYS.flatMap((k) => POOLS[k].map((t) => t.cost)));
  check('every (battle, size) budget still affords at least one cheap body',
    BATTLES.every((b) => SIZES.every((s) => battleBudget(b, s) >= cheapest)));
  check('bodyCap never lets the foes outnumber the squad by more than one',
    SIZES.every((s) => bodyCap(s, false) <= Math.max(2, s + 1)));
}

// ---- the boss node ---------------------------------------------------------
console.log('\nboss node');
{
  let negative = false;
  let starved = false;
  for (let b = 1; b <= 4; b++) {
    for (let s = 1; s <= 4; s++) {
      const share = Math.floor(battleBudget(b, s) * BOSS_MINION_SHARE);
      if (share < 0) negative = true;
      if (share > battleBudget(b, s)) starved = true;
    }
  }
  check('the minion budget is never negative at any (battle, size)', !negative);
  check('the minion budget never exceeds the whole node budget', !starved);

  const scales = [1, 2, 3, 4].map(bossScale);
  check('bossScale is a no-op for a full squad',
    scales[3].maxHp === 0 && scales[3].atk === 0 && scales[3].def === 0);
  check('bossScale weakens the boss monotonically as the squad shrinks',
    scales.every((s, i) => i === 0 || (s.maxHp > scales[i - 1].maxHp
      && s.atk >= scales[i - 1].atk && s.def >= scales[i - 1].def)));
  // A boss a shrunken squad cannot kill is not a boss, it is a wall. Play the
  // duel out in arithmetic: the level-4 Fighter boss (46 HP / ATK 14 / DEF 8)
  // against the level-2 Fighter who realistically reaches him (38 HP / ATK 12 /
  // DEF 7). Unscaled that is 12 swings to kill him against 6 to kill you — 0%
  // is the correct output of those numbers, and it is what the sim measured.
  const duel = (size) => {
    const s = bossScale(size);
    const boss = { hp: 46 + s.maxHp, atk: 14 + s.atk, def: 8 + s.def };
    return {
      heroSwings: Math.ceil(boss.hp / Math.max(1, 12 - boss.def)),
      bossSwings: Math.ceil(38 / Math.max(1, boss.atk - 7)),
    };
  };
  const solo = duel(1);
  const full = duel(4);
  check('a solo hero wins a clean duel with the scaled boss',
    solo.heroSwings < solo.bossSwings);
  check('a full squad still meets the unscaled wall of a boss',
    full.heroSwings > full.bossSwings);
  check('the duel gets harder with every hero the squad still has',
    [1, 2, 3, 4].every((s, i, a) => i === 0
      || duel(s).heroSwings >= duel(a[i - 1]).heroSwings));

  const room = flat(14, 14);
  const plan = generateEncounter({
    room, roomKey: 'throne', battleNumber: 4, seed: 7,
    spawns: [{ x: 6, y: 11 }, { x: 8, y: 11 }], squadSize: 1,
  });
  const bossEntry = plan.find((p) => p.tag === 'boss');
  check('the boss keeps his authored level and tile', Boolean(bossEntry)
    && bossEntry.level === BOSSES.throne.level
    && bossEntry.x === BOSSES.throne.x && bossEntry.y === BOSSES.throne.y);
  check('the boss carries the squad-scaled bonuses',
    bossEntry.bonuses && bossEntry.bonuses.maxHp === bossScale(1).maxHp);
}

// ---- plan shape + determinism ----------------------------------------------
console.log('\ngenerated plans');
{
  const room = flat(14, 14);
  const spawns = [{ x: 5, y: 10 }, { x: 7, y: 10 }];
  const call = (over = {}) => generateEncounter({
    room, roomKey: 'antechamber', battleNumber: 1, seed: 42, spawns, squadSize: 4, ...over,
  });

  const plan = call();
  check('a plan is produced', plan.length > 0);
  check('every entry carries the fields dungeon.js consumes',
    plan.every((p) => p.look && p.name && p.classId && p.level >= 1
      && Number.isInteger(p.x) && Number.isInteger(p.y)
      && Object.prototype.hasOwnProperty.call(p, 'bonuses')));
  check('rolled entries carry their template deltas',
    plan.every((p) => p.bonuses && typeof p.bonuses === 'object'));
  check('no two enemies share a tile',
    new Set(plan.map((p) => `${p.x},${p.y}`)).size === plan.length);

  // Determinism is what lets a resumed save rebuild the same battle. It has to
  // survive the delta pass, which now hands the SAME object out repeatedly.
  check('the same inputs yield an identical plan',
    JSON.stringify(call()) === JSON.stringify(plan));
  check('a different seed yields a different plan',
    JSON.stringify(call({ seed: 43 })) !== JSON.stringify(plan));

  // The `bonuses` object is shared with the pool template. Nothing downstream
  // may mutate it, or one over-levelled Skeleton would rewrite the species.
  const before = JSON.stringify(POOLS.dungeon);
  call({ seed: 99, squadSize: 2 });
  check('generating a plan never mutates the pool it drew from',
    JSON.stringify(POOLS.dungeon) === before);
}

console.log(failed ? `\n${failed} encounter test(s) FAILED` : '\nAll encounter tests passed');
process.exit(failed ? 1 : 0);
