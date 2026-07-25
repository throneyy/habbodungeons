// Seeded battle-room decor. Deterministically dresses each battle room with
// 6-12 extra clutter props from the run seed — same seed, same dressing, so
// resumed saves (and co-op replicas) rebuild identical rooms. Placement never
// touches player spawns, the far tiles enemies deploy on (encounterGen),
// hazard/effect tiles, objective/boss tiles, or stair transitions — and a
// blocking piece is reverted if it would split the room's walkable floor.
import { mulberry32, hashSeed, enemyTiles, BOSSES } from './encounterGen.js';

// Per-kit pools of already-extracted 1x1 props. walk:true = flat ground
// clutter (drawn as surface, standable); the rest are blocking cover.
export const DECOR = {
  dungeon: [
    { id: 'hween_c17_lichen', walk: true }, // moss creeping over the flags
    { id: 'hween_c17_rock' },
    { id: 'hween_c17_rock2' },
    { id: 'fantasy_c22_barrel' },
    { id: 'fantasy_c22_wood' },
    { id: 'fantasy_c22_metal' },
    { id: 'gothic_candles' },
    { id: 'hween_c19_bewitchedskull' },
  ],
  forest: [
    { id: 'hween_c17_lichen', walk: true },
    { id: 'nft_h25_flowers2', walk: true }, // low flower tufts
    { id: 'nft_h25_flowers7', walk: true },
    { id: 'easter_c19_mushrooms' },
    { id: 'hween_c17_shroomthing' },
    { id: 'easter_c19_flowerlamp' },
    { id: 'easter_c19_turnipbuddies' },
  ],
  greek: [
    { id: 'greek_c19_scrolls1', walk: true }, // scrolls spilled on the marble
    { id: 'greek_c19_scrolls2', walk: true },
    { id: 'greek_c19_vase1' },
    { id: 'greek_c19_vase2' },
    { id: 'greek_c19_shield1' },
    { id: 'greek_c19_shield2' },
    { id: 'greek_c15_lamp' },
  ],
  viking: [
    { id: 'fantasy_c22_cloth', walk: true }, // trodden floor cloth
    { id: 'vikings_basket1' },
    { id: 'vikings_basket2' },
    { id: 'fantasy_c22_barrel' }, // mead barrels
    { id: 'vikings_chesspiece' },
    { id: 'vikings_torch' },
  ],
  witch: [
    { id: 'hween_c19_feathers', walk: true }, // molted familiar feathers
    { id: 'hween_c19_herbs', walk: true }, // drying herbs strewn about
    { id: 'hween_c19_bewitchedskull' },
    { id: 'hween_c19_potions' },
    { id: 'hween_c19_crystal' },
    { id: 'hween_c19_broomstaffstand' },
  ],
};

// battle room id -> decor kit
export const ROOM_KIT = {
  antechamber: 'dungeon', nave: 'dungeon', rampart: 'dungeon', throne: 'dungeon',
  glade: 'forest', ruin: 'greek', meadhall: 'viking', hollow: 'witch',
};

const RESERVED_ENEMY_TILES = 10; // far-side tiles kept clear for encounterGen
const MAX_BLOCKING = 3; // cover, not a maze

// 4-neighbor passability the way walkers see it (±1 height step is a stair)
function passable(room, x, y, nx, ny) {
  if (!room.tile(nx, ny) || room.isBlocked(nx, ny)) return false;
  return Math.abs(room.heightAt(x, y) - room.heightAt(nx, ny)) <= 1;
}

// count connected walkable components (a blocking piece must never add one)
function componentCount(room) {
  const seen = new Set();
  let comps = 0;
  for (let y = 0; y < room.h; y++) {
    for (let x = 0; x < room.w; x++) {
      const k = `${x},${y}`;
      if (seen.has(k) || !room.tile(x, y) || room.isBlocked(x, y)) continue;
      comps++;
      const stack = [[x, y]];
      seen.add(k);
      while (stack.length) {
        const [cx, cy] = stack.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          const nk = `${nx},${ny}`;
          if (seen.has(nk) || !passable(room, cx, cy, nx, ny)) continue;
          seen.add(nk);
          stack.push([nx, ny]);
        }
      }
    }
  }
  return comps;
}

// Tiles decor may use: real, unblocked, effect-free, flat-neighborhood (no
// stair transitions), and outside every reserved set.
export function decorTiles(room, { spawns = [], objectiveTile = null, reserved = [] } = {}) {
  const banned = new Set([
    ...spawns.map((s) => `${s.x},${s.y}`),
    ...reserved.map((s) => `${s.x},${s.y}`),
  ]);
  if (objectiveTile) {
    // the objective tile and its approach ring stay clear
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) banned.add(`${objectiveTile.x + dx},${objectiveTile.y + dy}`);
  }
  const boss = BOSSES[room.id];
  if (boss) banned.add(`${boss.x},${boss.y}`);
  const out = [];
  for (let y = 0; y < room.h; y++) {
    for (let x = 0; x < room.w; x++) {
      if (!room.tile(x, y) || room.isBlocked(x, y)) continue;
      if (banned.has(`${x},${y}`)) continue;
      if (room.effectAt && room.effectAt(x, y)) continue;
      // stair guard: any 4-neighbor at a different height renders a stair
      // face on this edge — keep both sides of every step clear
      const h = room.heightAt(x, y);
      let stepEdge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (room.tile(x + dx, y + dy) && room.heightAt(x + dx, y + dy) !== h) stepEdge = true;
      }
      if (stepEdge) continue;
      out.push({ x, y });
    }
  }
  return out; // scan order = deterministic
}

// Dress a freshly built battle room. Mutates room.props (and blockers for
// cover pieces). Deterministic in (seed, room id).
export function decorate(room, { seed = 0, spawns = [], objectiveTile = null } = {}) {
  const pool = DECOR[ROOM_KIT[room.id]];
  if (!pool) return room;
  const rng = mulberry32(hashSeed(seed, `decor:${room.id}`));
  const reserved = enemyTiles(room, spawns, objectiveTile ? [objectiveTile] : [])
    .slice(0, RESERVED_ENEMY_TILES);
  const tiles = decorTiles(room, { spawns, objectiveTile, reserved });

  const count = Math.min(6 + Math.floor(rng() * 7), tiles.length); // 6..12
  const walkers = pool.filter((p) => p.walk);
  const blockers = pool.filter((p) => !p.walk);
  const baseComps = componentCount(room);
  let placedBlocking = 0;

  let placed = 0;
  while (placed < count && tiles.length) {
    const tile = tiles.splice(Math.floor(rng() * tiles.length), 1)[0];
    // a few blocking pieces for cover, the rest flat ground clutter
    const wantBlock = placedBlocking < MAX_BLOCKING && rng() < 0.35 && blockers.length;
    const src = wantBlock ? blockers : walkers.length ? walkers : blockers;
    const tpl = src[Math.floor(rng() * src.length)];
    const prop = { id: tpl.id, x: tile.x, y: tile.y, dir: rng() < 0.5 ? 0 : 2, decor: true };
    if (tpl.walk) {
      prop.walk = true;
      room.props.push(prop);
    } else {
      room.props.push(prop);
      room.block(tile.x, tile.y, prop);
      // never let cover split the floor into islands (unwinnable fights);
      // a reverted piece doesn't count — try the next tile instead
      if (componentCount(room) > baseComps) {
        room.unblock(tile.x, tile.y);
        room.props.pop();
        continue;
      }
      placedBlocking++;
    }
    placed++;
  }
  return room;
}
