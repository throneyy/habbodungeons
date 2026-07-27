import { Room } from './room.js';
import { SEATS } from './config.js';
import { wireNpcs } from './npc.js';
import { splitBots } from './roomBots.js';

// Attackable scenery: tapping one of these from an adjacent tile swings at
// it (strike pose, wobble, damage floater — see exploreController).
const HITTABLE = new Set(['fantasy_c22_trainingdummy']);

// Rangeable scenery: double-tap looses an arrow from wherever you stand
// (Firing Arrow projectile, wobble + damage floater on impact).
const SHOOTABLE = new Set(['fantasy_c22_trainingtarget']);

// Stamp sit flags onto any prop whose furni is in the SEATS registry, so both
// default layouts and admin-saved ones (which strip flags) seat avatars.
// Hittable/shootable scenery is stamped the same self-healing way.
const withSeats = (props) =>
  props.map((p) => {
    const extra = {};
    if (SEATS[p.id]) extra.sit = SEATS[p.id];
    if (HITTABLE.has(p.id)) extra.hittable = true;
    if (SHOOTABLE.has(p.id)) extra.shootable = true;
    return Object.keys(extra).length ? { ...p, ...extra } : p;
  });

// The dungeon gate: ONE walkable archway in the square (diegetic entry).
// It has no destination of its own — the Gatekeeper beside it opens the way:
// choices in his dialogue (js/dialogueData.js) pick the dungeon, then walking
// through the arch begins that descent (main.js resolves { gate: true }).
// Wiring is self-healing like the RP arrows: saved layouts can move the arch
// (the trigger follows) and a layout that omits it gets it back.
export const GATE_FURNI = 'fantasy_c22_archway';
const GATE_DEFAULTS = {
  // set into the guild hall's west front, beside the clock tower (the
  // default layout places it there too — this only heals omissions). No
  // footprint here: the Room derives it from the arch's own dims.
  square: [{ id: GATE_FURNI, x: 1, y: 5, dir: 2 }],
};

// A traversal decal (RP arrow, dungeon gate) is only a door if a player can
// STAND on it, so every one of them ends up here. Its own block is always
// lifted — it was flagged walkable after the ctor ran.
//
// Beyond that, a door buried under OTHER furni would strand players, and that
// is a live hazard: footprints used to be hand-authored per placement and got
// the axis wrong, so layouts were saved against footprints a tile off. The
// square's adventure board (1x2, dir 2) really sits across (12,6)+(13,6) and
// the saved layout parks the mirkwood arrow on (13,6) — with correct
// footprints a solid board covers the only way east.
//
// The door MOVES rather than the furni becoming see-through. Punching a hole
// in the board would leave players walking through a signboard, which is the
// same class of lie the wrong footprints told; relocating keeps every item
// solid and the traversal network complete, which is this module's contract.
// Its registered default tile is tried first (ARROW_DEFAULTS/GATE_DEFAULTS
// already restore missing arrows to exactly those spots), then neighbours in a
// FIXED order — determinism matters because every client builds its rooms
// independently, and a heal that picked differently per client would desync
// the blocked-tile set. Only if nothing at all is free does the door force its
// own tile, because being unreachable is worse than overlapping art.
//
// A door with one tile still free (the square's arch, whose far tile holds a
// goblin statue) is left exactly as the admin placed it.
const NEIGHBOURS = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function wireDoor(room, p, home = null) {
  for (const t of p.tiles) {
    if (room.blockers.get(`${t.x},${t.y}`) === p) room.unblock(t.x, t.y);
  }
  if (p.tiles.some((t) => !room.isBlocked(t.x, t.y))) return;
  const t = p.tiles[0];
  const by = room.blockers.get(`${t.x},${t.y}`);
  const buriedBy = by && by.id ? `${by.id} at (${by.x},${by.y})` : 'another item';
  const free = (x, y) => room.tile(x, y) && !room.isBlocked(x, y);

  const spot =
    (home && free(home.x, home.y) ? { x: home.x, y: home.y, dir: home.dir ?? p.dir } : null) ||
    NEIGHBOURS.map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy, dir: p.dir })).find((s) => free(s.x, s.y));

  if (spot) {
    p.x = spot.x;
    p.y = spot.y;
    p.dir = spot.dir ?? p.dir;
    room.stampFootprint(p);
    console.warn(
      `[rooms] ${room.id}: ${p.id} at (${t.x},${t.y}) was fully covered by ${buriedBy} — ` +
        `moved to (${p.x},${p.y}). Re-save the layout in the room editor to make it permanent.`,
    );
    return;
  }
  room.unblock(t.x, t.y);
  console.warn(
    `[rooms] ${room.id}: ${p.id} at (${t.x},${t.y}) was fully covered by ${buriedBy} and has ` +
      'nowhere free to move — forcing the door tile open. Move one of them in the room editor.',
  );
}

