// M4 asset-pipeline tests — run with:  node tests/sprites.test.js
// Covers the pet-rig math (mirroring, frame counts), the integrity of the
// extracted monster/prop data the game ships, furni cover rules, and the
// battle engine's fx events.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mirrorDir, actionFrameCount, actionFrameRepeat } from '../../tools/lib/pet.js';
import { loadDeleted, mergeIndex, saveDeleted } from '../../tools/lib/extract.js';
import { classnameCandidatesFromHtml, pageTitleFromUrl, lineNameFromWikitext, matchLineId } from '../../tools/lib/wiki.js';
import { nearestDir } from '../../js/monsterSprites.js';
import { buildDungeon } from '../../js/dungeon.js';
import { PROJ_SPRITE } from '../../js/battleController.js';
import { rotationBetween } from '../../js/pathfinder.js';
import { Room } from '../../js/room.js';
import { Unit } from '../../js/units.js';
import { Battle } from '../../js/battle.js';
import { hasLineOfSight } from '../../js/classes.js';
import { canStep, findPath } from '../../js/pathfinder.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---- pet rig math ----------------------------------------------------------
console.log('pet rig math');
check('mirror 0 <-> 6', mirrorDir(0) === 6 && mirrorDir(6) === 0);
check('mirror 1 <-> 5', mirrorDir(1) === 5 && mirrorDir(5) === 1);
check('mirror 2 <-> 4', mirrorDir(2) === 4 && mirrorDir(4) === 2);
check('front/back mirror onto themselves', mirrorDir(3) === 3 && mirrorDir(7) === 7);

const mock = (layers) => ({
  postures: { std: '0' },
  animations: { 0: Object.fromEntries(layers.map((l, i) => [i, l])) },
});
check(
  'frame count is the LCM of layer sequences',
  actionFrameCount(mock([{ frames: [1, 2], repeat: 1 }, { frames: [1, 2, 3], repeat: 1 }]), 'std') === 6
);
check(
  'frame count caps at 8',
  actionFrameCount(mock([{ frames: [1, 2, 3], repeat: 1 }, { frames: Array(8).fill(1), repeat: 1 }]), 'std') === 8
);
check('missing posture -> 0 frames', actionFrameCount(mock([{ frames: [1], repeat: 1 }]), 'mv') === 0);
check(
  'repeat comes from the longest layer',
  actionFrameRepeat(mock([{ frames: [1], repeat: 9 }, { frames: [1, 2, 3], repeat: 3 }]), 'std') === 3
);

// ---- extracted monster data ------------------------------------------------
console.log('extracted monsters (assets/monsters)');
const MON_DIR = path.join(ROOT, 'assets', 'monsters');
const monIndex = JSON.parse(fs.readFileSync(path.join(MON_DIR, 'index.json'), 'utf8'));
check('roster extracted (30+ pets)', monIndex.length >= 30);

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

let dataOk = true;
let stdOk = true;
let rectOk = true;
let anchorOk = true;
for (const { id } of monIndex) {
  const dir = path.join(MON_DIR, id);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
  } catch {
    dataOk = false;
    continue;
  }
  const sheet = pngSize(path.join(dir, 'sheet.png'));
  if (!data.actions.std || data.actions.std.frames < 1) dataOk = false;
  for (const spec of Object.values(data.actions)) {
    if (!(spec.frames >= 1) || !(spec.repeat >= 1)) dataOk = false;
  }
  // the runtime's last-resort fallback direction must exist
  if (!data.frames.std_2_0 && !data.frames[`std_${Object.keys(data.actions)[0]}_0`]) stdOk = false;
  for (const [key, r] of Object.entries(data.frames)) {
    if (r.x < 0 || r.y < 0 || r.x + r.w > sheet.w || r.y + r.h > sheet.h) {
      rectOk = false;
      console.error(`        ${id} ${key} rect out of sheet bounds`);
    }
    if (!(r.ax > -64 && r.ax < r.w + 64 && r.ay > -32 && r.ay < r.h + 96)) anchorOk = false;
  }
}
check('every data.json parses with sane std action', dataOk);
check('every pet has the fallback std direction', stdOk);
check('every frame rect lies inside its sheet', rectOk);
check('every anchor is near its frame', anchorOk);

