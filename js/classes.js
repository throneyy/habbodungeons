// The 8 Habbo Dungeons classes, carried over from v1. Stats are level-1 base
// values, tuned for readable tactics math (small numbers). Each class has a
// combat ARCHETYPE that drives the rock-paper-scissors triangle:
//
//   melee  >  ranged  >  magic  >  melee
//
// (melee closes distance on archers; archers out-range casters; magic ignores
// heavy armor). Support (cleric/bard) sits outside the triangle at neutral.
//
// move    = tiles per turn (Chebyshev/diagonal-aware, same as walking)
// range   = max attack distance in tiles; min = closest (archers can't melee)
// maxMp   = the level-1 skill pool. EVERY class has one, not just the casters:
//           any class can be the run leader, and the leader is granted the
//           unlocked Origins tree skills (run.js), so a zero pool would
//           silently disable a hard-won tree skill for whoever picked "wrong".
//           Melee pools are small instead — a real limit, not a lie about
//           availability. Skill costs live on the specs (`cost`); a spec with
//           no cost is free.
//           The melee floor is 10, not lower: Thorns is a burst around the
//           CASTER, so the classes standing in a cluster of foes are its
//           natural wielders, and a pool that cannot pay its 10 would have made
//           the melee-shaped capstone uncastable by melee. 10 buys exactly one
//           cast from a full pool — a real ration, not a lockout.
export const CLASSES = {
  fighter: {
    name: 'Fighter', archetype: 'melee', color: '#c94f4f',
    move: 4, range: 1, min: 1, maxHp: 34, maxMp: 10, atk: 11, def: 7, spd: 5,
    blurb: 'Frontline blade-and-shield. Endures where others fall.',
  },
  barbarian: {
    name: 'Barbarian', archetype: 'melee', color: '#a5642e',
    move: 4, range: 1, min: 1, maxHp: 40, maxMp: 10, atk: 13, def: 4, spd: 4,
    blurb: 'Raw fury over finesse. Huge damage, light on defense.',
  },
  rogue: {
    name: 'Rogue', archetype: 'melee', color: '#6f5aa8',
    move: 5, range: 1, min: 1, maxHp: 26, maxMp: 10, atk: 10, def: 4, spd: 8,
    blurb: 'Fast striker. Great reach across the map, fragile.',
  },
  ranger: {
    name: 'Ranger', archetype: 'ranged', color: '#4f9d5a',
    move: 4, range: 3, min: 2, maxHp: 26, maxMp: 12, atk: 9, def: 4, spd: 6,
    blurb: 'Bowfire from afar. Wants distance and high ground.',
    // A dagger for the one tile the bow can't draw on (min 2 means range 1 is
    // dead). Deliberately weak: 6 vs the bow's 9 (-3, about a third off) so the
    // bow is always the better choice whenever there's a choice — this exists
    // so an adjacent ranger isn't a guaranteed free kill, not so melee stops
    // being the ranger's hard counter. min/max are pinned to plug EXACTLY the
    // bow's dead zone (max = the bow's min - 1): see the contiguity guard in
    // the test file.
    closeRange: { min: 1, max: 1, atk: 6 },
  },
  mage: {
    name: 'Mage', archetype: 'magic', color: '#4f8fd0',
    move: 3, range: 3, min: 1, maxHp: 22, maxMp: 18, atk: 13, def: 2, spd: 4,
    blurb: 'Glass cannon. Ignores armor, dies to a stiff breeze.',
  },
  warlock: {
    name: 'Warlock', archetype: 'magic', color: '#8f4fb0',
    move: 3, range: 3, min: 1, maxHp: 24, maxMp: 16, atk: 11, def: 3, spd: 4,
    blurb: 'Cursed power. Steady magical damage at range.',
  },
  cleric: {
    name: 'Cleric', archetype: 'support', color: '#d8c25a',
    move: 4, range: 2, min: 1, maxHp: 28, maxMp: 20, atk: 7, def: 5, spd: 5,
    blurb: 'Holy support. Mends allies with Heal.',
    // 20/6 = three casts before the pool runs dry, then +2 regen per turn means
    // one sustained cast every three turns. That rationing IS the mechanic.
    skill: { id: 'heal', name: 'Heal', kind: 'heal', target: 'ally', range: 2, power: 12, cost: 6 },
  },
  bard: {
    name: 'Bard', archetype: 'support', color: '#d07fb0',
    move: 4, range: 2, min: 1, maxHp: 26, maxMp: 18, atk: 7, def: 4, spd: 6,
    blurb: "Battlefield songs. Inspire buffs an ally's next hit.",
    // Cheaper than Heal (18/4 = four casts): a buff should out-tempo a heal.
    skill: { id: 'inspire', name: 'Inspire', kind: 'buff', target: 'ally', range: 2, power: 5, cost: 4 },
  },
};

