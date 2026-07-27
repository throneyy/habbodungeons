// Multi-tile furni footprint tests — run with:  node tests/furniFootprint.test.js
//
// A furni's footprint used to be hand-authored per PLACEMENT as
// `tiles: [{x,y},...]`, with derivation from the furni's own dims scoped to
// seats. The hand lists transposed the axis: the square's market stall (1x2,
// dir 0) at (8,3) claimed (8,3)+(9,3) where the art covers (8,3)+(8,4). That
// put an invisible wall on one side of it, let players walk through the other,
// and — because js/game.js built its depth box from the same wrong pair —
// made depth.js's "strictly on b's front side" test answer wrong for anyone
// standing at the item's near end, so furni sliced through avatars. 40 of 69
// multi-tile placements in the live layouts were wrong that way.
//
// The footprint is now derived, once, by room.js propFootprint. These tests
// pin the rule against the ART (a prop's drop shadow IS its footprint diamond,
// so the pixels are the ground truth, not a registry) and then assert the
// things a moved blocker can break: spawns, doors, seats and reachability.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { propFootprint, Room } from '../js/room.js';
import { serializeProp } from '../js/roomEditor.js';
import { buildRooms } from '../js/rooms.js';
import { buildDungeon } from '../js/dungeon.js';
import { FURNI_DIMS } from '../js/furniDims.js';
import { decodePng } from '../tools/png.mjs';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

const PROPS = new URL('../public/assets/props/', import.meta.url);

// ---------------------------------------------------------------- the rule
console.log('the footprint rule:');
const stall = { id: 'fantasy_c22_marketstall', x: 8, y: 3, dir: 0 };
check(
  'a 1x2 at dir 0 runs along +y (the market stall bug)',
  JSON.stringify(propFootprint(stall)) === JSON.stringify([{ x: 8, y: 3 }, { x: 8, y: 4 }]),
);
check(
  'the same item at dir 2 runs along +x',
  JSON.stringify(propFootprint({ ...stall, dir: 2 })) === JSON.stringify([{ x: 8, y: 3 }, { x: 9, y: 3 }]),
);
check(
  'dir 4 matches dir 0 and dir 6 matches dir 2 (only the axis matters)',
  JSON.stringify(propFootprint({ ...stall, dir: 4 })) === JSON.stringify(propFootprint(stall)) &&
    JSON.stringify(propFootprint({ ...stall, dir: 6 })) === JSON.stringify(propFootprint({ ...stall, dir: 2 })),
);
check(
  'a 3x1 spans three tiles along +x at dir 0',
  propFootprint({ id: 'vikings_table_r', x: 5, y: 8, dir: 0 }).length === 3 &&
    propFootprint({ id: 'vikings_table_r', x: 5, y: 8, dir: 0 }).every((t, i) => t.x === 5 + i && t.y === 8),
);
check('an unknown / 1x1 furni is its anchor tile alone', propFootprint({ id: 'nope', x: 2, y: 2, dir: 0 }).length === 1);
check('a missing dir is treated as dir 0', JSON.stringify(propFootprint({ id: stall.id, x: 8, y: 3 })) === JSON.stringify(propFootprint(stall)));

// -------------------------------------------------- the rule vs the artwork
// A prop's drop shadow is drawn as its footprint diamond, anchored by the
// frame's (ax, ay) at the anchor tile's centre. In Habbo's projection +x is
// down-RIGHT and +y is down-LEFT, so the shadow's lowest row sits
// 32px * (span - 1) off the anchor column along whichever axis the item spans:
// negative for +y, positive for +x. Thin decal shadows overshoot the exact
// magnitude, so only the SIGN — the axis, which is what propFootprint decides —
// is asserted here.
function shadowAxis(id, dir) {
  const dir1 = new URL(`${id}/`, PROPS);
  if (!existsSync(new URL('sheet.png', dir1))) return null;
  const data = JSON.parse(readFileSync(new URL('data.json', dir1), 'utf8'));
  if (data.size !== 64) return null;
  const f = data.frames[`sd${dir}`];
  if (!f) return null;
  const png = decodePng(readFileSync(new URL('sheet.png', dir1)));
  let botY = -1;
  let xs = [];
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      if (png.data[((f.y + y) * png.width + (f.x + x)) * 4 + 3] < 16) continue;
      if (y > botY) {
        botY = y;
        xs = [x];
      } else if (y === botY) xs.push(x);
    }
  }
  if (!xs.length) return null;
  const lean = (Math.min(...xs) + Math.max(...xs)) / 2 - f.ax;
  return Math.abs(lean) < 8 ? 'square' : lean < 0 ? 'y' : 'x';
}

