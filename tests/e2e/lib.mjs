// e2e harness — lovable-main variant.
//
// Same exported contract as the vanilla-main harness (findChromium, startServer,
// openPlayer, enterFreeRoam, makeChecker), but adapted to lovable-main's stack:
//   - startServer boots a plain STATIC server (static-server.mjs) instead of the
//     multiplayer server.js, which lovable-main doesn't have (it uses Supabase).
//   - openPlayer seeds a VERIFIED identity (verifiedAt) directly — no server-side
//     token mint — which is all requireSignIn()/Identity.isVerified() needs.
//   - enterFreeRoam waits for the Daily-Spin dock, i.e. startExplore() completing,
//     rather than a live multiplayer connection.
// This is sufficient for client-side features (the daily-reward wheel). Suites
// that assert real two-window multiplayer would need the Supabase backend.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export function findChromium() {
  const base = join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  const candidates = [
    chromium.executablePath(),
    join(base, 'chromium-1228', 'chrome-win64', 'chrome.exe'),
    join(base, 'chromium-1223', 'chrome-win', 'chrome.exe'),
    join(base, 'chromium_headless_shell-1228', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
  ];
  for (const p of candidates) if (p && existsSync(p)) return p;
  return null;
}

export async function startServer(port) {
  const child = spawn(process.execPath, [join(ROOT, 'tests', 'e2e', 'static-server.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not boot')), 10000);
    child.stdout.on('data', (d) => {
      if (d.toString().includes('running at')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', () => reject(new Error('server exited during boot')));
  });
  return child;
}

// A browser page with a pre-seeded VERIFIED identity so requireSignIn lets it
// into the square. Purely client-side — no server session credential needed.
export async function openPlayer(browser, port, name, figure) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 750 } });
  const identity = {
    name,
    figure,
    uniqueId: `e2e-${name.toLowerCase()}`,
    verifiedAt: new Date().toISOString(),
    classId: 'fighter',
  };
  await context.addInitScript((id) => {
    localStorage.setItem('habbo-dungeons-identity', JSON.stringify(id));
    localStorage.setItem('habbo-dungeons-char', JSON.stringify({ name: id.name, figure: id.figure }));
  }, identity);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`  [${name}] pageerror:`, e.message));
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
  return page;
}

// Enter Free Roam and wait until we're actually in the square. The Daily-Spin
// dock mounts at the end of startExplore(), so its presence is the completion
// signal (no multiplayer connection required on lovable-main).
export async function enterFreeRoam(page) {
  await page.click('#btnPlay');
  await page.waitForSelector('.dr-dock', { timeout: 15000 });
}

export function makeChecker() {
  const state = { failed: 0 };
  return {
    state,
    check(name, cond) {
      if (cond) console.log(`  ok    ${name}`);
      else {
        state.failed++;
        console.error(`  FAIL  ${name}`);
      }
    },
  };
}
