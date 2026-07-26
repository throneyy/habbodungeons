// Reports what Habbo's furni logic says versus what this game currently
// assumes, WITHOUT changing any behaviour. Read this before wiring canstandon
// into js/room.js collision or zdim into js/depth.js sorting.
//
//   node tools/report-furni-logic.mjs           # default layouts only
//   node tools/report-furni-logic.mjs --live    # also pull live room_layouts
//
// Sections:
//   1. zdim coverage (real vs fallback)
//   2. placement mismatches: hand-authored walk/sit in js/rooms.js (and the
//      live admin layouts) vs canstandon/cansiton/canlayon
//   3. the SEATS registry (js/config.js) vs cansiton/canlayon, library-wide
//   4. zdim vs the art's own pixel height — where furnidata's collision
//      height and the sprite disagree, which is a trap for depth sorting
//   5. default vs live blocked tiles per room (the duel blocked-tile warning)

import { readdir, readFile } from 'node:fs/promises';
import { SEATS } from '../js/config.js';
import { buildRooms } from '../js/rooms.js';

const PROPS = new URL('../public/assets/props/', import.meta.url);
const live = process.argv.includes('--live');

// ---------------------------------------------------------------- prop logic
const logic = new Map();
for (const e of await readdir(PROPS, { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  const raw = await readFile(new URL(`${e.name}/data.json`, PROPS), 'utf8').catch(() => null);
  if (raw) logic.set(e.name, JSON.parse(raw));
}
const known = [...logic.values()].filter((p) => p.zdim != null);
const bySrc = (src) => known.filter((p) => p.logicSrc === src);

// Habbo's answer for a prop, as a placement kind: what the room model would
// do with it if collision came from the furni type instead of by hand.
const kindOf = (p) => (p?.cansiton ? 'sit' : p?.canlayon ? 'lay' : p?.canstandon ? 'walk' : 'solid');
// What the game actually does with a placement today.
const handOf = (p) => (p.sit ? 'sit' : p.walk ? 'walk' : 'solid');

// Deliberate gameplay overrides — a mismatch here is by design, not a bug.
const reasonFor = (p) => {
  if (p.teleport) return 'teleport (RP arrow / dungeon gate: walkable by wiring)';
  if (p.gate) return 'gate prop (toggles its own footprint)';
  if (p.hittable || p.shootable) return 'attackable scenery';
  return null;
};

// ------------------------------------------------------------------ layouts
async function liveLayouts() {
  const env = Object.fromEntries(
    (await readFile(new URL('../.env', import.meta.url), 'utf8'))
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
  );
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('no VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  const res = await fetch(`${url}/rest/v1/room_layouts?select=room_id,layout`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`room_layouts HTTP ${res.status}`);
  return Object.fromEntries((await res.json()).map((r) => [r.room_id, r.layout || []]));
}

const layouts = live ? await liveLayouts().catch((e) => (console.log(`live layouts unavailable: ${e.message}\n`), {})) : {};
const rooms = buildRooms(layouts);

// ------------------------------------------------------------------- report
const line = (s = '') => console.log(s);
line('='.repeat(78));
line(`FURNI LOGIC REPORT — ${live ? 'live admin layouts' : 'default layouts'}`);
line('='.repeat(78));

line();
line('1. zdim coverage');
line(`   props in library        : ${logic.size}`);
line(`   real zdim (furnidata)   : ${bySrc('furnidata').length}`);
line(`   hand override           : ${bySrc('override').length}  [${bySrc('override').map((p) => p.id).join(', ')}]`);
line(`   NO zdim -> falls back   : ${logic.size - known.length}  [${[...logic.values()].filter((p) => p.zdim == null).map((p) => p.id).join(', ')}]`);
const flat = known.filter((p) => p.zdim < 0.05).length;
line(`   zdim distribution       : ${flat} flat (<0.05), ${known.filter((p) => p.zdim >= 0.05 && p.zdim < 1).length} low, ${known.filter((p) => p.zdim >= 1 && p.zdim < 2).length} 1-2, ${known.filter((p) => p.zdim >= 2).length} tall (>=2)`);
line(`   flags true              : canstandon ${known.filter((p) => p.canstandon).length}, cansiton ${known.filter((p) => p.cansiton).length}, canlayon ${known.filter((p) => p.canlayon).length}, canputstuffon ${known.filter((p) => p.canputstuffon).length}`);

line();
line('2. placement mismatches — hand-authored flag vs furni type');

// Both surfaces are reported: js/rooms.js defaults are what the repo says,
// the live room_layouts are what players actually walk through today.
function mismatches(roomSet, label) {
  const rowsByClass = new Map();
  let placements = 0;
  let agree = 0;
  for (const room of roomSet) {
    for (const p of room.props) {
      placements++;
      const l = logic.get(p.id);
      const hand = handOf(p);
      const furni = kindOf(l);
      if (!l) {
        push(rowsByClass, 'NO PROP DATA', { room: room.id, p, hand, furni: '?', note: 'no data.json' });
        continue;
      }
      if (hand === furni) {
        agree++;
        continue;
      }
      const reason = reasonFor(p);
      const cls = reason
        ? 'BY DESIGN'
        : hand === 'solid' && furni === 'walk'
          ? 'OVER-BLOCKED — furni says canstandon, we block the tile'
          : hand === 'walk' && furni === 'solid'
            ? 'FALSE FLOOR — we let players stand on a solid furni'
            : hand === 'solid' && furni === 'sit'
              ? 'MISSED SEAT — cansiton, but the tile just blocks'
              : hand === 'solid' && furni === 'lay'
                ? 'MISSED BED — canlayon, no equivalent in the game'
                : hand === 'sit' && furni !== 'sit'
                  ? 'SEAT NOT IN FURNIDATA — we seat on something Habbo does not'
                  : hand === 'walk' && furni === 'sit'
                    ? 'WALKABLE SEAT — cansiton, placed as plain walkable'
                    : `${hand} vs ${furni}`;
      push(rowsByClass, cls, { room: room.id, p, hand, furni, note: reason || '' });
    }
  }
  const bad = placements - agree;
  line();
  line(`   --- ${label}: ${placements} placements across ${roomSet.map((r) => r.id).join(', ')}`);
  line(`       ${agree} agree with the furni type, ${bad} disagree`);
  const order = [...rowsByClass.keys()].sort((a, b) => (a === 'BY DESIGN' ? 1 : b === 'BY DESIGN' ? -1 : rowsByClass.get(b).length - rowsByClass.get(a).length));
  for (const cls of order) {
    const rows = rowsByClass.get(cls);
    line();
    line(`   [${cls}]  ${rows.length} placements`);
    const byId = new Map();
    for (const r of rows) push(byId, r.p.id, r);
    for (const [id, rs] of [...byId].sort((a, b) => b[1].length - a[1].length)) {
      const l = logic.get(id) || {};
      const tiles = rs.map((r) => `${r.room}(${r.p.x},${r.p.y})`);
      line(
        `     ${id.padEnd(34)} hand=${rs[0].hand.padEnd(5)} furni=${String(kindOf(l)).padEnd(5)}` +
          ` z=${l.zdim ?? '?'} stand=${b(l.canstandon)} sit=${b(l.cansiton)} lay=${b(l.canlayon)}${rs[0].note ? '  <- ' + rs[0].note : ''}`,
      );
      line(`       ${tiles.slice(0, 8).join(' ')}${tiles.length > 8 ? ` … ${tiles.length} total` : ''}`);
    }
  }
}

const defaultRooms = buildRooms({});
mismatches(defaultRooms, 'js/rooms.js default layouts');
if (live) mismatches(rooms, 'LIVE admin layouts (room_layouts)');

line();
line('3. SEATS registry (js/config.js) vs furnidata, library-wide');
const seatIds = Object.keys(SEATS);
const seatBad = seatIds.filter((id) => !logic.get(id)?.cansiton);
const seatMissing = [...logic.values()].filter((p) => p.cansiton && !SEATS[p.id]);
const layable = [...logic.values()].filter((p) => p.canlayon);
line(`   SEATS entries                     : ${seatIds.length}`);
line(`   …that furnidata does NOT call sit : ${seatBad.length}  [${seatBad.join(', ')}]`);
line(`   cansiton props NOT in SEATS       : ${seatMissing.length}`);
for (const p of seatMissing) line(`     ${p.id.padEnd(34)} z=${p.zdim}  ${p.xdim}x${p.ydim}${p.canlayon ? '  (also canlayon)' : ''}`);
line(`   canlayon props (no game support)  : ${layable.length}`);
for (const p of layable) line(`     ${p.id.padEnd(34)} z=${p.zdim}  ${p.xdim}x${p.ydim}${SEATS[p.id] ? '  (currently a SEAT)' : ''}`);

line();
line('4. zdim vs the art (skeptic pass: zdim is a COLLISION height, not the sprite)');
const geo = [];
for (const p of known) {
  if (p.size !== 64) continue;
  const hs = Object.entries(p.frames || {}).filter(([k]) => /^d\d$/.test(k)).map(([, f]) => f.h);
  if (!hs.length) continue;
  const flatPx = 16 * ((p.xdim || 1) + (p.ydim || 1)); // the footprint diamond
  geo.push({ id: p.id, z: p.zdim, h: Math.max(...hs), resid: Math.max(...hs) - (flatPx + 32 * p.zdim) });
}
geo.sort((a, b) => b.resid - a.resid);
line(`   art TALLER than zdim claims (a zdim-only depth sort will underdraw these):`);
for (const g of geo.slice(0, 12)) line(`     ${g.id.padEnd(34)} zdim=${String(g.z).padEnd(7)} art ${g.h}px, zdim predicts ${(g.h - g.resid).toFixed(0)}px`);
line(`   art SHORTER than zdim claims (these claim stack space they do not fill):`);
for (const g of geo.slice(-8).reverse()) line(`     ${g.id.padEnd(34)} zdim=${String(g.z).padEnd(7)} art ${g.h}px, zdim predicts ${(g.h - g.resid).toFixed(0)}px`);

line();
line('5. blocked tiles per room (default layout vs live layout)');
for (const room of defaultRooms) {
  const liveRoom = rooms.find((r) => r.id === room.id);
  const a = new Set(room.blockers.keys());
  const bset = new Set(liveRoom ? liveRoom.blockers.keys() : []);
  const only = [...a].filter((k) => !bset.has(k));
  const other = [...bset].filter((k) => !a.has(k));
  line(`   ${room.id.padEnd(10)} default ${String(a.size).padStart(3)}  ${live ? `live ${String(bset.size).padStart(3)}  differ ${only.length + other.length}` : ''}`);
  if (live && only.length + other.length) {
    line(`     default-only: ${only.slice(0, 12).join(' ')}${only.length > 12 ? ` (+${only.length - 12})` : ''}`);
    line(`     live-only   : ${other.slice(0, 12).join(' ')}${other.length > 12 ? ` (+${other.length - 12})` : ''}`);
  }
}
line();

function push(map, key, v) {
  const arr = map.get(key) || [];
  arr.push(v);
  map.set(key, arr);
}
function b(v) {
  return v ? 'Y' : 'n';
}
