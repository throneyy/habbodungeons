// README Tests-block guard — run with:  node tests/readmeTests.test.js
//
// The README's Tests section described five suites that did not exist anywhere
// in this repository for its entire history: it was copied wholesale from an
// unrelated project by 0c4977f, at a commit where tests/ did not exist at all.
// Nothing detected that, because nothing ever compared the document to the
// tree. It also drifted the other way — real suites went unlisted, and one
// count was written from memory instead of measured (19 vs the real 18).
//
// So this asserts the block matches reality, in both directions:
//   - every suite the README lists exists on disk
//   - every unit suite on disk is listed in the README
//   - every claimed check count equals what that suite actually prints
//   - quarantined suites are never advertised as part of the blocking run
//
// It executes the other unit suites to count their assertions, skipping itself
// (running itself would recurse). That costs about a second and buys a document
// that cannot quietly become fiction again.
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';

let failed = 0;
function check(label, cond) {
  if (!cond) failed++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}`);
}

const ROOT = new URL('..', import.meta.url);
const SELF = basename(fileURLToPath(import.meta.url));
const readme = readFileSync(new URL('README.md', ROOT), 'utf8');

// ---- what the README claims -------------------------------------------------
// `.*?` rather than `[^(]*`: a description may itself contain parentheses —
// the studded-sole line says "(cleat)" — so the count must be read from the
// trailing "(N checks)", not from the first bracket on the line.
const claims = new Map(
  [...readme.matchAll(/node (tests\/[\w.]+\.test\.js)\s+#.*?\((\d+) checks\)/g)]
    .map((m) => [m[1].replace('tests/', ''), Number(m[2])])
);
check('the README lists at least one unit suite with a check count', claims.size > 0);

// ---- what is actually on disk ----------------------------------------------
const onDisk = readdirSync(new URL('tests/', ROOT))
  .filter((f) => f.endsWith('.test.js'))
  .sort();
const quarantined = readdirSync(new URL('tests/quarantine/', ROOT))
  .filter((f) => f.endsWith('.test.js'))
  .sort();

// ---- neither direction may drift -------------------------------------------
console.log('README <-> tests/ agree:');
for (const [file] of claims) {
  check(`listed suite exists: tests/${file}`, onDisk.includes(file));
}
// Every suite must be MENTIONED. Most carry a measured count; this guard is
// listed without one, because verifying its own count would mean running
// itself, and a suite whose output depends on running itself cannot have a
// stable count. Being unlisted is the failure that actually happened, so
// mention is what gets asserted.
for (const file of onDisk) {
  check(`suite on disk is documented: tests/${file}`, readme.includes(`tests/${file}`));
  if (file !== SELF) {
    check(`suite on disk carries a check count: tests/${file}`, claims.has(file));
  }
}

// A quarantined suite must never appear as part of the blocking run — that is
// the whole point of the directory.
console.log('\nquarantine stays out of the blocking run:');
for (const file of quarantined) {
  check(`quarantined suite not listed as a unit suite: ${file}`, !claims.has(file));
}
check('the README documents the quarantine directory',
  readme.includes('tests/quarantine/'));

// ---- counts must be measured, not remembered -------------------------------
console.log('\nclaimed check counts match reality:');
let total = 0;
for (const [file, claimed] of claims) {
  if (!onDisk.includes(file)) continue; // already failed above
  const out = execFileSync(process.execPath, [fileURLToPath(new URL(`tests/${file}`, ROOT))], {
    encoding: 'utf8',
    cwd: fileURLToPath(ROOT),
  });
  // Every suite in this repo prints one indented `ok`/`FAIL` line per assertion.
  const actual = (out.match(/^\s+(ok|FAIL)/gm) || []).length;
  total += actual;
  check(`tests/${file}: README says ${claimed}, suite prints ${actual}`, actual === claimed);
}

// ---- and the headline totals ------------------------------------------------
console.log('\nheadline totals:');
const header = readme.match(/npm test\s+#\s*all (\d+) unit suites below \((\d+) checks\)/);
check('the README states a suite count and a total check count', Boolean(header));
if (header) {
  // Suite count is every file `npm test` runs, including this guard. The check
  // total covers the suites that carry a documented count — this guard's own
  // assertions are deliberately outside it, for the reason given above.
  check(`suite count: README says ${header[1]}, tests/ holds ${onDisk.length}`,
    Number(header[1]) === onDisk.length);
  check(`documented checks: README says ${header[2]}, those suites print ${total}`,
    Number(header[2]) === total);
}

console.log(failed ? `\n${failed} README/tests mismatch(es)` : '\nREADME Tests block matches the tree');
process.exit(failed ? 1 : 0);
