// Rendered-glyph tests — run with:  node tests/uiGlyphs.test.js
//
// The UI is drawn in Volter, the Habbo pixel font, and Volter has no em dash.
// A string containing one does not fall back to a hyphen: the glyph slot lands
// on a MUSICAL NOTE, so "The party makes camp — Alice is deciding…" shipped to
// players as "The party makes camp ♫ Alice is deciding…". It was caught in an
// e2e screenshot (tests/e2e/coopFallen.e2e.mjs, state 7), which is the only
// place it could be caught: nothing throws, no assertion on the TEXT fails,
// because the text is perfectly correct. Only the pixels are wrong.
//
// So this guards the source instead. Em dashes are fine in comments — they
// never reach a canvas — but not in a string literal that can reach the DOM.
//
// The separator convention in their UI is the middle dot (·), which Volter
// does have: "ATK 11 · DEF 7 · SPD 5". Prose takes a colon or a hyphen.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let failed = 0;
function check(label, cond) {
  if (!cond) failed++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}`);
}

const JS = fileURLToPath(new URL('../js/', import.meta.url));
const EM_DASH = '\u2014';

// Glyphs Volter cannot draw, mapped to what to use instead. The em dash is the
// one that bit; the others are the neighbours a well-meaning autocorrect
// reaches for next, and they fail the same way.
const BANNED = [
  [EM_DASH, 'em dash', 'use : or - in prose, \u00b7 between a label and its value'],
  ['\u2013', 'en dash', 'use - or \u00b7'],
];

/** Strip comments, then return the string literals left on the line.
 *
 *  Deliberately conservative: it walks the line character by character
 *  tracking quote state, so a `//` inside a string ("http://…") does not look
 *  like a comment and an apostrophe inside a comment does not open a string.
 *  Template literals count — most of the rendered text in this codebase is
 *  built with them. */
function literalsOf(line) {
  const out = [];
  let quote = null;
  let buf = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') { buf += c + (line[i + 1] || ''); i++; continue; }
      if (c === quote) { out.push(buf); buf = ''; quote = null; continue; }
      buf += c;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; buf = ''; continue; }
    if (c === '/' && (line[i + 1] === '/' || line[i + 1] === '*')) break; // comment
  }
  return out;
}

// Recursive: UI strings live in js/ AND in js/screens/ (the title screen), and
// a non-recursive readdir silently skipped the latter -- an em dash shipped in
// a class tooltip and a leaderboard error before this was widened.
const files = readdirSync(JS, { recursive: true })
  .map((f) => String(f).replace(/\\/g, '/'))
  .filter((f) => f.endsWith('.js'))
  .sort();

// ---- the scan ---------------------------------------------------------------
console.log('no unrenderable glyphs in UI strings');
const offenders = [];
for (const file of files) {
  const src = readFileSync(join(JS, file), 'utf8');
  src.split('\n').forEach((line, i) => {
    // A line-leading comment (including JSDoc continuations) is prose about the
    // code, not code: skip before doing any quote tracking at all.
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    for (const lit of literalsOf(line)) {
      for (const [glyph, name] of BANNED) {
        if (lit.includes(glyph)) {
          offenders.push({ where: `${file}:${i + 1}`, name, text: lit.trim().slice(0, 60) });
        }
      }
    }
  });
}

check(`${files.length} source files scanned`, files.length > 20);
if (offenders.length) {
  for (const o of offenders) {
    console.log(`        ${o.where}  ${o.name} in: ${o.text}`);
  }
}
check('no string literal carries a glyph Volter cannot draw', offenders.length === 0);

// ---- the scanner is not asleep ----------------------------------------------
// A guard that cannot fail guards nothing, so prove it sees each case.
console.log('\nthe scanner works');
check('it finds an em dash in a single-quoted string',
  literalsOf(`const a = 'party ${EM_DASH} camp';`).some((s) => s.includes(EM_DASH)));
check('it finds one in a template literal',
  literalsOf('const a = `turn ${x} ' + EM_DASH + ' go`;').some((s) => s.includes(EM_DASH)));
check('it IGNORES one in a trailing comment',
  literalsOf(`const a = 'ok'; // a note ${EM_DASH} harmless`).every((s) => !s.includes(EM_DASH)));
check('it ignores one in a whole-line comment',
  literalsOf(`  // the Hand ${EM_DASH} a battle toolbar`).length === 0);
check('a URL is not mistaken for a comment',
  literalsOf(`const u = 'http://x.test/a';`)[0] === 'http://x.test/a');
check('an apostrophe in a comment does not open a string',
  literalsOf(`const a = 1; // don't ${EM_DASH} really`).every((s) => !s.includes(EM_DASH)));

// ---- the replacement glyph is safe -----------------------------------------
// The middle dot is not merely "different", it is the one already proven to
// render: the camp screenshots show "ATK 11 · DEF 7 · SPD 5 · MOV 4".
console.log('\nthe separator actually used');
const dotUsers = files.filter((f) => readFileSync(join(JS, f), 'utf8').includes('\u00b7'));
check('the middle dot is the established separator', dotUsers.length >= 3);

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall UI glyph checks passed');
process.exit(failed ? 1 : 0);
