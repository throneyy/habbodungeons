import { Room } from './room.js';
import { Unit } from './units.js';
import { monsterSprites, figureSprites, furniSprites } from './monsterSprites.js';
import { generateEncounter } from './encounterGen.js';
import { decorate } from './decorGen.js';

// The M1/M2 dungeon: "The Dungeon" — five nodes,
// battle → event → battle → event → boss. Battle rooms are built
// programmatically (loops, not hand-typed heightmaps) so tile counts can't
// drift. All guest-scale (zoom 1) so the Habbo avatars read at full size.

export const DUNGEON_ID = 'dungeon';
export const EVENT_NODE_INDICES = [1, 3];

// ---- room builders ---------------------------------------------------------

// The Dungeon's visual kit (pure DATA): real Dungeon-line flagstone floor
// art on every tile, a dark-stone palette for the procedural stairs/sides,
// and classic boundary walls. Rooms that build their own walls from furni
// (the rampart) switch the procedural ones off.
const DUNGEON_KIT = {
  floor: 'dng_floor',
  walls: { height: 3.4 },
  palette: {
    topA: '#565a63', topB: '#4e525a', // stair tops sit near the flagstone tone
    sideSW: '#23262d', sideSE: '#32363f',
    line: 'rgba(8,9,12,0.45)',
    wallN: '#3b3744', wallW: '#4b4657', wallTrim: '#211d29',
  },
};
const KIT_NO_WALLS = { ...DUNGEON_KIT, walls: false };

function grid(w, h, fill = '0') {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
}
function border(rows) {
  const h = rows.length;
  const w = rows[0].length;
  for (let x = 0; x < w; x++) {
    rows[0][x] = 'x';
    rows[h - 1][x] = 'x';
  }
  for (let y = 0; y < h; y++) {
    rows[y][0] = 'x';
    rows[y][w - 1] = 'x';
  }
  return rows;
}
function toStrings(rows) {
  return rows.map((r) => r.join(''));
}

// Battle 1 — The Broken Undercroft: the keep's entry hall. A raised landing
// spans the north end (auto-stairs down its whole lip) framed by twin gothic
// portcullises and watch towers; a gothic-carpet processional aisle runs from
// the south doors to the stairs past a fallen knight of the garrison. The
// hall's SE wing has collapsed into the dark — a ragged void bite rimmed with
// hanging roots, dripping rock and a gibbet swinging over the drop — and the
// old chapel alcove (height 2, one stair up) still guards the garrison's
// chest: climb it to loot the cache.
function antechamber() {
  const rows = border(grid(16, 13));
  // the north landing — height 1 across the full width, stairs all along it
  for (let y = 1; y <= 2; y++) for (let x = 1; x <= 14; x++) rows[y][x] = '1';
  // the west chapel alcove — height 2 (sheer), one height-1 step at its foot
  for (let y = 5; y <= 7; y++) for (let x = 1; x <= 3; x++) rows[y][x] = '2';
  rows[8][2] = '1'; // the chapel step
  // the SE collapse — a ragged diagonal void bite eating the wing
  for (const [y, x0] of [[5, 14], [6, 13], [7, 13], [8, 11], [9, 11], [10, 9], [11, 8]])
    for (let x = x0; x <= 14; x++) rows[y][x] = 'x';
  return new Room({
    id: 'antechamber', name: 'The Broken Undercroft', zoom: 1, heightmap: toStrings(rows), kit: DUNGEON_KIT,
    spawn: { x: 6, y: 10 }, spawnDir: 0,
    props: [
      // ---- the landing: towers at the corners, twin gates, honor statues
      { id: 'gothic_c15_tower', x: 1, y: 1, dir: 0 },
      { id: 'gothgate', x: 3, y: 1, dir: 0 },
      { id: 'sp_statue', x: 6, y: 1, dir: 0 },
      { id: 'gothic_bowl', x: 7, y: 1, dir: 0 },
      { id: 'gothic_bowl', x: 8, y: 1, dir: 0 },
      { id: 'sp_statue', x: 9, y: 1, dir: 0 },
      { id: 'gothgate', x: 10, y: 1, dir: 0 },
      { id: 'gothic_c15_tower', x: 14, y: 1, dir: 0 },
      // railings cap the landing's outer lip; the middle stays climbable
      { id: 'gothrailing', x: 1, y: 2, dir: 0 },
      { id: 'gothrailing', x: 13, y: 2, dir: 0 },
      // ---- the processional aisle: carpet lane from the doors to the stairs
      { id: 'gothic_carpet', x: 6, y: 4, dir: 0, walk: true },
      { id: 'gothic_carpet', x: 6, y: 8, dir: 0, walk: true },
      { id: 'gothiccandelabra', x: 5, y: 4, dir: 0 },
      { id: 'gothiccandelabra', x: 8, y: 4, dir: 2 },
      { id: 'gothiccandelabra', x: 5, y: 9, dir: 0 },
      { id: 'gothiccandelabra', x: 8, y: 9, dir: 2 },
      // a knight of the garrison, dead where he knelt beside the carpet
      { id: 'hween_c17_thefallen', x: 8, y: 6, dir: 0 },
      // ---- the chapel alcove: the chest, its light, and the cache
      { id: 'sw_chest', x: 1, y: 5, dir: 0 },
      { id: 'hween12_lantern', x: 3, y: 5, dir: 0 },
      { id: 'dng_treasure2', x: 2, y: 6, dir: 0, walk: true },
      // ---- the west wall: a cage, a lantern, a coffin stood by the doors
      { id: 'hween12_cage', x: 1, y: 3, dir: 0 },
      { id: 'hween12_lantern', x: 1, y: 8, dir: 0 },
      { id: 'hween12_coffin', x: 1, y: 10, dir: 0 },
      // ---- under the landing's east end: the dungeon's welcome
      { id: 'hween12_cage', x: 13, y: 3, dir: 0 },
      { id: 'hween12_coffin', x: 14, y: 3, dir: 0 },
      // ---- the collapse: cave floor creeping in, rubble, rim dressing
      { id: 'hween_c17_cavefloor', x: 11, y: 4, dir: 0, walk: true },
      { id: 'hween_c17_cavefloor', x: 9, y: 8, dir: 0, walk: true },
      { id: 'hween_c17_hangingroots', x: 13, y: 5, dir: 0 },
      { id: 'hween_c17_rockdrip', x: 12, y: 6, dir: 0 },
      { id: 'hween_c17_gibbet', x: 12, y: 7, dir: 0 },
      { id: 'hween_c17_rock2', x: 11, y: 7, dir: 2 },
      { id: 'dng_block', x: 10, y: 8, dir: 2 },
      { id: 'hween_c17_fallingrocks', x: 10, y: 9, dir: 0 },
      { id: 'hween_c17_mimic', x: 8, y: 10, dir: 2 },
    ],
    effects: [
      { x: 2, y: 6, kind: 'treasure', gold: 20, label: 'the chapel cache' },
    ],
  });
}

