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
    // Multi-tile items declare their footprint via `tiles: [{x,y},...]`
    // (defaults to just the anchor tile). `gate: true` props open/close via
    // toggleGate (switch gimmick) — open = whole footprint unblocked.
    this.props = props;
    for (const p of props) {
      // Auto-derive multi-tile footprints for SEATS from the furni dims
      // registry when the spec doesn't hand-declare one (dirs 2/6 rotate the
      // dims 90°), so every tile of a two-seater sofa/bench seats. Scoped to
      // seats: extracted dims for wall decor over-claim floor, and solid
      // furni keep using hand-authored `tiles` (which always win).
      if (p.sit && !(p.tiles && p.tiles.length) && FURNI_DIMS[p.id]) {
        const [dx, dy] = FURNI_DIMS[p.id];
        const [w, h] = (p.dir ?? 0) % 4 === 2 ? [dy, dx] : [dx, dy];
        p.tiles = [];
        for (let ty = 0; ty < h; ty++)
          for (let tx = 0; tx < w; tx++) p.tiles.push({ x: p.x + tx, y: p.y + ty });
      }
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
  return p.tiles && p.tiles.length ? p.tiles : [{ x: p.x, y: p.y }];
}

function parseCell(ch) {
  if (!ch || ch === 'x' || ch === 'X' || ch === ' ') return null;
  if (ch >= '0' && ch <= '9') return { z: ch.charCodeAt(0) - 48 };
  if (ch >= 'a' && ch <= 'w') return { z: ch.charCodeAt(0) - 97 + 10 };
  return null;
}