const dog = JSON.parse(fs.readFileSync(path.join(MON_DIR, 'dog', 'data.json'), 'utf8'));
check('dog walk = 4 frames (authentic rig)', dog.actions.mv.frames === 4);
check('dog has corpse art', !!dog.actions.ded);
check('dog covers all 8 directions', [0, 1, 2, 3, 4, 5, 6, 7].every((d) => dog.frames[`std_${d}_0`]));

// ---- extracted props -------------------------------------------------------
console.log('extracted props (assets/props)');
const PROP_DIR = path.join(ROOT, 'assets', 'props');
const propIndex = JSON.parse(fs.readFileSync(path.join(PROP_DIR, 'index.json'), 'utf8'));
check('fantasy village set extracted (10+)', propIndex.length >= 10);
let propOk = true;
for (const { id } of propIndex) {
  const data = JSON.parse(fs.readFileSync(path.join(PROP_DIR, id, 'data.json'), 'utf8'));
  const sheet = pngSize(path.join(PROP_DIR, id, 'sheet.png'));
  if (!data.dirs.length || !data.frames[`d${data.dirs[0]}`]) propOk = false;
  for (const r of Object.values(data.frames)) {
    if (r.x + r.w > sheet.w || r.y + r.h > sheet.h) propOk = false;
  }
}
check('every prop has a view for its first direction, in bounds', propOk);
check('barrel is a 1x1 blocker', JSON.parse(fs.readFileSync(path.join(PROP_DIR, 'fantasy_c22_barrel', 'data.json'), 'utf8')).xdim === 1);
// the delete/creature endpoints validate ids with this charset — every real id
// must pass it or it can't be pruned (uppercase classnames: SID_*, ads_idol_*)
const ID_CHARSET = /^[A-Za-z0-9_-]+$/;
check('every prop id is accepted by the dev-endpoint charset', propIndex.every((e) => ID_CHARSET.test(e.id)));

// ---- index merging (subset extractions must not clobber) --------------------
console.log('index merging');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hd-index-'));
  const idx = path.join(tmp, 'index.json');
  fs.writeFileSync(idx, JSON.stringify([{ id: 'a', dims: '1x1', name: 'Kept' }, { id: 'b', dims: '2x1' }]));
  const merged = mergeIndex(idx, [{ id: 'b', dims: '2x2' }, { id: 'c', dims: '1x1' }]);
  check('subset merge keeps entries it did not touch', merged.some((e) => e.id === 'a'));
  check('subset merge updates the re-extracted entry', merged.find((e) => e.id === 'b').dims === '2x2');
  check('subset merge appends new entries, sorted', merged.map((e) => e.id).join(',') === 'a,b,c');
  check('merged index is what landed on disk', JSON.parse(fs.readFileSync(idx, 'utf8')).length === 3);
  const again = mergeIndex(idx, [{ id: 'a', dims: '1x1' }]);
  check('fields absent from a re-extract survive (importer name)', again.find((e) => e.id === 'a').name === 'Kept');
  const fresh = mergeIndex(path.join(tmp, 'sub', 'index.json'), [{ id: 'z' }]);
  check('merging into a missing index starts one', fresh.length === 1 && fresh[0].id === 'z');

  // deletion tombstones (props pruned in tools/props.html stay pruned)
  const dead = path.join(tmp, 'deleted.json');
  check('no tombstone file -> empty set', loadDeleted(dead).size === 0);
  saveDeleted(new Set(['b_prop', 'a_prop']), dead);
  const loaded = loadDeleted(dead);
  check('tombstones round-trip', loaded.has('a_prop') && loaded.has('b_prop') && loaded.size === 2);
  check('tombstone file is sorted', JSON.parse(fs.readFileSync(dead, 'utf8')).join(',') === 'a_prop,b_prop');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- wiki line importer parsing ---------------------------------------------
