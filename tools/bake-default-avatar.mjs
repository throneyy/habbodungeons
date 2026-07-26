// Bakes the DEFAULT HABBO LOOK into a local sprite sheet so the renderer has a
// real Habbo fallback avatar instead of a drawn placeholder — the classic
// black-hair / mustard-shirt / blue-jeans newbie figure every Habbo starts as.
//
// Why bake instead of hitting habbo-imaging live: the fallback exists precisely
// for the moments imaging ISN'T available (offline, proxy down, sprites still
// loading), so it has to be local art. Same posture as tools/extract-pets.js →
// public/assets/monsters/{id}/{sheet.png,data.json}.
//
//   node tools/bake-default-avatar.mjs
//
// Output: public/assets/avatar/default/{m.png,s.png,data.json}
// Untrimmed uniform-grid frames (64x110 at size m, 32x55 at s) so the renderer
// anchors them exactly like a live habbo-imaging PNG: centred on the tile,
// bottom edge minus AVATAR_FOOT_PAD.

import { mkdir, writeFile } from 'node:fs/promises';
import { decodePng, encodePng, blankImage } from './png.mjs';
// Shared with tests/defaultAvatarShoes.test.js — read that module's header for
// why a bake has to assert on sole pixels at all.
import { isStudded } from './studDetect.mjs';

// Keep in sync with DEFAULT_FIGURE in js/config.js (read the shoe note there
// before touching the sh- part — sh-290 bakes soccer cleats).
const FIGURE = 'hr-100-61.hd-180-1.ch-210-66.lg-270-82.sh-300-62';
const IMAGING = 'https://www.habbo.com/habbo-imaging/avatarimage';
const OUT = new URL('../public/assets/avatar/default/', import.meta.url);

const DIRS = [0, 1, 2, 3, 4, 5, 6, 7];
// Row order in the sheet; every action's frames are consecutive rows.
const ACTIONS = [
  { action: 'std', frames: 1 },
  { action: 'sit', frames: 1 },
  { action: 'wlk', frames: 4 },
];
// habbo-imaging's own canvas per size (s is NOT exactly half of m — it rounds up).
const SIZES = { m: { w: 64, h: 110 }, s: { w: 33, h: 56 } };

async function frame(action, dir, f, size) {
  const p = new URLSearchParams({
    figure: FIGURE,
    action,
    direction: String(dir),
    head_direction: String(dir),
    frame: String(f),
    size,
    img_format: 'png',
  });
  const res = await fetch(`${IMAGING}?${p}`);
  if (!res.ok) throw new Error(`imaging ${res.status} for ${action}/${dir}/${f}/${size}`);
  return decodePng(Buffer.from(await res.arrayBuffer()));
}

function blit(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      const di = ((dy + y) * dst.width + dx + x) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
}

const rows = ACTIONS.reduce((n, a) => n + a.frames, 0);
const studded = [];

for (const [size, dim] of Object.entries(SIZES)) {
  const sheet = blankImage(dim.w * DIRS.length, dim.h * rows);
  let row = 0;
  for (const { action, frames } of ACTIONS) {
    for (let f = 0; f < frames; f++, row++) {
      for (const dir of DIRS) {
        const png = await frame(action, dir, f, size);
        if (png.width !== dim.w || png.height !== dim.h) {
          throw new Error(
            `unexpected ${size} frame size ${png.width}x${png.height} for ${action}/${dir}/${f} ` +
            `(expected ${dim.w}x${dim.h}) — habbo-imaging changed its canvas; update SIZES`
          );
        }
        if (size === 'm' && isStudded(png)) studded.push(`${action}/dir${dir}/frame${f}`);
        blit(sheet, png, dir * dim.w, row * dim.h);
      }
    }
  }
  await mkdir(OUT, { recursive: true });
  await writeFile(new URL(`${size}.png`, OUT), encodePng(sheet));
  console.log(`${size}.png  ${sheet.width}x${sheet.height}`);
}

if (studded.length) {
  throw new Error(
    `${FIGURE} renders a STUDDED SOLE (soccer cleats) in ${studded.length} frame(s): ` +
    `${studded.join(', ')}. The nubs typically show only while standing, so this would ship ` +
    'cleats on every idle avatar. Pick a plain-soled shoe part (sh-300 works; sh-290 does not) ' +
    'and update DEFAULT_FIGURE in js/config.js to match.'
  );
}
console.log(`no studded soles across ${rows * DIRS.length} frames`);

const data = {
  figure: FIGURE,
  note: 'Default Habbo look — local fallback avatar. Baked by tools/bake-default-avatar.mjs.',
  dirs: DIRS,
  sizes: Object.fromEntries(Object.entries(SIZES).map(([k, v]) => [k, { file: `${k}.png`, ...v }])),
  // row = index of the action's first frame in the sheet (frames run downwards)
  actions: Object.fromEntries(
    ACTIONS.reduce(
      ([out, r], a) => [[...out, [a.action, { row: r, frames: a.frames }]], r + a.frames],
      [[], 0]
    )[0]
  ),
};
await writeFile(new URL('data.json', OUT), `${JSON.stringify(data, null, 1)}\n`);
console.log('data.json', JSON.stringify(data.actions));