// Battle 2 — The Sundered Nave: a drowned cathedral split corner to corner
// by a chasm. The raised choir (height 1, pillared colonnade + a stone
// guardian between twin fonts) survives across the dark; the only ways over
// are two one-tile spans with spike traps waiting at their near mouths.
// Railings cap the choir rim beside each bridgehead so the spans — not the
// rim — are the only climbs. An old bonfire smoulders mid-camp: the
// defensible ground for the survive-3-turns stand.
function sunkenNave() {
  const rows = border(grid(17, 13));
  // the chasm — a ragged 2-3 wide void band cutting NW -> SE; columns 4 and
  // 11 are the surviving spans (left as floor)
  const CHASM = {
    1: [4, 5], 2: [4, 5], 3: [4, 5, 6], 5: [5, 6], 6: [5, 6], 7: [5, 6, 7],
    8: [6, 7], 9: [6, 7], 10: [6, 7, 8], 12: [7, 8], 13: [7, 8], 14: [7, 8, 9], 15: [8, 9],
  };
  // the choir — everything north of the chasm rides one step up (the spans
  // stay at floor height: their head tile auto-stairs onto the choir)
  const CHOIR_TOP = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 4, 6: 4, 7: 4, 8: 5, 9: 5, 10: 5, 11: 5, 12: 6, 13: 6, 14: 6, 15: 7 };
  for (let x = 1; x <= 15; x++) {
    for (let y = 1; y <= CHOIR_TOP[x]; y++) rows[y][x] = '1';
    for (const y of CHASM[x] || []) rows[y][x] = 'x';
  }
  return new Room({
    id: 'nave', name: 'The Sundered Nave', zoom: 1, heightmap: toStrings(rows), kit: DUNGEON_KIT,
    spawn: { x: 5, y: 10 }, spawnDir: 0,
    props: [
      // ---- the choir: colonnade along the back wall
      { id: 'hween_c17_pillar', x: 2, y: 1, dir: 0 },
      { id: 'hween_c17_pillar', x: 5, y: 1, dir: 0 },
      { id: 'hween_c17_pillar', x: 8, y: 1, dir: 0 },
      { id: 'hween_c17_pillar', x: 11, y: 1, dir: 0 },
      { id: 'hween_c17_pillar', x: 14, y: 1, dir: 0 },
      // the drowned altar: a stone guardian between twin fonts
      { id: 'gothic_bowl', x: 7, y: 2, dir: 0 },
      { id: 'sp_statue', x: 8, y: 2, dir: 0 },
      { id: 'gothic_bowl', x: 9, y: 2, dir: 0 },
      // relics of the old rites on the choir wings
      { id: 'fantasy_c22_rune', x: 1, y: 1, dir: 0 },
      { id: 'hween12_lantern', x: 15, y: 1, dir: 0 },
      { id: 'fantasy_c22_crystal', x: 15, y: 3, dir: 2 },
      // the choir's east wing: the processional carpet, mouldering in place
      { id: 'gothic_carpet', x: 11, y: 2, dir: 2, walk: true },
      // railings cap the choir rim beside each bridgehead
      { id: 'gothrailing', x: 5, y: 4, dir: 0 },
      { id: 'gothrailing', x: 12, y: 6, dir: 0 },
      // ---- the chasm rim: roots, drip, rubble and a rockfall
      { id: 'hween_c17_fallingrocks', x: 5, y: 7, dir: 0 },
      { id: 'hween_c17_rock2', x: 6, y: 7, dir: 2 },
      { id: 'hween_c17_hangingroots', x: 7, y: 8, dir: 0 },
      { id: 'dng_block', x: 12, y: 9, dir: 2 },
      { id: 'hween_c17_rockdrip', x: 14, y: 10, dir: 0 },
      // ---- the bridge mouths: cave floor creeping out of the dark + traps
      { id: 'hween_c17_cavefloor', x: 3, y: 7, dir: 0, walk: true },
      { id: 'hween_c17_cavefloor', x: 10, y: 9, dir: 0, walk: true },
      { id: 'hween_c17_spiketrap', x: 4, y: 6, dir: 0, walk: true },
      { id: 'hween_c17_spiketrap', x: 11, y: 9, dir: 0, walk: true },
      // ---- the camp: the survivors' bonfire and what they left behind
      { id: 'hween_c17_bonfire', x: 7, y: 9, dir: 0, walk: true },
      { id: 'gothiccandelabra', x: 3, y: 8, dir: 0 },
      { id: 'gothiccandelabra', x: 8, y: 8, dir: 2 },
      { id: 'fantasy_c22_rune', x: 1, y: 7, dir: 0 },
      { id: 'fantasy_c22_crystal', x: 1, y: 10, dir: 0 },
      { id: 'hween12_coffin', x: 15, y: 10, dir: 0 },
      { id: 'dng_block', x: 13, y: 10, dir: 2 },
    ],
    effects: [
      { x: 4, y: 6, kind: 'hazard', dmg: 5, label: 'a spike trap' },
      { x: 11, y: 9, kind: 'hazard', dmg: 5, label: 'a spike trap' },
      { x: 7, y: 9, kind: 'hazard', dmg: 4, when: 'endTurn', label: 'the bonfire' },
    ],
  });
}

// Battle 3 (boss) — The Dread Cathedral: a cathedral-scale throne hall. The
// Cursed Throne crowns a height-2 dais whose ONLY approach is the 3-wide
// grand stair (a height-1 tier at its center; everything else is sheer),
// while height-2 side galleries run the east and west walls — archer perches
// climbable only by their single corner step. Stone knights of the honor
// guard flank the processional carpet, the garrison's plunder molders on the
// gallery ends, and spike traps wait on the open floor beside the dais where
// flankers like to sneak (one hard shot each — spring them with a tank).
function throne() {
  const rows = border(grid(16, 14));
  for (let x = 4; x <= 11; x++) {
    rows[1][x] = '2';
    rows[2][x] = '2'; // the dais — flat top, sheer sides
  }
  for (let x = 6; x <= 8; x++) rows[3][x] = '1'; // the 3-wide grand stair tier
  for (let y = 5; y <= 10; y++) {
    rows[y][1] = '2'; // west gallery
    rows[y][14] = '2'; // east gallery
  }
  rows[11][1] = '1'; // west gallery corner step
  rows[11][14] = '1'; // east gallery corner step
  return new Room({
    id: 'throne', name: 'The Dread Cathedral', zoom: 1, heightmap: toStrings(rows), kit: DUNGEON_KIT,
    spawn: { x: 7, y: 11 }, spawnDir: 0,
    props: [
      // ---- the dais: the seat of power, its guardians and its torches
      { id: 'hween_r17_lichthrone', x: 7, y: 1, dir: 4 },
      { id: 'gothic_bowl', x: 6, y: 1, dir: 0 },
      { id: 'gothic_bowl', x: 8, y: 1, dir: 0 },
      { id: 'vikings_torch', x: 5, y: 1, dir: 2 },
      { id: 'vikings_torch', x: 9, y: 1, dir: 2 },
      { id: 'sp_statue', x: 4, y: 1, dir: 0 },
      { id: 'sp_statue', x: 11, y: 1, dir: 0 },
      // lanterns cap the sheer dais faces beside the grand stair
      { id: 'hween12_lantern', x: 4, y: 3, dir: 2 },
      { id: 'hween12_lantern', x: 9, y: 3, dir: 2 },
      // ---- the processional: carpet lane + the flaming honor guard
      { id: 'gothic_carpet', x: 6, y: 4, dir: 0, walk: true },
      { id: 'gothic_carpet', x: 6, y: 8, dir: 0, walk: true },
      // (stone knights, not hween_c17_flamingknight — that furni ships
      // Habbo's attackable-boss HEALTH BAR baked into every frame)
      { id: 'sp_statue', x: 5, y: 5, dir: 2 },
      { id: 'sp_statue', x: 8, y: 5, dir: 0 },
      { id: 'sp_statue', x: 5, y: 9, dir: 2 },
      { id: 'sp_statue', x: 8, y: 9, dir: 0 },
      // ---- the galleries: plunder hoards on their north ends
      { id: 'fantasy_c22_treasure2', x: 1, y: 5, dir: 0 },
      { id: 'fantasy_c22_treasure1', x: 14, y: 5, dir: 2 },
      // ---- dungeon clutter on the floor beside the galleries
      { id: 'hween12_cage', x: 2, y: 6, dir: 0 },
      { id: 'hween12_coffin', x: 2, y: 8, dir: 0 },
      { id: 'hween12_cage', x: 13, y: 6, dir: 2 },
      { id: 'hween12_coffin', x: 13, y: 8, dir: 0 },
      // ---- floor traps beside the dais
      { id: 'hween_c17_spiketrap', x: 4, y: 4, dir: 0, walk: true },
      { id: 'hween_c17_spiketrap', x: 11, y: 4, dir: 0, walk: true },
    ],
    effects: [
      { x: 4, y: 4, kind: 'hazard', dmg: 7, once: true, label: 'a spike trap' },
      { x: 11, y: 4, kind: 'hazard', dmg: 7, once: true, label: 'a spike trap' },
    ],
  });
}

