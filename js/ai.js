import { tileDistance } from './classes.js';

// Enemy AI. Baseline: pick the best player to hit, move into range along a
// reachable path, attack if possible. On top of that it plays to the battle's
// OBJECTIVE (the mirror of the player's win condition) so foes feel purposeful:
//   reach  -> focus the unit racing for the goal (intercept the leader)
//   escort -> hunt the ward being walked to safety
//   defend -> rush the defended tile; breaching it wins outright
// Objective awareness is a thin bias layer over the same three-tier plan, so a
// plain 'eliminate'/'survive'/'slay' battle behaves exactly as before.
// Returns a plan { path, target } for the battle to execute.
export function runEnemyTurn(battle, unit) {
  const foes = battle.livingPlayers();
  if (!foes.length) return { path: null, target: null };
  const bias = objectiveBias(battle);

  // 0. Objective play: if breaching a defended tile ends the battle in our
  //    favour and we can reach it this turn, go stand on it.
  if (bias.rush && bias.goalTile) {
    const g = bias.goalTile;
    const { reach } = battle.computeMoveField(unit);
    if (reach.has(`${g.x},${g.y}`) && !battle.unitAt(g.x, g.y)) {
      return { path: battle.pathTo(unit, g.x, g.y), target: null };
    }
  }

  // 1. Already in range from where we stand? Hit the objective target if we
  //    can, else the weakest reachable foe.
  const hitNow = battle.attackTargets(unit);
  if (hitNow.length) {
    const pref = bias.preferTarget && hitNow.includes(bias.preferTarget) ? bias.preferTarget : null;
    return { path: null, target: pref || pickTarget(hitNow) };
  }

  // 2. Find a reachable tile we CAN attack from. Prefer one that lets us hit
  //    the objective target; otherwise the fewest steps to the softest target.
  //    Live traps make a stop deeply unattractive (but never impossible).
  const { reach } = battle.computeMoveField(unit);
  let best = null;
  for (const [k, dist] of reach) {
    const [x, y] = k.split(',').map(Number);
    if (battle.unitAt(x, y) && !(x === unit.x && y === unit.y)) continue; // must be a free stop
    const targets = battle.attackTargets(unit, x, y);
    if (!targets.length) continue;
    const canHitPref = bias.preferTarget && targets.includes(bias.preferTarget);
    const target = canHitPref ? bias.preferTarget : pickTarget(targets);
    const score =
      dist * 100 + target.stats.hp - (canHitPref ? 100000 : 0) + hazardPenalty(battle, x, y);
    if (!best || score < best.score) best = { x, y, dist, target, score };
  }
  if (best) {
    return { path: battle.pathTo(unit, best.x, best.y), target: best.target };
  }

  // 3. Can't reach anyone — advance toward the objective anchor: a goal tile to
  //    hold (defend), the objective target's tile (reach/escort), or the
  //    nearest foe (default).
  const anchor =
    bias.goalTile ||
    (bias.preferTarget ? { x: bias.preferTarget.x, y: bias.preferTarget.y } : null) ||
    nearestFoeTile(unit, foes);
  let approach = null;
  for (const [k, dist] of reach) {
    const [x, y] = k.split(',').map(Number);
    if (x === unit.x && y === unit.y) continue;
    if (battle.unitAt(x, y)) continue;
    const d = tileDistance(x, y, anchor.x, anchor.y);
    const score = d * 100 - dist + hazardPenalty(battle, x, y); // closest to the anchor, break ties by moving more
    if (!approach || score < approach.score) approach = { x, y, score };
  }
  if (approach) return { path: battle.pathTo(unit, approach.x, approach.y), target: null };
  return { path: null, target: null };
}

// The enemy's read on the player's objective: who to focus, which tile to seize.
function objectiveBias(battle) {
  const o = battle.objective;
  switch (o.type) {
    case 'escort': {
      const vip = battle.unitByTag(o.tag);
      return { preferTarget: vip && vip.alive ? vip : null };
    }
    case 'reach': {
      const reacher = battle.reachers(o).find((u) => u.alive);
      return { preferTarget: reacher || null };
    }
    case 'defend':
      return { goalTile: o.tile || null, rush: !!o.tile };
    default:
      return {};
  }
}

// Stopping on a live trap costs like an extra 50 tiles of approach — enemies
// only do it when there is genuinely nothing better.
function hazardPenalty(battle, x, y) {
  const fx = battle.room.effectAt && battle.room.effectAt(x, y);
  return fx && fx.kind === 'hazard' && !fx.spent ? 5000 : 0;
}

// Prefer a target we can kill; otherwise the lowest-HP one.
function pickTarget(list) {
  return list.slice().sort((a, b) => a.stats.hp - b.stats.hp)[0];
}

function nearestFoeTile(unit, foes) {
  const n = foes.reduce((a, b) =>
    tileDistance(unit.x, unit.y, a.x, a.y) <= tileDistance(unit.x, unit.y, b.x, b.y) ? a : b
  );
  return { x: n.x, y: n.y };
}