// Archetype triangle multiplier applied to an attack.
const BEATS = { melee: 'ranged', ranged: 'magic', magic: 'melee' };
export function triangleMultiplier(attackerArch, defenderArch) {
  if (attackerArch === 'support' || defenderArch === 'support') return 1;
  if (BEATS[attackerArch] === defenderArch) return 1.25; // favorable
  if (BEATS[defenderArch] === attackerArch) return 0.8; // unfavorable
  return 1; // same archetype
}

// Height advantage: attacking downhill hits harder, uphill softer. Uses the
// tile heights the two units stand on.
export function heightMultiplier(attackerZ, targetZ) {
  if (attackerZ > targetZ) return 1.2;
  if (attackerZ < targetZ) return 0.85;
  return 1;
}

// Chebyshev distance — matches our diagonal-1-cost movement grid, so a unit's
// attack range is the same shape as its move range.
export function tileDistance(x0, y0, x1, y1) {
  return Math.max(Math.abs(x0 - x1), Math.abs(y0 - y1));
}

// A unit's set of usable attack profiles at its CURRENT (level/equipment-
// scaled) stats: the primary window everyone has (stats.min..stats.range at
// stats.atk), plus — currently only the ranger — an optional `closeRange`
// secondary profile plugging the dead zone below the primary's min. The two
// windows are constructed to be contiguous and non-overlapping
// (closeRange.max === primary.min - 1), so picking a profile for a given
// distance is never ambiguous.
export function statsProfiles(stats) {
  const primary = { min: stats.min, max: stats.range, atk: stats.atk };
  return stats.closeRange ? [primary, stats.closeRange] : [primary];
}

// Which profile a unit would use to hit something `d` tiles away, or null if
// out of range on every profile it has.
export function statsProfileFor(stats, d) {
  return statsProfiles(stats).find((p) => d >= p.min && d <= p.max) || null;
}

// Deterministic damage (no RNG in M1 — tactics first, dice later): floor of
// base (atk minus def, min 1) scaled by the triangle and height multipliers.
export function computeDamage(attacker, target, atkOverride) {
  const atk = (atkOverride ?? attacker.stats.atk) + (attacker.buffAtk || 0); // Bard's Inspire
  const base = Math.max(1, atk - target.stats.def);
  const mult =
    triangleMultiplier(attacker.cls.archetype, target.cls.archetype) *
    heightMultiplier(attacker.tileZ, target.tileZ);
  return Math.max(1, Math.round(base * mult));
}

// Simple tile line-of-sight for ranged attacks: walk the tiles between the two
// units; a shot is blocked by the void, by a tile taller than BOTH endpoints
// (a wall/pillar you can't shoot over), or by a blocker (furni props = cover).
// Endpoints themselves are exempt.
export function hasLineOfSight(room, x0, y0, x1, y1, z0, z1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 1) return true;
  const ceil = Math.max(z0, z1);
  for (let i = 1; i < steps; i++) {
    const x = Math.round(x0 + (dx * i) / steps);
    const y = Math.round(y0 + (dy * i) / steps);
    const t = room.tile(x, y);
    if (!t) return false; // over the void
    if (t.z > ceil) return false; // blocked by a taller wall
    if (room.blockers.has(`${x},${y}`)) return false; // furni cover
  }
  return true;
}