// Battle 4 (M5 showcase) — The Gatehouse Yard: the keep's full curtain-wall
// gatehouse. The cave-stone wall seals the whole north edge (beyond it: void,
// the unseen keep) and a height-2 battlement catwalk runs its entire length,
// broken only by the portcullis corridor — a two-tile slot between sheer
// catwalk cliffs. Height-1 stair tiles at BOTH catwalk ends are the only
// climbs; the garrison's supply dump (its coin pile = loot) holds the west
// walk, the gate winch the east. Down in the yard a ruined spine wall splits
// the approach into chokepoint lanes, and the SW corner has collapsed into
// the dark under a constant rockfall. Throw the winch, then escape with your
// leader THROUGH the rising gate.
function rampart() {
  const rows = border(grid(18, 13));
  for (let x = 1; x <= 16; x++) rows[1][x] = 'x'; // beyond the wall: the unseen keep
  // the battlement catwalk — height 2 along the wall's whole length, sheer
  // everywhere, EXCEPT the gateway corridor at x8-9 (kept at yard level)
  for (let x = 1; x <= 16; x++) if (x !== 8 && x !== 9) rows[3][x] = '2';
  rows[4][1] = '1'; // west catwalk stair
  rows[4][16] = '1'; // east catwalk stair
  // the SW corner, collapsed into the void
  for (const [y, xs] of [[9, [1]], [10, [1, 2]], [11, [1, 2, 3]]])
    for (const x of xs) rows[y][x] = 'x';
  return new Room({
    id: 'rampart', name: 'The Gatehouse Yard', zoom: 1, heightmap: toStrings(rows), kit: KIT_NO_WALLS,
    spawn: { x: 8, y: 10 }, spawnDir: 0,
    props: [
      // ---- the curtain wall (row y2): six wall spans, pillars, the GATE
      { id: 'hween_c17_wall', x: 1, y: 2, dir: 2 },
      { id: 'hween_c17_wall', x: 3, y: 2, dir: 2 },
      { id: 'hween_c17_wall', x: 5, y: 2, dir: 2 },
      { id: 'hween_c17_pillar', x: 7, y: 2, dir: 0 },
      { id: 'hween_c17_portcullis', x: 8, y: 2, dir: 2, gate: true },
      { id: 'hween_c17_pillar', x: 10, y: 2, dir: 0 },
      { id: 'hween_c17_wall', x: 11, y: 2, dir: 2 },
      { id: 'hween_c17_wall', x: 13, y: 2, dir: 2 },
      { id: 'hween_c17_wall', x: 15, y: 2, dir: 2 },
      // ---- west catwalk: the garrison supply dump (the stair tile at (1,4)
      // climbs to (1,3); the coin pile sits first so looters can reach it)
      { id: 'dng_treasure2', x: 2, y: 3, dir: 0, walk: true },
      { id: 'fantasy_c22_barrel', x: 4, y: 3, dir: 0 },
      { id: 'fantasy_c22_arrows', x: 5, y: 3, dir: 0 },
      // ---- east catwalk: the winch that raises the portcullis
      { id: 'wf_tile1', x: 14, y: 3, dir: 0, walk: true },
      { id: 'fantasy_c22_arrows', x: 12, y: 3, dir: 0 },
      // ---- the yard spine: a ruined wall splitting the approach into lanes
      { id: 'hween_c17_pillarsmall', x: 3, y: 7, dir: 0 },
      { id: 'hween_c17_hidewall', x: 4, y: 7, dir: 2 },
      { id: 'hween_c17_hidewall', x: 7, y: 7, dir: 2 },
      { id: 'hween_c17_hidewall', x: 11, y: 7, dir: 2 },
      { id: 'hween_c17_pillarsmall', x: 13, y: 7, dir: 0 },
      // ---- the SW collapse: rockfall + rubble on the rim
      { id: 'hween_c17_fallingrocks', x: 1, y: 8, dir: 0 },
      { id: 'dng_block', x: 2, y: 9, dir: 2 },
      { id: 'hween_c17_rock2', x: 3, y: 10, dir: 2 },
      { id: 'hween_c17_hangingroots', x: 4, y: 11, dir: 0 },
      // ---- cave floor creeping into the yard
      { id: 'hween_c17_cavefloor', x: 2, y: 5, dir: 0, walk: true },
      { id: 'hween_c17_cavefloor', x: 12, y: 8, dir: 0, walk: true },
      // ---- yard cover
      { id: 'fantasy_c22_crystal', x: 5, y: 5, dir: 0 },
      { id: 'fantasy_c22_crystal', x: 12, y: 5, dir: 2 },
      { id: 'fantasy_c22_barrel', x: 15, y: 9, dir: 2 },
      { id: 'fantasy_c22_wood', x: 16, y: 6, dir: 2 },
    ],
    effects: [
      { x: 14, y: 3, kind: 'switch', toggles: [{ x: 8, y: 2 }], once: true, label: 'the winch' },
      { x: 2, y: 3, kind: 'treasure', gold: 25, label: "the garrison's coin" },
    ],
  });
}

// ============================================================================
// DUNGEON 2 — "Trials of the Realms": a gauntlet of four realm-gates, each a
// different land with its own visual kit. Proves the kit system's theming
// breadth: fairytale forest → sun-bleached Greek ruin → Steelscar mead hall →
// the Bog Witch's den. One battle per realm, one objective type per battle.
// ============================================================================

// The enchanted forest: real grass-and-leaf floor art, earthy stair/side
// tones, and NO procedural walls — the glade's boundary is a living hedge
// (env_bushes + trees) with the deep woods (void) beyond it.
const FOREST_KIT = {
  floor: 'easter_c19_forrestfloor',
  walls: false,
  palette: {
    topA: '#5f7c40', topB: '#557138',
    sideSW: '#26331c', sideSE: '#354628',
    line: 'rgba(16,24,10,0.45)',
    wallN: '#3c4d2c', wallW: '#495e36', wallTrim: '#202a15',
  },
};

