// Ad-hoc diagnostic (not a fix): reproduces "my own weapon disappeared
// mid-attack" SOLO — no multiplayer, no second client. Loads as a cleric,
// attacks the real training dummy prop (fantasy_c22_trainingdummy, square
// room) repeatedly via the same onDoubleTap() code path a real double-tap
// takes, and screenshots the atk pose across many swings + the idle pose
// between them, checking whether the hammer (atk) and lantern (idle) render
// reliably on the player's OWN screen.
//
// Run: node tests/e2e/soloClericWeapon.e2e.mjs
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { findChromium, startServer, makeChecker } from './lib.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 8640;
const SWINGS = 12; // repeated attacks to catch an intermittent failure, not just one swing
const { check, state } = makeChecker();
const OUT = join(ROOT, '.gg', 'screenshots', 'solo-cleric');
mkdirSync(OUT, { recursive: true });

const exe = findChromium();
if (!exe) {
  console.error('SKIP: no local Chromium build found');
  process.exit(0);
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe, headless: true });

try {
  console.log(`=== SOLO cleric weapon repro: ${SWINGS} repeated dummy attacks, no multiplayer ===\n`);

  const context = await browser.newContext({ viewport: { width: 1100, height: 750 } });
  const identity = {
    name: 'SoloCleric',
    figure: 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62',
    uniqueId: 'e2e-soloclericonly',
    verifiedAt: new Date().toISOString(),
    classId: 'cleric',
  };
  await context.addInitScript((id) => {
    localStorage.setItem('habbo-dungeons-identity', JSON.stringify(id));
    localStorage.setItem('habbo-dungeons-char', JSON.stringify({ name: id.name, figure: id.figure }));
  }, identity);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('  pageerror:', e.message));

  // No ?backend=supabase, no identity.session — deliberately solo/local.
  // shouldConnectNet requires a session for the local-mode transport, which
  // this identity doesn't have, so multiplayer never activates. This is
  // exactly "solo, no multiplayer involved".
  //
  // BUT: this checked-out branch has no server.js at all (confirmed: no file
  // on disk), so in local-backend mode config.js's IMAGING_URL ('/api/imaging')
  // 404s on every single request — a missing-local-dev-infra gap, unrelated to
  // any class/weapon code, that would otherwise make EVERY avatar (fighter's
  // sword included) fail to render in this environment. Routing that path to
  // the real habbo-imaging endpoint here, the same way earlier weapon
  // screenshots in this session did, isolates the actual question (does solo
  // cleric rendering hold up over repeated swings) from that unrelated gap.
  await page.route('**/api/imaging**', async (route) => {
    const url = new URL(route.request().url());
    const real = 'https://sandbox.habbo.com/habbo-imaging/avatarimage' + url.search;
    try {
      const res = await fetch(real, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const buf = Buffer.from(await res.arrayBuffer());
      await route.fulfill({
        status: res.status,
        contentType: res.headers.get('content-type') || 'image/png',
        body: buf,
      });
    } catch {
      await route.abort();
    }
  });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.click('#btnPlay');
  await page.waitForSelector('.dr-dock', { timeout: 15000 });
  await page.waitForFunction(() => window.game.room, { timeout: 10000 });

  // Go to the square room (has the real training dummy prop). #exploreBar
  // buttons key off array index, not room id (see index.html) — "Town
  // Square" is exploreRooms[1].
  await page.evaluate(() => {
    document.querySelectorAll('#exploreBar button[data-room]')[1].click();
  });
  await page.waitForFunction(() => window.game.room && window.game.room.id === 'square', { timeout: 10000 });

  const ownState = await page.evaluate(() => {
    const u = window.__debug.explore.unit;
    return { classId: u.classId, spritesReady: u.sprites && u.sprites.ready, weapon: u.sprites && u.sprites.weapon };
  });
  console.log(`own unit: ${JSON.stringify(ownState)}\n`);
  check('local unit classId is cleric', ownState.classId === 'cleric');
  check('local unit weapon set has hammer(atk)+lantern(idle)', ownState.weapon && ownState.weapon.atk === 140 && ownState.weapon.idle === 151);

  const netState = await page.evaluate(() => ({ active: window.__debug.net.active, connected: window.__debug.net.connected }));
  console.log(`net state (must both be false — confirms genuinely solo, no multiplayer): ${JSON.stringify(netState)}\n`);
  check('multiplayer never activated (net.active === false)', netState.active === false);

  // Walk beside the real dummy (5,6) and confirm we're actually standing next
  // to it before attacking — same setup a real player would do by walking up.
  await page.evaluate(() => {
    window.__debug.explore.unit.walkTo(5, 7); // one tile below/beside the dummy at (5,6)
  });
  await page.waitForTimeout(2500); // let the walk actually finish (avoid racing !step before it starts)
  await page.waitForFunction(() => {
    const u = window.__debug.explore.unit;
    return !u.step; // walk finished
  }, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);

  const beside = await page.evaluate(() => {
    const explore = window.__debug.explore;
    const room = window.game.room;
    const dummy = room.hittableAt ? room.hittableAt(5, 6) : null;
    return { hasDummy: !!dummy, isBeside: dummy ? explore.isBeside(dummy) : null };
  });
  console.log(`dummy prop present: ${beside.hasDummy}, standing beside it: ${beside.isBeside}\n`);
  check('training dummy prop exists at (5,6) in square', beside.hasDummy);
  check('local player ended up beside the dummy', beside.isBeside);

  // Zoom the canvas 4x for the screenshots so the held item is legible.
  await page.evaluate(() => {
    const cv = document.getElementById('game');
    cv.style.transformOrigin = 'center center';
    cv.style.transform = 'scale(4)';
  });

  let missingAtkFrames = 0;
  let missingIdleFrames = 0;
  const results = [];

  for (let swing = 1; swing <= SWINGS; swing++) {
    // Real double-tap path: onDoubleTap(tile) -> attack(hit) if beside it.
    await page.evaluate(() => {
      window.__debug.explore.onDoubleTap({ x: 5, y: 6 });
    });

    // Sample across the ~600ms ATTACK_MS window: find the weapon-up tick
    // (frame parity 0) and confirm the hammer image actually resolved (not
    // just that the atk pose was entered).
    let sawWeaponFrame = false;
    let weaponImgOk = null;
    for (let i = 0; i < 8 && !sawWeaponFrame; i++) {
      await page.waitForTimeout(55);
      const info = await page.evaluate(() => {
        const u = window.__debug.explore.unit;
        const now = performance.now();
        const fr = u.frame(now);
        const img = u.sprites.get('atk', u.dir, fr);
        return {
          midSwing: u.attackUntil > now,
          frameParity: fr % 2,
          imgComplete: img ? img.complete : null,
          imgNaturalWidth: img ? img.naturalWidth : null,
          imgSrc: img ? img.src : null,
        };
      });
      if (info.midSwing && info.frameParity === 0) {
        sawWeaponFrame = true;
        weaponImgOk = info.imgComplete && info.imgNaturalWidth > 0;
        if (weaponImgOk) {
          await page.screenshot({ path: join(OUT, `swing-${String(swing).padStart(2, '0')}-atk.png`) });
        }
      }
    }
    if (!sawWeaponFrame || !weaponImgOk) missingAtkFrames++;
    results.push({ swing, sawWeaponFrame, weaponImgOk });
    console.log(`  swing ${swing}: sawWeaponFrame=${sawWeaponFrame} weaponImgOk=${weaponImgOk}`);

    // Let the swing fully finish, then check the idle/lantern pose before the
    // next attack — this is the "gone back to bare hands" failure mode.
    await page.waitForTimeout(700);
    const idleInfo = await page.evaluate(() => {
      const u = window.__debug.explore.unit;
      const img = u.sprites.get('std', u.dir, 0);
      return { imgComplete: img ? img.complete : null, imgNaturalWidth: img ? img.naturalWidth : null };
    });
    const idleOk = idleInfo.imgComplete && idleInfo.imgNaturalWidth > 0;
    if (!idleOk) missingIdleFrames++;
    if (idleOk && swing <= 3) {
      // only keep a few idle shots to avoid spamming the screenshot folder
      await page.screenshot({ path: join(OUT, `swing-${String(swing).padStart(2, '0')}-idle.png`) });
    }
    console.log(`  swing ${swing}: idle (lantern) frame ok=${idleOk}`);
  }

  check(`hammer (atk) rendered on every one of ${SWINGS} swings`, missingAtkFrames === 0);
  check(`lantern (idle) rendered between every one of ${SWINGS} swings`, missingIdleFrames === 0);

  console.log(`\nsummary: ${SWINGS - missingAtkFrames}/${SWINGS} swings showed the hammer, ${SWINGS - missingIdleFrames}/${SWINGS} idle gaps showed the lantern`);
  console.log(state.failed === 0 ? '\nALL CHECKS PASSED — no solo rendering regression observed' : `\n${state.failed} CHECK(S) FAILED`);

  await context.close();
} catch (e) {
  console.error('ERROR:', e.stack || e.message);
  state.failed++;
} finally {
  await browser.close();
  server.kill();
}
process.exit(state.failed ? 1 : 0);