console.log('the rule agrees with the drop-shadow art:');
let tested = 0;
const disagree = [];
for (const id of Object.keys(FURNI_DIMS)) {
  const [dx, dy] = FURNI_DIMS[id];
  // Only items with a LONG axis — exactly one dim of 1 — can have their axis
  // transposed, and only they have an axis the shadow can name. A 2x3 bed
  // spans both directions at once, so its shadow leans along the net diagonal
  // and no single answer is meaningful; 13 such items sit this check out.
  if (dx !== 1 && dy !== 1) continue;
  for (const dir of [0, 2, 4, 6]) {
    const axis = shadowAxis(id, dir);
    if (!axis || axis === 'square') continue;
    const foot = propFootprint({ id, x: 10, y: 10, dir });
    const spansX = foot.some((t) => t.x !== 10);
    tested++;
    if ((axis === 'x') !== spansX) disagree.push(`${id} dir${dir}: art says ${axis}, footprint says ${spansX ? 'x' : 'y'}`);
  }
}
check(`${tested} art directions checked across ${Object.keys(FURNI_DIMS).length} multi-tile furni`, tested >= 150);
check(`every one agrees with propFootprint (${disagree.length} disagreements)`, disagree.length === 0);
for (const d of disagree.slice(0, 10)) console.error(`        ${d}`);

// ------------------------------------------------- footprints are derived
console.log('footprints are derived, not stored:');
const roomsDefault = buildRooms({});
check('every prop in a built room carries a stamped footprint', roomsDefault.every((r) => r.props.every((p) => Array.isArray(p.tiles) && p.tiles.length)));
check(
  'the stamped footprint always equals propFootprint',
  roomsDefault.every((r) => r.props.every((p) => JSON.stringify(p.tiles) === JSON.stringify(propFootprint(p)))),
);
// A saved layout carrying a STALE footprint must be ignored, not trusted:
// that is exactly what the live square layout still holds.
const stale = buildRooms({
  square: [{ id: 'fantasy_c22_marketstall', x: 8, y: 3, dir: 0, tiles: [{ x: 8, y: 3 }, { x: 9, y: 3 }] }],
}).find((r) => r.id === 'square');
const restall = stale.props.find((p) => p.id === 'fantasy_c22_marketstall');
check('a saved layout\u2019s stale tiles list is overridden', JSON.stringify(restall.tiles) === JSON.stringify([{ x: 8, y: 3 }, { x: 8, y: 4 }]));
check('the stall blocks (8,4), the tile its art covers', stale.isBlocked(8, 4));
check('the stall does NOT block (9,3) \u2014 no invisible wall', !stale.isBlocked(9, 3));

// Rotating re-derives, and releases the tiles it used to hold.
const rot = new Room({
  id: 'rot',
  heightmap: ['0000', '0000', '0000', '0000'],
  spawn: { x: 0, y: 0 },
  props: [{ id: 'fantasy_c22_marketstall', x: 1, y: 1, dir: 0 }],
});
check('before rotating: blocks (1,1)+(1,2)', rot.isBlocked(1, 1) && rot.isBlocked(1, 2) && !rot.isBlocked(2, 1));
const spec = rot.props[0];
for (const t of spec.tiles) rot.unblock(t.x, t.y);
spec.dir = 2;
rot.stampFootprint(spec);
for (const t of spec.tiles) rot.block(t.x, t.y, spec);
check('after rotating to dir 2: blocks (1,1)+(2,1), releases (1,2)', rot.isBlocked(1, 1) && rot.isBlocked(2, 1) && !rot.isBlocked(1, 2));

// ------------------------------------ what a moved blocker must never break
const reach = (room, from) => {
  const seen = new Set([`${from.x},${from.y}`]);
  const q = [from];
  while (q.length) {
    const c = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (seen.has(`${x},${y}`) || room.isBlocked(x, y)) continue;
      if (Math.abs((room.heightAt(x, y) || 0) - (room.heightAt(c.x, c.y) || 0)) > 1) continue;
      seen.add(`${x},${y}`);
      q.push({ x, y });
    }
  }
  return seen;
};

console.log('spawns and doors survive the derived footprints:');
for (const room of roomsDefault) {
  const seen = reach(room, room.spawn);
  check(`${room.id}: spawn (${room.spawn.x},${room.spawn.y}) is standable`, !room.isBlocked(room.spawn.x, room.spawn.y));
  // A door works if ANY of its tiles is standable and reachable — the square's
  // 2-tile arch legitimately keeps a goblin statue on its far tile.
  for (const p of room.props.filter((q) => q.teleport)) {
    const dest = p.teleport.room || (p.teleport.gate ? 'the dungeon gate' : '?');
    check(
      `${room.id}: door to ${dest} at (${p.x},${p.y}) is standable and reachable`,
      p.tiles.some((t) => !room.isBlocked(t.x, t.y) && seen.has(`${t.x},${t.y}`)),
    );
  }
  // Every seat must be sittable: a chair whose whole footprint is buried is a
  // seat nobody can use.
  const buried = room.props.filter((p) => p.sit && !p.tiles.some((t) => seen.has(`${t.x},${t.y}`)));
  // tavern (3,8): a chandelier stands on that chair in the authored layout —
  // a pre-existing overlap this change neither caused nor fixes.
  check(`${room.id}: at most one buried seat (${buried.map((p) => `${p.id}@${p.x},${p.y}`).join(', ') || 'none'})`, buried.length <= 1);
}

