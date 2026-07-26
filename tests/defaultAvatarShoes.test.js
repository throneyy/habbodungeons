// Default-avatar shoe tests — run with:  node tests/defaultAvatarShoes.test.js
//
// Guards the stud detector in tools/studDetect.mjs, which is the only thing
// standing between the baked fallback avatar and a return of the soccer cleats.
//
// The bug it encodes: habbo-imaging renders sh-290 — the shoe id every retro
// tool ships in its default-look sample — as a studded CLEAT in the standing
// pose, while the same shoe's walk and sit sprites are plain-soled. So the
// cleats appeared exactly while an avatar idled (nearly always) and vanished
// the moment it walked, which is why it read as "the cleats override the
// default shoes and the real ones only show in the walk animation".
//
// Fixtures are real habbo-imaging frames (size 'm', the size the baker checks)
// committed under tests/fixtures/shoes/, so this runs offline and deterministic
// — no live imaging call can turn a regression into a flaky skip.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng, blankImage } from '../tools/png.mjs';
import { bottomRowRuns, isStudded, MAX_STUD_WIDTH } from '../tools/studDetect.mjs';

let failed = 0;
function check(label, cond) {
  if (!cond) failed++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}`);
}

const frame = (name) =>
  decodePng(readFileSync(fileURLToPath(new URL(`./fixtures/shoes/${name}.png`, import.meta.url))));

// ---- the studded shoes must be REJECTED -------------------------------------
// sh-290 is the one that shipped; sh-3115 is the other studded id in figuredata
// (worse — it keeps its studs in the walk cycle too), included so a future
// "just pick another shoe" edit can't land on it either.
console.log('studded shoes are rejected:');
check('sh-290 standing (dir 2) is detected as studded', isStudded(frame('sh-290-std-dir2')));
check('sh-290 standing (dir 4) is detected as studded', isStudded(frame('sh-290-std-dir4')));
check('sh-3115 standing (dir 2) is detected as studded', isStudded(frame('sh-3115-std-dir2')));
check('sh-3115 walking (dir 2) is detected as studded', isStudded(frame('sh-3115-wlk-dir2')));

// The whole reason the bug hid for so long: sh-290's WALK frame is plain, so a
// detector that only ever saw a walk cycle would call the cleats clean. This
// asserts the fixture really is plain — i.e. the studs are pose-specific and a
// bake must therefore check every pose, not a sample one.
check('sh-290 walking (dir 2) is plain — the studs are standing-only',
  !isStudded(frame('sh-290-wlk-dir2')));

// ---- the shipped shoe must PASS, in every pose -------------------------------
console.log('\nthe shipped shoe (sh-300) passes:');
for (const pose of ['std-dir2', 'std-dir4', 'wlk-dir2', 'sit-dir2']) {
  check(`sh-300 ${pose} has a plain sole`, !isStudded(frame(`sh-300-${pose}`)));
}

// ---- the detector's own margins ----------------------------------------------
// isStudded needs BOTH conditions (3+ runs AND every run narrow). These assert
// the fixtures sit clearly on either side of the line rather than scraping it,
// so a small imaging change doesn't silently flip a verdict.
console.log('\ndetector margins:');
const studRuns = bottomRowRuns(frame('sh-290-std-dir2'));
check(`studded bottom row is 3+ separate nubs (got ${JSON.stringify(studRuns)})`,
  studRuns.length >= 3);
check(`every stud is narrow (<= ${MAX_STUD_WIDTH}px)`, studRuns.every((r) => r <= MAX_STUD_WIDTH));

for (const pose of ['std-dir2', 'wlk-dir2', 'sit-dir2']) {
  const runs = bottomRowRuns(frame(`sh-300-${pose}`));
  check(`plain sh-300 ${pose} is one solid sole run per foot, not nubs (got ${JSON.stringify(runs)})`,
    runs.length > 0 && runs.length < 3);
}

// An empty frame has no bottom row at all; the detector must not call that
// studded (the baker would otherwise reject a legitimately transparent frame).
const blank = blankImage(8, 8);
check('a fully transparent frame is not studded', !isStudded(blank));
check('a fully transparent frame has no runs', bottomRowRuns(blank).length === 0);

// ---- the baked sheet on disk -------------------------------------------------
// The end product, not just the detector: every standing frame of the shipped
// sheet must be plain. Catches a stale public/assets/avatar/default/m.png that
// was baked before the shoe was fixed.
console.log('\nthe committed sheet:');
const sheetUrl = new URL('../public/assets/avatar/default/', import.meta.url);
const data = JSON.parse(readFileSync(fileURLToPath(new URL('data.json', sheetUrl)), 'utf8'));
const sheet = decodePng(readFileSync(fileURLToPath(new URL('m.png', sheetUrl))));
const dim = data.sizes.m;

function sheetFrame(row, dir) {
  const out = blankImage(dim.w, dim.h);
  for (let y = 0; y < dim.h; y++) {
    for (let x = 0; x < dim.w; x++) {
      const si = ((row * dim.h + y) * sheet.width + (dir * dim.w + x)) * 4;
      const di = (y * dim.w + x) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = sheet.data[si + k];
    }
  }
  return out;
}

const studdedFrames = [];
for (const [action, spec] of Object.entries(data.actions)) {
  for (let f = 0; f < spec.frames; f++) {
    for (const dir of data.dirs) {
      if (isStudded(sheetFrame(spec.row + f, dir))) studdedFrames.push(`${action}/dir${dir}/frame${f}`);
    }
  }
}
check(`no studded sole in any baked frame (checked ${Object.values(data.actions).reduce((n, a) => n + a.frames, 0) * data.dirs.length})`,
  studdedFrames.length === 0);
if (studdedFrames.length) console.log(`        studded: ${studdedFrames.join(', ')}`);

// The sheet is baked from a figure string; if it drifts from the shoe we
// vetted, the frames above are testing an outfit nobody ships.
check("the baked sheet's figure uses a vetted plain shoe (sh-300)",
  /(^|\.)sh-300-/.test(data.figure));

console.log(failed ? `\n${failed} test(s) failed` : '\nall default-avatar shoe tests passed');
process.exit(failed ? 1 : 0);
