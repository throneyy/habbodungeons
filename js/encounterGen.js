// Seeded procedural encounters. PURE planning — no Unit construction, no
// imports from dungeon.js (dungeon.js turns plans into Units with its own
// LOOKS + enemy factory, keeping this module dependency-free and testable).
//
// generateEncounter() is fully deterministic: (seed, roomKey, battleNumber,
// room geometry) -> identical plan, so a resumed save (which restores the
// run's seed) rebuilds the exact same battles.
//
// The one import is classes.js, which is itself import-free pure data + maths:
// the threat score below has to read the same base stats the Unit constructor
// does, and a second hand-copied stat table is exactly the kind of thing that
// silently rots.
import { CLASSES } from './classes.js';

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

// ---- threat scoring --------------------------------------------------------

// A template's `cost` is what the budget pays; `threat` is what the budget
// BUYS. Before per-template deltas existed the two were unrelated — every
// template sharing a classId built the identical Unit, so a cost-5 elite could
// be the weakest body in its pool. This score is the contract between the two,
// written once here so the tuning tables, the tests and any future pool share
// one definition instead of three opinions.
//
//   dmg   = damage per swing against a reference defender
//   live  = swings survived against a reference attacker
//   reach = a ranged body trades from outside melee reply range
//
// Reference numbers are the level-1 Fighter's DEF and ATK: the stat block a
// player most often points a monster at.
export const REF_DEF = 5;
export const REF_ATK = 11;

// Threat targets per template cost. Super-linear on purpose: one big body acts
// once per turn where two small ones act twice, so an elite has to out-threat
// its cost linearly to be worth the budget it eats (action economy).
export const COST_TARGETS = { 2: 20, 3: 32, 4: 48, 5: 66 };
export const COST_TOLERANCE = 0.2; // ±20% band around the target

// Stats a template's `d` deltas produce, without building a Unit (this module
// stays free of dungeon.js/units.js imports — see the file header). Mirrors the
// level-1 branch of the Unit constructor: base class stats plus summed bonuses.
export function templateStats(tpl) {
  const base = CLASSES[tpl.classId];
  if (!base) return null;
  const d = tpl.d || {};
  return {
    maxHp: base.maxHp + (d.maxHp || 0),
    atk: base.atk + (d.atk || 0),
    def: base.def + (d.def || 0),
    move: base.move + (d.move || 0),
    range: base.range + (d.range || 0),
    min: base.min + (d.min || 0),
  };
}

// threat = damage per swing * swings survived * reach bonus.
export function templateThreat(tpl) {
  const s = templateStats(tpl);
  if (!s) return 0;
  const dmg = Math.max(1, s.atk - REF_DEF);
  const live = s.maxHp / Math.max(1, REF_ATK - s.def);
  const reach = s.range >= 2 ? 1.2 : 1.0;
  return dmg * live * reach;
}

// ---- monster pools ---------------------------------------------------------