console.log('wiki line importer (tools/lib/wiki.js)');
{
  // markup lifted from the real habboxwiki Fantasy_Village page (2026-07-02)
  const SNIPPET = `
    <td><a href="/File:Fantasy_c22_arrows_64_a_0_0.png" class="mw-file-description">
    <img src="/wiki/images/f/f4/Fantasy_c22_arrows_64_a_0_0.png"/></a></td><td>Arrow Bucket</td>
    <a href="/File:Fantasy_c22_marketstall.png"><img src="/wiki/images/3/32/Fantasy_c22_marketstall.png"/></a>
    <img src="/wiki/images/c/cd/Spromo_Aug22.png"/>
    <img src="/wiki/images/4/48/Image2022-5-6_16-12-48.png"/>`;
  const found = classnameCandidatesFromHtml(SNIPPET);
  check('render-suffixed wiki image -> classname', found.has('fantasy_c22_arrows'));
  check('plain wiki image -> classname', found.has('fantasy_c22_marketstall'));
  check('promo art + screenshots are not candidates', ![...found].some((c) => c.includes('spromo') || c.includes('image2022')));

  check('wiki url -> page title', pageTitleFromUrl('https://habboxwiki.com/Fantasy_Village') === 'Fantasy Village');
  check(
    'infobox name from wikitext',
    lineNameFromWikitext('{{Infobox_range \n| name = Fantasy Village \n| image = S.png\n}}') === 'Fantasy Village'
  );

  const IDS = ['fantasy', 'fall', 'habboween', 'habboween_2024', 'xmas', 'xmas2024', 'area', 'suncity'];
  check('campaign name resolves by prefix', matchLineId('Fantasy Village', IDS).id === 'fantasy');
  check('exact normalized match beats prefix', matchLineId('Habboween 2024', IDS).id === 'habboween_2024');
  check('ambiguity is reported, never guessed', !!matchLineId('xmas 20', ['xmas', 'xmas2020', 'xmas2021']).ambiguous);
  check('nonsense matches nothing', matchLineId('Totally Unknown Line', IDS) === null);
}

// ---- imported line metadata --------------------------------------------------
console.log('imported line props (import-line.js output)');
{
  const tavern = JSON.parse(fs.readFileSync(path.join(PROP_DIR, 'fantasy_c22_tavern', 'data.json'), 'utf8'));
  check('imported prop carries its furnidata name', tavern.name === 'Medieval Tavern');
  check('imported prop carries its furniline', tavern.line === 'fantasy');
  check('multi-tile footprint stored (tavern 1x2)', tavern.xdim === 1 && tavern.ydim === 2);
  const entry = propIndex.find((e) => e.id === 'fantasy_c22_tavern');
  check('index entry carries name + line too', !!entry && entry.name === 'Medieval Tavern' && entry.line === 'fantasy');
}

// ---- furni monsters ----------------------------------------------------------
console.log('furni monsters (props cast as foes)');
{
  check('nearestDir picks an exact match', nearestDir([0, 2, 4, 6], 4) === 4);
  check('nearestDir snaps to the closest view', nearestDir([0, 2], 3) === 2);
  check('nearestDir ties keep list order', nearestDir([0, 2], 1) === 0);
  check('single-view furni faces everywhere', [0, 1, 2, 3, 4, 5, 6, 7].every((d) => nearestDir([4], d) === 4));
  check('no views -> null', nearestDir([], 2) === null);

  const dungeon = buildDungeon();
  const battles = dungeon.nodes.filter((n) => n.type === 'battle');
  const foes = battles.flatMap((n) => n.makeEnemies(n.makeRoom()));
  const goblin = foes.find((u) => u.name === 'Greedy Goblin');
  const gnoll = foes.find((u) => u.name === 'Gnoll Sentinel');
  check('Greedy Goblin statue guards the nave', !!goblin && goblin.sprites && goblin.sprites.kind === 'furni');
  check('Gnoll Sentinel statue guards the throne', !!gnoll && gnoll.sprites && gnoll.sprites.kind === 'furni');
  check('statue foes wear real imported furni', goblin.sprites.id === 'fantasy_c22_goblin' && gnoll.sprites.id === 'fantasy_c22_gnoll');
  const gobData = JSON.parse(fs.readFileSync(path.join(PROP_DIR, 'fantasy_c22_goblin', 'data.json'), 'utf8'));
  check('the goblin asset has a view for every snapped dir', [0, 1, 2, 3, 4, 5, 6, 7].every((d) => gobData.frames[`d${nearestDir(gobData.dirs, d)}`]));
  check('statue foes are ordinary engine units (hp/atk sane)', goblin.stats.hp > 0 && goblin.stats.atk > 0);
}