// The sun-bleached ruin: white Greek Tile marble, warm sandstone sides and
// weathered temple walls — the one BRIGHT room in the game so far.
const GREEK_KIT = {
  floor: 'greek_c15_floor',
  walls: { height: 3.4 },
  palette: {
    topA: '#c6bfae', topB: '#bab3a1',
    sideSW: '#6f6857', sideSE: '#837b68',
    line: 'rgba(64,56,40,0.40)',
    wallN: '#a79d85', wallW: '#b9ae95', wallTrim: '#665e4b',
  },
};

// The mead hall: dark Steelscar timber underfoot, ember-warm brown sides and
// smoke-stained walls, lit by the vikings' own burning torches.
const VIKING_KIT = {
  floor: 'vikings_floor',
  walls: { height: 3.4 },
  palette: {
    topA: '#6a4a33', topB: '#5f422d',
    sideSW: '#2b1d12', sideSE: '#3a281a',
    line: 'rgba(14,8,4,0.5)',
    wallN: '#4a3423', wallW: '#5c4130', wallTrim: '#241709',
  },
};

// The witch's den: uneven rotten floorboards and plum-dark walls; the only
// light comes from the hearth, the cauldron and her drifting ghost-lights.
const WITCH_KIT = {
  floor: 'hween_c19_crookedfloor',
  walls: { height: 3.4 },
  palette: {
    topA: '#5b4b46', topB: '#514240',
    sideSW: '#221a1e', sideSE: '#2f2429',
    line: 'rgba(10,6,10,0.5)',
    wallN: '#3e3142', wallW: '#4c3c52', wallTrim: '#201727',
  },
};

// Realm 1 — The Brookside Glade. A fairy forest cut by a running brook: the
// water enters from the deep woods in the west, bends, and spills away NE —
// crossed only by a two-tile ford of rushing shallows guarded by an ent and
// the mystic tree. Across the water a mossy rise (height 1) holds the fairy
// ring: reach it with anyone. Toxic mushrooms punish the direct sprint,
// meadow and leaf-litter patches zone the clearings, and an enchanted egg
// rests in the far corner for the greedy. The weeping willow keeps the SW.
function glade() {
  const rows = border(grid(17, 13));
  // the mossy rise NE, one step up, cliffed over the brook
  for (let x = 11; x <= 15; x++) rows[1][x] = '1';
  rows[2][11] = '1';
  rows[2][12] = '1';
  // the brook — a 2-wide void ribbon, W edge -> NE exit; x7-8 stay floor (the ford)
  for (const [x0, x1, ys] of [[1, 6, [4, 5]], [9, 10, [4, 5]], [11, 12, [3, 4]], [13, 15, [2, 3]]])
    for (let x = x0; x <= x1; x++) for (const y of ys) rows[y][x] = 'x';
  return new Room({
    id: 'glade', name: 'The Brookside Glade', zoom: 1, heightmap: toStrings(rows), kit: FOREST_KIT,
    spawn: { x: 7, y: 10 }, spawnDir: 0,
    props: [
      // ---- the treeline: hedge + trees ringing the clearing
      { id: 'env_bushes', x: 1, y: 1, dir: 2 },
      { id: 'easter_c19_springtree', x: 3, y: 1, dir: 2 },
      { id: 'env_bushes', x: 5, y: 1, dir: 2 },
      { id: 'easter_c20_foresttree', x: 8, y: 1, dir: 2 },
      { id: 'env_bushes', x: 9, y: 1, dir: 2 },
      { id: 'easter_c20_foresttree', x: 15, y: 4, dir: 2 },
      { id: 'env_bushes', x: 15, y: 6, dir: 0 },
      { id: 'easter_c19_springtree', x: 15, y: 9, dir: 2 },
      { id: 'env_bushes', x: 13, y: 11, dir: 2 },
      { id: 'easter_c20_foresttree', x: 12, y: 11, dir: 2 },
      { id: 'env_bushes', x: 1, y: 11, dir: 2 },
      { id: 'env_bushes', x: 1, y: 6, dir: 0 },
      // ---- the SW vista: the weeping willow over the water
      { id: 'hween_r19_weepingwillow', x: 1, y: 9, dir: 0 },
      // ---- the mossy rise: the fairy ring, its lights and its keepers
      { id: 'easter_c19_magicringtele', x: 13, y: 1, dir: 2, walk: true }, // the way out
      { id: 'easter_c19_flowerlamp', x: 15, y: 1, dir: 2 },
      { id: 'easter_c19_littlefairies', x: 12, y: 2, dir: 2 },
      // ---- the ford: rushing shallows, its guardians at both mouths
      { id: 'easter_c20_rapids', x: 7, y: 4, dir: 2, walk: true },
      { id: 'easter_c20_rapids', x: 8, y: 5, dir: 2, walk: true },
      { id: 'easter_c19_ent', x: 6, y: 2, dir: 2 },
      { id: 'easter_r20_mystictree', x: 9, y: 6, dir: 2 },
      { id: 'easter_c20_waypointrocks', x: 6, y: 6, dir: 2 },
      // ---- the north bank: the wilds across the water
      { id: 'easter_c19_chillgnome', x: 2, y: 2, dir: 2 },
      { id: 'easter_c20_heather', x: 4, y: 3, dir: 2 },
      { id: 'easter_c19_mushrooms', x: 5, y: 3, dir: 2, walk: true },
      { id: 'easter_c20_heatherrock', x: 12, y: 7, dir: 2 },
      { id: 'easter_c19_babyent2', x: 10, y: 3, dir: 2 },
      // ---- the clearing: floor-art zones, a dirt track to the ford, cover
      { id: 'easter_c19_meadow', x: 4, y: 7, dir: 0, walk: true },
      { id: 'easter_c20_scatteredforestfloor', x: 10, y: 8, dir: 0, walk: true },
      { id: 'easter_c19_dirtpath', x: 7, y: 7, dir: 0, walk: true },
      { id: 'easter_c19_dirtpath', x: 7, y: 9, dir: 0, walk: true },
      { id: 'easter_c19_mushrooms', x: 9, y: 7, dir: 2, walk: true },
      { id: 'easter_c20_heather', x: 3, y: 6, dir: 2 },
      { id: 'easter_c20_heather', x: 12, y: 6, dir: 2 },
      { id: 'easter_c20_heatherrock', x: 3, y: 9, dir: 2 },
      { id: 'easter_c20_rockboulders', x: 13, y: 5, dir: 2 },
      // ---- an enchanted egg, abandoned in the far corner
      { id: 'easter_c19_forrestegg2', x: 14, y: 10, dir: 2, walk: true },
    ],
    effects: [
      { x: 5, y: 3, kind: 'hazard', dmg: 4, label: 'toxic spores' },
      { x: 9, y: 7, kind: 'hazard', dmg: 4, label: 'toxic spores' },
      { x: 14, y: 10, kind: 'treasure', gold: 20, label: 'an enchanted egg' },
    ],
  });
}

