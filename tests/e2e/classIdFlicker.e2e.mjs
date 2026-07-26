// Ad-hoc diagnostic (not a fix, just observation): two real Supabase clients,
// distinct classIds (cleric vs mage), same room. Logs:
//   - each client's own classId + resolved weapon (js/classWeapons.js) at spawn
//   - every presence 'enter'/'roster' event received, verbatim payload
//   - whether either client ever spawns a Unit for its OWN name (self-dup bug)
//   - what classId the remote Unit actually gets in RemotePlayers.spawn()
//
// Run: node tests/e2e/classIdFlicker.e2e.mjs
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { findChromium, startServer } from './lib.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 8639;
mkdirSync(join(ROOT, '.gg', 'screenshots'), { recursive: true });

const exe = findChromium();
if (!exe) {
  console.error('SKIP: no local Chromium build found');
  process.exit(0);
}

const stamp = Date.now();
const t0 = Date.now();

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

async function hookPresenceLogging(page, tag) {
  const fnName = `__log_${tag.replace(/\W/g, '')}`;
  await page.exposeFunction(fnName, (line) => {
    const t = Date.now() - t0;
    console.log(`  t+${t}ms ${tag} ${line}`);
  });
  await page.evaluate((fnName) => {
    const net = window.__debug.net;
    const log = window[fnName];
    net.on('roster', (m) => log(`ROSTER room=${m.room} members=${JSON.stringify(m.members)}`));
    net.on('enter', (m) => log(`ENTER ${JSON.stringify(m.member)}`));
    net.on('left', (m) => log(`LEFT ${JSON.stringify(m)}`));
  }, fnName);
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe, headless: true });

