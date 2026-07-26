// Runs the footprint/traversal guards from tests/furniFootprint.test.js against
// the LIVE room_layouts in Supabase, which the unit suite cannot do (it stays
// offline and pure). Layouts are admin-authored and saved separately from the
// repo, so a layout can strand players even when every default room is fine.
//
//   node tools/check-live-layouts.mjs
//
// Exits non-zero if a spawn or a door is unstandable. Cut-off pockets are
// reported but not fatal: single tiles tucked behind furni predate this and are
// an authoring nit, not a broken room.

import { readFile } from 'node:fs/promises';
import { buildRooms } from '../js/rooms.js';

const env = Object.fromEntries(
  (await readFile(new URL('../.env', import.meta.url), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
);
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('no VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  process.exit(2);
}
const res = await fetch(`${url}/rest/v1/room_layouts?select=room_id,layout`, {
  headers: { apikey: key, authorization: `Bearer ${key}` },
});
if (!res.ok) {
  console.error(`room_layouts HTTP ${res.status}`);
  process.exit(2);
}
const rows = await res.json();
const layouts = Object.fromEntries(rows.map((r) => [r.room_id, r.layout || []]));

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

let fatal = 0;
console.log(`live layouts: ${rows.map((r) => `${r.room_id} (${(r.layout || []).length} props)`).join(', ')}\n`);
for (const room of buildRooms(layouts)) {
  const seen = reach(room, room.spawn);
  let walkable = 0;
  const orphans = [];
  for (let y = 0; y < room.h; y++) {
    for (let x = 0; x < room.w; x++) {
      if (!room.tile(x, y) || room.isBlocked(x, y)) continue;
      walkable++;
      if (!seen.has(`${x},${y}`)) orphans.push(`${x},${y}`);
    }
  }
  const spawnOk = !room.isBlocked(room.spawn.x, room.spawn.y);
  if (!spawnOk) fatal++;
  console.log(`${room.id}`);
  console.log(`  spawn (${room.spawn.x},${room.spawn.y}) ${spawnOk ? 'standable' : '** BLOCKED **'}`);
  console.log(`  ${room.props.length} props, ${room.blockers.size} blocked tiles, ${seen.size}/${walkable} walkable tiles reachable`);
  for (const p of room.props.filter((q) => q.teleport)) {
    const dest = p.teleport.room || (p.teleport.gate ? 'dungeon gate' : '?');
    const usable = p.tiles.filter((t) => !room.isBlocked(t.x, t.y) && seen.has(`${t.x},${t.y}`));
    if (!usable.length) fatal++;
    console.log(
      `  door -> ${String(dest).padEnd(13)} @(${p.x},${p.y}) footprint [${p.tiles.map((t) => `${t.x},${t.y}`).join(' ')}]` +
        ` ${usable.length ? `standable on ${usable.map((t) => `${t.x},${t.y}`).join(' ')}` : '** NO STANDABLE TILE **'}`,
    );
  }
  if (orphans.length) console.log(`  cut-off pockets (advisory): ${orphans.join(' ')}`);
}
console.log(fatal ? `\n${fatal} FATAL problem(s)` : '\nevery live room: spawn standable, every door standable and reachable');
// exitCode, not process.exit(): forcing exit while undici's fetch sockets are
// still closing trips a libuv assertion on Windows (UV_HANDLE_CLOSING) and
// turns a clean pass into exit 127.
process.exitCode = fatal ? 1 : 0;