function wireGates(rooms) {
  for (const room of rooms) {
    // restore the arch if a saved layout dropped it (admins move, not lose)
    for (const def of GATE_DEFAULTS[room.id] || []) {
      if (!room.props.some((p) => p.id === def.id)) room.addProp({ ...def });
    }
    for (const p of room.props) {
      if (p.id !== GATE_FURNI) continue;
      p.walk = true; // step INTO the archway to descend
      p.teleport = { gate: true }; // destination comes from the Gatekeeper
      wireDoor(room, p, (GATE_DEFAULTS[room.id] || [])[0]);
    }
  }
  return rooms;
}

// Self-healing RP arrows, keyed by DESTINATION: every room lists the arrows
// it must offer (dest + default tile). Saved layouts can move arrows (their
// position wins), strip teleport data (orphans re-adopt a missing dest in
// order), or omit them entirely (the default is restored) — the network
// always comes back complete, even for layouts saved before a room existed.
const ARROW_DEFAULTS = {
  tavern: [{ dest: 'square', x: 11, y: 6, dir: 2 }],
  square: [
    { dest: 'tavern', x: 5, y: 2, dir: 0 },
    { dest: 'mirkwood', x: 13, y: 7, dir: 4 },
  ],
  mirkwood: [{ dest: 'square', x: 14, y: 20, dir: 4 }],
};

function wireArrows(rooms) {
  for (const room of rooms) {
    const arrows = room.props.filter((p) => p.id === 'rp_arrow');
    const orphans = arrows.filter((p) => !p.teleport || !p.teleport.room);
    for (const def of ARROW_DEFAULTS[room.id] || []) {
      if (arrows.some((p) => p.teleport && p.teleport.room === def.dest)) continue;
      const orphan = orphans.shift();
      if (orphan) orphan.teleport = { room: def.dest }; // admin's spot, healed aim
      else {
        const spec = { id: 'rp_arrow', x: def.x, y: def.y, dir: def.dir, walk: true, teleport: { room: def.dest } };
        room.addProp(spec);
        arrows.push(spec);
      }
    }
    for (const p of arrows) {
      p.walk = true;
      // an arrow's registered default is keyed by DESTINATION, so a buried one
      // falls back to the exact tile this room documents for that exit
      wireDoor(room, p, (ARROW_DEFAULTS[room.id] || []).find((d) => p.teleport && p.teleport.room === d.dest));
    }
  }
  return rooms;
}

// Free Roam public rooms defined exactly like Habbo room models:
// 'x' = void, digits = floor height. Adjacent floors differing by exactly 1
// get automatic stairs, same as the real client.

// The tavern: warm Steelscar timber underfoot, smoke-stained walls — the
// classic "first room you idle in" public-space vibe.
const TAVERN_KIT = {
  floor: 'vikings_floor',
  walls: { height: 3.4 },
  palette: {
    topA: '#6a4a33', topB: '#5f422d',
    // level drops read as STONE retaining walls: gray riser faces (the
    // reference's brick counter/plinths) under the wood-plank tops.
    sideSW: '#3b3f45', sideSE: '#4a4f57',
    line: 'rgba(14,8,4,0.5)',
    wallN: '#4a3423', wallW: '#5c4130', wallTrim: '#241709',
  },
};

// The Mirkwood: a vast old-growth forest at public-room scale (zoom 0.5 —
// tiles, furni and avatars all render half size, so the wood reads huge).
// GLOOMY by design: mouldering autumn ground, bare gray birches, drifting
// wisp-light — the sick wood of the old stories, not a fairy meadow.
const MIRKWOOD_KIT = {
  floor: 'hween_c19_autumnfloor',
  walls: false,
  palette: {
    topA: '#3a3328', topB: '#332c22',
    sideSW: '#14100a', sideSE: '#1e1810',
    line: 'rgba(8,6,3,0.55)',
    wallN: '#241f16', wallW: '#2c261b', wallTrim: '#0f0c07',
  },
};

// The square outside: bright cobblestone plaza, open sky — no walls, the
// boundary is the market's own clutter and the void beyond.
const SQUARE_KIT = {
  floor: 'fantasy_c22_cobblestonefloor',
  walls: false,
  palette: {
    topA: '#9a9083', topB: '#8f8578',
    sideSW: '#4f483e', sideSE: '#5f574b',
    line: 'rgba(40,34,26,0.40)',
    wallN: '#7c7266', wallW: '#8a8073', wallTrim: '#4a4238',
  },
};

