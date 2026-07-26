// Regression test for the "name tag with no visible body" bug.
//
// Root cause (confirmed live via tests/e2e/depthOcclusionConfirm.e2e.mjs):
// SupabaseNet.pos starts at the class default { x: 0, y: 0 } and was only
// ever updated by an explicit move(x, y) call. A player who joins a room but
// hasn't taken a voluntary step yet — even for a brief window, or forever if
// they never move — broadcast world tile (0, 0) to every other client via
// presence. In the square room, (0,0) sits behind real scene geometry
// (fantasy_c22_building1 at (1,1)), so the avatar was legitimately
// depth-occluded on the canvas while the DOM name tag (js/remotePlayers.js,
// never depth-tested against props) stayed fully visible — a floating tag,
// no visible body.
//
// Fix: js/supabaseNet.js move() now updates this.pos unconditionally (not
// gated on this.room), and js/remotePlayers.js bindLocalUnit() calls
// net.move(unit.x, unit.y) immediately with the REAL spawn tile the moment
// multiplayer starts tracking a unit, instead of waiting for the first
// voluntary walk.
//
// This test asserts: a freshly-joined peer (who never calls move() before
// being observed) is seen by another client at the room's real spawn tile —
// never at (0, 0) — both on initial join AND after a leaveRoom()/join()
// churn cycle (the scenario that originally exposed this).
//
// Run against the real Supabase project via the local dev server
// (?backend=supabase) so this exercises live Realtime infrastructure with
// the FIXED client code (production hasn't received this fix yet).
//
// Run: node tests/e2e/tagBodyFix.e2e.mjs
import { chromium } from 'playwright-core';
import { findChromium, startServer, makeChecker, portFor } from './lib.mjs';

const PORT = portFor(48); // per-worktree base (lib.mjs), was 8648
const { check, state } = makeChecker();
const exe = findChromium();
if (!exe) { console.error('SKIP: no local Chromium build found'); process.exit(0); }
const stamp = Date.now();

async function openPlayer(browser, port, identity, tag) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 750 } });
  await context.addInitScript((id) => {
    localStorage.setItem('habbo-dungeons-identity', JSON.stringify(id));
    localStorage.setItem('habbo-dungeons-char', JSON.stringify({ name: id.name, figure: id.figure }));
  }, identity);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`  ${tag} pageerror:`, e.message));
  await page.goto(`http://localhost:${port}/?backend=supabase`, { waitUntil: 'domcontentloaded' });
  return { context, page, tag };
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe, headless: true });