// Realm 2 — The Processional Court. The temple's grand axis: a colonnade
// avenue of pillars and hero statues runs from the collapsed south court to
// the height-2 sanctum dais (sheer faces, TWIN corner stairs — two ways up,
// altar tile always flat). A ruined arch lies mid-court as a cover line,
// marble inlay marks the processional, feast wreckage molders in the west
// wing — and the whole east wing has sheared away into the void, the old
// wooden horse still poised on its rim. Hold the altar before the Master
// Monument for four turns while the guardians pour in from the ruins.
function ruin() {
  const rows = border(grid(17, 14));
  for (let x = 5; x <= 11; x++) {
    rows[1][x] = '2';
    rows[2][x] = '2'; // the sanctum dais — flat top, sheer sides
  }
  rows[3][5] = '1'; // the twin temple stairs, one at each dais corner
  rows[3][11] = '1';
  // the east wing, sheared away into the void
  for (const [y, x0] of [[6, 15], [7, 14], [8, 14], [9, 13], [10, 13], [11, 13], [12, 12]])
    for (let x = x0; x <= 15; x++) rows[y][x] = 'x';
  return new Room({
    id: 'ruin', name: 'The Processional Court', zoom: 1, heightmap: toStrings(rows), kit: GREEK_KIT,
    spawn: { x: 8, y: 2 }, spawnDir: 4,
    props: [
      // ---- the sanctum: relic monument, lit temple lamps, offering vases
      { id: 'easter_c20_zenmaster', x: 8, y: 1, dir: 2 },
      { id: 'greek_c15_lamp', x: 6, y: 1, dir: 2 },
      { id: 'greek_c15_lamp', x: 10, y: 1, dir: 2 },
      { id: 'greek_c19_vase1', x: 5, y: 1, dir: 2 },
      { id: 'greek_c19_vase2', x: 11, y: 1, dir: 2 },
      // ---- the colonnade avenue: pillars + hero statues flanking the walk
      { id: 'nft_h25_collpillar', x: 5, y: 5, dir: 0 },
      { id: 'nft_h25_collpillar', x: 11, y: 5, dir: 0 },
      { id: 'fantasy_r22_herostatue', x: 5, y: 7, dir: 0 },
      { id: 'fantasy_r22_herostatue', x: 11, y: 7, dir: 0 },
      { id: 'nft_h25_collpillar', x: 5, y: 11, dir: 0 },
      { id: 'nft_h25_collpillar', x: 11, y: 11, dir: 0 },
      // ---- the fallen arch, mid-court: the cover line on the direct approach
      { id: 'greek_gate', x: 7, y: 7, dir: 0 },
      // ---- the marble inlay of the processional walk
      { id: 'greek_c15_tile', x: 8, y: 4, dir: 0, walk: true },
      { id: 'greek_c15_tile', x: 8, y: 5, dir: 0, walk: true },
      { id: 'greek_c15_tile', x: 8, y: 6, dir: 0, walk: true },
      { id: 'greek_c15_tile', x: 8, y: 8, dir: 0, walk: true },
      { id: 'greek_c15_tile', x: 8, y: 9, dir: 0, walk: true },
      { id: 'greek_c15_tile', x: 8, y: 10, dir: 0, walk: true },
      // ---- the west wing: the feast abandoned mid-rout
      { id: 'greek_c19_table', x: 2, y: 5, dir: 0 },
      { id: 'greek_c19_chair', x: 3, y: 5, dir: 6 },
      { id: 'greek_c19_fruitbowl', x: 2, y: 6, dir: 0 },
      { id: 'greek_c15_bench', x: 2, y: 8, dir: 0 },
      { id: 'greek_c19_harp', x: 1, y: 3, dir: 2 },
      // ---- the east wing: the collapse rim and the horse that ended it all
      { id: 'easter_c20_ancienthorse', x: 13, y: 6, dir: 2 },
      { id: 'greek_r19_chariot', x: 12, y: 10, dir: 2 },
      { id: 'easter_c20_clayrelic', x: 12, y: 5, dir: 2 },
      { id: 'easter_c20_lightrock', x: 12, y: 3, dir: 2 },
      // ---- corner accents
      { id: 'easter_c20_jadeguardian', x: 1, y: 11, dir: 2 },
      { id: 'easter_c20_clayrelic', x: 14, y: 1, dir: 2 },
      { id: 'easter_c20_ornamentalrocks', x: 12, y: 2, dir: 2 },
      { id: 'easter_c20_ornamentalrocks', x: 3, y: 11, dir: 2 },
      { id: 'easter_c20_darkrock1', x: 4, y: 10, dir: 2 },
      // ---- a temple offering, dropped in the rout
      { id: 'greek_c19_pythagorascup', x: 1, y: 8, dir: 2, walk: true },
    ],
    effects: [
      { x: 1, y: 8, kind: 'treasure', gold: 25, label: 'a temple offering' },
    ],
  });
}

// Realm 3 — The Longhouse of Steelscar. The WHOLE longhouse: the chief's
// high seat crowns the height-2 dais over a double-longfire feast aisle (two
// 2x2 pits — all eight tiles burn at end of turn), the Yggdrasil shrine
// glows in the west wing under Thor's statue, the east wing holds the
// kitchen and the animal pen, sleeping alcoves line the south wall, and the
// stone gate frames the entry. Clear the hall — a straight brawl.
function meadhall() {
  const rows = border(grid(18, 13));
  for (let x = 7; x <= 11; x++) {
    rows[1][x] = '2';
    rows[2][x] = '2'; // the high-seat dais
  }
  rows[3][9] = '1'; // the dais step
  return new Room({
    id: 'meadhall', name: 'The Longhouse of Steelscar', zoom: 1, heightmap: toStrings(rows), kit: VIKING_KIT,
    spawn: { x: 9, y: 10 }, spawnDir: 0,
    props: [
      // ---- the high seat: throne, burning torches, war banners
      { id: 'vikings_throne', x: 9, y: 1, dir: 4 },
      { id: 'vikings_torch', x: 7, y: 1, dir: 2 },
      { id: 'vikings_torch', x: 11, y: 1, dir: 2 },
      { id: 'vikings_flag_r', x: 7, y: 2, dir: 2 },
      { id: 'vikings_flag_g', x: 11, y: 2, dir: 2 },
      // ---- armory + relic beside the dais
      { id: 'vikings_weapon', x: 4, y: 2, dir: 2 },
      { id: 'vikings_runestone', x: 13, y: 2, dir: 2 },
      // ---- the WEST WING: the Yggdrasil shrine under Thor's gaze
      { id: 'vikings_yggdrasil', x: 1, y: 1, dir: 0 },
      { id: 'vikings_thor', x: 2, y: 2, dir: 2 },
      { id: 'vikings_tombstone', x: 1, y: 3, dir: 2 },
      { id: 'vikings_stonedivdr', x: 1, y: 4, dir: 0 },
      // the chief's longship, drawn up along the west wall
      { id: 'vikings_gondola3', x: 1, y: 6, dir: 4 },
      { id: 'vikings_gondola2a', x: 1, y: 8, dir: 4 },
      // ---- the feast aisle: tables + stools flanking the double longfire
      { id: 'vikings_table_r', x: 6, y: 5, dir: 6 },
      { id: 'vikings_table_r', x: 12, y: 5, dir: 6 },
      { id: 'vikings_stool', x: 5, y: 6, dir: 2 },
      { id: 'vikings_stool', x: 13, y: 6, dir: 6 },
      // the double longfire: two real 2x2 flame pits, ALL eight tiles burn
      { id: 'hween_c17_bonfire', x: 8, y: 5, dir: 0, walk: true },
      { id: 'hween_c17_bonfire', x: 8, y: 8, dir: 0, walk: true },
      // ---- the EAST WING: kitchen + the animal pen
      { id: 'vikings_stove', x: 16, y: 2, dir: 2 },
      { id: 'vikings_indoorstove', x: 16, y: 3, dir: 0 },
      { id: 'vikings_basket2', x: 16, y: 5, dir: 0 },
      { id: 'vikings_basket1', x: 15, y: 2, dir: 0 },
      { id: 'vikings_stonedivdr', x: 14, y: 7, dir: 0 },
      { id: 'vikings_animal_g', x: 15, y: 8, dir: 2 },
      { id: 'vikings_animal_r', x: 16, y: 9, dir: 2 },
      // ---- the SOUTH WALL: sleeping alcoves + the stone gate entry
      { id: 'vikings_bed', x: 2, y: 11, dir: 2 },
      { id: 'vikings_bed', x: 5, y: 11, dir: 2 },
      { id: 'vikings_stonegate', x: 8, y: 11, dir: 0 },
      { id: 'vikings_chair_r', x: 11, y: 11, dir: 0 },
      { id: 'vikings_spike', x: 13, y: 11, dir: 2 },
      { id: 'vikings_tombstone', x: 16, y: 11, dir: 2 },
      // ---- the chief's hoard, spilling beside his dais
      { id: 'dng_treasure2', x: 4, y: 3, dir: 0, walk: true },
    ],
    effects: [
      { x: 8, y: 5, kind: 'hazard', dmg: 4, when: 'endTurn', label: 'the longfire' },
      { x: 9, y: 5, kind: 'hazard', dmg: 4, when: 'endTurn', label: 'the longfire' },
      { x: 8, y: 6, kind: 'hazard', dmg: 4, when: 'endTurn', label: 'the longfire' },
      { x: 9, y: 6, kind: 'hazard', dmg: 4, when: 'endTurn', label: 'the longfire' },
      { x: 8, y: 8, kind: 'hazard', dmg: 4, when: 'endTurn', label: 'the longfire' },
      { x: 9, y: 8, kind: 'hazard', dmg: 4, when: 'endTurn', label: 'the longfire' },
      { x: 8, y: 9, kind: 'hazard', dmg: 4, when: 'endTurn', label: 'the longfire' },
      { x: 9, y: 9, kind: 'hazard', dmg: 4, when: 'endTurn', label: 'the longfire' },
      { x: 4, y: 3, kind: 'treasure', gold: 30, label: "the chief's hoard" },
    ],
  });
}

