// Headless balance harness — run with:  node tests/balanceSim.js [options]
//
// NOT a pass/fail test suite. It is a MEASURING instrument: it plays the real
// Battle engine thousands of times and reports what actually happens, so
// balance changes can be argued from numbers instead of vibes. It asserts
// nothing and always exits 0 (except on a harness error) — `npm test` should
// not go red because the game got harder.
//
// What it drives, all of it the real thing:
//   js/encounterGen.js  generates the encounter (budget, body cap, levels)
//   js/dungeon.js       supplies the real rooms (geometry, props, hazards)
//   js/battle.js        resolves every move, attack, trap and phase
//   js/ai.js            plays BOTH sides (see "the player AI" below)
//   js/run.js           carries HP/XP/level between battles, and camp Rest
//
// Options:
//   --seeds=N      runs per squad size            (default 60)
//   --sizes=1,2,3  squad sizes to sweep           (default 1,2,3,4)
//   --dungeon=id   which dungeon's rooms/pools    (default 'dungeon')
//   --squad=a,b    class ids, sliced to each size (default fighter,cleric,ranger,mage)
//   --maxTurns=N   stalemate cut-off              (default 40)
//   --csv          emit CSV instead of the table
//   --verbose      per-battle detail lines
//
// ---------------------------------------------------------------------------
// READ THIS BEFORE TRUSTING A NUMBER
//
// 1. THE AI NEVER CASTS A SKILL. js/ai.js only walks and autoattacks — it has
//    no notion of `resolveSkill`. So the simulated Cleric never heals, the Bard
//    never inspires, and the leader never fires an Origins tree skill. Every
//    win rate below is therefore a FLOOR: it measures autoattack-only play, and
//    a competent human (who heals) does strictly better. It also means MP,
//    which the engine now spends and regenerates, is inert here — this harness
//    cannot measure MP balance at all.
//
// 2. BOTH SIDES PLAY THE SAME BRAIN. There is no separate "player AI": the
//    player team is planned by the very same runEnemyTurn, through a mirror
//    view that swaps which team it calls "foes" (see mirrorFor). That keeps the
//    measurement about the NUMBERS rather than about which side got the
//    cleverer code — but it also means the squad plays like a pack of monsters:
//    it charges the nearest soft target and never retreats, holds a chokepoint,
//    or focuses fire deliberately.
//
// 3. EVERY BATTLE IS FORCED TO 'eliminate'. The authored objectives (survive 3,
//    reach the gate, slay the boss) are win conditions the AI does not
//    understand as a PLAYER — an AI that cannot grasp "walk to the gate" would
//    score a fake 0% on battle 3 and tell us nothing about the combat maths.
//    Forcing eliminate measures the fight itself. Battle 4 therefore still
//    contains the authored boss (he is part of the encounter) but must be
//    killed along with everything else.
//
// 4. WIN RATES ARE CONDITIONAL. "reached" counts runs that actually got to that
//    battle; a run wiped at battle 2 never attempts battle 3. Late battles are
//    thus scored only by the squads strong (or lucky) enough to arrive, which
//    flatters them. Read `reach%` alongside `win%`, and treat `run%` (the whole
//    4-battle clear) as the honest end-to-end number.
//
// 5. NO LOOT IS EVER EQUIPPED. A real run opens 1-2 chests per battle and the
//    player equips what drops, so by battle 4 a real squad carries several
//    items of atk/def/maxHp. This harness banks reward gold (Rest needs it) but
//    never rolls or equips an item, because choosing what to equip is a POLICY
//    and inventing one here would be inventing balance. Another reason to read
//    these rates as a floor.
//
// 6. THE AI CANNOT PATH AROUND CONCAVE TERRAIN, which shows up as stalemates.
//    Tier 3 of runEnemyTurn ("nobody is reachable, advance on the anchor")
//    scores candidate tiles by straight-line Chebyshev distance to the anchor,
//    not by path distance, so it walks into the nearest dead end and stays
//    there. On the Sundered Nave the squad and the foes end up either side of a
//    void gap, both parties at FULL HP, each sitting on its own side of the
//    hole until the turn cut-off, because the only route is a long way around
//    that greedy scoring never picks. In the real game that map is `survive 3`,
//    so nobody has to cross and the flaw is invisible; forcing it to eliminate
//    (caveat 3) is what exposes it. Read the `stale` column as "this map has no
//    fight to measure", not as a draw.
import { Battle } from '../js/battle.js';
import { runEnemyTurn } from '../js/ai.js';
import { buildDungeon, DUNGEON_ID } from '../js/dungeon.js';
import { Run, makeMember, memberStats } from '../js/run.js';