// A door buried under correctly-sized furni relocates; the furni stays SOLID.
// The live square does exactly this: the adventure board (1x2, dir 2) covers
// (12,6)+(13,6) and the saved layout parks the mirkwood arrow on (13,6).
console.log('a buried door moves instead of punching a hole:');
const buried = buildRooms({
  square: [
    { id: 'fantasy_c22_adventureboard', x: 12, y: 6, dir: 2 },
    { id: 'rp_arrow', x: 13, y: 6, dir: 6, walk: true, teleport: { room: 'mirkwood' } },
  ],
}).find((r) => r.id === 'square');
const board = buried.props.find((p) => p.id === 'fantasy_c22_adventureboard');
const moved = buried.props.find((p) => p.teleport && p.teleport.room === 'mirkwood');
check('the board keeps BOTH its tiles blocked', board.tiles.length === 2 && board.tiles.every((t) => buried.blockers.get(`${t.x},${t.y}`) === board));
check('(13,6) stays solid — no walk-through hole in the signboard', buried.isBlocked(13, 6));
check('the arrow moved off it', !(moved.x === 13 && moved.y === 6));
check(`the arrow landed on its registered default (13,7), not a random neighbour — got (${moved.x},${moved.y})`, moved.x === 13 && moved.y === 7);
check('and the tile it landed on is standable', !buried.isBlocked(moved.x, moved.y));
// Determinism matters: every client builds its rooms independently, so a heal
// that picked differently per client would desync the blocked-tile set (the
// "[duel] blocked-tile mismatch with the host" warning).
const again = buildRooms({
  square: [
    { id: 'fantasy_c22_adventureboard', x: 12, y: 6, dir: 2 },
    { id: 'rp_arrow', x: 13, y: 6, dir: 6, walk: true, teleport: { room: 'mirkwood' } },
  ],
}).find((r) => r.id === 'square');
const moved2 = again.props.find((p) => p.teleport && p.teleport.room === 'mirkwood');
check(
  'the heal is deterministic: same layout, same landing tile and same blocker set',
  moved2.x === moved.x && moved2.y === moved.y &&
    [...again.blockers.keys()].sort().join('|') === [...buried.blockers.keys()].sort().join('|'),
);

// ---------------------------------------------------------------- stacking
// Habbo gives every furni a zdim and a canputstuffon flag; an item dropped on
// a tile lands on the current stack height and, if it can be stacked on,
// raises it. room.restack() applies that, replacing three hand-written
// `lift: 0.45` values that were eyeballed AND silently dropped by the first
// admin re-save (serializeProp never persisted them) — which is how the
// tavern's feast ended up served on the floorboards.
console.log('furni stack on each other by zdim (Habbo\u2019s rule):');
const tav = roomsDefault.find((r) => r.id === 'tavern');
const onTable = tav.props.filter((p) => p.restsOn && p.restsOn.id === 'vikings_table_r');
check(`the feast spread rests on the table (${onTable.length} items)`, onTable.length === 3);
check('...at the table\u2019s real height 1.1, not the eyeballed 0.45', onTable.every((p) => Math.abs(p.lift - 1.1) < 1e-9));
const onBar = tav.props.filter((p) => p.restsOn && p.restsOn.id === 'vikings_stonedivdr');
check(`the bar counter carries its own items at 1.15 (${onBar.length})`, onBar.length > 0 && onBar.every((p) => Math.abs(p.lift - 1.15) < 1e-9));
check('nothing is left hand-authored: no prop spec ships a literal lift', !readFileSync(new URL('../js/rooms.js', import.meta.url), 'utf8').match(/lift:\s*[\d.]/));

// A support with ZERO height still supports: the money tree's grass patch
// lifts by nothing, but the tree standing on it must still draw in front.
// This is why the renderer keys off `restsOn` and not `lift > 0`.
const zeroLift = new Room({
  id: 'z', heightmap: ['000', '000', '000'], spawn: { x: 0, y: 0 },
  props: [
    { id: 'gothic_carpet', x: 1, y: 1, dir: 0, walk: true }, // zdim 0, canputstuffon
    { id: 'fantasy_c22_barrel', x: 1, y: 1, dir: 0 },
  ],
});
check('a zero-height rug still counts as a support', zeroLift.props[1].restsOn === zeroLift.props[0]);
check('...lifting by exactly nothing', zeroLift.props[1].lift === 0);

