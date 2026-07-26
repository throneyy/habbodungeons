// Furni logic data tests — run with:  node tests/furniLogic.test.js
//
// The props library used to carry only xdim/ydim, so the game guessed the rest:
// collision was hand-flagged per PLACEMENT (js/rooms.js `walk`/`sit`) and draw
// order was relaxed pairwise because the scalar depth had no z in it. Habbo
// models zdim (physical stack height) and canstandon/cansiton/canlayon per
// furni TYPE; tools/gen-furni-logic.mjs mirrors those into every
// public/assets/props/<id>/data.json and tools/gen-furni-dims.mjs derives
// js/furniDims.js from them.
//
// This suite pins the DATA, not any behaviour: nothing in js/ reads the new
// fields yet. It exists because the old js/furniDims.js claimed a generator
// that had never existed, drifted from the data.json files it duplicated, and
// nothing compared the two. Same failure mode as tests/readmeTests.test.js.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FURNI_DIMS, FURNI_LOGIC, furniLogic } from '../js/furniDims.js';
import { SEATS } from '../js/config.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

const ROOT = new URL('..', import.meta.url);
const PROPS = new URL('public/assets/props/', ROOT);
const ids = readdirSync(PROPS, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(new URL(`${e.name}/data.json`, PROPS)))
  .map((e) => e.name)
  .sort();
const props = ids.map((id) => JSON.parse(readFileSync(new URL(`${id}/data.json`, PROPS), 'utf8')));
const byId = new Map(props.map((p) => [p.id, p]));

console.log('every prop carries Habbo furni logic:');
check('the library is non-empty', props.length > 600);
const noZ = props.filter((p) => p.zdim == null);
check(`every prop has a zdim (${props.length - noZ.length}/${props.length})`, noZ.length === 0);
const badZ = props.filter((p) => typeof p.zdim !== 'number' || !(p.zdim >= 0) || p.zdim > 20);
check('every zdim is a plausible number (0 <= z <= 20)', badZ.length === 0);
const FLAGS = ['canstandon', 'cansiton', 'canlayon', 'canputstuffon'];
const badFlag = props.filter((p) => FLAGS.some((f) => typeof p[f] !== 'boolean'));
check('every walkability flag is a real boolean', badFlag.length === 0);
const badSrc = props.filter((p) => p.logicSrc !== 'furnidata' && p.logicSrc !== 'override');
check('every prop records where its logic came from', badSrc.length === 0);
const overrides = props.filter((p) => p.logicSrc === 'override');
check(`hand overrides stay rare (${overrides.length}: ${overrides.map((p) => p.id).join(', ') || 'none'})`, overrides.length <= 5);
// The id inside data.json is the furnidata classname the join was keyed on;
// a directory renamed without regenerating would silently import the wrong
// item's height and flags.
check('every data.json id matches its directory', props.every((p, i) => p.id === ids[i]));

console.log('js/furniDims.js is derived, not maintained:');
const gen = spawnSync(process.execPath, [fileURLToPath(new URL('tools/gen-furni-dims.mjs', ROOT)), '--check'], {
  encoding: 'utf8',
});
check('tools/gen-furni-dims.mjs --check reports no drift', gen.status === 0);
if (gen.status !== 0) console.error(gen.stdout || gen.stderr);
const dimDrift = Object.entries(FURNI_DIMS).filter(([id, [x, y]]) => {
  const p = byId.get(id);
  return !p || p.xdim !== x || p.ydim !== y;
});
check('every FURNI_DIMS footprint matches its data.json', dimDrift.length === 0);
const missingDims = props.filter((p) => (p.xdim !== 1 || p.ydim !== 1) && !FURNI_DIMS[p.id]);
check('every multi-tile prop appears in FURNI_DIMS', missingDims.length === 0);
check('single-tile props stay out of FURNI_DIMS', !Object.keys(FURNI_DIMS).some((id) => byId.get(id)?.xdim === 1 && byId.get(id)?.ydim === 1));

console.log('furniLogic() resolves the same answer as the data:');
const logicDrift = props.filter((p) => {
  const l = furniLogic(p.id);
  return (
    l.zdim !== p.zdim ||
    l.canStandOn !== p.canstandon ||
    l.canSitOn !== p.cansiton ||
    l.canLayOn !== p.canlayon ||
    l.canPutStuffOn !== p.canputstuffon
  );
});
check(`furniLogic() agrees with all ${props.length} data.json files`, logicDrift.length === 0);
if (logicDrift.length) console.error('   first drift: ' + logicDrift.slice(0, 3).map((p) => p.id).join(', '));
check('an unknown id falls back to a solid 1-unit block', furniLogic('no_such_furni').zdim === 1 && !furniLogic('no_such_furni').canStandOn);
// Only the exceptions are stored, so a prop with default logic must be absent.
const defaulted = props.filter((p) => p.zdim === 1 && !FLAGS.some((f) => p[f]));
check(`props with default logic are omitted from FURNI_LOGIC (${defaulted.length} of them)`, defaulted.every((p) => !FURNI_LOGIC[p.id]));

console.log('the hand-authored seat registry agrees with Habbo:');
const seatIds = Object.keys(SEATS);
const notSeats = seatIds.filter((id) => byId.get(id) && !byId.get(id).cansiton);
check(`every SEATS entry is cansiton in furnidata (${seatIds.length} seats)`, notSeats.length === 0);
if (notSeats.length) console.error('   not cansiton: ' + notSeats.join(', '));
const seatHeights = seatIds.filter((id) => byId.get(id) && byId.get(id).zdim <= 0);
check('every seat has a real stack height', seatHeights.length === 0);

console.log(failed ? `\n${failed} test(s) failed` : '\nall furni logic tests passed');
process.exit(failed ? 1 : 0);
