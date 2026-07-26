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
// Sequential-within-a-run is not enough on this machine: six git worktrees
// share one Supabase project and one set of ports, so the e2e mode also takes
// a MACHINE-WIDE lock (see below). Unit and quarantine runs are pure and never
// wait for it.
//
// QUARANTINE is advisory: its suites are known-broken code recovered from an
// abandoned history (see tests/quarantine/README.md) and their failures must
// never gate a commit, so that mode reports and exits 0. It still runs them,
// because a quarantine nobody executes is just a folder of dead files — this
// way the day a suite starts passing is visible instead of discovered years
// later.
import { spawn } from 'node:child_process';
import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

// ------------------------------------------------------- cross-worktree lock
// The e2e suites are already serialized WITHIN a run (see the header). Six git
// worktrees on one machine break that guarantee from the outside: each has its
// own checkout and its own runner, but they share one Supabase project, one
// machine's ports, and one anonymous-sign-in quota (30/hour per IP, a token
// bucket that refills one token every two minutes).
//
// So the lock is machine-wide, not process-wide. It is a directory rather than
// a file because mkdir is atomic on every filesystem — two runners racing the
// same mkdir, one wins, no read-then-write window to lose.
//
// The lock records its owner pid so a crashed run can be distinguished from a
// live one: a stale lock whose pid is gone is reclaimed automatically, because
// the alternative is an agent hand-deleting lock directories, and an agent that
// has learned to delete locks will delete a live one.
const LOCK = join(tmpdir(), 'habbo-dungeons-e2e.lock');
const STALE_MS = 30 * 60_000;

const pidAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

async function acquireLock() {
  const started = Date.now();
  let announced = false;
  for (;;) {
    try {
      mkdirSync(LOCK);
      writeFileSync(join(LOCK, 'owner'), `${process.pid}\n${ROOT}\n${new Date().toISOString()}\n`);
      return () => { try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* already gone */ } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let owner = '';
      let pid = 0;
      let age = Infinity;
      try {
        owner = readFileSync(join(LOCK, 'owner'), 'utf8');
        pid = Number(owner.split('\n')[0]);
        age = Date.now() - statSync(join(LOCK, 'owner')).mtimeMs;
      } catch { /* mid-write by the holder, or already released */ }
      if ((pid && !pidAlive(pid)) || age > STALE_MS) {
        console.log(`  reclaiming stale e2e lock (pid ${pid || '?'} gone)`);
        try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* raced */ }
        continue;
      }
      if (!announced) {
        const who = (owner.split('\n')[1] || 'another worktree').trim();
        console.log(`waiting for the machine-wide e2e lock, held by:\n  ${who}`);
        announced = true;
      }
      if (Date.now() - started > 45 * 60_000) {
        throw new Error(`gave up waiting for ${LOCK} after 45min — check for a wedged run`);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

const run = (file) => new Promise((resolve) => {
  const child = spawn(process.execPath, [join(mode.dir, file)], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  child.on('exit', (code, signal) => resolve(signal ? `signal ${signal}` : code ?? 1));
  child.on('error', (e) => resolve(`spawn failed: ${e.message}`));
});

// Only e2e touches the shared machine and the shared Supabase project. Unit
// and quarantine suites are pure, and must never queue behind another
// worktree's browser run.
const release = mode.label === 'e2e' ? await acquireLock() : () => {};
process.on('exit', release);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { release(); process.exit(130); });

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
  release();
  process.exit(0);
}
release();
process.exit(failures.length ? 1 : 0);