// Realm 4 (boss) — The Bog Beneath the Moon. The witch's den blown out to
// the whole bog: her skull throne crowns the height-2 dais (one crooked
// stair up) above three pools of black water, crossed by boardwalk lanes of
// mouldering autumn planks. A low harvest moon hangs over the NE pool,
// ghost-lights drift along the lanes, birches lean from the pool rims, her
// scarecrow field rots in the west — and pumpkin patches guard both
// boardwalk junctions (enter = vine damage). Slay the witch herself — her
// creatures are incidental.
function hollow() {
  const rows = border(grid(17, 14));
  for (let x = 6; x <= 10; x++) {
    rows[1][x] = '2';
    rows[2][x] = '2'; // the witch's dais
  }
  rows[3][8] = '1'; // the crooked stair
  // the three pools of black water
  for (let x = 12; x <= 15; x++) { rows[1][x] = 'x'; rows[2][x] = 'x'; } // NE, under the moon
  rows[3][13] = 'x'; rows[3][14] = 'x';
  for (let y = 5; y <= 6; y++) for (let x = 1; x <= 3; x++) rows[y][x] = 'x'; // west
  rows[7][1] = 'x'; rows[7][2] = 'x';
  for (let y = 9; y <= 10; y++) for (let x = 12; x <= 14; x++) rows[y][x] = 'x'; // SE
  rows[11][13] = 'x'; rows[11][14] = 'x';
  return new Room({
    id: 'hollow', name: 'The Bog Beneath the Moon', zoom: 1, heightmap: toStrings(rows), kit: WITCH_KIT,
    spawn: { x: 8, y: 11 }, spawnDir: 0,
    props: [
      // ---- the seat of the witch: skull throne, familiar, drifting lights
      { id: 'hween_ltd19_skullthrone', x: 8, y: 1, dir: 4 },
      { id: 'hween_r19_witchfamiliar', x: 7, y: 1, dir: 2 },
      { id: 'hween12_orb', x: 6, y: 1, dir: 2 },
      { id: 'hween12_orb', x: 10, y: 1, dir: 2 },
      // ---- the harvest moon, hanging low over the NE pool
      { id: 'hween12_moon', x: 11, y: 1, dir: 2 },
      // ---- the brewing corner, NW across the water (the cluster fills its
      // full 2x2 so no dead pocket tile is left for spawns)
      { id: 'hween_c19_bewitchedcauldron', x: 1, y: 1, dir: 2 },
      { id: 'hween_c19_potions', x: 2, y: 1, dir: 0 },
      { id: 'hween_c19_crystalball', x: 1, y: 2, dir: 2 },
      { id: 'hween_c19_witchcraft', x: 2, y: 2, dir: 0 },
      { id: 'hween_c19_herbs', x: 1, y: 3, dir: 2, walk: true },
      { id: 'hween_c19_birchtree', x: 3, y: 1, dir: 2 },
      // ---- birches leaning from the pool rims
      { id: 'hween_c19_birchtree', x: 15, y: 3, dir: 2 },
      { id: 'hween_c19_birchtree', x: 11, y: 10, dir: 2 },
      { id: 'hween_c19_birchtree', x: 4, y: 5, dir: 2 },
      // ---- ghost-lights drifting along the boardwalk lanes
      { id: 'wisp_c23_willowisp', x: 5, y: 4, dir: 2 },
      { id: 'wisp_c23_lilwisp', x: 12, y: 7, dir: 2 },
      { id: 'wisp_c23_lilwisp', x: 5, y: 10, dir: 2 },
      // ---- the boardwalks: mouldering autumn planks over the mud
      { id: 'hween_c19_autumnfloor', x: 9, y: 4, dir: 0, walk: true },
      { id: 'hween_c19_autumnfloor', x: 6, y: 8, dir: 0, walk: true },
      { id: 'hween_c19_autumnfloor', x: 13, y: 5, dir: 0, walk: true },
      // ---- pumpkin patches guard both junctions (stand-on art, vines grasp)
      { id: 'hween_c19_pumpkinpatch', x: 4, y: 6, dir: 2, walk: true },
      { id: 'hween_c19_pumpkinpatch', x: 10, y: 8, dir: 2, walk: true },
      // ---- the scarecrow field, rotting in the west
      { id: 'hween_c19_fireplace', x: 1, y: 9, dir: 2 }, // the cottage hearth, all that's left of it
      { id: 'hween12_scarecrow', x: 3, y: 9, dir: 2 },
      { id: 'hween12_cart', x: 2, y: 11, dir: 2 },
      { id: 'hween12_coffin', x: 4, y: 10, dir: 0 },
      { id: 'hween12_fortune', x: 1, y: 12, dir: 2 },
      // ---- the east lane: a lantern against the dark, a chair facing it
      // (the lane past the SE pool stays open — the satchel lies at its end)
      { id: 'hween12_lantern', x: 15, y: 5, dir: 0 },
      { id: 'hween_c19_bewitchedchair', x: 12, y: 12, dir: 0 },
      // ---- her ingredient satchel, dropped at the lane's end
      { id: 'hween_c19_witchsatchel', x: 15, y: 12, dir: 2, walk: true },
    ],
    effects: [
      { x: 4, y: 6, kind: 'hazard', dmg: 3, label: 'grasping vines' },
      { x: 5, y: 6, kind: 'hazard', dmg: 3, label: 'grasping vines' },
      { x: 4, y: 7, kind: 'hazard', dmg: 3, label: 'grasping vines' },
      { x: 5, y: 7, kind: 'hazard', dmg: 3, label: 'grasping vines' },
      { x: 10, y: 8, kind: 'hazard', dmg: 3, label: 'grasping vines' },
      { x: 11, y: 8, kind: 'hazard', dmg: 3, label: 'grasping vines' },
      { x: 10, y: 9, kind: 'hazard', dmg: 3, label: 'grasping vines' },
      { x: 11, y: 9, kind: 'hazard', dmg: 3, label: 'grasping vines' },
      { x: 15, y: 12, kind: 'treasure', gold: 25, label: "the witch's satchel" },
    ],
  });
}

