// Mirrors Habbo's own furni LOGIC into every extracted prop:
//
//   public/assets/props/<id>/data.json  +=  zdim, canstandon, cansiton,
//                                           canlayon, canputstuffon, logicSrc
//
// The extraction that produced these directories recorded xdim/ydim and the
// sprite frames only, so the game had to guess the rest: collision is
// hand-flagged per PLACEMENT in js/rooms.js (`walk`/`sit`), and draw order is
// relaxed pairwise in js/depth.js because the scalar depth has no z in it.
// zdim is the missing number and canstandon/cansiton/canlayon are the missing
// flags; both come straight from furnidata, per furni TYPE, where Habbo keeps
// them. See tools/lib/furnidata.mjs for the source and the variant collapse.
//
//   node tools/gen-furni-logic.mjs           # write into every data.json
//   node tools/gen-furni-logic.mjs --check   # report drift, write nothing
//
// This step is DATA ONLY: nothing in js/ reads the new fields yet. Wiring
// canstandon into room.js collision and zdim into depth sorting is a separate,
// gated step.

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fetchFurnidata, indexFurnidata, logicOf, LOGIC_FIELDS } from './lib/furnidata.mjs';

const PROPS = new URL('../public/assets/props/', import.meta.url);
// Hand-sourced logic for props that are NOT Habbo furni (custom art with no
// furnidata record). Each entry needs a comment saying where its numbers came
// from; `logicSrc: "override"` keeps them countable in the coverage report.
const OVERRIDES = {
  // RP teleport arrow: a floor decal you walk onto. Not in any furnidata —
  // custom art. zdim mirrors Habbo's own floor-decal convention (fantasy_c22_
  // sewers = 0.0001), flags mirror how every layout already places it.
  rp_arrow: { zdim: 0.0001, canstandon: true, cansiton: false, canlayon: false, canputstuffon: false },
};

const check = process.argv.includes('--check');
const { data, fetched } = await fetchFurnidata();
const index = indexFurnidata(data);

const entries = await readdir(PROPS, { withFileTypes: true });
const ids = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

const out = { furnidata: [], override: [], missing: [], dimConflict: [], wallItem: [], changed: [] };

for (const id of ids) {
  const file = new URL(`${id}/data.json`, PROPS);
  if (!(await stat(file).catch(() => null))) continue;
  const raw = await readFile(file, 'utf8');
  const prop = JSON.parse(raw);

  const hit = index.get(id);
  let logic = null;
  if (hit) {
    logic = { ...logicOf(hit.record), logicSrc: 'furnidata' };
    if (hit.kind === 'wall') out.wallItem.push(id);
    // xdim/ydim were extracted independently (from the SWF, outside this
    // repo). furnidata answering differently means one of the two is wrong —
    // report, never silently overwrite the art's own footprint.
    if (hit.record.xdim !== prop.xdim || hit.record.ydim !== prop.ydim) {
      out.dimConflict.push(`${id}: data.json ${prop.xdim}x${prop.ydim}, furnidata ${hit.record.xdim}x${hit.record.ydim}`);
    }
    out.furnidata.push(id);
  } else if (OVERRIDES[id]) {
    logic = { ...OVERRIDES[id], logicSrc: 'override' };
    out.override.push(id);
  } else {
    out.missing.push(id);
    continue; // no zdim written: absence IS the "unknown" signal
  }

  const merged = {};
  for (const [k, v] of Object.entries(prop)) {
    if (k === 'zdim' || k === 'logicSrc' || LOGIC_FIELDS.includes(k)) continue; // re-emitted in order below
    merged[k] = v;
    if (k === 'ydim') Object.assign(merged, { zdim: logic.zdim }, pick(logic), { logicSrc: logic.logicSrc });
  }
  if (!('zdim' in merged)) Object.assign(merged, { zdim: logic.zdim }, pick(logic), { logicSrc: logic.logicSrc });

  const eol = raw.includes('\r\n') ? '\r\n' : '\n'; // these files are committed CRLF
  const text = JSON.stringify(merged, null, 1).replace(/\n/g, eol);
  if (text === raw) continue;
  out.changed.push(id);
  if (!check) await writeFile(file, text);
}

function pick(logic) {
  return Object.fromEntries(LOGIC_FIELDS.map((f) => [f, logic[f] === true]));
}

const total = ids.length;
console.log(`furnidata cache: ${fetched ? 'downloaded' : 'cached'}, ${index.size} base classes`);
console.log(`props: ${total}`);
console.log(`  real zdim from furnidata : ${out.furnidata.length}`);
console.log(`  hand override            : ${out.override.length}${out.override.length ? '  (' + out.override.join(', ') + ')' : ''}`);
console.log(`  NO zdim (left unknown)   : ${out.missing.length}${out.missing.length ? '  (' + out.missing.join(', ') + ')' : ''}`);
console.log(`  filed as WALL items      : ${out.wallItem.length}${out.wallItem.length ? '  (' + out.wallItem.join(', ') + ')' : ''}`);
console.log(`  xdim/ydim conflicts      : ${out.dimConflict.length}`);
for (const c of out.dimConflict) console.log(`    ${c}`);
console.log(`${check ? 'would rewrite' : 'rewrote'}: ${out.changed.length} data.json`);
if (check && out.changed.length) process.exitCode = 1;