// Pools reusing the bestiary: look = key into dungeon.js LOOKS, classId =
// archetype. cost gates how much of the battle budget one body eats at
// level 1 (tougher archetypes cost more); levels add on top. Entries with
// cost >= ELITE_COST are elites — tint/recolor variants that only fit the
// budget of later battles.
//
// `d` is the per-template stat delta, threaded to the Unit constructor through
// the same `bonuses` path equipment uses (dungeon.js E()). It is what makes a
// Skeleton and a Gnoll Sentinel different creatures rather than two names for
// the same level-1 Fighter, and it is what makes `cost` buy something: each
// entry is tuned to the COST_TARGETS threat band above (asserted by
// tests/encounters.test.js). Omitting `d` means "class base, unmodified".
export const ELITE_COST = 4;
export const POOLS = {
  // The Dungeon: one keep, one garrison — all four rooms share the pool.
  dungeon: [
    // glass: hits like a Fighter, folds like a Rogue
    { look: 'skeleton', name: 'Skeleton', classId: 'fighter', cost: 2, d: { maxHp: -14, def: -2 } },
    { look: 'sewer_rat', name: 'Sewer Rat', classId: 'rogue', cost: 2, d: { maxHp: -2, atk: 1 } },
    { look: 'crypt_spider', name: 'Crypt Spider', classId: 'ranger', cost: 2, d: { maxHp: -4, atk: 1 } },
    // shambler: move 3, so a mobile squad can kite it all day
    { look: 'restless_undead', name: 'Restless Undead', classId: 'fighter', cost: 3, d: { maxHp: -6, def: -1, move: -1 } },
    { look: 'grave_wraith', name: 'Grave Wraith', classId: 'ranger', cost: 3, d: { maxHp: 4, atk: 2 } },
    { look: 'ember_elemental', name: 'Ember Elemental', classId: 'mage', cost: 3, d: { maxHp: 6, def: 1 } },
    { look: 'greedy_goblin', name: 'Greedy Goblin', classId: 'fighter', cost: 3, d: { maxHp: -10, atk: 1, def: -1 } },
    // the wall: DEF 8 turns most level-1 swings into chip damage
    { look: 'gnoll_sentinel', name: 'Gnoll Sentinel', classId: 'fighter', cost: 3, d: { maxHp: -14, atk: -1, def: 1 } },
    { look: 'mystic_shaman', name: 'Mystic Shaman', classId: 'mage', cost: 4, d: { maxHp: 10, atk: 1, def: 2 } },
    { look: 'plague_rat', name: 'Plague Rat', classId: 'rogue', cost: 4, d: { maxHp: 6, atk: 3, def: 2 } }, // elite
    { look: 'frost_wraith', name: 'Frost Wraith', classId: 'ranger', cost: 5, d: { maxHp: 10, atk: 4, def: 2 } }, // elite
  ],
  // Trials of the Realms: each realm-gate keeps its own fauna — no theme
  // bleed (no vikings in the glade, no slimes in the ruin).
  glade: [
    // wolves: fast, bite hard, fold fast
    { look: 'ravenous_wolf', name: 'Ravenous Wolf', classId: 'fighter', cost: 2, d: { maxHp: -14, def: -2, move: 1 } },
    { look: 'hippogriff', name: 'Savage Hippogriff', classId: 'ranger', cost: 2, d: { maxHp: -2, atk: 1, move: 1 } },
    { look: 'bear_owl', name: 'Bear Owl', classId: 'fighter', cost: 3, d: { maxHp: -6, def: -1 } },
    // boars: thick hide, blunt tusks — chip damage you cannot ignore
    { look: 'war_boar', name: 'Wild Boar', classId: 'fighter', cost: 2, d: { maxHp: -9, atk: -2, def: -1 } },
    { look: 'alpha_wolf', name: 'Alpha Wolf', classId: 'fighter', cost: 4, d: { atk: 1, def: -1, move: 1 } }, // elite
  ],
  ruin: [
    // statues: slow (move 3), armored, unhurried
    { look: 'bronze_warrior', name: 'Bronze Warrior', classId: 'fighter', cost: 3, d: { maxHp: -8, atk: -1, move: -1 } },
    // The one body in the game with reach 4: she sings from outside every bow.
    // Priced at the LOW edge of her band on purpose — the threat score credits
    // reach with a flat x1.2 and cannot see that range 4 also means "never
    // shot back at", so she pays for the extra tile in raw numbers.
    { look: 'ruin_siren', name: 'Siren of the Ruin', classId: 'mage', cost: 3, d: { maxHp: 4, range: 1 } },
    { look: 'nemean_lion', name: 'Nemean Lion', classId: 'fighter', cost: 4, d: { maxHp: -10, def: 1 } }, // impenetrable hide
    { look: 'gilded_warrior', name: 'Gilded Warrior', classId: 'fighter', cost: 4, d: { maxHp: -2, move: -1 } }, // elite
    { look: 'marble_lioness', name: 'Marble Lioness', classId: 'fighter', cost: 5, d: { atk: 2, move: 1 } }, // elite
  ],
  meadhall: [
    { look: 'hall_bear', name: 'Hall Bear', classId: 'fighter', cost: 4, d: { maxHp: 6, def: -1 } },
    { look: 'war_boar', name: 'War Boar', classId: 'fighter', cost: 2, d: { maxHp: -9, atk: -2, def: -1 } },
    { look: 'odins_raven', name: "Odin's Raven", classId: 'mage', cost: 3, d: { maxHp: 8, move: 1 } },
    { look: 'dire_boar', name: 'Dire Boar', classId: 'fighter', cost: 4, d: { maxHp: -6, atk: -1, def: 1 } }, // elite
    // berserk: the biggest swing in any pool, and the armor to match — none
    { look: 'berserk_bear', name: 'Berserk Bear', classId: 'fighter', cost: 5, d: { maxHp: 2, atk: 3, def: -1 } }, // elite
  ],
  hollow: [
    { look: 'dark_werewolf', name: 'Ravenous Werewolf', classId: 'fighter', cost: 3, d: { maxHp: -6, atk: 1, def: -2, move: 1 } },
    // slime: move 2, so it is the one body a squad can simply walk away from
    { look: 'living_slime', name: 'Living Slime', classId: 'fighter', cost: 2, d: { atk: -3, def: -1, move: -2 } },
    { look: 'spirit_owl', name: 'Spirit Owl', classId: 'ranger', cost: 3, d: { maxHp: 6, atk: 2 } },
    { look: 'bog_slime', name: 'Bog Slime', classId: 'fighter', cost: 4, d: { maxHp: -6, atk: -1, def: 1, move: -2 } }, // elite
    { look: 'elder_werewolf', name: 'Elder Werewolf', classId: 'fighter', cost: 5, d: { maxHp: 2, atk: 3, def: -1, move: 1 } }, // elite
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

// Share of the boss node's budget the MINIONS get. The old model subtracted a
// flat `boss.level + 2`, which went negative for small squads and was then
// silently absorbed by the affordability check — a bug that happened to look
// like a feature. A share cannot go negative.
export const BOSS_MINION_SHARE = 0.5;

// The boss scales to the squad that actually walks in. Missing heroes are
// missing damage AND missing bodies to spread the boss's damage over, so the
// full-strength Dread Knight (46 HP / ATK 14 / DEF 8 at level 4) is a wall to
// one wounded survivor: 12 swings to kill him, 3 for him to kill you. That is
// not a hard fight, it is an arithmetic impossibility.
//
// He stays LEVEL 4 — his level is his identity, his stat block and his XP
// value. What scales is his bulk, through the same `bonuses` path the pool
// deltas use, so there is one mechanism here and not two.
// Tuned against tests/balanceSim.js, not guessed: ATK and DEF are the knobs
// that decide whether the fight is possible at all (a solo hero simply cannot
// out-trade DEF 8 / ATK 14), while HP only sets how long it takes. So ATK
// falls a point per missing hero, DEF a point per TWO missing heroes (dropping
// it in step with ATK made the duel a formality at 79% wins), and HP a modest
// 3 — enough to shorten the duel, not enough to trivialise it.
export function bossScale(squadSize) {
  const missing = 4 - Math.max(1, Math.min(4, squadSize));
  return { maxHp: -3 * missing, atk: -missing, def: -Math.ceil(missing / 2) };
}

// ---- budget ----------------------------------------------------------------

// How much of a battle a squad of N is asked to carry. NOT n/4: a party's
// fighting power is not linear in headcount. Scored with templateThreat, the
// default roster (fighter, cleric, ranger, mage) holds cumulative shares of
// 0.49 / 0.60 / 0.77 / 1.00 — the leader alone is half of a four-hero squad,
// being the tank AND a full damage dealer while the support slot contributes
// almost no offence.
//
// Budgeting linearly (0.25 / 0.50 / 0.75 / 1.00) therefore handed a soloist a
// QUARTER of the pressure for HALF of the power: a measured 95.8% solo clear
// rate against 64.5% for a full squad — the very inversion this curve exists
// to kill, arriving from the other side.
//
// The numbers below start from that power share and were then TUNED DOWN for
// small squads against tests/balanceSim.js until the measured clear rates
// converged (15.5 / 16.8 / 14.0 / 17.0 at 400 seeds per size). They sit below
// the raw share because the threat score is blind to action economy: four
// bodies focus-fire one hero and it dies, where the same threat spread over
// four heroes is survivable. Power share sets the shape; win rates set the
// values.
const SIZE_WEIGHT = [0, 0.35, 0.5, 0.68, 1];

// Points a battle node may spend on enemies. Scales with battleNumber — the
// curve tracks the authored fights (b1 ≈ 3 light bodies, b4 ≈ a heavy squad)
// — then with the squad's POWER share above, so what stays flat across sizes
// is pressure per unit of squad power rather than pressure per head.
//
// The previous curve had two defects beyond the linearity:
//
//   Math.round wobbled. At battle 3 it handed size 3 MORE pressure per hero
//   (3.67) than either size 2 or size 4 (3.50) — picking up a third member
//   made the run harder. Math.floor always errs the same direction, so the
//   curve can no longer invert.
//
//   The flat floor of 4 was a cliff at the bottom: size 1 was pinned to 4 at
//   EVERY battle number, so a solo battle 4 was no harder than a solo battle 1.
//   The floor is 2 now — still one of the cheapest bodies, so a lone hero
//   always has a fight — and the weight curve does the real work.
//
// Known residual: integer budgets cannot hit the weights exactly, and a size-1
// battle-1 budget is 3 points, so one unit of Math.floor is a sixth of it —
// pressure per unit of power varies by up to 17% between sizes. Tightening
// that needs finer-grained costs (every cost and budget doubled), which is a
// bigger change than it buys; tests/encounters.test.js asserts a tolerance
// band rather than exactness, so this stays explicit rather than hidden.
export function battleBudget(battleNumber, squadSize = 4) {
  const full = 7 + battleNumber * 3; // 10, 13, 16, 19
  const size = Math.max(1, Math.min(4, squadSize));
  return Math.max(2, Math.floor(full * SIZE_WEIGHT[size]));
}

// The weight curve, for tests and tuning tools (the sim reads win rates, but a
// unit test needs the intended shape to compare a budget against).
export const squadPowerShare = (squadSize) => SIZE_WEIGHT[Math.max(1, Math.min(4, squadSize))];

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
// -> [{ look, name, classId, level, x, y, tag?, bonuses? }]
// `bonuses` is the template's `d` delta (null when untuned), handed to the Unit
// constructor by dungeon.js through the same path equipment uses.
// squadSize (living members entering the node) scales pressure: budget AND
// body count shrink for small squads — deterministic per (seed, node, size).
export function generateEncounter({ room, roomKey, battleNumber = 1, seed = 0, spawns = [], squadSize = 4, objectiveTile = null }) {
  const rng = mulberry32(hashSeed(seed, `${roomKey}#${battleNumber}`));
  const pool = POOLS[ROOM_POOL[roomKey]] || POOLS.dungeon;
  const boss = BOSSES[roomKey] || null;

  const plan = [];
  const taken = [];
  if (boss) {
    plan.push({ ...boss, bonuses: bossScale(squadSize) });
    taken.push({ x: boss.x, y: boss.y });
  }

  const exclude = [...taken, ...(objectiveTile ? [objectiveTile] : [])];
  const tiles = enemyTiles(room, spawns, exclude);

  // levels hover around the battle number (never below 1, capped at 4);
  // under-strength squads face the lower roll more often
  const downBias = squadSize >= 4 ? 0.35 : squadSize >= 3 ? 0.5 : 0.65;
  const rollLevel = () => Math.max(1, Math.min(4, battleNumber + (rng() < downBias ? -1 : 0)));

  const full = battleBudget(battleNumber, squadSize);
  let budget = boss ? Math.max(0, Math.floor(full * BOSS_MINION_SHARE)) : full;
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
    plan.push({
      look: tpl.look, name: tpl.name, classId: tpl.classId, level,
      x: tile.x, y: tile.y, bonuses: tpl.d || null,
    });
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