// run.js -> items.js reach for localStorage on import in some paths; the
// harness never persists anything, so a black hole is the right stub.
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

// ---- options ---------------------------------------------------------------

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const SEEDS = Math.max(1, Number(opt('seeds', 60)) || 60);
const SIZES = String(opt('sizes', '1,2,3,4')).split(',').map(Number).filter((n) => n >= 1 && n <= 4);
const DUNGEON = opt('dungeon', DUNGEON_ID);
const SQUAD = String(opt('squad', 'fighter,cleric,ranger,mage')).split(',');
const MAX_TURNS = Math.max(5, Number(opt('maxTurns', 40)) || 40);
const CSV = flag('csv');
const VERBOSE = flag('verbose');

// ---- headless clock --------------------------------------------------------

// The engine animates: units walk a tile per WALK_MS and the enemy phase paces
// itself with `until` timestamps. Nothing here needs to be watched, so the
// harness runs a VIRTUAL clock and jumps it in big strides — Avatar.update
// consumes every completed step in one call, so a long jump lands a whole path
// at once. No real time passes and no frames are drawn.
const CLOCK_STEP = 5000;

function pump(battle, now) {
  for (const u of battle.units) u.update(now);
  battle.update(now);
}

// ---- the player AI ---------------------------------------------------------

// js/ai.js is written from the enemy's chair: it asks the battle for
// `livingPlayers()` and treats them as the enemy. Rather than fork it (a
// second brain would make the sim measure MY code instead of the game's), the
// player team plans against a MIRROR of the battle:
//
//   livingPlayers() -> the living ENEMIES, so "foes" means the other side
//   objective       -> plain eliminate, so the bias layer stays out of it
//
// Everything else (computeMoveField, attackTargets, pathTo, unitAt) is already
// team-agnostic: each filters by `unit.team`, so handing it a player unit makes
// it reason for the players with no change at all. The mirror inherits through
// the prototype, so it shares one battle's real state and mutates nothing.
function mirrorFor(battle) {
  const m = Object.create(battle);
  m.livingPlayers = () => battle.livingEnemies();
  m.objective = { type: 'eliminate' };
  return m;
}

// Execute one unit's plan with the same ordering the game uses: walk, settle
// (tile effects fire, and a trap may kill it mid-plan), then swing. Mirrors
// battleController.update for players and Battle.tickEnemyPhase for enemies.
function actOut(battle, unit, plan, clock) {
  if (plan.path && plan.path.length) {
    unit.followPath(plan.path);
    let guard = 0;
    while (unit.walking && guard++ < 200) pump(battle, clock.now += CLOCK_STEP);
  }
  unit.moved = true;
  battle.unitSettled(unit);
  if (!unit.alive) return; // stepped onto something lethal
  if (battle.phase !== 'player' && battle.phase !== 'enemy') return;

  const tgt = plan.target;
  if (tgt && tgt.alive && battle.attackTargets(unit).includes(tgt)) {
    battle.resolveAttack(unit, tgt);
  } else {
    // the walk may have opened a shot the plan did not know about
    const opportunist = battle.attackTargets(unit)[0];
    if (opportunist) battle.resolveAttack(unit, opportunist);
    else unit.acted = true;
  }
  battle.checkEnd();
}

// ---- one battle ------------------------------------------------------------

