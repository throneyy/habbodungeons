// Verifies the fix in js/supabaseNet.js: move() no longer calls
// roomChannel.track() on every step. Drives TWO real browser contexts against
// the REAL Supabase backend (this project's live project ref/anon key baked
// into index.html) — not a mock — joining the same Free Roam room, walking
// continuously, and polling BOTH clients' actual game state every 2s for 70s+
// to catch any transient "disappear/reappear" (the presence-thrash symptom
// track()-per-step would cause), not just a single end-of-test snapshot.
//
// Run: node tests/e2e/moveTrackFix.e2e.mjs
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { findChromium, startServer, makeChecker, portFor } from './lib.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = portFor(34); // per-worktree base (lib.mjs), was 8634
const RUN_MS = 70000; // > the requested 60s, with margin
const POLL_MS = 2000;
const { check, state } = makeChecker();
mkdirSync(join(ROOT, '.gg', 'screenshots'), { recursive: true });

const exe = findChromium();
if (!exe) {
  console.error('SKIP: no local Chromium build found (npx playwright install chromium)');
  process.exit(0);
}

// Distinct identities so this run never collides with a previous one's
// leftover room_presence row (fresh uniqueId each run).
const stamp = Date.now();
async function openPlayer(browser, port, name) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 750 } });
  const identity = {
    name,
    figure: 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62',
    uniqueId: `e2e-${name.toLowerCase()}-${stamp}`,
    verifiedAt: new Date().toISOString(),
    classId: 'fighter',
  };
  await context.addInitScript((id) => {
    localStorage.setItem('habbo-dungeons-identity', JSON.stringify(id));
    localStorage.setItem('habbo-dungeons-char', JSON.stringify({ name: id.name, figure: id.figure }));
  }, identity);
  const page = await context.newPage();
  const tag = `[${name}]`;
  page.on('pageerror', (e) => console.error(`  ${tag} pageerror:`, e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error(`  ${tag} console.error:`, m.text());
  });
  // Force the real Supabase transport: this repo has no local server.js (see
  // lib.mjs) — on localhost isSupabase() defaults to false (dead WS hub), so
  // without this override every "connect" would silently be solo-local and
  // every check below would be a false positive.
  await page.goto(`http://localhost:${port}/?backend=supabase`, { waitUntil: 'domcontentloaded' });
  return page;
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe, headless: true });