try {
  console.log('=== two real clients, distinct classIds (cleric vs mage), same room ===\n');

  const idCleric = {
    name: `Cleric${stamp % 10000}`,
    figure: 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62',
    uniqueId: `e2e-cleric-${stamp}`,
    verifiedAt: new Date().toISOString(),
    classId: 'cleric',
  };
  const idMage = {
    name: `Mage${stamp % 10000}`,
    figure: 'hr-100-61.hd-180-1.ch-210-66.lg-270-82.sh-290-80',
    uniqueId: `e2e-mage-${stamp}`,
    verifiedAt: new Date().toISOString(),
    classId: 'mage',
  };

  const C = await openPlayer(browser, PORT, idCleric, '[Cleric]');
  const M = await openPlayer(browser, PORT, idMage, '[Mage]');

  await C.page.click('#btnPlay');
  await M.page.click('#btnPlay');
  await C.page.waitForSelector('.dr-dock', { timeout: 15000 });
  await M.page.waitForSelector('.dr-dock', { timeout: 15000 });
  await C.page.waitForFunction(() => window.game.room, { timeout: 10000 });
  await M.page.waitForFunction(() => window.game.room, { timeout: 10000 });

  // Own classId + resolved weapon at spawn, read straight from the live unit
  // + sprite set — ground truth, not assumed from Identity alone.
  const ownStateC = await C.page.evaluate(() => {
    const u = window.__debug.explore.unit;
    return { classId: u.classId, spritesClassId: u.sprites && u.sprites.classId, weapon: u.sprites && u.sprites.weapon };
  });
  const ownStateM = await M.page.evaluate(() => {
    const u = window.__debug.explore.unit;
    return { classId: u.classId, spritesClassId: u.sprites && u.sprites.classId, weapon: u.sprites && u.sprites.weapon };
  });
  console.log(`[Cleric] own unit at spawn: ${JSON.stringify(ownStateC)}`);
  console.log(`[Mage]   own unit at spawn: ${JSON.stringify(ownStateM)}\n`);

  const connectedC = await C.page.waitForFunction(() => window.__debug.net.connected === true, { timeout: 15000 })
    .then(() => true).catch(() => false);
  const connectedM = await M.page.waitForFunction(() => window.__debug.net.connected === true, { timeout: 15000 })
    .then(() => true).catch(() => false);
  console.log(`connected: Cleric=${connectedC} Mage=${connectedM}\n`);
  if (!connectedC || !connectedM) throw new Error('multiplayer never connected');

  await hookPresenceLogging(C.page, '[Cleric]');
  await hookPresenceLogging(M.page, '[Mage]');

  const nameC = await C.page.evaluate(() => window.__debug.net.name);
  const nameM = await M.page.evaluate(() => window.__debug.net.name);

  await C.page.waitForFunction(
    (n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()),
    nameM, { timeout: 20000 }
  ).catch(() => {});
  await M.page.waitForFunction(
    (n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()),
    nameC, { timeout: 20000 }
  ).catch(() => {});

  await C.page.waitForTimeout(2000);

  // 1) Self-duplicate check: does either client's remote.units map ever
  //    contain an entry for ITS OWN name?
  const selfDupC = await C.page.evaluate((n) => window.__debug.remote.units.has(n.toLowerCase()), nameC);
  const selfDupM = await M.page.evaluate((n) => window.__debug.remote.units.has(n.toLowerCase()), nameM);
  console.log(`\n[Cleric] remote.units has own name "${nameC}"? ${selfDupC} (should be false)`);
  console.log(`[Mage]   remote.units has own name "${nameM}"? ${selfDupM} (should be false)`);

  // Also check game.units for a raw duplicate Unit object under the player's
  // own name, in case remote.units and game.units disagree.
  const gameUnitsDupC = await C.page.evaluate((n) => {
    const units = window.game.units || [];
    return units.filter((u) => u.name && u.name.toLowerCase() === n.toLowerCase()).length;
  }, nameC);
  const gameUnitsDupM = await M.page.evaluate((n) => {
    const units = window.game.units || [];
    return units.filter((u) => u.name && u.name.toLowerCase() === n.toLowerCase()).length;
  }, nameM);
  console.log(`[Cleric] game.units entries named "${nameC}": ${gameUnitsDupC} (should be 1 — just the local player)`);
  console.log(`[Mage]   game.units entries named "${nameM}": ${gameUnitsDupM} (should be 1 — just the local player)`);

  // 2) classId hardcode check: what classId does the REMOTE unit actually get
  //    on the other client, vs. what the real player picked?
  const remoteClericOnMage = await M.page.evaluate((n) => {
    const u = window.__debug.remote.units.get(n.toLowerCase());
    return u ? { classId: u.classId, hasWeaponSprites: !!(u.sprites && u.sprites.weapon) } : null;
  }, nameC);
  const remoteMageOnCleric = await C.page.evaluate((n) => {
    const u = window.__debug.remote.units.get(n.toLowerCase());
    return u ? { classId: u.classId, hasWeaponSprites: !!(u.sprites && u.sprites.weapon) } : null;
  }, nameM);
  console.log(`\n[Mage]'s   view of the Cleric player's remote Unit: ${JSON.stringify(remoteClericOnMage)} (real classId was 'cleric')`);
  console.log(`[Cleric]'s view of the Mage player's remote Unit:   ${JSON.stringify(remoteMageOnCleric)} (real classId was 'mage')`);

  // 3) Does supabaseNet's presence payload even carry classId? Check the
  // served source directly (ground truth, not an assumption from reading it
  // once) plus the raw member payload logged above.
  const memberShape = await C.page.evaluate(async () => {
    const src = await fetch('/js/supabaseNet.js').then((r) => r.text());
    const memberFnStart = src.indexOf('_member(meta)');
    const memberFnBody = src.slice(memberFnStart, memberFnStart + 300);
    return memberFnBody;
  });
  console.log(`\n_member() body from the served supabaseNet.js:\n  ${memberShape.split('\n').join('\n  ')}`);
  console.log(`\ndoes _member() mention classId at all? ${memberShape.includes('classId')}`);

  await C.page.screenshot({ path: join(ROOT, '.gg', 'screenshots', 'classid-cleric-view.png') });
  await M.page.screenshot({ path: join(ROOT, '.gg', 'screenshots', 'classid-mage-view.png') });

  await C.context.close();
  await M.context.close();
} catch (e) {
  console.error('ERROR:', e.stack || e.message);
} finally {
  await browser.close();
  server.kill();
}