// Returns 'won' | 'lost' | 'stalemate'. The engine owns the verdict; the
// harness only decides when to stop asking.
function playBattle(battle, clock) {
  let guard = 0;
  while (battle.phase === 'player' || battle.phase === 'enemy') {
    if (battle.turn > MAX_TURNS) return 'stalemate';
    if (guard++ > MAX_TURNS * 40) return 'stalemate';

    if (battle.phase === 'player') {
      const mirror = mirrorFor(battle);
      // the list is snapshotted, so re-check alive: a trap sprung by an
      // earlier unit's move can fell a later one before its turn comes up
      for (const u of battle.livingPlayers()) {
        if (!u.alive || u.done || battle.phase !== 'player') continue;
        actOut(battle, u, runEnemyTurn(mirror, u), clock);
      }
      if (battle.phase === 'player') battle.endPlayerPhase();
    } else {
      // the enemy phase drives itself off the clock (queue -> move -> attack)
      pump(battle, clock.now += CLOCK_STEP);
    }
  }
  return battle.phase === 'won' ? 'won' : 'lost';
}

// ---- one full run ----------------------------------------------------------

function playRun(dungeon, battleNodes, size, seed, stats) {
  const squad = SQUAD.slice(0, size).map((classId, i) =>
    makeMember(classId, `${classId}-${i}`, { id: `m${i}`, leader: i === 0 })
  );
  const run = new Run({ squad, dungeon, seed });
  const clock = { now: 0 };

  for (let bi = 0; bi < battleNodes.length; bi++) {
    const { node, index } = battleNodes[bi];
    const battleNo = bi + 1;
    run.nodeIndex = index; // battleNumber()/restCost() read this
    const row = stats[size][battleNo];
    row.reached++;

    const room = node.makeRoom({ seed: run.seed });
    const players = run.instantiateSquad(room, node.spawns);
    // The node's own factory, called exactly as runController.js calls it.
    // Going through generateEncounter directly instead looks equivalent and is
    // not: the node closes over its roomKey and objective tile and does not
    // expose them, so a hand-rolled call silently drew from the wrong monster
    // pool, hashed a different seed, and skipped the authored BOSS entirely.
    const enemies = node.makeEnemies(room, {
      seed: run.seed,
      battleNumber: run.battleNumber(),
      squadSize: run.livingSquad().length, // fights scale to who is left
    });

    const battle = new Battle(room, [...players, ...enemies], {
      objective: { type: 'eliminate' }, // see caveat 3
      onPickup: (spec) => {
        if (spec.gold) run.addGold(spec.gold);
      },
    });

    const result = playBattle(battle, clock);
    run.writeBack(players); // the real carry-forward: hp, xp, level, mp refill

    const maxHp = squad.reduce((s, m) => s + memberStats(m).maxHp, 0);
    const curHp = squad.reduce((s, m) => s + Math.max(0, m.hp), 0);
    row.turns += battle.turn;
    row.hpPct += maxHp ? (curHp / maxHp) * 100 : 0;
    row.level += squad[0].level;
    row.alive += run.livingSquad().length;
    row.enemies += enemies.length;

    if (VERBOSE) {
      console.log(
        `  size ${size} seed ${seed} b${battleNo} ${result} ` +
          `turn ${battle.turn} hp ${curHp}/${maxHp} foes ${enemies.length}`
      );
    }

    if (result !== 'won') {
      row[result === 'lost' ? 'lost' : 'stale']++;
      return;
    }
    row.won++;
    if (run.isWiped()) return; // won the field but nobody walked away

    // camp: reward gold, then ONE Rest (run.rest enforces once-per-camp,
    // the gold price, and the 40%-of-max heal).
    if (node.reward && node.reward.gold) run.addGold(node.reward.gold);
    run.rested = false;
    if (run.rest()) stats[size][battleNo].rests++;
  }
  stats[size].cleared++;
}

// ---- reporting -------------------------------------------------------------

const blank = () => ({
  reached: 0, won: 0, lost: 0, stale: 0, rests: 0,
  turns: 0, hpPct: 0, level: 0, alive: 0, enemies: 0,
});