// Multi-level feast hall (matches .gg/reference/tavern.png structure): a
// LOWER plank dining floor (front/south + west) wrapping a RAISED bar
// platform along the north band and the east storage bay. Every drop is a
// single step, so the engine auto-stairs the edges and the gray riser faces
// read as the reference's stone retaining walls.
const TAVERN = [
  'xxxxxxxxxxxxx',
  'x11111111111x', // y1: raised bar platform (behind the counter)
  'x11111111111x', // y2: platform — the bar counter sits on this front edge
  'x00000000011x', // y3..y6: dining floor, east bay (x10-11) stays raised
  'x00000000011x',
  'x00000000011x',
  'x00000000011x',
  'x00000000000x', // y7..y10: the open lower feast floor
  'x00000000000x',
  'x00000000000x',
  'x00000000000x',
  'xxxxxxxxxxxxx',
];

// The Old Town Square — the village yard outside the tavern, laid out like
// the classic Fantasy Village rooms: the guild hall's clock tower and gate
// along the west, the timber-framed tavern row along the north, the market
// under its awnings to the east, a dirt training yard SW and the green
// tree-corner SE. A paved apron juts south — the way in from the road.
const SQUARE = [
  'xxxxxxxxxxxxxxx',
  'x0000000000000x',
  'x0000000000000x',
  'x0000000000000x',
  'x0000000000000x',
  'x0000000000000x',
  'x0000000000000x',
  'x0000000000000x',
  'x0000000000000x',
  'x0000000000000x',
  'x0000000000000x',
  'xxxx000000xxxxx',
  'xxxxxxxxxxxxxxx',
];

// The Mirkwood — 26×20 walkable at half scale. Three pools break the floor
// (a spring in the west, a dark tarn NE, a marsh SE), a low mossy rise
// carries the fairy glade north-centre, and a dirt trail winds from the
// southern arrow up to the glade.
const MIRKWOOD = [
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'x00000000000000000000000000x',
  'x00000000000000000000000000x',
  'x00000000000000000000000000x',
  'x00000000000111100000xx0000x',
  'x00000000000111100000xx0000x',
  'x00000000000111100000000000x',
  'x00000000000000000000000000x',
  'x000xxx00000000000000000000x',
  'x000xxx00000000000000000000x',
  'x00000000000000000000000000x',
  'x00000000000000000000000000x',
  'x00000000000000000000000000x',
  'x00000000000000000000000000x',
  'x00000000000000000000000000x',
  'x000000000000000000xxx00000x',
  'x000000000000000000xxx00000x',
  'x00000000000000000000000000x',
  'x00000000000000000000000000x',
  'x00000000000000000000000000x',
  'x00000000000000000000000000x',
  'xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
];

// The treeline: a solid ring of old trees just inside the void border, with
// one gap in the south wall where the trail (and the arrow home) comes in.
// Mostly bare gray birches, every third a black-green fir — a dead palisade.
function mirkwoodTreeline() {
  const trees = [];
  const tree = (x, y, i) => ({ id: i % 3 === 2 ? 'easter_c20_foresttree' : 'hween_c19_birchtree', x, y, dir: i % 2 ? 0 : 2 });
  let i = 0;
  for (let x = 1; x <= 26; x += 2) {
    trees.push(tree(x, 1, i++));
    if (x < 13 || x > 15) trees.push(tree(x, 20, i++)); // southern gap: the way home
  }
  for (let y = 3; y <= 18; y += 2) {
    trees.push(tree(1, y, i++));
    trees.push(tree(26, y, i++));
  }
  return trees;
}

// The wood's wildlife: low-level, harmless, quick to respawn — an XP trickle
// for wanderers. They never fight back (exploreController.strike→kill).
// Palette matches the gloom: ashen spiders, black carrion birds, bog frogs.
const MIRKWOOD_CRITTERS = [
  {
    look: { pet: 'spider', tint: '#7a7288' }, name: 'Forest Spiderling',
    hp: 6, xp: 3, respawnMs: 12000,
    spawns: [{ x: 17, y: 9 }, { x: 20, y: 10 }, { x: 22, y: 12 }, { x: 16, y: 12 }],
  },
  {
    look: { pet: 'frog', tint: '#8a9464' }, name: 'Bog Frog',
    hp: 4, xp: 2, respawnMs: 9000,
    spawns: [{ x: 5, y: 11 }, { x: 20, y: 7 }, { x: 18, y: 17 }],
  },
  {
    look: { pet: 'pigeonevil' }, name: 'Crebain',
    hp: 3, xp: 2, respawnMs: 8000,
    spawns: [{ x: 6, y: 4 }, { x: 22, y: 17 }, { x: 10, y: 17 }],
  },
  {
    look: { pet: 'turtle', tint: '#7d8570' }, name: 'Murk-Shell Turtle',
    hp: 8, xp: 4, respawnMs: 15000,
    spawns: [{ x: 3, y: 10 }, { x: 17, y: 14 }],
  },
];

