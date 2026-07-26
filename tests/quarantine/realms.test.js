// Trials of the Realms tests (M5 kit range) — run with:  node tests/realms.test.js
// Checks the dungeon registry, the four realm kits, and every showcase room
// against the room-design standards: walkable spawns/goals, flat interactive
// tiles, multi-tile footprints matching real furni dims, lit props shipping
// ambient loops, and objective pathability.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPath } from '../../js/pathfinder.js';
import { buildDungeon, DUNGEONS, DUNGEON_ID } from '../../js/dungeon.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX = JSON.parse(readFileSync(join(ROOT, 'assets', 'props', 'index.json'), 'utf8'));
const byId = new Map(INDEX.map((p) => [p.id, p]));
const propData = (id) => JSON.parse(readFileSync(join(ROOT, 'assets', 'props', id, 'data.json'), 'utf8'));

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

// ---- registry ----------------------------------------------------------------
console.log('dungeon registry');
const realms = buildDungeon('realms');
{
  check('DUNGEONS lists dungeon + realms', DUNGEONS.length === 2 && DUNGEONS[0].id === DUNGEON_ID && DUNGEONS[1].id === 'realms');
  check('buildDungeon(dungeon) is unchanged (6 nodes / 4 battles)', (() => {
    const d = buildDungeon();
    return d.id === 'dungeon' && d.nodes.length === 6 && d.nodes.filter((n) => n.type === 'battle').length === 4;
  })());
  check('buildDungeon(realms) = 6 nodes / 4 battles', realms && realms.nodes.length === 6 && realms.nodes.filter((n) => n.type === 'battle').length === 4);
  check('realms events sit at the registry indices', DUNGEONS[1].eventNodeIndices.every((i) => realms.nodes[i].type === 'event'));
  check('unknown dungeon id builds null', buildDungeon('nonsense') === null);
  check('realms boss is the last node', realms.nodes[5].boss === true);
  check('the four battles use four distinct objective types', (() => {
    const types = realms.nodes.filter((n) => n.type === 'battle').map((n) => (n.objective && n.objective.type) || 'eliminate');
    return new Set(types).size === 4 && ['reach', 'defend', 'eliminate', 'slay'].every((t) => types.includes(t));
  })());
}

const battles = realms.nodes.filter((n) => n.type === 'battle');

