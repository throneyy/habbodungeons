// Ad-hoc diagnostic: confirms the js/remotePlayers.js spawn() silent-invisible
// bug and traces WHERE an empty member.figure can come from.
//
// Two scenarios, both logging every 'enter'/'roster' presence event's
// member.figure with a timestamp:
//   1. NORMAL — an identity shaped exactly like Identity.verify() produces
//      (name + figure + uniqueId + verifiedAt). Expectation from code tracing:
//      figure is always present, because verify-habbo-link's fetchHabboProfile
//      refuses to return ok:true without a figureString.
//   2. NAME-ONLY — an identity with a name but NO figure (what a partially
//      written/legacy localStorage row, or the currently-unwired
//      Identity.setFigure('name', '') quick-play path, would look like).
//      shouldConnectNet() in js/net.js only checks identity.name on the
//      Supabase transport, so this identity is NOT rejected at the gate —
//      it connects, and SupabaseNet broadcasts figure: '' over presence.
//
// Run: node tests/e2e/figureFlicker.e2e.mjs
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { findChromium, startServer } from './lib.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 8638;
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
    if (id.figure) localStorage.setItem('habbo-dungeons-char', JSON.stringify({ name: id.name, figure: id.figure }));
  }, identity);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`  ${tag} pageerror:`, e.message));
  page.on('console', (m) => {
    // Surface the console.warn added in remotePlayers.js for a figure-less spawn
    if (m.type() === 'warning') {
      const t = Date.now() - t0;
      console.log(`  t+${t}ms ${tag} *** console.warn *** ${m.text()}`);
    }
  });
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
    net.on('roster', (m) => {
      log(`ROSTER room=${m.room} members=${JSON.stringify((m.members || []).map((mm) => ({ name: mm.name, figure: mm.figure })))}`);
    });
    net.on('enter', (m) => {
      const mem = m && m.member;
      log(`ENTER name=${mem && mem.name} figure="${mem && mem.figure}" (empty=${!mem || !mem.figure})`);
    });
  }, fnName);
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe, headless: true });

try {
  console.log('=== Scenario 1: NORMAL verified-shaped identities (figure present) ===\n');
  {
    const idA = {
      name: `NormA${stamp % 10000}`,
      figure: 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62',
      uniqueId: `e2e-norma-${stamp}`,
      verifiedAt: new Date().toISOString(),
      classId: 'fighter',
    };
    const idB = {
      name: `NormB${stamp % 10000}`,
      figure: 'hr-100-61.hd-180-1.ch-210-66.lg-270-82.sh-290-80',
      uniqueId: `e2e-normb-${stamp}`,
      verifiedAt: new Date().toISOString(),
      classId: 'fighter',
    };
    const A = await openPlayer(browser, PORT, idA, '[NormA]');
    const B = await openPlayer(browser, PORT, idB, '[NormB]');
    await A.page.click('#btnPlay');
    await B.page.click('#btnPlay');
    await A.page.waitForSelector('.dr-dock', { timeout: 15000 });
    await B.page.waitForSelector('.dr-dock', { timeout: 15000 });
    await A.page.waitForFunction(() => window.__debug.net.connected === true, { timeout: 15000 }).catch(() => {});
    await B.page.waitForFunction(() => window.__debug.net.connected === true, { timeout: 15000 }).catch(() => {});
    await hookPresenceLogging(A.page, '[NormA]');
    await hookPresenceLogging(B.page, '[NormB]');
    // trigger a re-roster by having B leave+rejoin isn't needed — the initial
    // join's own roster/enter already carries the figure; wait for it.
    await A.page.waitForTimeout(4000);

    const sawA = await A.page.evaluate(() => [...window.__debug.remote.units.keys()]);
    const spritesA = await A.page.evaluate(() => {
      const u = [...window.__debug.remote.units.values()][0];
      return u ? { hasSprites: !!u.sprites, figure: u.figure } : null;
    });
    console.log(`\n[NormA] remote units seen: ${JSON.stringify(sawA)}`);
    console.log(`[NormA] first remote unit sprite state: ${JSON.stringify(spritesA)}`);
    await A.context.close();
    await B.context.close();
  }

  console.log('\n\n=== Scenario 2 (POST-FIX): NAME-ONLY identity — the shouldConnectNet gap ===\n');
  {
    const idC = {
      name: `NameOnly${stamp % 10000}`,
      // no figure field at all — simulates a partially-written/legacy
      // localStorage identity, or Identity.setFigure(name, '') with an empty
      // figure string.
      uniqueId: `e2e-nameonly-${stamp}`,
      verifiedAt: new Date().toISOString(),
      classId: 'fighter',
    };
    const C = await openPlayer(browser, PORT, idC, '[NameOnly]');

    // Confirm shouldConnectNet's own verdict on the name-only identity, read
    // straight from the served module (ground truth, not an assumption).
    const gateVerdict = await C.page.evaluate(async (id) => {
      const mod = await import('/js/net.js');
      return mod.shouldConnectNet(id);
    }, idC);
    console.log(`shouldConnectNet(name-only identity) => ${gateVerdict} (expected: FALSE now — the gate is fixed)`);

    await C.page.click('#btnPlay');
    await C.page.waitForSelector('.dr-dock', { timeout: 15000 });
    // give it a moment — if the fix works, net.connected should NEVER flip true
    await C.page.waitForTimeout(3000);
    const netActive = await C.page.evaluate(() => window.__debug.net.active);
    const netConnected = await C.page.evaluate(() => window.__debug.net.connected);
    console.log(`[NameOnly] net.active=${netActive} net.connected=${netConnected} (expected: both false/falsy — never even attempted to connect)`);
    await C.context.close();
  }

  console.log('\n\n=== Scenario 3 (POST-FIX): forcing an empty-figure spawn() directly — fallback + warn ===\n');
  {
    const idE = {
      name: `Fallback${stamp % 10000}`,
      figure: 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62',
      uniqueId: `e2e-fallback-${stamp}`,
      verifiedAt: new Date().toISOString(),
      classId: 'fighter',
    };
    const E = await openPlayer(browser, PORT, idE, '[Fallback]');
    await E.page.click('#btnPlay');
    await E.page.waitForSelector('.dr-dock', { timeout: 15000 });
    await E.page.waitForFunction(() => window.game.room, { timeout: 10000 });

    // Bypass the network entirely and call RemotePlayers.spawn() directly with
    // an empty figure — this is the defense-in-depth path: even if a bad
    // payload somehow reached the client (a bug elsewhere, a malicious peer),
    // spawn() itself must not go silently invisible.
    const result = await E.page.evaluate(() => {
      const remote = window.__debug.remote;
      remote.attach();
      remote.spawn({ name: 'GhostPeer', figure: '', x: 2, y: 2, dir: 4 });
      const u = remote.units.get('ghostpeer');
      return u ? { hasSprites: !!u.sprites, figure: u.figure } : null;
    });
    console.log(`[Fallback] spawn({figure:''}) result: ${JSON.stringify(result)}`);
    console.log(result && result.hasSprites && result.figure
      ? '*** FIXED: empty-figure spawn now renders the default figure instead of staying invisible ***'
      : '*** STILL BROKEN ***');
    await E.context.close();
  }
} catch (e) {
  console.error('ERROR:', e.stack || e.message);
} finally {
  await browser.close();
  server.kill();
}