// ---- enemy looks -----------------------------------------------------------
// Real Habbo assets, themed per dungeon (data here, never engine code):
// beasts wear pet sprite sheets (assets/monsters, tools/extract-pets.js),
// humanoids are habbo-imaging avatars in authored outfits (figuredata sets:
// 6248 Skeleton Outfit, 3603 Zombie Eyes, 3448/3449 Light Guardian armor,
// 3859 gold crown, 6275/6273/6271 Wizard robe/hat/beard), and statue
// monsters wear furni views from assets/props (tools/import-line.js — any
// creature furni in the imported props library can be cast with `prop:`).

const FIGURES = {
  skeleton: 'hd-6248-1.lg-285-64',
  undead: 'hd-3603-110.ch-215-82.lg-275-81', // zombie skin (dark, red eyes) + teal rags
  wraith: 'hd-180-1.ch-215-110.lg-275-110.hd-3603-110', // all-shadow body, red eyes
  // elite wraith: the same shadow body re-dressed in the wizard-blue (64)
  // rags the Mystic Shaman already proves out — ice-cold recolor, no new parts
  frost_wraith: 'hd-180-1.ch-215-64.lg-275-64.hd-3603-110',
  shaman: 'hd-180-1.ch-6275-64.ha-6273-64.fa-6271-61',
  dread_knight: 'hd-180-1.cc-3448-110.lg-3449-110.ha-3859-110',
  // The Bog Witch: zombie skin (green, red eyes) under a BLACK star-spangled
  // witch hat (colour 61 — a black cat rides the brim) and black robe.
  bog_witch: 'hd-3603-110.ch-6275-61.ha-6273-61',
};

const LOOKS = {
  skeleton: { figure: FIGURES.skeleton },
  sewer_rat: { pet: 'cat', tint: '#b8b8b8' }, // gray cat + gray tint (terrier is black in every palette)
  crypt_spider: { pet: 'spider' },
  restless_undead: { figure: FIGURES.undead },
  grave_wraith: { figure: FIGURES.wraith, ghost: 0.62 },
  ember_elemental: { pet: 'dragon' }, // the red dragon reads as living ember
  mystic_shaman: { figure: FIGURES.shaman },
  dread_knight: { figure: FIGURES.dread_knight },
  // ---- dungeon elites: tint/recolor variants of the roster above ----
  plague_rat: { pet: 'cat', tint: '#8fb060' }, // sickly green sewer stock
  frost_wraith: { figure: FIGURES.frost_wraith, ghost: 0.5 }, // paler, colder
  // Fantasy Village statues, woken by the keep's curse (furni monsters)
  greedy_goblin: { prop: 'fantasy_c22_goblin' },
  gnoll_sentinel: { prop: 'fantasy_c22_gnoll' },
  // ---- Trials of the Realms ----
  // The glade's beasts (fairytale-forest furni, all with idle loops)
  ravenous_wolf: { prop: 'easter_c19_wolf' },
  hippogriff: { prop: 'easter_c19_hippogriff' },
  bear_owl: { prop: 'easter_c19_bearowl' },
  alpha_wolf: { prop: 'easter_c19_wolf', tint: '#9aa4b8' }, // steel-gray pack leader
  // The ruin's guardians: bronze come alive, a siren on her rock, a lion
  bronze_warrior: { prop: 'greek_c19_statue' },
  ruin_siren: { prop: 'easter_c20_darkrock' },
  nemean_lion: { pet: 'lion', tint: '#e9c86a' }, // golden-maned
  gilded_warrior: { prop: 'greek_c19_statue', tint: '#e9c86a' }, // gold-plated elite
  marble_lioness: { pet: 'lion', tint: '#e6e6ee' }, // temple marble come alive
  // The hall's defenders: the chief's beasts and Odin's watcher
  hall_bear: { pet: 'bear', tint: '#a97e50' }, // brown hall bear
  war_boar: { pet: 'pig', tint: '#9a7a5c' }, // pink farm pig -> dour war boar
  odins_raven: { prop: 'sw_raven' },
  berserk_bear: { pet: 'bear', recolor: '#b03a2a' }, // blood-maddened elite
  dire_boar: { pet: 'pig', tint: '#5d4a3a' }, // near-black tusker
  // The witch and her creatures
  bog_witch: { figure: FIGURES.bog_witch },
  dark_werewolf: { prop: 'hween_c19_darkwerewolf' },
  living_slime: { prop: 'hween_c19_slimeblob' },
  spirit_owl: { prop: 'hween_c19_spiritowl' },
  elder_werewolf: { prop: 'hween_c19_darkwerewolf', tint: '#8d84a8' }, // moon-silvered elite
  bog_slime: { prop: 'hween_c19_slimeblob', recolor: '#5a7d2a' }, // the witch's own brew
};

// Read-only view for tools/tests (encounter pools must reference real looks).
export const LOOK_KEYS = Object.keys(LOOKS);

// ---- enemy factories -------------------------------------------------------

// opts.bonuses is the encounter template's per-monster stat delta (POOLS `d` in
// encounterGen.js). It rides the Unit constructor's equipment-bonus path, which
// is why a Skeleton and a Gnoll Sentinel are different creatures instead of two
// names for the same level-1 Fighter.
function E(room, x, y, classId, name, level = 1, look = null, opts = {}) {
  const u = new Unit(room, null, x, y, {
    team: 'enemy', classId, name, level, dir: 4, ghost: look && look.ghost,
    tag: opts.tag, bonuses: opts.bonuses,
  });
  if (look && look.pet) u.sprites = monsterSprites(look.pet, { tint: look.tint, recolor: look.recolor });
  else if (look && look.figure) u.sprites = figureSprites(look.figure);
  else if (look && look.prop) u.sprites = furniSprites(look.prop, { tint: look.tint, recolor: look.recolor, foot: look.foot });
  return u;
}

// Encounters are generated, not authored: a seeded plan per battle room
// (encounterGen.js) turned into live Units here. Boss rooms keep their
// authored boss (BOSSES in encounterGen); minions are rolled from the pool.

