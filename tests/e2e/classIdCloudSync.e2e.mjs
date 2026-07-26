// Regression test for account-level classId persistence.
//
// Root problem: Identity.setClass() (js/identity.js) only ever wrote the
// picked calling into localStorage. Clearing site data, or opening the game
// on a different device/browser, silently reset a verified player back to
// the 'fighter' default (js/supabaseNet.js's fallback) with total loss of
// their previous class pick -- nothing server-side remembered it.
//
// Fix: profiles.class_id (supabase/migrations/20260726000000_...sql) plus
// setClass() mirroring classId to the cloud profile the same way
// verify()/sync() already mirror figure/skills, and loadFromCloud() pulling
// classId back down when a verified session can reach the server.
//
// This test proves the actual cross-device scenario against the REAL
// Supabase project (same one every other e2e suite in this repo uses, no
// mocks): set a class while "signed in" (a real, persisted Supabase Auth
// session -- anonymous sign-in is a first-class authenticated user for RLS
// purposes, identical to email sign-in for this purpose), then simulate a
// completely fresh browser by opening a NEW isolated context with the
// in-game identity wiped but the SAME Supabase Auth session transplanted
// (exactly what a real cross-device login re-establishes: the same
// auth.uid(), hence the same `profiles` row) -- and confirm classId still
// resolves correctly from the server, not the 'fighter'/null default.
//
// Run: node tests/e2e/classIdCloudSync.e2e.mjs
import { chromium } from 'playwright-core';
import { findChromium, startServer, makeChecker, portFor } from './lib.mjs';

const PORT = portFor(54); // per-worktree base (lib.mjs), was 8654
const { check, state } = makeChecker();
const exe = findChromium();
if (!exe) { console.error('SKIP: no local Chromium build found'); process.exit(0); }
const stamp = Date.now();

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe, headless: true });

try {
  console.log('=== classId cloud sync: survives a cleared localStorage on a fresh browser ===\n');

  const name = `ClassSync${stamp % 100000}`;
  const figure = 'hr-100-61.hd-180-1.ch-210-66.lg-270-82.sh-290-80';

  // --- Context A: the "original device" -----------------------------------
  const ctxA = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctxA.addInitScript((id) => {
    localStorage.setItem('habbo-dungeons-identity', JSON.stringify(id));
    localStorage.setItem('habbo-dungeons-char', JSON.stringify({ name: id.name, figure: id.figure }));
  }, {
    name, figure,
    uniqueId: `e2e-classsync-${stamp}`,
    verifiedAt: new Date().toISOString(),
    classId: 'fighter',
  });
  const pageA = await ctxA.newPage();
  pageA.on('pageerror', (e) => console.error('  [A] pageerror:', e.message));
  await pageA.goto(`http://localhost:${PORT}/?backend=supabase`, { waitUntil: 'domcontentloaded' });

  const gotUser = await pageA.evaluate(async () => {
    const u = await window.__debug.Auth.ensureSession();
    return !!u;
  });
  check('context A: a real Supabase Auth session was established', gotUser);

  const beforePick = await pageA.evaluate(() => window.__debug.Identity.classId());
  console.log(`context A classId before pick: ${JSON.stringify(beforePick)}`);

  const mirrorErr = await pageA.evaluate(async () => {
    window.__debug.Identity.setClass('cleric');
    // setClass() fires mirror() fire-and-forget; await an explicit second
    // call (idempotent -- just re-syncs current local state) so the test
    // doesn't race the network write.
    return window.__debug.Identity.mirror();
  });
  // mirror() returns null on success and an error/skip object otherwise. This
  // was `=== true` when mirror() returned `!error`; the contract inverted.
  // Comparing against null rather than falsiness keeps it strict -- a
  // {skipped:'no-session'} return means the row was never written, not a pass.
  console.log(`context A mirror() -> ${JSON.stringify(mirrorErr)}`);
  check('context A: setClass(\'cleric\') mirrored to the cloud profile successfully', mirrorErr === null);

  const localAfterPick = await pageA.evaluate(() => window.__debug.Identity.classId());
  console.log(`context A classId after pick: ${JSON.stringify(localAfterPick)}\n`);
  check('context A: local classId is \'cleric\' immediately after picking', localAfterPick === 'cleric');

  // Grab the persisted Supabase Auth session token(s) -- this IS the account
  // credential; copying it into a fresh context is exactly what a real
  // cross-device sign-in re-establishes (same auth.uid(), same profiles row).
  const authEntries = await pageA.evaluate(() => {
    const out = {};
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('sb-') && k.includes('auth-token')) out[k] = localStorage.getItem(k);
    }
    return out;
  });
  const authKeys = Object.keys(authEntries);
  console.log(`captured Supabase Auth storage key(s): ${JSON.stringify(authKeys)}\n`);
  check('context A: found a persisted Supabase Auth session to transplant', authKeys.length > 0);

  // --- Context B: a completely fresh browser, SAME account ----------------
  // Deliberately does NOT seed habbo-dungeons-identity/char (cleared site
  // data) -- only the transplanted auth session, which is the one thing that
  // makes it "the same verified account" rather than a stranger.
  const ctxB = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  if (authKeys.length > 0) {
    await ctxB.addInitScript((entries) => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, authEntries);
  }
  const pageB = await ctxB.newPage();
  pageB.on('pageerror', (e) => console.error('  [B] pageerror:', e.message));
  await pageB.goto(`http://localhost:${PORT}/?backend=supabase`, { waitUntil: 'domcontentloaded' });

  const freshLocalIdentity = await pageB.evaluate(() => window.__debug.Identity.get());
  console.log(`context B (fresh browser) local identity before any load: ${JSON.stringify(freshLocalIdentity)}`);
  check('context B: app identity is genuinely empty (simulated cleared site data)', !freshLocalIdentity);

  const sameUser = await pageB.evaluate(async () => {
    const u = await window.__debug.Auth.user();
    return !!u;
  });
  check('context B: the transplanted session authenticates as a real user', sameUser);

  const restored = await pageB.evaluate(() => window.__debug.Identity.loadFromCloud());
  console.log(`context B: loadFromCloud() result: ${JSON.stringify(restored)}\n`);
  check('context B: loadFromCloud() resolved a profile (not null)', !!restored);
  check('context B: restored classId is \'cleric\' (not the fighter/null default)', restored && restored.classId === 'cleric');

  const localAfterLoad = await pageB.evaluate(() => window.__debug.Identity.classId());
  check('context B: Identity.classId() now reads \'cleric\' from local storage', localAfterLoad === 'cleric');

  console.log(state.failed === 0
    ? '\nALL CHECKS PASSED — classId survives a cleared localStorage / fresh browser for a signed-in account'
    : `\n${state.failed} CHECK(S) FAILED`);

  await ctxA.close();
  await ctxB.close();
} catch (e) {
  console.error('ERROR:', e.stack || e.message);
  state.failed++;
} finally {
  await browser.close();
  server.kill();
}
process.exit(state.failed ? 1 : 0);
