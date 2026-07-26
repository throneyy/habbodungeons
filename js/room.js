import { FURNI_DIMS } from './furniDims.js';

// A room is defined exactly like Habbo's room models: a heightmap of
// characters where 'x' is void (unwalkable hole / wall), '0'-'9' are floor
// heights 0-9 and 'a'-'w' continue 10-32. Adjacent floors that differ by
// exactly 1 render as stairs, just like the real client.
export class Room {
  constructor({ id, name, zoom = 1, heightmap, spawn, spawnDir = 4, props = [], effects = [], kit = null, critters = null, bots = [] }) {
    this.id = id;
    this.name = name;
    this.zoom = zoom; // 1 = guest room tiles (64x32), 0.5 = public-room scale (32x16)
    // Visual kit (DATA, from the dungeon): { floor: propId, palette: {...},
    // walls: {height}|false }. floor = real furni floor art tiled across the
    // tops; palette recolors the procedural stairs/sides to match; walls draws
    // classic boundary walls along the room's far edges.
    this.kit = kit;
    // Huntable wildlife (Free Roam only — see exploreController.hunt*):
    // [{ look: {pet,tint}, name, hp, xp, respawnMs, spawns: [{x,y},...] }].
    // DATA passthrough; battle rooms never set it.
    this.critters = critters;
    // Walking room bots (Free Roam only — see js/roomBots.js):
    // [{ bot: '<key>', x, y, dir }]. DATA passthrough like `critters`: these
    // are specs, never props — they get no sprite sheet, never block a tile,
    // and are split back out of saved layouts by rooms.js (splitBots).
    this.bots = bots;
    this.rows = heightmap;
    this.h = heightmap.length;
    this.w = Math.max(...heightmap.map((r) => r.length));
    this.tiles = [];
    for (let y = 0; y < this.h; y++) {
      const row = [];
      for (let x = 0; x < this.w; x++) row.push(parseCell(heightmap[y][x]));
      this.tiles.push(row);
    }
    this.spawn = spawn;
    this.spawnDir = spawnDir;
    // Dynamic blockers (furni, monsters, other players later). A tile with a
    // blocker exists visually but can't be stood on or walked through.
    this.blockers = new Map(); // "x,y" -> whatever occupies it
    // Furni props: [{ id, x, y, dir }] — visual specs the renderer resolves
    // via assets/props; each prop's tile is solid (walk + line-of-sight)
    // UNLESS it's flagged `walk: true` (trap/plate/chest art you stand on)
    // or `sit: <height>` (chairs — walkable, and seat whoever lands there).
    // `tiles` is DERIVED from the furni's own dims, never authored — see
    // propFootprint. `gate: true` props open/close via toggleGate (switch
    // gimmick) — open = whole footprint unblocked.
    this.props = props;
    for (const p of props) {
      this.stampFootprint(p);
      if (p.walk || p.sit) continue;
      for (const t of propTiles(p)) this.block(t.x, t.y, p);
    }
    // Tile effects (M5 gimmicks) — DATA from the dungeon, dispatched by the
    // battle engine when a unit settles on the tile (or at end of turn):
    //   { x, y, kind: 'hazard'|'switch'|'treasure', ... } — see battle.js.
    // The spec object itself carries live state (spent/on); rooms are rebuilt
    // per battle so gimmicks reset naturally.
    this.effects = new Map(); // "x,y" -> effect spec
    for (const e of effects) this.effects.set(`${e.x},${e.y}`, e);
  }

  effectAt(x, y) {
    return this.effects.get(`${x},${y}`) || null;
  }

  // Recompute a prop's footprint from its furni dims. Every read path goes
  // through the stamped `tiles`, so this is the one place a footprint is
  // decided — call it after anything that changes a prop's x/y/dir.
  stampFootprint(p) {
    p.tiles = propFootprint(p);
    return p.tiles;
  }

  // Add a prop after construction (self-healing defaults: gates, RP arrows,
  // NPC trees). Stamps the footprint and blocks it if the item is solid,
  // exactly as the constructor would have.
  addProp(p) {
    this.stampFootprint(p);
    this.props.push(p);
    if (!p.walk && !p.sit) for (const t of p.tiles) this.block(t.x, t.y, p);
    return p;
  }

  // The sit-flagged prop covering (x,y), if any. Seats are walkable; the
  // avatar that settles on one sits (see avatar.js).
  seatAt(x, y) {
    return this.props.find((p) => p.sit && propTiles(p).some((t) => t.x === x && t.y === y)) || null;
  }

  // The teleport prop covering (x,y), if any (RP-arrow style: walkable floor
  // decal with { teleport: { room, x?, y? } } — stepping on it moves the
  // avatar to the target room).
  teleportAt(x, y) {
    return (
      this.props.find((p) => p.teleport && propTiles(p).some((t) => t.x === x && t.y === y)) || null
    );
  }