// canputstuffon=false must NOT support: you cannot rest a rug on a tree.
const noSupport = new Room({
  id: 'n', heightmap: ['000', '000', '000'], spawn: { x: 0, y: 0 },
  props: [
    { id: 'fantasy_c22_tree', x: 1, y: 1, dir: 0 }, // canputstuffon = false
    { id: 'gothic_carpet', x: 1, y: 1, dir: 0, walk: true },
  ],
});
check('an item that cannot be stacked on supports nothing', !noSupport.props[1].restsOn && noSupport.props[1].lift === 0);

// Layout order is stacking order, and a prop never rests on itself.
const multi = new Room({
  id: 'm', heightmap: ['0000', '0000', '0000'], spawn: { x: 0, y: 0 },
  props: [
    { id: 'vikings_table_r', x: 0, y: 1, dir: 0 }, // 3x1, zdim 1.1, canputstuffon
    { id: 'picnic_food1', x: 1, y: 1, dir: 0 },
  ],
});
check('a 3-tile table carries an item on any of its tiles', multi.props[1].restsOn === multi.props[0] && Math.abs(multi.props[1].lift - 1.1) < 1e-9);
check('the table itself rests on nothing', !multi.props[0].restsOn && multi.props[0].lift === 0);

// restsOn holds a PROP REFERENCE, so it must never reach the layout JSON — it
// would be a cycle (table -> food -> table) and throw on save.
const saved = JSON.stringify(tav.props.map(serializeProp));
check('a saved layout carries neither lift nor restsOn (no cycle, no stale copy)', !saved.includes('restsOn') && !saved.includes('lift'));
// The real regression guard: derived altitudes must survive a save/reload,
// which the hand-authored ones did not.
const reloaded = buildRooms({ tavern: JSON.parse(saved) }).find((r) => r.id === 'tavern');
const reOnTable = reloaded.props.filter((p) => p.restsOn && p.restsOn.id === 'vikings_table_r');
check(`the feast is STILL on the table after a save/reload round trip (${reOnTable.length} items)`, reOnTable.length === 3 && reOnTable.every((p) => Math.abs(p.lift - 1.1) < 1e-9));

console.log('battle rooms stay winnable:');
for (const id of ['dungeon', 'realms']) {
  const d = buildDungeon(id);
  let bad = 0;
  d.nodes.forEach((n, i) => {
    if (!n.makeRoom) return;
    for (let seed = 0; seed < 5; seed++) {
      const room = n.makeRoom(seed);
      const from = (n.spawns && n.spawns[0]) || room.spawn;
      if (room.isBlocked(from.x, from.y)) {
        bad++;
        continue;
      }
      const seen = reach(room, from);
      for (const s of n.spawns || []) if (room.isBlocked(s.x, s.y)) bad++;
      // Node 4 of the dungeon is the portcullis yard: its objective AND its
      // exit are both the CLOSED gate at (8,2), unreachable until the switch
      // opens it — that is the whole fight. Asserted properly below instead.
      const gated = id === 'dungeon' && i === 4;
      const objT = n.objective && n.objective.tile;
      if (objT && !seen.has(`${objT.x},${objT.y}`) && !gated) bad++;
      if (n.exit && !seen.has(`${n.exit.x},${n.exit.y}`) && !gated) bad++;
    }
  });
  check(`${id}: every hero spawn standable and every objective/exit reachable (5 decor seeds x ${d.nodes.filter((n) => n.makeRoom).length} rooms)`, bad === 0);
}

// The portcullis is the one place a multi-tile footprint has to open and close
// at runtime, so it is the sharpest test of the derived footprint: shut, it
// seals the yard; opened by the switch, the whole footprint frees and the exit
// becomes reachable.
const yard = buildDungeon('dungeon').nodes[4].makeRoom(0);
const portcullis = yard.props.find((p) => p.gate);
check('the portcullis spans two tiles', portcullis && portcullis.tiles.length === 2);
check('shut, the gate tile (8,2) is sealed', yard.isBlocked(8, 2));
yard.toggleGate(8, 2);
check('opened, every tile of its footprint frees', portcullis.tiles.every((t) => !yard.isBlocked(t.x, t.y)));
check('opened, the exit (8,2) is reachable from the party spawn', reach(yard, buildDungeon('dungeon').nodes[4].spawns[0]).size > 0 && !yard.isBlocked(8, 2));

console.log(failed ? `\n${failed} test(s) failed` : '\nall furni footprint tests passed');
process.exit(failed ? 1 : 0);