// ---- kits ----------------------------------------------------------------------
console.log('realm kits');
{
  const kits = battles.map((n) => n.makeRoom().kit);
  check('every realm room declares a kit with floor art', kits.every((k) => k && k.floor && k.palette));
  check('the four realms use four DIFFERENT floors', new Set(kits.map((k) => k.floor)).size === 4);
  check('kit floors exist in the props library with 2x2 art', kits.every((k) => byId.get(k.floor) && byId.get(k.floor).dims === '2x2'));
  check('shade()-facing palette fields are hex', kits.every((k) =>
    ['topA', 'topB', 'sideSW', 'sideSE', 'wallN', 'wallW', 'wallTrim'].every((f) => /^#[0-9a-f]{6}$/i.test(k.palette[f]))));
  check('the glade builds its own boundary (walls:false)', battles[0].makeRoom().kit.walls === false);
  check('interior realms keep procedural walls', battles.slice(1).every((n) => n.makeRoom().kit.walls && n.makeRoom().kit.walls.height > 0));
}

// ---- per-room standards ---------------------------------------------------------
// A flat-required tile renders as stairs when a cardinal neighbour is exactly
// 1 lower (the auto-stair rule) — void, border, same-or-higher, and sheer
// (2+) drops all keep the tile top flat.
function isFlat(room, x, y) {
  const h = room.heightAt(x, y);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => {
    const t = room.tile(x + dx, y + dy);
    return t === null || t === 'x' || room.heightAt(x + dx, y + dy) !== h - 1;
  });
}
const dimsOf = (id) => {
  const [w, h] = (byId.get(id).dims || '1x1').split('x').map(Number);
  return w * h;
};

for (const node of battles) {
  const room = node.makeRoom();
  console.log(`room: ${room.name}`);
  check('spawns are on walkable tiles', node.spawns.every((s) => !room.isVoid(s.x, s.y) && !room.isBlocked(s.x, s.y)));
  check('every placed prop exists in the library', room.props.every((p) => byId.has(p.id)));
  // walk:true props never block, so a footprint only matters for solid furni
  check('multi-tile solid furni declare full footprints', room.props.every((p) => {
    const n = dimsOf(p.id);
    return n === 1 || p.walk || (Array.isArray(p.tiles) && p.tiles.length === n);
  }));
  check('interactive (walk:true) tiles are flat', room.props.filter((p) => p.walk)
    .every((p) => (p.tiles || [{ x: p.x, y: p.y }]).every((t) => isFlat(room, t.x, t.y))));
  check('every effect tile is walkable', [...room.effects.values()].every((e) => !room.isVoid(e.x, e.y) && !room.isBlocked(e.x, e.y)));
  const enemies = node.makeEnemies(room);
  check('enemies stand on walkable tiles', enemies.every((u) => !room.isVoid(u.x, u.y) && !room.isBlocked(u.x, u.y)));
  check('no enemy shares a tile with a spawn or another enemy', (() => {
    const seen = new Set(node.spawns.map((s) => `${s.x},${s.y}`));
    return enemies.every((u) => {
      const k = `${u.x},${u.y}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  })());
  if (node.objective && node.objective.tile) {
    const { x, y } = node.objective.tile;
    check('objective tile is walkable and flat', !room.isBlocked(x, y) && !room.isVoid(x, y) && isFlat(room, x, y));
    check('a path exists from spawn to the objective', Array.isArray(findPath(room, node.spawns[0].x, node.spawns[0].y, x, y)));
  }
}

// ---- art standards ---------------------------------------------------------------
console.log('art: ambient loops on lit/animated props');
{
  // Every fire/glow/magic prop placed in a realm room must ship its loop.
  const mustAnimate = [
    'easter_c19_magicringtele', 'easter_c19_flowerlamp', 'easter_c19_littlefairies',
    'greek_c15_lamp', 'vikings_torch', 'vikings_indoorstove', 'hween_c17_bonfire',
    'hween_c19_fireplace', 'hween_c19_bewitchedcauldron', 'hween12_orb', 'hween_c19_crystalball',
  ];
  const placed = new Set(battles.flatMap((n) => n.makeRoom().props.map((p) => p.id)));
  check('all lit props are actually placed somewhere', mustAnimate.every((id) => placed.has(id)));
  for (const id of mustAnimate) {
    const d = propData(id);
    check(`${id} ships an ambient loop`, d.anim && d.anim.ticks > 1 && Object.keys(d.anim.map || {}).length > 0);
  }
  // Furni monsters cast in the realms exist and have art.
  const monsters = ['easter_c19_wolf', 'easter_c19_hippogriff', 'easter_c19_bearowl',
    'greek_c19_statue', 'easter_c20_darkrock', 'sw_raven',
    'hween_c19_darkwerewolf', 'hween_c19_slimeblob', 'hween_c19_spiritowl'];
  check('all realm furni-monsters are in the library', monsters.every((id) => byId.has(id)));
}

// ---- save/resume ------------------------------------------------------------
console.log('run round-trip');
{
  globalThis.localStorage = (() => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  })();
  const { Run, makeMember } = await import('../../js/run.js');
  const run = new Run({
    squad: [makeMember('fighter', 'You', { leader: true })],
    dungeon: buildDungeon('realms', { 1: 'cache', 3: 'shrine' }),
    eventPicks: { 1: 'cache', 3: 'shrine' },
  });
  run.nodeIndex = 2;
  const back = (await import('../../js/run.js')).Run.deserialize(run.serialize(), buildDungeon);
  check('a realms run survives serialize/deserialize', back && back.dungeon.id === 'realms' && back.nodeIndex === 2);
  check('the rebuilt run keeps its event picks', back.dungeon.nodes[1].eventId === 'cache' && back.dungeon.nodes[3].eventId === 'shrine');
}

console.log(failed ? `\n${failed} FAILED` : '\nall green');
process.exit(failed ? 1 : 0);