try {
  console.log('move() track()-removal — two real Supabase clients, 70s soak');

  const a = await openPlayer(browser, PORT, `Ann${stamp % 10000}`);
  const b = await openPlayer(browser, PORT, `Bob${stamp % 10000}`);

  // Enter Free Roam (title -> #btnPlay -> startExplore -> net.connect + join)
  await a.click('#btnPlay');
  await b.click('#btnPlay');
  await a.waitForSelector('.dr-dock', { timeout: 15000 });
  await b.waitForSelector('.dr-dock', { timeout: 15000 });

  // Both must be on the SAME room, and both must actually reach the real
  // Supabase-connected state (not silently solo-local — that would be a
  // false positive: each client only ever sees itself).
  await a.waitForFunction(() => window.game.room, { timeout: 10000 });
  await b.waitForFunction(() => window.game.room, { timeout: 10000 });
  const roomA = await a.evaluate(() => window.game.room.id);
  const roomB = await b.evaluate(() => window.game.room.id);
  check('both clients land in the same starting room', roomA === roomB);

  const connectedA = await a.waitForFunction(() => window.__debug.net.connected === true, { timeout: 15000 })
    .then(() => true).catch(() => false);
  const connectedB = await b.waitForFunction(() => window.__debug.net.connected === true, { timeout: 15000 })
    .then(() => true).catch(() => false);
  check('client A reached real net.connected === true (not solo fallback)', connectedA);
  check('client B reached real net.connected === true (not solo fallback)', connectedB);
  if (!connectedA || !connectedB) throw new Error('multiplayer never actually connected — aborting soak (would only prove solo-local rendering)');

  const nameA = await a.evaluate(() => window.__debug.net.name);
  const nameB = await b.evaluate(() => window.__debug.net.name);

  // Cross-client roster: each must see the OTHER as a real remote Unit before
  // we start moving — this is the actual cross-browser sync claim, not just
  // "my own avatar renders".
  const seesBOnA = await a.waitForFunction(
    (n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()),
    nameB,
    { timeout: 20000 }
  ).then(() => true).catch(() => false);
  const seesAOnB = await b.waitForFunction(
    (n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()),
    nameA,
    { timeout: 20000 }
  ).then(() => true).catch(() => false);
  check(`A sees B (${nameB}) as a remote unit`, seesBOnA);
  check(`B sees A (${nameA}) as a remote unit`, seesAOnB);

  // Confirm the fix is actually live in the served bundle (belt + suspenders
  // against stale dev-server cache masking a false pass).
  const src = await a.evaluate(() => fetch('/js/supabaseNet.js').then((r) => r.text()));
  const moveBody = src.slice(src.indexOf('move(x, y)'), src.indexOf('chat(text'));
  check('served supabaseNet.js move() contains no track() call', !moveBody.includes('.track('));
  check('served supabaseNet.js move() still broadcasts "moved"', moveBody.includes("event: 'moved'"));

  // Drive continuous walking on both sides for the full soak window, polling
  // BOTH clients' view of the OTHER every 2s so a transient drop mid-run is
  // caught (not just checked once at t=0 and t=end).
  const drive = async (page, otherName, oppositeCorner) => {
    // Bounce the local unit between two corners of the starting room via the
    // real choke point (walkTo → net.move), same as clicking tiles.
    return page.evaluate(async ({ other, corner }) => {
      const g = window.game;
      const room = g.room;
      const corners = [
        { x: room.spawn.x, y: room.spawn.y },
        corner,
      ];
      let i = 0;
      window.__soak = { drops: 0, lastSeen: performance.now(), samples: [] };
      const iv = setInterval(() => {
        const has = [...window.__debug.remote.units.keys()].includes(other.toLowerCase());
        const now = performance.now();
        if (has) window.__soak.lastSeen = now;
        else window.__soak.drops++;
        window.__soak.samples.push(has);
        if (g.unit && g.unit.walkTo) {
          const dest = corners[i % corners.length];
          i++;
          g.unit.walkTo(dest.x, dest.y);
        }
      }, 900); // ~1 step/sec — realistic walking cadence
      window.__soakStop = () => clearInterval(iv);
    }, { other: otherName, corner: oppositeCorner });
  };

  // Pick a destination a few tiles from spawn inside the current room bounds.
  const cornerA = await a.evaluate(() => {
    const r = window.game.room;
    return { x: Math.min(r.spawn.x + 3, r.w - 1), y: Math.min(r.spawn.y + 3, r.h - 1) };
  });
  const cornerB = await b.evaluate(() => {
    const r = window.game.room;
    return { x: Math.max(r.spawn.x - 3, 0), y: Math.max(r.spawn.y - 3, 0) };
  });

  await drive(a, nameB, cornerA);
  await drive(b, nameA, cornerB);

  console.log(`  soaking ${RUN_MS / 1000}s with continuous movement on both clients...`);
  const start = Date.now();
  let worstGapA = 0;
  let worstGapB = 0;
  while (Date.now() - start < RUN_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const [sa, sb] = await Promise.all([
      a.evaluate(() => ({ lastSeen: window.__soak.lastSeen, drops: window.__soak.drops, now: performance.now() })),
      b.evaluate(() => ({ lastSeen: window.__soak.lastSeen, drops: window.__soak.drops, now: performance.now() })),
    ]);
    worstGapA = Math.max(worstGapA, sa.now - sa.lastSeen);
    worstGapB = Math.max(worstGapB, sb.now - sb.lastSeen);
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`  t+${elapsed}s  A sees B: gap=${Math.round(sa.now - sa.lastSeen)}ms drops=${sa.drops}   B sees A: gap=${Math.round(sb.now - sb.lastSeen)}ms drops=${sb.drops}`);
  }

  await a.evaluate(() => window.__soakStop && window.__soakStop());
  await b.evaluate(() => window.__soakStop && window.__soakStop());

  const finalA = await a.evaluate(() => window.__soak);
  const finalB = await b.evaluate(() => window.__soak);

  // A brief gap (one missed poll right at a room re-render) is tolerable;
  // an outright disappearance shows as a gap spanning multiple poll periods.
  const MAX_TOLERABLE_GAP_MS = POLL_MS * 3;
  check(`A never lost sight of B for > ${MAX_TOLERABLE_GAP_MS}ms during the soak`, worstGapA <= MAX_TOLERABLE_GAP_MS);
  check(`B never lost sight of A for > ${MAX_TOLERABLE_GAP_MS}ms during the soak`, worstGapB <= MAX_TOLERABLE_GAP_MS);
  check('A recorded zero true drop-samples', finalA.drops === 0);
  check('B recorded zero true drop-samples', finalB.drops === 0);

  // Still present at the very end, still walking (not frozen).
  const stillA = await a.evaluate((n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()), nameB);
  const stillB = await b.evaluate((n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()), nameA);
  check('B still visible on A at soak end', stillA);
  check('A still visible on B at soak end', stillB);

  await a.screenshot({ path: join(ROOT, '.gg', 'screenshots', 'soak-clientA-end.png') });
  await b.screenshot({ path: join(ROOT, '.gg', 'screenshots', 'soak-clientB-end.png') });

  console.log(state.failed === 0 ? '\nALL CHECKS PASSED' : `\n${state.failed} CHECK(S) FAILED`);
} catch (e) {
  console.error('ERROR:', e.stack || e.message);
  state.failed++;
} finally {
  await browser.close();
  server.kill();
}
process.exit(state.failed ? 1 : 0);
