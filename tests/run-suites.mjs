// Run every test suite in sequence and fail the whole run if any one fails.
//   node tests/run-suites.mjs unit        (npm test)           -> tests/*.test.js
//   node tests/run-suites.mjs quarantine  (npm run test:quarantine)
//   node tests/run-suites.mjs e2e         (npm run test:e2e)   -> tests/e2e/*.e2e.mjs
//
// Sequential on purpose: the e2e suites each bind real ports (a static server,
// an embedded Postgres, PostgREST) and drive real browser contexts, so running
// them concurrently would have them fight over the machine.
//
// A suite "passes" when it exits 0 — every suite here prints its own ok/FAIL
// lines and exits non-zero on failure, so this runner only aggregates.
//
// QUARANTINE is advisory: its suites are known-broken code recovered from an
// abandoned history (see tests/quarantine/README.md) and their failures must
// never gate a commit, so that mode reports and exits 0. It still runs them,
// because a quarantine nobody executes is just a folder of dead files — this
// way the day a suite starts passing is visible instead of discovered years
// later.
import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MODES = {
  unit: {
    dir: join(ROOT, 'tests'),
    match: (f) => f.endsWith('.test.js'),
    label: 'unit',
    blocking: true,
  },
  quarantine: {
    dir: join(ROOT, 'tests', 'quarantine'),
    match: (f) => f.endsWith('.test.js'),
    label: 'quarantined',
    blocking: false,
  },
  e2e: {
    dir: join(ROOT, 'tests', 'e2e'),
    match: (f) => f.endsWith('.e2e.mjs'),
    label: 'e2e',
    blocking: true,
  },
};

const mode = MODES[process.argv[2]];
if (!mode) {
  console.error(`usage: node tests/run-suites.mjs <${Object.keys(MODES).join('|')}>`);
  process.exit(2);
}
if (!existsSync(mode.dir)) {
  console.error(`no such directory: ${mode.dir}`);
  process.exit(2);
}

// readdirSync lists only this directory's entries, so tests/quarantine/ and
// tests/e2e/ are naturally excluded from `unit` — subdirectories don't match.
const suites = readdirSync(mode.dir).filter(mode.match).sort();
if (!suites.length) {
  console.error(`no ${mode.label} suites found in ${mode.dir}`);
  process.exit(2);
}

const run = (file) => new Promise((resolve) => {
  const child = spawn(process.execPath, [join(mode.dir, file)], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  child.on('exit', (code, signal) => resolve(signal ? `signal ${signal}` : code ?? 1));
  child.on('error', (e) => resolve(`spawn failed: ${e.message}`));
});

console.log(`running ${suites.length} ${mode.label} suite(s)\n`);
const failures = [];
const started = Date.now();
for (const file of suites) {
  console.log(`\u2500\u2500 ${file} ${'\u2500'.repeat(Math.max(0, 60 - file.length))}`);
  const code = await run(file);
  if (code !== 0) failures.push({ file, code });
  console.log('');
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`${'='.repeat(64)}`);
console.log(`${suites.length - failures.length}/${suites.length} ${mode.label} suite(s) passed in ${secs}s`);
for (const f of failures) console.error(`  FAILED  ${f.file} (exit ${f.code})`);

if (!mode.blocking) {
  // Advisory: report, never gate. A suite that starts passing here is a
  // candidate for promotion out of quarantine.
  if (failures.length) {
    console.log(`\n${failures.length} quarantined suite(s) still failing — advisory only, not blocking.`);
    console.log('See tests/quarantine/README.md for what each one needs.');
  } else {
    console.log('\nEvery quarantined suite passes — promote them into tests/ and drop the quarantine.');
  }
  process.exit(0);
}
process.exit(failures.length ? 1 : 0);