// layouts: optional { roomId: [prop,...] } overrides from the server
// (admin-arranged furniture); rooms not present keep their defaults.
export function buildRooms(layouts = {}) {
  const rooms = [
    new Room({
      id: 'tavern',
      name: 'The Poisoned Toad',
      zoom: 1,
      heightmap: TAVERN,
      spawn: { x: 6, y: 7 },
      spawnDir: 0, // facing the bar
      kit: TAVERN_KIT,
      props: withSeats([
        // ==== PASS 2: big fixed pieces on the Pass-1 multi-level shell ====
        // ---- the raised bar: keeper behind a STONE COUNTER masking the
        // platform's front stairs; one gap (x5-6) left as the step down.
        { id: 'fantasy_c22_craftsman', x: 3, y: 1, dir: 0 }, // the keeper behind the counter
        { id: 'vikings_stonecrn', x: 1, y: 2, dir: 0 }, // counter's west corner
        { id: 'vikings_stonedivdr', x: 2, y: 2, dir: 0 }, // counter run (2-wide each)
        { id: 'vikings_stonedivdr', x: 4, y: 2, dir: 0 },
        { id: 'vikings_stonedivdr', x: 7, y: 2, dir: 0 },
        { id: 'vikings_stonedivdr', x: 9, y: 2, dir: 0 },
        // stacked ale casks on the platform behind the bar (the back tower)
        { id: 'fantasy_c22_barrel', x: 6, y: 1, dir: 0 },
        { id: 'fantasy_c22_barrel', x: 7, y: 1, dir: 2 },
        // ---- the EAST storage bay (raised): stone-walled edge, casks + cat
        { id: 'vikings_stonedivdr', x: 10, y: 3, dir: 2 }, // bay's west wall (2-tall)
        // the wall turns east along the bay's south edge instead of running on
        // down the column: two 2-tall sections would seal (10,6), and that tile
        // is the room's ONLY step down to the southern dining floor — where the
        // feast table, its stools and the exit arrow are. The seal was invisible
        // while footprints were hand-authored a tile off (this divider claimed
        // its anchor alone); deriving them from the furni's real 2x1 dims made
        // the wall solid and stranded half the tavern.
        { id: 'vikings_stonedivdr', x: 10, y: 5, dir: 0 }, // corner: (10,5)+(11,5)
        { id: 'fantasy_c22_barrel', x: 11, y: 4, dir: 0 },
        { id: 'fantasy_c22_barrel', x: 11, y: 5, dir: 2 },
        { id: 'easter_c19_habshirecat', x: 11, y: 3, dir: 2 }, // cat perched on the casks
        // ---- BANNERS: red Steelscar crests on the west wall, teal on the back
        { id: 'vikings_flag_r', x: 1, y: 4, dir: 2 },
        { id: 'vikings_flag_r', x: 1, y: 7, dir: 2 },
        { id: 'vikings_flag_g', x: 5, y: 1, dir: 2 },
        { id: 'vikings_flag_g', x: 9, y: 1, dir: 2 },
        // ---- CHANDELIERS: iron candle-trees over the dining floor (no ceiling
        // mount in-engine, so they stand tall from the floor — closest match)
        { id: 'gothic_c15_chandelier', x: 3, y: 8, dir: 0 },
        { id: 'gothic_c15_chandelier', x: 7, y: 5, dir: 0 },
        // ==== PASS 3: furniture ====
        // ---- WEST: two round bistro tables with ladderback chairs
        { id: 'hween_c19_bewitchedtable', x: 2, y: 5, dir: 0 },
        { id: 'vikings_chair_r', x: 3, y: 5, dir: 6, sit: 0.25 },
        { id: 'vikings_chair_r', x: 2, y: 6, dir: 0, sit: 0.25 },
        { id: 'hween_c19_bewitchedtable', x: 2, y: 8, dir: 0 },
        { id: 'vikings_chair_r', x: 3, y: 8, dir: 6, sit: 0.25 },
        { id: 'vikings_chair_r', x: 2, y: 9, dir: 0, sit: 0.25 },
        // ---- CENTRE-SOUTH: the long feast table, benches drawn up both sides
        { id: 'vikings_table_r', x: 5, y: 8, dir: 0 },
        { id: 'vikings_stool', x: 5, y: 7, dir: 2 },
        { id: 'vikings_stool', x: 6, y: 7, dir: 2 },
        { id: 'vikings_stool', x: 7, y: 7, dir: 2 },
        { id: 'vikings_stool', x: 5, y: 9, dir: 0 },
        { id: 'vikings_stool', x: 6, y: 9, dir: 0 },
        { id: 'vikings_stool', x: 7, y: 9, dir: 0 },
        // feast spread on the long table: roast platters + bread + ale. They
        // are listed AFTER the table on purpose — layout order is stacking
        // order (room.restack), so they land on its 1.1-high top. No hand
        // `lift`: an eyeballed 0.45 used to be written here and was silently
        // dropped by the first admin re-save, which is how the feast ended up
        // served on the floorboards.
        { id: 'picnic_food3', x: 5, y: 8, dir: 0 },
        { id: 'picnic_food1', x: 6, y: 8, dir: 0 },
        { id: 'fantasy_c22_sweetrolls', x: 7, y: 8, dir: 0 },
        // ==== PASS 4: lighting + small props ====
        // floor candelabra flanking the feast table + by the round tables
        { id: 'gothiccandelabra', x: 4, y: 8, dir: 0 },
        { id: 'gothiccandelabra', x: 8, y: 8, dir: 0 },
        { id: 'gothiccandelabra', x: 4, y: 6, dir: 0 },
        // wall torches for warm pools of light
        { id: 'vikings_torch', x: 1, y: 3, dir: 2 },
        { id: 'vikings_torch', x: 11, y: 7, dir: 2 },
        // ale + bread laid out along the counter gap
        { id: 'fantasy_c22_frothydrink', x: 5, y: 2, dir: 0 },
        { id: 'fantasy_c22_frothydrink', x: 6, y: 2, dir: 0 },
        { id: 'fantasy_c22_sweetrolls', x: 5, y: 1, dir: 0 },
        // herbs drying behind the bar
        { id: 'fantasy_c22_herbs', x: 8, y: 1, dir: 2 },
        // a wolfhound lounging on the feast floor + candle clusters
        { id: 'easter_c19_wolf', x: 9, y: 9, dir: 2 },
        { id: 'gothic_candles', x: 9, y: 7, dir: 0 },
        { id: 'gothic_candles', x: 1, y: 9, dir: 0 },
        // ---- door out to the courtyard (auto-paired by wireArrows)
        { id: 'rp_arrow', x: 6, y: 10, dir: 4, walk: true },
      ]),
    }),
    new Room({
      id: 'square',
      name: 'The Old Town Square',
      zoom: 1,
      heightmap: SQUARE,
      spawn: { x: 6, y: 11 },
      spawnDir: 0, // walking in from the south road
      kit: SQUARE_KIT,
      props: withSeats([
        // ---- WEST: the guild hall front — wall, clock tower, gate, balcony
        { id: 'fantasy_c22_building1', x: 1, y: 1, dir: 2 },
        { id: 'fantasy_c22_guildhall', x: 1, y: 3, dir: 2 },
        // the dungeon gate: wireGates makes it walkable + aims it (GATE_FURNI)
        { id: 'fantasy_c22_archway', x: 1, y: 5, dir: 2 },
        { id: 'fantasy_c22_balcony', x: 1, y: 7, dir: 2 },
        { id: 'fantasy_c22_shopsigns', x: 1, y: 9, dir: 2 },
        { id: 'fantasy_c22_barrel', x: 1, y: 10, dir: 2 },
        // ---- NORTH: the timber-framed tavern row, thatch side of the square
        { id: 'fantasy_c22_tavern', x: 2, y: 1, dir: 0 },
        { id: 'fantasy_c22_building2', x: 4, y: 1, dir: 0 },
        { id: 'fantasy_c22_building1', x: 6, y: 1, dir: 0 },
        { id: 'fantasy_c22_building1', x: 8, y: 1, dir: 0 },
        // the Gatekeeper (money tree NPC) fills the row's open NE bay
        { id: 'neopets_c25_moneytree', x: 10, y: 1, dir: 0 },
        // bunting strung across the tavern front
        { id: 'fantasy_c22_hangingflags', x: 6, y: 2, dir: 0, walk: true },
        // ---- RP arrow in at the tavern door (explicit — three rooms share
        // the arrow network now, round-robin would mis-pair this one)
        { id: 'rp_arrow', x: 5, y: 2, dir: 0, walk: true, teleport: { room: 'tavern' } },
        // ---- EAST: the market under its awnings
        { id: 'fantasy_c22_marketstall', x: 8, y: 3, dir: 0 },
        { id: 'fantasy_c22_marketgoods', x: 8, y: 4, dir: 0 },
        { id: 'fantasy_c22_marketgoods', x: 9, y: 4, dir: 2 },
        { id: 'fantasy_c22_strawcanopy', x: 10, y: 3, dir: 0 },
        // ---- SE: the green corner — grass and the bright tree
        { id: 'neopets_c25_grass', x: 12, y: 1, dir: 0, walk: true },
        { id: 'neopets_c25_grass', x: 12, y: 3, dir: 0, walk: true },
        { id: 'neopets_c25_grass', x: 12, y: 5, dir: 0, walk: true },
        { id: 'fantasy_c22_tree', x: 13, y: 4, dir: 0 },
        // ---- RP arrow into the Mirkwood, on the path below the green corner
        // (the fenced grass itself is decorative — the arrow stays reachable)
        { id: 'rp_arrow', x: 13, y: 7, dir: 4, walk: true, teleport: { room: 'mirkwood' } },
        { id: 'nft_h25_flowers5', x: 12, y: 5, dir: 0 },
        { id: 'easter_c20_mossydivider', x: 12, y: 6, dir: 0 },
        { id: 'easter_c20_mossydivider', x: 13, y: 6, dir: 0 },
        { id: 'fantasy_c22_barrel', x: 11, y: 6, dir: 0 },
        // ---- SW: the dirt training yard
        { id: 'hblooza_dirtfloor', x: 2, y: 6, dir: 0, walk: true },
        { id: 'hblooza_dirtfloor', x: 4, y: 6, dir: 0, walk: true },
        { id: 'hblooza_dirtfloor', x: 2, y: 8, dir: 0, walk: true },
        { id: 'hblooza_dirtfloor', x: 4, y: 8, dir: 0, walk: true },
        { id: 'hblooza_dirtfloor', x: 3, y: 7, dir: 0, walk: true },
        { id: 'hween_c25_weed1', x: 3, y: 7, dir: 0, walk: true },
        { id: 'hween_c25_weed1', x: 4, y: 9, dir: 0, walk: true },
        { id: 'fantasy_c22_goblin', x: 2, y: 5, dir: 2 },
        { id: 'fantasy_c22_trainingdummy', x: 5, y: 6, dir: 2 },
        { id: 'fantasy_c22_trainingtarget', x: 3, y: 9, dir: 0 },
        { id: 'fantasy_c22_trainingtarget', x: 5, y: 9, dir: 0 },
        { id: 'fantasy_c22_arrows', x: 2, y: 9, dir: 0 },
        { id: 'easter_c20_mossydivider', x: 2, y: 10, dir: 0 },
        { id: 'easter_c20_mossydivider', x: 3, y: 10, dir: 0 },
        // ---- CENTRE: the paved court + drain, the road south
        { id: 'country_patio', x: 6, y: 5, dir: 0, walk: true }, { id: 'country_patio', x: 7, y: 5, dir: 0, walk: true },
        { id: 'country_patio', x: 8, y: 5, dir: 0, walk: true }, { id: 'country_patio', x: 9, y: 5, dir: 0, walk: true },
        { id: 'country_patio', x: 6, y: 6, dir: 0, walk: true }, { id: 'country_patio', x: 7, y: 6, dir: 0, walk: true },
        { id: 'country_patio', x: 8, y: 6, dir: 0, walk: true }, { id: 'country_patio', x: 9, y: 6, dir: 0, walk: true },
        { id: 'country_patio', x: 6, y: 7, dir: 0, walk: true }, { id: 'country_patio', x: 7, y: 7, dir: 0, walk: true },
        { id: 'country_patio', x: 8, y: 7, dir: 0, walk: true }, { id: 'country_patio', x: 9, y: 7, dir: 0, walk: true },
        { id: 'country_patio', x: 6, y: 8, dir: 0, walk: true }, { id: 'country_patio', x: 7, y: 8, dir: 0, walk: true },
        { id: 'country_patio', x: 8, y: 8, dir: 0, walk: true }, { id: 'country_patio', x: 9, y: 8, dir: 0, walk: true },
        { id: 'fantasy_c22_sewers', x: 6, y: 10, dir: 0, walk: true },
        // ---- the guild's quest board by the south entrance
        { id: 'fantasy_c22_adventureboard', x: 10, y: 10, dir: 0 },
      ]),
    }),
    new Room({
      id: 'mirkwood',
      name: 'Fogwood Forest',
      zoom: 0.5, // public-room scale: half-size tiles, furni and avatars
      heightmap: MIRKWOOD,
      spawn: { x: 14, y: 19 },
      spawnDir: 0, // stepping in from the southern gap, facing the deep wood
      kit: MIRKWOOD_KIT,
      critters: MIRKWOOD_CRITTERS,
      props: withSeats([
        ...mirkwoodTreeline(),
        // ---- the trail: dirt path winding from the southern gap to the shrine
        { id: 'easter_c19_dirtpath', x: 14, y: 17, dir: 0, walk: true },
        { id: 'easter_c19_dirtpath', x: 14, y: 15, dir: 0, walk: true },
        { id: 'easter_c19_dirtpath', x: 13, y: 13, dir: 0, walk: true },
        { id: 'easter_c19_dirtpath', x: 13, y: 11, dir: 0, walk: true },
        { id: 'easter_c19_dirtpath', x: 14, y: 9, dir: 0, walk: true },
        { id: 'easter_c19_dirtpath', x: 14, y: 7, dir: 0, walk: true },
        // ---- the wisp shrine on the rise (the trail's destination): standing
        // stones, will-o-wisp light, starry ground — beautiful but WRONG
        { id: 'easter_c20_waypointrocks', x: 12, y: 4, dir: 2 },
        { id: 'wisp_c23_willowisp', x: 14, y: 4, dir: 2 },
        { id: 'easter_c20_darkrock1', x: 15, y: 5, dir: 2 },
        { id: 'wisp_c23_starryfloor', x: 13, y: 5, dir: 0, walk: true },
        { id: 'wisp_c23_starryfloor', x: 14, y: 5, dir: 0, walk: true },
        { id: 'wisp_c23_lilwisp', x: 11, y: 7, dir: 2 },
        { id: 'wisp_c23_lilwisp', x: 16, y: 7, dir: 2 },
        // ---- the west spring: the old willow over black water
        { id: 'hween_r19_weepingwillow', x: 2, y: 6, dir: 0 },
        { id: 'easter_c20_fishstream', x: 7, y: 8, dir: 0 },
        { id: 'hween_c25_bedofmushrooms', x: 5, y: 10, dir: 0 },
        { id: 'easter_c20_darkrock', x: 5, y: 5, dir: 2 },
        { id: 'hween_c25_weed2', x: 4, y: 12, dir: 2, walk: true },
        { id: 'hween_c25_weed1', x: 5, y: 13, dir: 2, walk: true },
        // the springside is thick with overgrowth: weed clumps + mossy ground
        { id: 'hween_c25_mossyfloor', x: 3, y: 15, dir: 0, walk: true },
        { id: 'hween_c25_weed3', x: 2, y: 13, dir: 2, walk: true },
        { id: 'hween_c25_weed1', x: 5, y: 16, dir: 2, walk: true },
        { id: 'hween_c25_weed2', x: 3, y: 17, dir: 2, walk: true },
        { id: 'hween_c25_bedofmushrooms', x: 6, y: 18, dir: 0 },
        // ---- the dark east wood: spider country, close-planted, root-choked
        { id: 'hween_c19_birchtree', x: 18, y: 8, dir: 2 },
        { id: 'hween_c19_birchtree', x: 19, y: 9, dir: 0 },
        { id: 'easter_c20_foresttree', x: 17, y: 10, dir: 2 },
        { id: 'hween_c19_birchtree', x: 19, y: 11, dir: 2 },
        { id: 'hween_c19_birchtree', x: 18, y: 12, dir: 0 },
        { id: 'easter_c20_foresttree', x: 21, y: 12, dir: 2 },
        { id: 'hween_c19_birchtree', x: 23, y: 9, dir: 2 },
        { id: 'hween_c19_birchtree', x: 24, y: 7, dir: 0 },
        { id: 'hween_c17_hangingroots', x: 20, y: 8, dir: 0 },
        { id: 'hween_c17_lichen', x: 21, y: 8, dir: 0, walk: true },
        { id: 'easter_c20_scatteredforestfloor', x: 17, y: 11, dir: 0, walk: true },
        // the spiders nest in the weeds: tall foxglove + trailing vines choke it
        { id: 'hween_c25_weed2', x: 22, y: 10, dir: 2, walk: true },
        { id: 'hween_c25_weed3', x: 24, y: 11, dir: 2, walk: true },
        { id: 'hween_c25_weed1', x: 16, y: 10, dir: 2, walk: true },
        { id: 'hween_c25_weed2', x: 25, y: 8, dir: 2, walk: true },
        // ---- the NE tarn's rim: drowned stones, sick growth
        { id: 'easter_c20_waypointrocks', x: 19, y: 4, dir: 2 },
        { id: 'easter_c20_darkrock', x: 24, y: 5, dir: 2 },
        { id: 'easter_c19_mushrooms', x: 17, y: 3, dir: 2, walk: true },
        { id: 'hween_c17_lichen', x: 22, y: 2, dir: 0, walk: true },
        { id: 'hween_c25_weed1', x: 25, y: 4, dir: 2, walk: true },
        { id: 'hween_c25_weed3', x: 25, y: 6, dir: 2, walk: true },
        { id: 'hween_c25_mossyfloor', x: 15, y: 3, dir: 0, walk: true },
        { id: 'easter_c20_scatteredforestfloor', x: 22, y: 2, dir: 0, walk: true },
        // ---- mid-wood: dead falls and mushroom rings
        { id: 'hween_c25_weed3', x: 8, y: 3, dir: 2, walk: true },
        { id: 'hween_c25_weed1', x: 9, y: 4, dir: 2, walk: true },
        { id: 'hween_c25_weed2', x: 2, y: 4, dir: 2, walk: true },
        { id: 'hween_c25_weed1', x: 4, y: 3, dir: 2, walk: true },
        { id: 'hween_c17_shroomthing', x: 7, y: 6, dir: 2 },
        { id: 'easter_c20_rockboulders', x: 8, y: 13, dir: 2 },
        { id: 'easter_c20_waypointrocks', x: 10, y: 11, dir: 2 },
        { id: 'easter_c20_darkrock1', x: 19, y: 13, dir: 2 },
        { id: 'easter_c20_rockboulders', x: 21, y: 6, dir: 2 },
        { id: 'hween_c25_weed3', x: 11, y: 11, dir: 2, walk: true },
        { id: 'hween_c25_weed2', x: 12, y: 12, dir: 2, walk: true },
        { id: 'hween_c25_mossyfloor', x: 6, y: 11, dir: 0, walk: true },
        { id: 'hween_c25_bedofmushrooms', x: 9, y: 9, dir: 0 },
        { id: 'hween_c19_birchtree', x: 6, y: 15, dir: 2 },
        { id: 'hween_c19_birchtree', x: 9, y: 14, dir: 0 },
        { id: 'hween_c19_birchtree', x: 11, y: 3, dir: 2 },
        // ---- the SE marsh: black water, drowned weeds
        { id: 'easter_c20_fishstream', x: 22, y: 15, dir: 0 },
        { id: 'easter_c19_mushrooms', x: 20, y: 18, dir: 2, walk: true },
        { id: 'hween_c25_weed2', x: 11, y: 16, dir: 2, walk: true },
        { id: 'hween_c25_weed3', x: 24, y: 18, dir: 2, walk: true },
        { id: 'hween_c17_lichen', x: 25, y: 19, dir: 0, walk: true },
        { id: 'hween_c25_weed1', x: 24, y: 16, dir: 2, walk: true },
        { id: 'hween_c25_bedofmushrooms', x: 21, y: 18, dir: 0 },
        { id: 'hween_c25_weed2', x: 16, y: 14, dir: 2, walk: true },
        // ---- the south wood, flanking the trail
        { id: 'hween_c19_birchtree', x: 10, y: 18, dir: 2 },
        { id: 'hween_c19_birchtree', x: 18, y: 19, dir: 0 },
        { id: 'easter_c20_darkrock', x: 23, y: 14, dir: 2 },
        { id: 'hween_c17_shroomthing', x: 25, y: 16, dir: 2 },
        { id: 'easter_c20_scatteredforestfloor', x: 7, y: 18, dir: 0, walk: true },
        // ---- fallen country logs strewn through the wood (part of the room
        // build so they're permanent + always render crisp at big-room scale)
        { id: 'country_log', x: 1, y: 2, dir: 0 },
        { id: 'country_log', x: 20, y: 2, dir: 2 },
        { id: 'country_log', x: 20, y: 13, dir: 0 },
        { id: 'country_log', x: 7, y: 14, dir: 0 },
        { id: 'country_log', x: 4, y: 18, dir: 2 },
        // ---- RP arrow home, in the southern treeline gap
        { id: 'rp_arrow', x: 14, y: 20, dir: 4, walk: true, teleport: { room: 'square' } },
      ]),
    }),
  ];
  return wireNpcs(wireGates(wireArrows(
    rooms.map((r) => {
      const saved = layouts[r.id];
      if (!Array.isArray(saved)) return r;
      // Walking room bots share the saved layout array but are NOT props: pull
      // them out before withSeats/wireArrows/wireGates/wireNpcs ever see them.
      const { props, bots } = splitBots(saved.map((p) => ({ ...p })));
      return new Room({
        id: r.id, name: r.name, zoom: r.zoom, heightmap: r.rows,
        spawn: r.spawn, spawnDir: r.spawnDir, kit: r.kit, critters: r.critters,
        props: withSeats(props), bots,
      });
    })
  )));
}
