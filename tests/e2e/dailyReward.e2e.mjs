// Daily-rewards wheel e2e — run with:  node tests/e2e/dailyReward.e2e.mjs
// Drives the full in-game flow headless: open the popup, spin, claim, then
// prove a SECOND spin the same day is blocked. Reduced-motion is emulated so
// the spin animation resolves instantly (no 9s frame playback). A screenshot of
// the claimed state is written to .gg/screenshots/.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { findChromium, startServer, openPlayer, enterFreeRoam, makeChecker } from './lib.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 8631;
const { check, state } = makeChecker();

const exe = findChromium();
if (!exe) {
  console.error('SKIP: no local Chromium build found (npx playwright install chromium)');
  process.exit(0);
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe, headless: true });

try {
  console.log('daily wheel: open / spin / claim');
  const alice = await openPlayer(browser, PORT, 'AliceHD', 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62');
  // reduced motion -> the spin lands instantly instead of playing 74 frames
  await alice.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreeRoam(alice);

  // fresh daily state with a fixed seed so the landed wedge is deterministic
  await alice.evaluate(() => {
    localStorage.setItem(
      'habbo-dungeons-daily',
      JSON.stringify({ v: 1, seed: 424242, lastClaimDay: null, streak: 0, totalClaims: 0 })
    );
    // clear payout pots so we can prove the claim banked something
    localStorage.removeItem('habbo-dungeons-coop-gold');
    localStorage.removeItem('habbo-dungeons-wild-xp');
    localStorage.removeItem('habbo-dungeons-daily-items');
  });

  // the always-visible dock: present in the square, badge pulsing when claimable
  await alice.waitForSelector('.dr-dock', { timeout: 5000 });
  const dockBefore = await alice.evaluate(() => ({
    present: !!document.querySelector('.dr-dock'),
    badgeShown: !document.querySelector('.dr-dock-dot').hidden,
    pulsing: document.querySelector('.dr-dock-dot').classList.contains('pulse'),
    cta: document.querySelector('.dr-dock-cta').textContent,
  }));
  console.log('daily wheel: dock');
  check('dock is mounted in the square', dockBefore.present);
  check('dock shows the alert badge when claimable', dockBefore.badgeShown);
  check('dock badge pulses when a spin is ready', dockBefore.pulsing);
  check('dock CTA invites a claim', /Ready to claim/.test(dockBefore.cta));

  // clicking the dock opens the same popup the Gatekeeper does
  await alice.click('.dr-dock');
  await alice.waitForSelector('.dr-modal', { timeout: 5000 });
  const opened = await alice.evaluate(() => ({
    title: document.querySelector('#drTitle').textContent,
    spinLabel: document.querySelector('.dr-spin').textContent,
    spinEnabled: !document.querySelector('.dr-spin').disabled,
    wedges: document.querySelectorAll('.dr-leg').length,
  }));
  check('popup opens with the Daily Rewards title', opened.title === 'Daily Rewards');
  check('spin button offers a claim', /Spin to Claim/.test(opened.spinLabel));
  check('spin is enabled before claiming', opened.spinEnabled);
  check('legend lists all 10 wedges', opened.wedges === 10);

  // SPIN -> lands (reduced motion resolves synchronously)
  await alice.click('.dr-spin');
  await alice.waitForFunction(
    () => /^Claim /.test(document.querySelector('.dr-spin').textContent),
    null,
    { timeout: 5000 }
  );
  const landed = await alice.evaluate(() => ({
    result: document.querySelector('.dr-result').textContent,
    claimLabel: document.querySelector('.dr-spin').textContent,
    wonHighlighted: !!document.querySelector('.dr-leg.won'),
  }));
  check('a wedge is won and highlighted', landed.wonHighlighted);
  check('result announces the prize', /You won/.test(landed.result));
  check('button turns into a Claim action', /^Claim /.test(landed.claimLabel));

  // screenshot the winning moment (prize revealed + payout detail)
  const shotDir = join(ROOT, '.gg', 'screenshots');
  mkdirSync(shotDir, { recursive: true });
  await alice.screenshot({ path: join(shotDir, 'daily-wheel-e2e.png') });

  // CLAIM (acknowledge) -> settles into the claimed/cooldown state
  await alice.click('.dr-spin');
  await alice.waitForFunction(
    () => document.querySelector('.dr-spin').textContent === 'Claimed for today',
    null,
    { timeout: 5000 }
  );
  const claimed = await alice.evaluate(() => ({
    spinLabel: document.querySelector('.dr-spin').textContent,
    spinDisabled: document.querySelector('.dr-spin').disabled,
    daily: JSON.parse(localStorage.getItem('habbo-dungeons-daily')),
    goldPot: Number(localStorage.getItem('habbo-dungeons-coop-gold') || 0),
    xpPot: Number(localStorage.getItem('habbo-dungeons-wild-xp') || 0),
    itemPot: JSON.parse(localStorage.getItem('habbo-dungeons-daily-items') || '[]'),
  }));
  const today = await alice.evaluate(() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  check('button reads Claimed for today', claimed.spinLabel === 'Claimed for today');
  check('claim button is now disabled', claimed.spinDisabled);
  check('claim persisted todays date', claimed.daily.lastClaimDay === today);
  check('first claim sets the streak to 1', claimed.daily.streak === 1);
  check(
    'payout was banked (gold, xp, or item pot got it)',
    claimed.goldPot > 0 || claimed.xpPot > 0 || claimed.itemPot.length > 0
  );

  // close the popup -> the dock refreshes and drops its "ready" badge
  await alice.click('.dr-x');
  await alice.waitForFunction(() => !document.querySelector('.dr-modal'), null, { timeout: 5000 });
  const dockAfter = await alice.evaluate(() => ({
    badgeShown: !document.querySelector('.dr-dock-dot').hidden,
    cta: document.querySelector('.dr-dock-cta').textContent,
  }));
  check('dock badge clears after claiming', dockAfter.badgeShown === false);
  check('dock CTA switches to come-back-tomorrow', /Come back tomorrow/.test(dockAfter.cta));

  // RE-OPEN the same day -> second spin must be blocked
  await alice.evaluate(() => window.__debug.openDailyWheel());
  await alice.waitForSelector('.dr-modal', { timeout: 5000 });
  const reopened = await alice.evaluate(() => ({
    spinLabel: document.querySelector('.dr-spin').textContent,
    spinDisabled: document.querySelector('.dr-spin').disabled,
    cooldownShown: !document.querySelector('.dr-cooldown').hidden,
  }));
  console.log('daily wheel: second spin blocked same day');
  check('re-opening same day shows Claimed for today', reopened.spinLabel === 'Claimed for today');
  check('second spin is blocked (button disabled)', reopened.spinDisabled);
  check('cooldown note is shown', reopened.cooldownShown);
} catch (e) {
  state.failed++;
  console.error('  FAIL  (exception)', e.message);
} finally {
  await browser.close().catch(() => {});
  server.kill();
}

console.log(state.failed ? `\n${state.failed} e2e check(s) FAILED` : '\nAll e2e checks passed');
process.exit(state.failed ? 1 : 0);
