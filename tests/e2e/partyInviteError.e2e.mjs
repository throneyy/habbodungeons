// Party invite: the accepted path AND the rejected path, end to end.
//
// The party-* / trade-* edge functions answer a REJECTION with HTTP 200 and
// { ok:false, reason } in the body. js/supabaseNet.js's send() used to do
// invokeFn(...).catch(() => {}) — a 200 is not a throw, so the reason was
// dropped on the floor: the player saw the infostand button flip to 'Invited…'
// and then nothing, forever. send() now awaits the body and emits 'net-error'
// { t, reason } whenever the response is missing or ok is false; js/party.js
// shows the reason through notice() and restores the 'Invite to Party' button.
//
// Both players get a real profiles row (lib.mjs seedProfile, written by their
// own anon session under the "profiles self upsert" RLS policy), which is what
// party-invite resolves the target by — without it every invite is rejected
// with 'no such player' regardless of client correctness.
//
// Run: node tests/e2e/partyInviteError.e2e.mjs
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium, startServer, makeChecker, seedProfile } from './lib.mjs';

const PORT = 8659;
const { check, state } = makeChecker();
const exe = findChromium();
if (!exe) { console.error('SKIP: no local Chromium build found'); process.exit(0); }

// STABLE names + PERSISTENT browser profiles, deliberately. Supabase
// rate-limits anonymous sign-ups per project ("Request rate limit reached"),
// and a fresh context every run burns two more of them — a handful of reruns
// and the whole suite starts failing at seedProfile for reasons that have
// nothing to do with the code under test. Reusing the profile dir reuses the
// stored session, so repeat runs mint no new users at all and keep the same
// profiles rows.
const PROFILE_DIR = fileURLToPath(new URL('.profiles/', import.meta.url));

async function openPlayer(port, name) {
  const identity = {
    name,
    figure: 'hd-180-1.ch-255-66.lg-280-110.sh-305-62',
    uniqueId: `e2e-${name.toLowerCase()}`,
    verifiedAt: new Date().toISOString(),
    classId: 'fighter',
  };
  const context = await chromium.launchPersistentContext(join(PROFILE_DIR, name), {
    executablePath: exe,
    headless: true,
    viewport: { width: 1100, height: 750 },
  });
  await context.addInitScript((id) => {
    localStorage.setItem('habbo-dungeons-identity', JSON.stringify(id));
    localStorage.setItem('habbo-dungeons-char', JSON.stringify({ name: id.name, figure: id.figure }));
  }, identity);
  const page = context.pages()[0] || await context.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  page.on('pageerror', (e) => console.error(`  [${name}] pageerror:`, e.message));
  await page.goto(`http://localhost:${port}/?backend=supabase`, { waitUntil: 'domcontentloaded' });
  const seed = await seedProfile(page, identity);
  await page.click('#btnPlay');
  await page.waitForSelector('.dr-dock', { timeout: 20000 });
  // Tap exactly what lands on this client's own user: topic (invited /
  // declined / party / trade-*), payload included — the whole point of the
  // mailbox channel, and the only way to prove a prompt really arrived.
  await page.evaluate(() => {
    const net = window.__debug.net;
    window.__rx = [];
    const orig = net._onUserEvent.bind(net);
    net._onUserEvent = (e, p) => { window.__rx.push({ e, p }); orig(e, p); };
  });
  // ...and a SEPARATE Realtime client (own socket, so it can't collide with
  // the app's channel on the same topic name) subscribed to the very same
  // topic as PUBLIC. This distinguishes "the server never broadcast" from
  // "the server broadcast to the other privacy of this topic" — exactly the
  // bug the private:false in supabase/functions/_shared/realtime.ts caused.
  await page.evaluate(async () => {
    const net = window.__debug.net;
    const sb = await window.__debug.supabase();
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('/js/supabase.js');
    const { data: { session } } = await sb.auth.getSession();
    const spy = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (session?.access_token) spy.realtime.setAuth(session.access_token);
    window.__pub = [];
    const ch = spy.channel(`user:${net.userId}`, { config: { private: false } });
    for (const e of ['invited', 'declined', 'party']) {
      ch.on('broadcast', { event: e }, ({ payload }) => window.__pub.push({ e, payload }));
    }
    window.__pubStatus = null;
    await new Promise((res) => {
      ch.subscribe((s, err) => {
        window.__pubStatus = `${s}${err ? ` (${err.message || err})` : ''}`;
        if (s === 'SUBSCRIBED') res();
      });
      setTimeout(res, 8000);
    });
  });
  return { page, context, logs, name, seed };
}