function main() {
  const dungeon = buildDungeon(DUNGEON, {});
  if (!dungeon) {
    console.error(`unknown dungeon '${DUNGEON}'`);
    process.exit(1);
  }
  const battleNodes = dungeon.nodes
    .map((node, index) => ({ node, index }))
    .filter((n) => n.node.type === 'battle');

  const stats = {};
  for (const size of SIZES) {
    stats[size] = { cleared: 0 };
    for (let b = 1; b <= battleNodes.length; b++) stats[size][b] = blank();
  }

  const started = Date.now();
  for (const size of SIZES) {
    for (let s = 0; s < SEEDS; s++) {
      // a distinct, reproducible stream per (size, seed)
      playRun(dungeon, battleNodes, size, (s * 2654435761 + size * 40503) >>> 0, stats);
    }
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  const rows = [];
  for (const size of SIZES) {
    for (let b = 1; b <= battleNodes.length; b++) {
      const r = stats[size][b];
      if (!r.reached) continue;
      const n = r.reached;
      rows.push({
        size,
        battle: b,
        reachPct: (n / SEEDS) * 100,
        reached: n,
        winPct: (r.won / n) * 100,
        stale: r.stale,
        // of the battles won here, how many could afford the camp Rest after.
        // Rest costs gold, so a poor squad simply does not get the heal - and
        // the hp% of the NEXT battle is unreadable without knowing that.
        restPct: r.won ? (r.rests / r.won) * 100 : 0,
        hpPct: r.hpPct / n,
        level: r.level / n,
        alive: r.alive / n,
        foes: r.enemies / n,
        turns: r.turns / n,
      });
    }
  }

  if (CSV) {
    console.log('squad,battle,reached,reach_pct,win_pct,stalemates,rest_pct,avg_hp_pct,avg_leader_level,avg_alive,avg_foes,avg_turns');
    for (const r of rows) {
      console.log(
        [r.size, r.battle, r.reached, r.reachPct, r.winPct, r.stale, r.restPct, r.hpPct, r.level, r.alive, r.foes, r.turns]
          .map((v) => (typeof v === 'number' ? v.toFixed(2).replace(/\.00$/, '') : v))
          .join(',')
      );
    }
    return;
  }

  const f = (n, d = 1) => n.toFixed(d).padStart(6);
  console.log(`\nBALANCE BASELINE  ${dungeon.name || DUNGEON}`);
  console.log(
    `${SEEDS} runs per squad size, squad = [${SQUAD.slice(0, Math.max(...SIZES)).join(', ')}] ` +
      `sliced to size, ${secs}s`
  );
  console.log('every battle forced to eliminate; AI never casts (see header)\n');

  console.log('squad  battle   reach%  win%   stale   hp%  rest%   lvl  alive   foes  turns');
  console.log('-----  ------  -------  -----  -----  -----  -----  ----  -----  -----  -----');
  let lastSize = null;
  for (const r of rows) {
    if (lastSize !== null && r.size !== lastSize) console.log('');
    lastSize = r.size;
    console.log(
      `${String(r.size).padStart(5)}  ${String(r.battle).padStart(6)}  ` +
        `${f(r.reachPct)}  ${f(r.winPct, 1).trim().padStart(5)}  ` +
        `${String(r.stale).padStart(5)}  ${f(r.hpPct, 1).trim().padStart(5)}  ` +
        `${f(r.restPct, 0).trim().padStart(5)}  ` +
        `${f(r.level, 1).trim().padStart(4)}  ${f(r.alive, 1).trim().padStart(5)}  ` +
        `${f(r.foes, 1).trim().padStart(5)}  ${f(r.turns, 1).trim().padStart(5)}`
    );
  }

  console.log('\nfull-run clear rate (all 4 battles, one squad, no restarts)');
  console.log('squad   runs  cleared   rate');
  console.log('-----  -----  -------  -----');
  for (const size of SIZES) {
    const c = stats[size].cleared;
    console.log(
      `${String(size).padStart(5)}  ${String(SEEDS).padStart(5)}  ` +
        `${String(c).padStart(7)}  ${((c / SEEDS) * 100).toFixed(1).padStart(5)}`
    );
  }

  console.log('\nreach% = share of runs that got this far   win% = of those, share that won');
  console.log('hp%    = squad HP left after the fight, before Rest');
  console.log('rest%  = of wins here, share that could afford the camp Rest after');
  console.log('lvl    = leader level after the fight       alive = members still standing');
  console.log('stale  = battles hit the ' + MAX_TURNS + '-turn cut-off (counted as not won)');
}

main();
