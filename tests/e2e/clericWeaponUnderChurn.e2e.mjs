// Ad-hoc diagnostic: the condition never actually tested before. TWO REAL
// connected Supabase clients (net.active===true, net.connected===true on
// BOTH), one playing cleric in the square room attacking the real training
// dummy 10+ times, while the SECOND client repeatedly joins/leaves/moves
// during the cleric's swing window — does a peer's roster/enter/left/moved
// event ever corrupt or reset the cleric's OWN unit.classId/unit.sprites
// mid-fight? Logs classId + weapon on every single swing (not just spawn),
// so a transient overwrite that self-corrects still shows up.
//
// Run: node tests/e2e/clericWeaponUnderChurn.e2e.mjs
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { findChromium, startServer } from './lib.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 8645;
const SWINGS = 12;
const OUT = join(ROOT, '.gg', 'screenshots', 'cleric-churn');
mkdirSync(OUT, { recursive: true });

const exe = findChromium();
if (!exe) {
  console.error('SKIP: no local Chromium build found');
  process.exit(0);
}

const stamp = Date.now();

async function openPlayer(browser, port, identity, tag) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 750 } });
  await context.addInitScript((id) => {
    localStorage.setItem('habbo-dungeons-identity', JSON.stringify(id));
    localStorage.setItem('habbo-dungeons-char', JSON.stringify({ name: id.name, figure: id.figure }));
  }, identity);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`  ${tag} pageerror:`, e.message));
  // Local checkout has no server.js -> IMAGING_URL 404s for both transports.
  // Route imaging to the real endpoint so avatar art actually resolves,
  // isolating the classId/weapon-corruption question from that unrelated gap.
  await page.route('**/api/imaging**', async (route) => {
    const url = new URL(route.request().url());
    const real = 'https://sandbox.habbo.com/habbo-imaging/avatarimage' + url.search;
    try {
      const res = await fetch(real, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const buf = Buffer.from(await res.arrayBuffer());
      await route.fulfill({ status: res.status, contentType: res.headers.get('content-type') || 'image/png', body: buf });
    } catch { await route.abort(); }
  });
  await page.goto(`http://localhost:${port}/?backend=supabase`, { waitUntil: 'domcontentloaded' });
  return { context, page, tag };
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe, headless: true });

