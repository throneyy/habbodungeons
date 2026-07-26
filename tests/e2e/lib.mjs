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

// ---------------------------------------------------------------- worktree id
// Six agents run six git worktrees against ONE Supabase project, so every suite
// has to be distinguishable from the same suite running next door. Both halves
// below are derived from the worktree DIRECTORY NAME, so nobody has to remember
// to export anything; HD_SLUG / HD_PORT_BASE exist only as overrides.
//
// This is not hypothetical tidiness. Four profiles rows once claimed the two
// hardcoded e2e names (InvA/InvB) because parallel runs shared one project, and
// userByName() resolves with .ilike().maybeSingle() — which ERRORS on multiple
// matches rather than picking one. Both accounts became permanently uninvitable
// while the API blamed the name ("no such player"). The unique index added in
// 20260726180000_profiles_unique_habbo_username.sql turns a name clash into a
// hard 23505, so namespacing is now mandatory rather than merely tidy: without
// it the second worktree to seed "InvA" fails outright.
const WORKTREES = {
  duel: 'dl',
  'party-invite': 'pi',
  'profiles-unique': 'pu',
  'test-infra': 'ti',
  combat: 'cb',
};
const DIR = ROOT.replace(/[\\/]+$/, '').split(/[\\/]/).pop().toLowerCase();
export const SLUG = process.env.HD_SLUG || WORKTREES[DIR] || 'hb';

// Hyphen, never underscore: userByName matches with ILIKE, where _ is a
// single-character WILDCARD — "pi_InvA" would also match "piXInvA".
export const e2eName = (base) => `${SLUG}-${base}`;

// Fixed per worktree, NOT an OS-assigned free port. partyInviteError reuses
// persistent browser profiles to avoid burning anonymous sign-ins (Supabase
// allows 30/hour per IP), and localStorage is scoped to origin INCLUDING PORT —
// a shifting port silently yields a fresh unauthenticated session every run.
// That cost real debugging time once: a probe on the wrong port read an empty
// profiles table that was actually full, and the emptiness looked like data loss.
const PORT_BASES = { dl: 8700, pi: 8800, pu: 8900, ti: 9000, cb: 9100 };
export const PORT_BASE = Number(process.env.HD_PORT_BASE || PORT_BASES[SLUG] || 8600);
export const portFor = (offset) => PORT_BASE + offset;

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
// into the square, plus a matching profiles row so the SERVER knows who this
// browser is (see seedProfile).
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
  await seedProfile(page, identity);
  return page;
}

// Seeding localStorage alone makes a player look linked to ITSELF only. The
// server has no idea who this browser is: the party-* / trade-* edge functions
// resolve their target by profiles.habbo_username (supabase/functions/_shared/
// party.ts userByName), so an unseeded peer is invisible to them and every
// invite comes back { ok:false, reason:'no such player' } no matter how
// correct the client is.
//
// The fix is a row the page is allowed to write itself: the "profiles self
// upsert" / "profiles self update" RLS policies
// (supabase/migrations/20260725153009_*.sql) permit insert/update where
// auth.uid() = id, so a page's OWN anonymous session can claim its Habbo name
// — no service-role key anywhere near the test suite.
export async function seedProfile(page, identity) {
  await page.waitForFunction(() => !!(window.__debug && window.__debug.supabase), null, { timeout: 20000 });
  const res = await page.evaluate(async (id) => {
    const d = window.__debug;
    const sb = await d.supabase();
    if (!sb) return { ok: false, reason: 'supabase client unavailable' };
    // The anon JWT owns the row, so it has to exist before the upsert. Anon
    // sign-ups are rate-limited per IP, and a two-browser suite burns two of
    // them per run — retry, and surface the real auth error instead of a bare
    // "no session", so a 429 is obvious rather than looking like a test bug.
    let user = null;
    let authErr = '';
    for (let i = 0; i < 3 && !user; i++) {
      const { data: { user: u } = { user: null } } = await sb.auth.getUser();
      if (u) { user = u; break; }
      const { data, error } = await sb.auth.signInAnonymously();
      if (data?.user) user = data.user;
      else {
        authErr = error?.message || 'unknown';
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      }
    }
    if (!user) return { ok: false, reason: `no supabase session (${authErr})` };
    const { error } = await sb.from('profiles').upsert({
      id: user.id,
      habbo_username: id.name,
      habbo_figure: id.figure,
      habbo_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    return error ? { ok: false, reason: error.message } : { ok: true, userId: user.id };
  }, identity);
  if (!res.ok) console.error(`  [${identity.name}] profile seed failed:`, res.reason);
  return res;
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