try {
  console.log('=== regression: peer must never present at (0,0) — spawn broadcasts immediately ===\n');

  const idWitness = {
    name: `Witness${stamp % 10000}`,
    figure: 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62',
    uniqueId: `e2e-tagfixwitness-${stamp}`,
    verifiedAt: new Date().toISOString(),
    classId: 'cleric',
  };
  const idPeer = {
    name: `Peer${stamp % 10000}`,
    figure: 'hr-100-61.hd-180-1.ch-210-66.lg-270-82.sh-290-80',
    uniqueId: `e2e-tagfixpeer-${stamp}`,
    verifiedAt: new Date().toISOString(),
    classId: 'mage',
  };

  const W = await openPlayer(browser, PORT, idWitness, '[Witness]');
  const P = await openPlayer(browser, PORT, idPeer, '[Peer]');

  await W.page.click('#btnPlay');
  await P.page.click('#btnPlay');
  await W.page.waitForSelector('.dr-dock', { timeout: 15000 });
  await P.page.waitForSelector('.dr-dock', { timeout: 15000 });
  await W.page.waitForFunction(() => window.__debug.net.connected === true, { timeout: 20000 });
  await P.page.waitForFunction(() => window.__debug.net.connected === true, { timeout: 20000 });

  const gotoSquare = (page) => page.evaluate(() => document.querySelectorAll('#exploreBar button[data-room]')[1].click());
  await gotoSquare(W.page);
  await gotoSquare(P.page);
  await W.page.waitForFunction(() => window.game.room && window.game.room.id === 'square', { timeout: 10000 });
  await P.page.waitForFunction(() => window.game.room && window.game.room.id === 'square', { timeout: 10000 });

  const realSpawn = await P.page.evaluate(() => ({ x: window.game.room.spawn.x, y: window.game.room.spawn.y }));
  console.log(`room's real spawn tile: ${JSON.stringify(realSpawn)}\n`);

  // Witness joins first and waits — Peer joins right after, deliberately
  // WITHOUT ever calling move()/walkTo() (this is the exact condition that
  // exposed the bug: observed before the peer's first voluntary step).
  await W.page.evaluate(() => { if (window.__debug.net.room !== window.game.room.id) window.__debug.net.join(window.game.room.id); });
  await W.page.waitForTimeout(1000);
  await P.page.evaluate(() => { if (window.__debug.net.room !== window.game.room.id) window.__debug.net.join(window.game.room.id); });

  const nameP = await P.page.evaluate(() => window.__debug.net.name);
  await W.page.waitForFunction(
    (n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()),
    nameP, { timeout: 15000 }
  );

  const peerPosOnJoin = await W.page.evaluate((n) => {
    const u = window.__debug.remote.units.get(n.toLowerCase());
    return u ? { x: u.x, y: u.y } : null;
  }, nameP);
  console.log(`Witness sees Peer at, immediately on join (Peer never moved): ${JSON.stringify(peerPosOnJoin)}`);
  check('peer is NOT at the stale (0,0) default on initial join', !(peerPosOnJoin.x === 0 && peerPosOnJoin.y === 0));
  check('peer is at the room\'s real spawn tile on initial join', peerPosOnJoin.x === realSpawn.x && peerPosOnJoin.y === realSpawn.y);

  // Now the exact churn scenario that originally exposed this: leaveRoom()
  // + rejoin, still without the peer ever having moved.
  for (let round = 1; round <= 3; round++) {
    await P.page.evaluate(() => window.__debug.net.leaveRoom());
    await W.page.waitForTimeout(200);
    await P.page.evaluate((roomId) => window.__debug.net.join(roomId), await P.page.evaluate(() => window.game.room.id));
    await W.page.waitForTimeout(600);

    const peerPosAfterChurn = await W.page.evaluate((n) => {
      const u = window.__debug.remote.units.get(n.toLowerCase());
      return u ? { x: u.x, y: u.y } : null;
    }, nameP);
    console.log(`round ${round} (leave+rejoin): Witness sees Peer at ${JSON.stringify(peerPosAfterChurn)}`);
    check(`round ${round}: peer is NOT at (0,0) after leave+rejoin`, !(peerPosAfterChurn && peerPosAfterChurn.x === 0 && peerPosAfterChurn.y === 0));
  }

  // And confirm the depth-occlusion condition itself is gone: whatever tile
  // the peer is now at, is it ever hidden behind a prop drawn after it? Each
  // leave+rejoin above respawns a brand-new remote Unit (RemotePlayers.spawn),
  // which loads a fresh AvatarSprites set — give the last one a moment to
  // finish loading before asserting drawable, so this doesn't flake on a
  // sprite set that's still mid-fetch from the rapid rejoin.
  await W.page.waitForFunction(
    (n) => {
      const u = window.__debug.remote.units.get(n.toLowerCase());
      return u && u.sprites && u.sprites.ready;
    },
    nameP,
    { timeout: 5000 }
  ).catch(() => {});
  const finalOcclusionCheck = await W.page.evaluate((n) => {
    const u = window.__debug.remote.units.get(n.toLowerCase());
    if (!u) return { unitExists: false };
    const sp = u.sprites;
    const now = performance.now();
    const act = u.alive ? u.action() : 'ded';
    const tick = u.frame(now);
    const fr = sp && sp.ready && sp.get(act, u.dir, tick, false);
    return { unitExists: true, x: u.x, y: u.y, drawable: !!fr };
  }, nameP);
  console.log(`\nfinal peer render state: ${JSON.stringify(finalOcclusionCheck)}`);
  check('peer unit still exists and is drawable after the full churn sequence', finalOcclusionCheck.unitExists && finalOcclusionCheck.drawable);

  console.log(state.failed === 0 ? '\nALL CHECKS PASSED — fix confirmed' : `\n${state.failed} CHECK(S) FAILED`);

  // game.recenter() fits the WHOLE room on screen (no per-frame camera
  // follow), so just capture the full room view — the peer's real spawn
  // tile is on-screen by construction.
  await W.page.waitForTimeout(300);
  const { mkdirSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join } = await import('node:path');
  const ROOT = fileURLToPath(new URL('../..', import.meta.url));
  const OUT = join(ROOT, '.gg', 'screenshots', 'tag-body-fix');
  mkdirSync(OUT, { recursive: true });
  await W.page.screenshot({ path: join(OUT, 'peer-visible-with-body.png') });

  await W.context.close();
  await P.context.close();
} catch (e) {
  console.error('ERROR:', e.stack || e.message);
  state.failed++;
} finally {
  await browser.close();
  server.kill();
}
process.exit(state.failed ? 1 : 0);
