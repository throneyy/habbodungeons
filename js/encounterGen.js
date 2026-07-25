// Seeded procedural encounters. PURE planning — no Unit construction, no
// imports from dungeon.js (dungeon.js turns plans into Units with its own
// LOOKS + enemy factory, keeping this module dependency-free and testable).
//
// generateEncounter() is fully deterministic: (seed, roomKey, battleNumber,
// room geometry) -> identical plan, so a resumed save (which restores the
// run's seed) rebuilds the exact same battles.

// ---- deterministic PRNG ----------------------------------------------------

// mulberry32: tiny, solid 32-bit seeded PRNG.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mix a string into a 32-bit seed (xmur3-style) so each battle room draws an
// independent stream from the one run seed.
export function hashSeed(seed, key) {
  let h = seed >>> 0;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

// ---- monster pools ---------------------------------------------------------

// Pools reusing the bestiary: look = key into dungeon.js LOOKS, classId =
// archetype. cost gates how much of the battle budget one body eats at
// level 1 (tougher archetypes cost more); levels add on top. Entries with
// cost >= ELITE_COST are elites — tint/recolor variants that only fit the
// budget of later battles.
export const ELITE_COST = 4;
export const POOLS = {
  // The Dungeon: one keep, one garrison — all four rooms share the pool.
  dungeon: [
    { look: 'skeleton', name: 'Skeleton', classId: 'fighter', cost: 2 },
    { look: 'sewer_rat', name: 'Sewer Rat', classId: 'rogue', cost: 2 },
    { look: 'crypt_spider', name: 'Crypt Spider', classId: 'ranger', cost: 2 },
    { look: 'restless_undead', name: 'Restless Undead', classId: 'fighter', cost: 3 },
    { look: 'grave_wraith', name: 'Grave Wraith', classId: 'ranger', cost: 3 },
    { look: 'ember_elemental', name: 'Ember Elemental', classId: 'mage', cost: 3 },
    { look: 'greedy_goblin', name: 'Greedy Goblin', classId: 'fighter', cost: 3 },
    { look: 'gnoll_sentinel', name: 'Gnoll Sentinel', classId: 'fighter', cost: 3 },
    { look: 'mystic_shaman', name: 'Mystic Shaman', classId: 'mage', cost: 4 },
    { look: 'plague_rat', name: 'Plague Rat', classId: 'rogue', cost: 4 }, // elite
    { look: 'frost_wraith', name: 'Frost Wraith', classId: 'ranger', cost: 5 }, // elite
  ],
  // Trials of the Realms: each realm-gate keeps its own fauna — no theme
  // bleed (no vikings in the glade, no slimes in the ruin).
  glade: [
    { look: 'ravenous_wolf', name: 'Ravenous Wolf', classId: 'fighter', cost: 2 },
    { look: 'hippogriff', name: 'Savage Hippogriff', classId: 'ranger', cost: 2 },
    { look: 'bear_owl', name: 'Bear Owl', classId: 'fighter', cost: 3 },
    { look: 'war_boar', name: 'Wild Boar', classId: 'fighter', cost: 2 }, // forest stock, dour tusker
    { look: 'alpha_wolf', name: 'Alpha Wolf', classId: 'fighter', cost: 4 }, // elite
  ],
  ruin: [
    { look: 'bronze_warrior', name: 'Bronze Warrior', classId: 'fighter', cost: 3 },
    { look: 'ruin_siren', name: 'Siren of the Ruin', classId: 'mage', cost: 3 },
    { look: 'nemean_lion', name: 'Nemean Lion', classId: 'fighter', cost: 4 },
    { look: 'gilded_warrior', name: 'Gilded Warrior', classId: 'fighter', cost: 4 }, // elite
    { look: 'marble_lioness', name: 'Marble Lioness', classId: 'fighter', cost: 5 }, // elite
  ],
  meadhall: [
    { look: 'hall_bear', name: 'Hall Bear', classId: 'fighter', cost: 4 },
    { look: 'war_boar', name: 'War Boar', classId: 'fighter', cost: 2 },
    { look: 'odins_raven', name: "Odin's Raven", classId: 'mage', cost: 3 },
    { look: 'dire_boar', name: 'Dire Boar', classId: 'fighter', cost: 4 }, // elite
    { look: 'berserk_bear', name: 'Berserk Bear', classId: 'fighter', cost: 5 }, // elite
  ],
  hollow: [
    { look: 'dark_werewolf', name: 'Ravenous Werewolf', classId: 'fighter', cost: 3 },
    { look: 'living_slime', name: 'Living Slime', classId: 'fighter', cost: 2 },
    { look: 'spirit_owl', name: 'Spirit Owl', classId: 'ranger', cost: 3 },
    { look: 'bog_slime', name: 'Bog Slime', classId: 'fighter', cost: 4 }, // elite
    { look: 'elder_werewolf', name: 'Elder Werewolf', classId: 'fighter', cost: 5 }, // elite
  ],
};

// Which pool each battle room draws from (Dungeon rooms share; realm rooms
// are themed per-room).
export const ROOM_POOL = {
  antechamber: 'dungeon', nave: 'dungeon', rampart: 'dungeon', throne: 'dungeon',
  glade: 'glade', ruin: 'ruin', meadhall: 'meadhall', hollow: 'hollow',
};

// Authored bosses: boss nodes keep their signature foe (look/class/level/tile
// stay hand-placed before the throne); only the minions are rolled.
export const BOSSES = {
  throne: { look: 'dread_knight', name: 'Dread Knight Commander', classId: 'fighter', level: 4, x: 7, y: 2, tag: 'boss' },
  hollow: { look: 'bog_witch', name: 'The Bog Witch', classId: 'mage', level: 4, x: 8, y: 2, tag: 'boss' },
};

// ---- budget ----------------------------------------------------------------

// Points a battle node may spend on enemies. Scales with battleNumber — the
// curve tracks the authored fights (b1 ≈ 3 light bodies, b4 ≈ a heavy squad)
// — then with squad size: a solo descent faces a quarter of the pressure a
// full four-hero squad does (floor 4 still buys two of the cheapest bodies).
export function battleBudget(battleNumber, squadSize = 4) {
  const full = 5 + battleNumber * 3; // 8, 11, 14, 17...
  return Math.max(4, Math.round((full * Math.max(1, Math.min(4, squadSize))) / 4));
}

// Never outnumber the squad by more than one — 4v1 is a wall, not a fight.
export function bodyCap(squadSize = 4, boss = false) {
  return Math.min(boss ? 3 : 4, Math.max(2, Math.max(1, squadSize) + 1));
}

// cost of one plan entry: template cost + level surcharge
const entryCost = (tpl, level) => tpl.cost + (level - 1);

// ---- spawn tiles -----------------------------------------------------------

// Valid enemy stands: real, walkable, hazard-free tiles that aren't player
// spawns or the objective tile — ranked by distance from the player side so
// enemies deploy across the room, then drawn with seeded randomness.
export function enemyTiles(room, playerSpawns, exclude = []) {
  const banned = new Set([
    ...playerSpawns.map((s) => `${s.x},${s.y}`),
    ...exclude.map((s) => `${s.x},${s.y}`),
  ]);
  const out = [];
  for (let y = 0; y < room.h; y++) {
    for (let x = 0; x < room.w; x++) {
      if (!room.tile(x, y) || room.isBlocked(x, y)) continue;
      if (banned.has(`${x},${y}`)) continue;
      if (room.effectAt && room.effectAt(x, y)) continue; // no spawning in fire
      const d = Math.min(...playerSpawns.map((s) => Math.abs(s.x - x) + Math.abs(s.y - y)));
      if (d < 3) continue; // out of the players' laps
      out.push({ x, y, d });
    }
  }
  // farthest first; x/y tiebreak keeps the order fully deterministic
  out.sort((a, b) => b.d - a.d || a.y - b.y || a.x - b.x);
  return out;
}

// ---- generator -------------------------------------------------------------

// Deterministically plan one battle's enemies.
//   { room, roomKey, battleNumber, seed, spawns, squadSize?, objectiveTile? }
// -> [{ look, name, classId, level, x, y, tag? }]
// squadSize (living members entering the node) scales pressure: budget AND
// body count shrink for small squads — deterministic per (seed, node, size).
export function generateEncounter({ room, roomKey, battleNumber = 1, seed = 0, spawns = [], squadSize = 4, objectiveTile = null }) {
  const rng = mulberry32(hashSeed(seed, `${roomKey}#${battleNumber}`));
  const pool = POOLS[ROOM_POOL[roomKey]] || POOLS.dungeon;
  const boss = BOSSES[roomKey] || null;

  const plan = [];
  const taken = [];
  if (boss) {
    plan.push({ ...boss });
    taken.push({ x: boss.x, y: boss.y });
  }

  const exclude = [...taken, ...(objectiveTile ? [objectiveTile] : [])];
  const tiles = enemyTiles(room, spawns, exclude);

  // levels hover around the battle number (never below 1, capped at 4);
  // under-strength squads face the lower roll more often
  const downBias = squadSize >= 4 ? 0.35 : squadSize >= 3 ? 0.5 : 0.65;
  const rollLevel = () => Math.max(1, Math.min(4, battleNumber + (rng() < downBias ? -1 : 0)));

  let budget = battleBudget(battleNumber, squadSize) - (boss ? boss.level + 2 : 0);
  const maxBodies = Math.min(bodyCap(squadSize, !!boss), tiles.length);
  let ti = 0; // next tile rank to hand out

  while (plan.length - (boss ? 1 : 0) < maxBodies && ti < tiles.length) {
    // affordable templates only; stop when nothing fits the remaining budget.
    // Elites (cost >= ELITE_COST) may only join when the leftover budget still
    // buys two of the pool's cheapest — an elite never thins a fight to a duo.
    const level = rollLevel();
    const minCost = Math.min(...pool.map((t) => t.cost));
    const options = pool.filter(
      (t) =>
        entryCost(t, level) <= budget &&
        (t.cost < ELITE_COST || budget - entryCost(t, level) >= 2 * minCost)
    );
    if (!options.length) break;
    const tpl = options[Math.floor(rng() * options.length)];
    // deploy on a seeded pick among the next few far-side tiles, so squads
    // spread naturally instead of stacking the single farthest corner
    const span = Math.min(4, tiles.length - ti);
    const slot = ti + Math.floor(rng() * span);
    const tile = tiles[slot];
    tiles.splice(slot, 1);
    plan.push({ look: tpl.look, name: tpl.name, classId: tpl.classId, level, x: tile.x, y: tile.y });
    budget -= entryCost(tpl, level);
  }
  return plan;
}

// Total budget cost of a generated plan (bosses excluded) — for tests/UI.
// Same look at different costs across pools is possible; use the pool the
// plan was drawn from.
export function planCost(plan, poolKey = 'dungeon') {
  const byLook = new Map();
  for (const p of POOLS[poolKey] || []) byLook.set(p.look, p);
  return plan
    .filter((p) => !p.tag)
    .reduce((sum, p) => sum + entryCost(byLook.get(p.look), p.level), 0);
}
