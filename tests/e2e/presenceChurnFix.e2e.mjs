// Regression test for the permanent-peer-loss bug in js/supabaseNet.js's
// presence sync handler.
//
// Root cause: Supabase Realtime's presence 'join'/'leave' diff events are NOT
// guaranteed to arrive as clean discrete pairs. When a peer calls
// leaveRoom() then join() again in quick succession (a real room-switch or a
// flaky connection does exactly this), the observing client can have that
// collapse into a single presence 'sync' event with no separate 'join' diff
// for the rejoin. The pre-fix _onPresenceSync only ever processed the FIRST
// sync after each of ITS OWN join() calls (`if (this._rosterSent) return;`)
// and threw every later sync away — so on an observer that stays in the room
// the whole time (never re-joins, so _rosterSent never resets), a peer lost
// this way never came back. Their name tag and Unit vanished on the 'leave'
// diff (which did fire) and nothing ever re-added them, because the one
// event that could have (sync) was unconditionally ignored.
//
// Confirmed live: two real Supabase clients, Peer doing leaveRoom()+join()
// on a still-connected session with a fixed gap before rejoining, repeated
// several times. At a ~50-100ms gap this reproduced a PERMANENT loss (no
// self-heal after 15s, no recovery via a further clean rejoin) in roughly
// 1-in-4 to 1-in-8 tries pre-fix; 0-and-100ms and 300ms+ gaps did not
// reproduce it directly, and the whole thing was 0-for-30 after the fix
// below. This test targets that confirmed 50-100ms danger zone with enough
// repeated trials that a regression is very unlikely to slip through by luck.
//
// The fix: _onPresenceSync now reconciles a shadow roster (this._roster)
// against the full presence state on EVERY sync, not just the first, and
// emits the enter/left events the discrete handlers should have fired if
// they didn't already. Run: node tests/e2e/presenceChurnFix.e2e.mjs
import { chromium } from 'playwright-core';
import { findChromium, startServer, makeChecker } from './lib.mjs';

const PORT = 8653;
const GAPS = [50, 100];
const TRIALS_PER_GAP = 8;
const { check, state } = makeChecker();
const exe = findChromium();
if (!exe) { console.error('SKIP: no local Chromium build found'); process.exit(0); }
const stamp = Date.now();

async function openPlayer(browser, port, identity) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 750 } });
  await context.addInitScript((id) => {
    localStorage.setItem('habbo-dungeons-identity', JSON.stringify(id));
    localStorage.setItem('habbo-dungeons-char', JSON.stringify({ name: id.name, figure: id.figure }));
  }, identity);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('  pageerror:', e.message));
  await page.goto(`http://localhost:${port}/?backend=supabase`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe, headless: true });

try {
  console.log(`=== presence churn: leaveRoom()+join() at ${GAPS.join('/')}ms gaps, x${TRIALS_PER_GAP} each ===\n`);

  const idWitness = {
    name: `ChurnW${stamp % 10000}`,
    figure: 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62',
    uniqueId: `e2e-churnw-${stamp}`,
    verifiedAt: new Date().toISOString(),
    classId: 'cleric',
  };
  const idPeer = {
    name: `ChurnP${stamp % 10000}`,
    figure: 'hr-100-61.hd-180-1.ch-210-66.lg-270-82.sh-290-80',
    uniqueId: `e2e-churnp-${stamp}`,
    verifiedAt: new Date().toISOString(),
    classId: 'ranger',
  };

  const W = await openPlayer(browser, PORT, idWitness);
  const P = await openPlayer(browser, PORT, idPeer);
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
  const roomId = await W.page.evaluate(() => window.game.room.id);

  // Witness joins once and stays put for the whole test — this is what makes
  // the bug possible: Witness's own _rosterSent never resets, so it depends
  // entirely on correctly reconciling every subsequent sync.
  await W.page.evaluate((rid) => { if (window.__debug.net.room !== rid) window.__debug.net.join(rid); }, roomId);
  await P.page.evaluate((rid) => { if (window.__debug.net.room !== rid) window.__debug.net.join(rid); }, roomId);
  const nameP = idPeer.name;

  await W.page.waitForFunction(
    (n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()),
    nameP, { timeout: 15000 },
  );
  console.log('initial join confirmed\n');

  for (const gap of GAPS) {
    for (let t = 1; t <= TRIALS_PER_GAP; t++) {
      await P.page.evaluate(() => window.__debug.net.leaveRoom());
      await W.page.waitForTimeout(gap);
      await P.page.evaluate((rid) => window.__debug.net.join(rid), roomId);
      const reappeared = await W.page.waitForFunction(
        (n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()),
        nameP, { timeout: 6000 },
      ).then(() => true).catch(() => false);
      check(`gap=${gap}ms trial ${t}/${TRIALS_PER_GAP}: peer reappears after leaveRoom()+join()`, reappeared);
      if (!reappeared) break; // loss is permanent pre-fix; no point burning more trials in this group
      // Settle a beat before the next trial so we're not racing the previous
      // join's own presence sync.
      await W.page.waitForTimeout(400);
    }
  }

  console.log(state.failed === 0
    ? '\nALL CHECKS PASSED — no permanent peer loss across leaveRoom()+join() churn'
    : `\n${state.failed} CHECK(S) FAILED — peer permanently vanished from the observer's roster`);

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