// Wait for one event to land on a client's own mailbox, then hand back the
// captured { e, p } record. Every read of __rx must go through this.
//
// A bare p.evaluate(() => window.__rx) read races the socket. pushParty()
// (_shared/party.ts) fans the roster out to every member CONCURRENTLY via
// Promise.all, so the order the two clients receive it in is not defined —
// and the A-side read here used to be bare while the B-side waited. It
// therefore sampled A's buffer in the instant after B's broadcast arrived
// but before A's had, reported `undefined`, and failed four assertions about
// a roster the server had in fact sent correctly. Symmetry is the fix: if a
// value comes off the network, wait for it.
// `live: true` additionally demands a REAL roster (partyId set), not a
// teardown. partyStateShape(null) is { leader:null, members:[], partyId:null }
// and pushParty sends exactly that when a party dissolves — so the disband in
// the pre-test cleanup below puts a `party` event in the buffer that satisfies
// a naive search and is not the roster the assertion means. The stale one wins
// too, since find() returns the FIRST match.
const waitForEvent = (page, event, { timeout = 20000, live = false } = {}) => page.waitForFunction(
  (o) => window.__rx.find((r) => r.e === o.e && (!o.live || (r.p && r.p.partyId))) || null,
  { e: event, live }, { timeout },
).then((h) => h.jsonValue()).catch(() => null);

// Drop everything captured so far. Setup noise must never be assertable.
const resetRx = (page) => page.evaluate(() => { window.__rx.length = 0; });

const server = await startServer(PORT);
let a = null;
let b = null;