try {
  console.log('=== cleric attacking under real presence churn from a second connected client ===\n');

  const idCleric = {
    name: `Cleric${stamp % 10000}`,
    figure: 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62',
    uniqueId: `e2e-clericchurn-${stamp}`,
    verifiedAt: new Date().toISOString(),
    classId: 'cleric',
  };
  const idPeer = {
    name: `Peer${stamp % 10000}`,
    figure: 'hr-100-61.hd-180-1.ch-210-66.lg-270-82.sh-290-80',
    uniqueId: `e2e-peerchurn-${stamp}`,
    verifiedAt: new Date().toISOString(),
    classId: 'mage',
  };

  const C = await openPlayer(browser, PORT, idCleric, '[Cleric]');
  const P = await openPlayer(browser, PORT, idPeer, '[Peer]');

  await C.page.click('#btnPlay');
  await P.page.click('#btnPlay');
  await C.page.waitForSelector('.dr-dock', { timeout: 15000 });
  await P.page.waitForSelector('.dr-dock', { timeout: 15000 });
  await C.page.waitForFunction(() => window.game.room, { timeout: 10000 });
  await P.page.waitForFunction(() => window.game.room, { timeout: 10000 });

  const connectedC = await C.page.waitForFunction(() => window.__debug.net.connected === true, { timeout: 15000 })
    .then(() => true).catch(() => false);
  const connectedP = await P.page.waitForFunction(() => window.__debug.net.connected === true, { timeout: 15000 })
    .then(() => true).catch(() => false);
  console.log(`connected: Cleric net.active=${await C.page.evaluate(() => window.__debug.net.active)} net.connected=${connectedC}`);
  console.log(`connected: Peer   net.active=${await P.page.evaluate(() => window.__debug.net.active)} net.connected=${connectedP}`);
  if (!connectedC || !connectedP) throw new Error('REQUIRED CONDITION NOT MET: both clients must be really connected — aborting, this would only test solo-local');

  // Move both into the square room (has the real dummy at (5,6)).
  const gotoSquare = (page) => page.evaluate(() => {
    document.querySelectorAll('#exploreBar button[data-room]')[1].click();
  });
  await gotoSquare(C.page);
  await gotoSquare(P.page);
  await C.page.waitForFunction(() => window.game.room && window.game.room.id === 'square', { timeout: 10000 });
  await P.page.waitForFunction(() => window.game.room && window.game.room.id === 'square', { timeout: 10000 });

  // both clients re-join the multiplayer room explicitly (mirrors main.js's
  // net.join(game.room.id) on room switch) so presence actually syncs here
  await C.page.evaluate(() => { if (window.__debug.net.room !== window.game.room.id) window.__debug.net.join(window.game.room.id); });
  await P.page.evaluate(() => { if (window.__debug.net.room !== window.game.room.id) window.__debug.net.join(window.game.room.id); });
  await C.page.waitForTimeout(2000);

  const nameC = await C.page.evaluate(() => window.__debug.net.name);
  const nameP = await P.page.evaluate(() => window.__debug.net.name);
  const seesEachOther = await C.page.waitForFunction(
    (n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()),
    nameP, { timeout: 15000 }
  ).then(() => true).catch(() => false);
  console.log(`Cleric sees Peer as remote unit in square: ${seesEachOther}\n`);

  // Confirmed setup: BOTH real, BOTH connected, BOTH in the same live room.
  const setupState = await C.page.evaluate(() => ({ active: window.__debug.net.active, connected: window.__debug.net.connected, room: window.game.room.id }));
  console.log(`Cleric final connection state going into the attack loop: ${JSON.stringify(setupState)}\n`);

  // Find the real training dummy wherever this live room's saved layout
  // actually put it (found relocated to (5,5) via a prior admin save on the
  // real Supabase project — don't hardcode a tile, look it up).
  const dummyTile = await C.page.evaluate(() => {
    const d = window.game.room.props.find((p) => p.hittable);
    return d ? { x: d.x, y: d.y } : null;
  });
  console.log(`training dummy located at: ${JSON.stringify(dummyTile)}\n`);
  if (!dummyTile) throw new Error('no hittable prop found in square — cannot run the attack loop');

  // Walk the cleric to an adjacent tile.
  await C.page.evaluate((t) => window.__debug.explore.unit.walkTo(t.x, t.y + 1), dummyTile);
  await C.page.waitForTimeout(2500);
  await C.page.waitForFunction(() => !window.__debug.explore.unit.step, { timeout: 8000 }).catch(() => {});
  await C.page.waitForTimeout(300);

  const beside = await C.page.evaluate((t) => {
    const explore = window.__debug.explore;
    const dummy = window.game.room.hittableAt(t.x, t.y);
    return dummy ? explore.isBeside(dummy) : false;
  }, dummyTile);
  console.log(`Cleric standing beside the training dummy: ${beside}\n`);

  await C.page.evaluate(() => {
    const cv = document.getElementById('game');
    cv.style.transformOrigin = 'center center';
    cv.style.transform = 'scale(4)';
  });

  // Start the peer's churn generator: repeated move() broadcasts (simulates
  // walking) plus repeated leave-room/rejoin-room cycles, running continuously
  // and asynchronously to the cleric's own attack loop below — real presence
  // traffic landing on the cleric's client mid-swing, not scripted to line up.
  await P.page.evaluate((roomId) => {
    let n = 0;
    window.__churnInterval = setInterval(() => {
      const net = window.__debug.net;
      n++;
      if (n % 4 === 0) {
        // leave + rejoin the room channel entirely (forces a fresh presence
        // sync + a 'left' then 'enter'/'roster' pair on the cleric's side)
        net.leaveRoom();
        setTimeout(() => net.join(roomId), 150);
      } else {
        // ordinary movement broadcast
        const x = 3 + (n % 5);
        const y = 3 + ((n * 3) % 5);
        net.move(x, y);
      }
    }, 350);
  }, await P.page.evaluate(() => window.game.room.id));

  let missingAtk = 0;
  let missingIdle = 0;
  let classIdEverWrong = false;
  let weaponEverWrong = false;
  const perSwingLog = [];

  const EXPECTED_WEAPON = { atk: 140, idle: 151, bow: 166 };

  for (let swing = 1; swing <= SWINGS; swing++) {
    // Real attack path, exactly as a real double-tap on the dummy.
    await C.page.evaluate((t) => window.__debug.explore.onDoubleTap(t), dummyTile);

    // Log classId + full weapon object EVERY swing (not just at spawn), and
    // find the weapon-raised frame in the same pass.
    let sawWeaponFrame = false;
    let weaponImgOk = null;
    let sampledClassId = null;
    let sampledWeapon = null;
    for (let i = 0; i < 8 && !sawWeaponFrame; i++) {
      await C.page.waitForTimeout(55);
      const info = await C.page.evaluate(() => {
        const u = window.__debug.explore.unit;
        const now = performance.now();
        const fr = u.frame(now);
        const img = u.sprites.get('atk', u.dir, fr);
        return {
          classId: u.classId,
          spritesClassId: u.sprites.classId,
          weapon: u.sprites.weapon,
          midSwing: u.attackUntil > now,
          frameParity: fr % 2,
          imgComplete: img ? img.complete : null,
          imgNaturalWidth: img ? img.naturalWidth : null,
        };
      });
      sampledClassId = info.classId;
      sampledWeapon = info.weapon;
      if (info.classId !== 'cleric' || info.spritesClassId !== 'cleric') classIdEverWrong = true;
      if (!info.weapon || info.weapon.atk !== EXPECTED_WEAPON.atk || info.weapon.idle !== EXPECTED_WEAPON.idle) weaponEverWrong = true;
      if (info.midSwing && info.frameParity === 0) {
        sawWeaponFrame = true;
        weaponImgOk = info.imgComplete && info.imgNaturalWidth > 0;
        if (weaponImgOk) {
          await C.page.screenshot({ path: join(OUT, `swing-${String(swing).padStart(2, '0')}-atk.png`) });
        }
      }
    }
    if (!sawWeaponFrame || !weaponImgOk) missingAtk++;
    perSwingLog.push({ swing, classId: sampledClassId, weapon: sampledWeapon, sawWeaponFrame, weaponImgOk });
    console.log(`  swing ${swing}: classId=${sampledClassId} weapon=${JSON.stringify(sampledWeapon)} sawWeaponFrame=${sawWeaponFrame} weaponImgOk=${weaponImgOk}`);

    await C.page.waitForTimeout(700);
    const idleInfo = await C.page.evaluate(() => {
      const u = window.__debug.explore.unit;
      const img = u.sprites.get('std', u.dir, 0);
      return {
        classId: u.classId,
        weapon: u.sprites.weapon,
        imgComplete: img ? img.complete : null,
        imgNaturalWidth: img ? img.naturalWidth : null,
      };
    });
    const idleOk = idleInfo.imgComplete && idleInfo.imgNaturalWidth > 0;
    if (!idleOk) missingIdle++;
    if (idleInfo.classId !== 'cleric') classIdEverWrong = true;
    console.log(`  swing ${swing} (idle gap): classId=${idleInfo.classId} weapon=${JSON.stringify(idleInfo.weapon)} idleFrameOk=${idleOk}`);
    if (idleOk && swing <= 3) await C.page.screenshot({ path: join(OUT, `swing-${String(swing).padStart(2, '0')}-idle.png`) });
  }

  await P.page.evaluate(() => window.__churnInterval && clearInterval(window.__churnInterval));

  console.log(`\n=== RESULTS ===`);
  console.log(`hammer (atk) rendered: ${SWINGS - missingAtk}/${SWINGS} swings`);
  console.log(`lantern (idle) rendered: ${SWINGS - missingIdle}/${SWINGS} gaps`);
  console.log(`classId was ever something other than 'cleric' mid-run: ${classIdEverWrong}`);
  console.log(`weapon object was ever wrong (not hammer/lantern) mid-run: ${weaponEverWrong}`);

  const finalState = await C.page.evaluate(() => ({
    active: window.__debug.net.active, connected: window.__debug.net.connected,
    classId: window.__debug.explore.unit.classId,
    weapon: window.__debug.explore.unit.sprites.weapon,
  }));
  console.log(`\nfinal state after the full churn run: ${JSON.stringify(finalState)}`);

  if (missingAtk > 0 || missingIdle > 0 || classIdEverWrong || weaponEverWrong) {
    console.log('\n*** REPRODUCED: the cleric\'s weapon/classId was corrupted or failed to render under real connected presence churn. ***');
  } else {
    console.log('\n*** NOT REPRODUCED in this run: hammer/lantern rendered on every swing, classId/weapon never deviated from cleric, despite continuous real presence churn from a second connected client. ***');
  }

  await C.context.close();
  await P.context.close();
} catch (e) {
  console.error('ERROR:', e.stack || e.message);
} finally {
  await browser.close();
  server.kill();
}