  // The NPC prop covering (x,y), if any (wired by npc.js: p.npc = spec).
  // Tapping one from an adjacent tile starts its dialogue.
  npcAt(x, y) {
    return (
      this.props.find((p) => p.npc && propTiles(p).some((t) => t.x === x && t.y === y)) || null
    );
  }

  // The hittable prop covering (x,y), if any (training dummies: attackable
  // scenery — tap it from an adjacent tile to swing at it).
  hittableAt(x, y) {
    return (
      this.props.find((p) => p.hittable && propTiles(p).some((t) => t.x === x && t.y === y)) || null
    );
  }

  // The shootable prop covering (x,y), if any (archery targets: double-tap
  // to loose an arrow from wherever you stand).
  shootableAt(x, y) {
    return (
      this.props.find((p) => p.shootable && propTiles(p).some((t) => t.x === x && t.y === y)) || null
    );
  }

  // Open/close a gate prop covering a tile (switch gimmick). Open = the whole
  // footprint unblocked (walkable AND shoot-through); the renderer swaps to
  // the item's open-state art (or hides it if none was extracted). Returns
  // the new open state, or null if there is no gate there.
  toggleGate(x, y) {
    const p = this.props.find((q) => q.gate && propTiles(q).some((t) => t.x === x && t.y === y));
    if (!p) return null;
    p.open = !p.open;
    p.openedAt = null; // renderer stamps this to time the transition
    for (const t of propTiles(p)) {
      if (p.open) this.unblock(t.x, t.y);
      else this.block(t.x, t.y, p);
    }
    return p.open;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  tile(x, y) {
    return this.inBounds(x, y) ? this.tiles[y][x] : null;
  }

  isVoid(x, y) {
    return !this.tile(x, y);
  }

  isBlocked(x, y) {
    return !this.tile(x, y) || this.blockers.has(`${x},${y}`);
  }

  heightAt(x, y) {
    const t = this.tile(x, y);
    return t ? t.z : NaN;
  }

  block(x, y, thing = true) {
    this.blockers.set(`${x},${y}`, thing);
  }

  unblock(x, y) {
    this.blockers.delete(`${x},${y}`);
  }
}

function propTiles(p) {
  return p.tiles && p.tiles.length ? p.tiles : propFootprint(p);
}

// THE footprint rule, and the only one. Habbo furni occupy xdim x ydim tiles
// from their anchor: xdim runs along +x, ydim along +y, and dirs 2/6 rotate
// the pair 90°. Verified against the art itself — a prop's drop shadow IS its
// footprint diamond, and the renderer anchors it at (tileCentre - ax, -ay), so
// the shadow's lowest point sits 32px * (span - 1) off the anchor column along
// whichever axis the item spans (+x leans down-RIGHT on screen, +y down-LEFT).
// Measured on clean-diamond shadows: marketstall 1x2 d0 -33 (+y), balcony 2x1
// d0 +32 (+x), vikings_table_g 3x1 d0 +64 (+x), and every one of those flips
// sign at dir 2/6.
//
// This USED to be hand-authored per placement as `tiles: [{x,y},...]`, with
// the derivation scoped to seats only. The hand lists transposed the axis: the
// square's market stall at (8,3) claimed (8,3)+(9,3) where the art covers
// (8,3)+(8,4) — an invisible wall on one side, a walk-through counter on the
// other, and js/game.js's depth box built from the same wrong pair, so
// depth.js's front-side test mis-ordered avatars against the near end. 40 of
// 69 multi-tile placements in the live layouts were wrong that way. Deriving
// leaves nothing to transpose, and heals layouts already saved in the
// database (their stored `tiles` are ignored).
//
// Props with no FURNI_DIMS entry are 1x1 — the registry lists only multi-tile
// furni. Wall decor whose extracted dims over-claim floor stays harmless as
// long as it is placed `walk: true` (it is: hanging flags, canopies, roots),
// because walkable props never block.
export function propFootprint(p) {
  const dims = FURNI_DIMS[p.id];
  if (!dims) return [{ x: p.x, y: p.y }];
  const [w, h] = (p.dir ?? 0) % 4 === 2 ? [dims[1], dims[0]] : dims;
  const out = [];
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) out.push({ x: p.x + tx, y: p.y + ty });
  return out;
}

function parseCell(ch) {
  if (!ch || ch === 'x' || ch === 'X' || ch === ' ') return null;
  if (ch >= '0' && ch <= '9') return { z: ch.charCodeAt(0) - 48 };
  if (ch >= 'a' && ch <= 'w') return { z: ch.charCodeAt(0) - 97 + 10 };
  return null;
}