// Player spawn tiles per battle room (up to 4 units).
const SPAWNS = {
  antechamber: [{ x: 5, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 9 }, { x: 4, y: 10 }],
  nave: [{ x: 5, y: 10 }, { x: 6, y: 9 }, { x: 4, y: 9 }, { x: 6, y: 11 }],
  rampart: [{ x: 7, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 9 }, { x: 10, y: 10 }],
  throne: [{ x: 6, y: 11 }, { x: 8, y: 11 }, { x: 7, y: 12 }, { x: 5, y: 11 }],
  // Trials of the Realms
  glade: [{ x: 6, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 9 }, { x: 5, y: 10 }],
  ruin: [{ x: 7, y: 2 }, { x: 9, y: 2 }, { x: 6, y: 2 }, { x: 10, y: 2 }], // defenders hold the dais
  meadhall: [{ x: 8, y: 10 }, { x: 10, y: 10 }, { x: 9, y: 10 }, { x: 7, y: 10 }],
  hollow: [{ x: 7, y: 11 }, { x: 9, y: 11 }, { x: 8, y: 10 }, { x: 6, y: 11 }],
};

function battleNode(name, roomKey, makeRoom, reward, opts = {}) {
  const objectiveTile = opts.objective && opts.objective.tile ? opts.objective.tile : null;
  return {
    type: 'battle',
    name,
    boss: opts.boss || false,
    reward,
    // authored room + a seeded decor pass (decorGen.js): same seed, same
    // dressing — resumes and co-op replicas rebuild identical rooms
    makeRoom: (ctx = {}) =>
      // the exit tile rides in the decor-banned set (as an extra "spawn") so
      // seeded clutter never squats where the victory arrow lands
      decorate(makeRoom(), {
        seed: ctx.seed ?? 0,
        spawns: opts.exit ? [...SPAWNS[roomKey], opts.exit] : SPAWNS[roomKey],
        objectiveTile,
      }),
    objective: opts.objective, // undefined = default 'eliminate' (battle.js normalizes)
    // Where the victory RP arrow lands (runController): win the fight and an
    // arrow appears here — walk your leader onto it to move to the next room.
    exit: opts.exit || null,
    spawns: SPAWNS[roomKey],
    // ctx = { seed, battleNumber, squadSize } from the run (runController).
    // Same seed + squad -> same plan, so resumed saves rebuild identical
    // encounters; squadSize scales pressure (no 4v1 walls for solo runs).
    makeEnemies: (room, ctx = {}) =>
      generateEncounter({
        room,
        roomKey,
        seed: ctx.seed ?? 0,
        battleNumber: ctx.battleNumber ?? 1,
        squadSize: ctx.squadSize ?? 4,
        spawns: SPAWNS[roomKey],
        objectiveTile,
      }).map((p) =>
        E(room, p.x, p.y, p.classId, p.name, p.level, LOOKS[p.look], { tag: p.tag, bonuses: p.bonuses })
      ),
  };
}

// ---- assembly --------------------------------------------------------------

// The dungeon registry: metadata for every playable dungeon (title screen
// shows this list; each entry says where its event nodes sit so main.js can
// pre-pick events for save/resume).
export const DUNGEONS = [
  { id: 'dungeon', name: 'The Dungeon', sub: 'An old keep sunk in dark stone', eventNodeIndices: [1, 3] },
  { id: 'realms', name: 'Trials of the Realms', sub: 'Four realm-gates, four trials', eventNodeIndices: [1, 3] },
];

// eventPicks: { nodeIndex -> eventId } (from events.pickEvents), so the event
// at each slot is fixed and survives save/resume.
export function buildDungeon(id = DUNGEON_ID, eventPicks = {}) {
  if (id === 'frostkeep') id = 'dungeon'; // legacy saves (local + cloud) predate the retheme
  if (id === 'realms') return buildRealms(eventPicks);
  if (id !== DUNGEON_ID) return null;
  return {
    id: DUNGEON_ID,
    name: 'The Dungeon',
    nodes: [
      // Battle 1: a straight fight — teaches the basics (default 'eliminate').
      battleNode('The Broken Undercroft', 'antechamber', antechamber, { gold: 15, chests: 1 },
        { exit: { x: 12, y: 1, dir: 2 } }), // beside the east portcullis, into the keep
      { type: 'event', eventId: eventPicks[1] || 'cache' },
      // Battle 2: hold out — the nave's guardians only need to be outlasted.
      battleNode('The Sundered Nave', 'nave', sunkenNave, { gold: 25, chests: 1 },
        { objective: { type: 'survive', turns: 3 }, exit: { x: 12, y: 1, dir: 2 } }), // across the chasm, out the choir
      { type: 'event', eventId: eventPicks[3] || 'shrine' },
      // Battle 3 (M5 showcase): break through — open the portcullis and escape
      // through the gateway with your leader; don't clear the room.
      battleNode('The Gatehouse Yard', 'rampart', rampart, { gold: 30, chests: 1 },
        { objective: { type: 'reach', tile: { x: 8, y: 2 }, who: 'leader' },
          exit: { x: 8, y: 2, dir: 0 } }), // the open gateway IS the way out
      // Boss: slay the commander — his minions are incidental.
      battleNode('The Dread Cathedral', 'throne', throne, { gold: 50, chests: 2 },
        { boss: true, objective: { type: 'slay', tag: 'boss', label: 'the Dread Knight Commander' },
          exit: { x: 7, y: 12, dir: 4 } }), // back out the hall doors, victorious
    ],
  };
}

// Trials of the Realms: one battle per realm-kit, one objective type each —
// reach (forest), defend (ruin), eliminate (mead hall), slay (witch boss).
// Same 6-node battle/event rhythm as the Dungeon, same level curve.
function buildRealms(eventPicks = {}) {
  return {
    id: 'realms',
    name: 'Trials of the Realms',
    nodes: [
      // Trial 1: don't clear the glade — escape it through the fairy ring.
      battleNode('The Brookside Glade', 'glade', glade, { gold: 15, chests: 1 },
        { objective: { type: 'reach', tile: { x: 13, y: 1 }, who: 'any' },
          exit: { x: 12, y: 1, dir: 2 } }), // beside the fairy ring on the rise
      { type: 'event', eventId: eventPicks[1] || 'cache' },
      // Trial 2: hold the altar before the Master Monument for four turns.
      battleNode('The Processional Court', 'ruin', ruin, { gold: 25, chests: 1 },
        { objective: { type: 'defend', tile: { x: 8, y: 2 }, turns: 4 },
          exit: { x: 8, y: 12, dir: 4 } }), // down the processional, out the court
      { type: 'event', eventId: eventPicks[3] || 'shrine' },
      // Trial 3: a hall brawl — clear Steelscar's defenders.
      battleNode('The Longhouse of Steelscar', 'meadhall', meadhall, { gold: 35, chests: 1 },
        { exit: { x: 10, y: 11, dir: 4 } }), // beside the stone gate
      // Boss: slay the Bog Witch — her creatures are incidental.
      battleNode('The Bog Beneath the Moon', 'hollow', hollow, { gold: 60, chests: 2 },
        { boss: true, objective: { type: 'slay', tag: 'boss', label: 'the Bog Witch' },
          exit: { x: 14, y: 12, dir: 4 } }), // the lane's end, past her satchel
    ],
  };
}