// ---- ranged projectile art (the Firing Arrow) ------------------------------
console.log('ranged projectile art');
{
  const arrowId = PROJ_SPRITE.ranged;
  check('rangers have a projectile prop assigned', typeof arrowId === 'string' && !!arrowId);
  const dataPath = path.join(PROP_DIR, arrowId, 'data.json');
  check('the projectile prop is extracted', fs.existsSync(dataPath));
  const arrow = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  // a projectile needs to face all 8 travel directions
  check('projectile ships all 8 directions', [0, 1, 2, 3, 4, 5, 6, 7].every((d) => arrow.frames[`d${d}`]));
  // the direction handed to the renderer is the caster->target travel dir
  check('travel dir east (+x) -> 2', rotationBetween(4, 4, 7, 4) === 2);
  check('travel dir south (+y) -> 4', rotationBetween(4, 4, 4, 7) === 4);
  check('travel dir NW -> 7', rotationBetween(4, 4, 1, 1) === 7);
  check('every travel dir has a matching arrow view', [
    [4, 4, 7, 4], [4, 4, 4, 7], [4, 4, 1, 1], [4, 4, 7, 1], [4, 4, 4, 1], [4, 4, 1, 7],
  ].every(([a, b, c, d]) => arrow.frames[`d${nearestDir(arrow.dirs, rotationBetween(a, b, c, d))}`]));
}

// ---- props in rooms: blocking + cover --------------------------------------
console.log('props block walking and shots');
const flat7 = ['0000000', '0000000', '0000000', '0000000', '0000000', '0000000', '0000000'];
const bare = new Room({ id: 't', name: 't', heightmap: flat7, spawn: { x: 0, y: 0 } });
check('clear shot without props', hasLineOfSight(bare, 1, 3, 5, 3, 0, 0));

const cluttered = new Room({
  id: 't2', name: 't2', heightmap: flat7, spawn: { x: 0, y: 0 },
  props: [{ id: 'fantasy_c22_barrel', x: 3, y: 3, dir: 0 }],
});
check('prop tile is blocked', cluttered.isBlocked(3, 3));
check('cannot step onto a prop', !canStep(cluttered, 2, 3, 3, 3));
check('prop blocks the shot (furni cover)', !hasLineOfSight(cluttered, 1, 3, 5, 3, 0, 0));
check('shot past the prop is clear', hasLineOfSight(cluttered, 1, 2, 5, 2, 0, 0));
const around = findPath(cluttered, 1, 3, 5, 3);
check('path routes around the prop', !!around && !around.some((s) => s.x === 3 && s.y === 3));

// ---- battle fx events ------------------------------------------------------
console.log('battle fx events');
{
  const room = new Room({ id: 'b', name: 'b', heightmap: flat7, spawn: { x: 0, y: 0 } });
  const a = new Unit(room, null, 1, 1, { team: 'player', classId: 'fighter' });
  const e = new Unit(room, null, 2, 1, { team: 'enemy', classId: 'ranger' });
  const events = [];
  const b = new Battle(room, [a, e], { onFx: (ev) => events.push(ev) });
  b.resolveAttack(a, e);
  check('attack emits an fx event', events.length === 1 && events[0].kind === 'attack');
  check('fx event carries damage + units', events[0].dmg > 0 && events[0].attacker === a && events[0].target === e);
}
{
  const room = new Room({ id: 'h', name: 'h', heightmap: flat7, spawn: { x: 0, y: 0 } });
  const cleric = new Unit(room, null, 1, 1, { team: 'player', classId: 'cleric' });
  const hurt = new Unit(room, null, 2, 1, { team: 'player', classId: 'fighter' });
  const foe = new Unit(room, null, 5, 5, { team: 'enemy', classId: 'fighter' });
  hurt.stats.hp = 10;
  const events = [];
  const b = new Battle(room, [cleric, hurt, foe], { onFx: (ev) => events.push(ev) });
  b.resolveSkill(cleric, hurt);
  const heal = events.find((ev) => ev.kind === 'heal');
  check('heal emits an fx event with the amount', !!heal && heal.amount > 0 && heal.target === hurt);
}

console.log(failed ? `\n${failed} CHECKS FAILED` : '\nAll M4 sprite/asset tests passed');
process.exit(failed ? 1 : 0);