try {
  // Namespaced per worktree (see AGENTS.md). Six worktrees share ONE Supabase
  // project, and these two names are the exact pair that once accumulated four
  // profiles rows between them — which is fatal here, because userByName()
  // resolves with .ilike().maybeSingle() and maybeSingle ERRORS on multiple
  // matches instead of picking one. Both players then became unresolvable and
  // party-invite answered "no such player" for someone standing right there,
  // which is several steps upstream of anything this suite means to assert.
  //
  // The 'pi-' prefix is this worktree's; a hyphen, never an underscore, because
  // _ is a single-character WILDCARD in ILIKE.
  a = await openPlayer(PORT, 'pi-InvA');
  b = await openPlayer(PORT, 'pi-InvB');
  check('A profile row seeded', a.seed.ok);
  check('B profile row seeded', b.seed.ok);
  if (!a.seed.ok || !b.seed.ok) throw new Error(`profile seed failed: ${a.seed.reason || b.seed.reason}`);

  // Reused accounts carry state: a party left over from a previous run makes
  // the next invite a legitimate 'already in a party' rejection. Start clean.
  for (const p of [a, b]) {
    await p.page.evaluate(async () => {
      const { invokeFn } = await import('/js/backend.js');
      await invokeFn('party-disband', {});
      await invokeFn('party-leave', {});
    });
  }
  // Disbanding an EXISTING party (there is one whenever a previous run got as
  // far as the accept) broadcasts a teardown to both mailboxes. Let those land,
  // then wipe the buffers so the assertions below can only see events this run
  // actually caused.
  await a.page.waitForTimeout(1500);
  await resetRx(a.page);
  await resetRx(b.page);

  // ---------------------------------------------------------- accepted path
  const tile = await a.page.waitForFunction((peer) => {
    const units = window.game?.controller?.remote?.units;
    const u = units && units.get(peer.toLowerCase());
    return u ? { x: u.x, y: u.y } : null;
  }, b.name, { timeout: 30000 }).then((h) => h.jsonValue()).catch(() => null);
  check('A sees B in the room', !!tile);
  if (!tile) throw new Error('no presence — cannot send a real invite');

  // ONE invite per run, and exactly one. party-invite rate-limits on
  // (user_id, action) with a 1-SECOND window (_shared/client.ts rateOk ->
  // rate_limit_touch), so the old pair here — click the infostand button, then
  // repeat the identical call raw "so the report can quote the body" — had its
  // second call rejected with {"ok":false,"reason":"slow down"} on every run.
  // A self-inflicted throttle: the suite never got past it to the private-topic
  // assertions below, which are the whole point of the file. The raw call IS
  // the invite now; the infostand is opened only to prove the UI path is
  // reachable and the button live for a valid target.
  await a.page.evaluate((t) => window.game.controller.onTap(t), tile);
  await a.page.waitForSelector('.infostand--human [data-act="invite"]', { timeout: 10000 });
  check('A\'s invite button is live for a valid target',
    await a.page.isEnabled('.infostand--human [data-act="invite"]'));

  const raw = await a.page.evaluate(async (name) => {
    const { invokeFn } = await import('/js/backend.js');
    return invokeFn('party-invite', { name });
  }, b.name);
  console.log(`  party-invite   ->  ${JSON.stringify(raw)}`);
  check('party-invite returns ok:true for a seeded target', !!(raw && raw.ok));
  // The error surface this suite is named for, now read off the single invite's
  // own response instead of a side effect of the click: a rejection comes back
  // as { ok:false, reason } with a 200, which invokeFn RESOLVES rather than
  // throws, so the reason has to be read from the body or it vanishes. (The
  // button path reports the same failure as a console warning, `invite failed:
  // <reason>` from supabaseNet.send — asserted below to have stayed quiet.)
  check('A saw no error for a valid invite', !(raw && raw.reason));
  check('nothing logged an invite failure on A',
    !a.logs.some((l) => l.includes('invite failed:')));

  const invited = await waitForEvent(b.page, 'invited');
  const onPublic = await b.page.evaluate(() => window.__pub);
  check('B receives "invited" on its (private) user: topic', !!invited);
  if (!invited) {
    const st = await b.page.evaluate(() => window.__pubStatus);
    console.log(`  └─ same topic, PUBLIC subscriber (${st}) saw: ${JSON.stringify(onPublic)}`);
    console.log('     └─ deploy the private:true fix in supabase/functions/_shared/realtime.ts');
  }
  console.log(`  B user: topic  ->  ${JSON.stringify(invited)}`);
  check('the invite carries A\'s Habbo name', invited && invited.p && invited.p.from === a.name);

  // B accepts through the real prompt → both mailboxes get the roster.
  await b.page.waitForSelector('.party-prompt [data-act="accept"]', { timeout: 10000 });
  await b.page.click('.party-prompt [data-act="accept"]');
  const partyB = await waitForEvent(b.page, 'party', { live: true });
  check('B receives "party" on its user: topic', !!partyB);
  console.log(`  B user: topic  ->  ${JSON.stringify(partyB)}`);
  const partyA = await waitForEvent(a.page, 'party', { live: true });
  check('A receives the same roster on its own topic', !!partyA);
  console.log(`  A user: topic  ->  ${JSON.stringify(partyA)}`);
  check('roster holds both players', partyA && (partyA.p.members || []).length === 2);
  check('A is the leader', partyA && partyA.p.leader === a.name);
  check('A shows the party chip strip',
    await a.page.waitForSelector('#partyStrip', { state: 'visible', timeout: 10000 })
      .then(() => true).catch(() => false));

  // ---------------------------------------------------------- rejected path
  // A ghost name can never resolve, so this exercises the { ok:false, reason }
  // branch deterministically without needing a full party.
  await a.page.evaluate(() => window.__debug.party.invite('NoSuchHabboAtAll_zzz'));
  const notice = await a.page.waitForSelector('.party-prompt--notice', { timeout: 20000 })
    .then((el) => el.textContent()).catch(() => null);
  check('the rejection reaches the player as a notice', !!notice);
  console.log(`  server reason  ->  ${JSON.stringify(notice)}`);
  check('net-error logged to the console',
    a.logs.some((l) => l.includes('invite failed:')));
  console.log(`  console        ->  ${a.logs.filter((l) => l.includes('failed:')).join(' | ') || '(none)'}`);
} finally {
  for (const p of [a, b]) if (p) await p.context.close().catch(() => {});
  server.kill();
}

process.exit(state.failed ? 1 : 0);
