// A REAL duel, three browsers, against the live Supabase project.
//
// Everything before this file proved duels in a vacuum: tests/duelBattle.test.js
// drives DuelHost/DuelGuest over a fake wire in one process, and
// duelRlsLive.probe.mjs pokes the deployed functions with curl. Neither has ever
// put two actual browsers in one room and made them fight. This does, and it is
// the first run that can — the backend was only deployed today.
//
// Contexts, all three in THE OLD TOWN SQUARE and all three on distinct tiles:
//   A, B  the duellists, standing next to each other. Full flow: sign in, walk,
//         A taps B and hits Duel, B accepts, both run the 3-2-1-GO off the
//         server anchor, the battle boots IN THE SQUARE, and each lands a blow.
//   C     a BYSTANDER off to the side, in no duel at all. Nothing here builds
//         spectator support; C exists to MEASURE what a non-participant sees.
//
// The walking matters. Remote players do not block tiles, so three clients that
// just enter a room all stand on its spawn: the first live duel opened with
// both fighters on (6,7), one sprite drawn on top of the other. Walking them
// apart first is what makes "they fight from where they are standing" a real
// claim rather than an accident of the placement fallback.
//
// Assertions read what each browser RENDERS — the countdown digit in
// `.duel-count`, the banner text, the roster rows and their `.rhpn` HP numbers —
// not the network frames that caused them. A frame that arrives and paints
// nothing is exactly the failure mode worth catching.
//
// The bystander is measured at TWO layers, because they answer different
// questions and the interesting result is that they disagree:
//   raw  — net._onRelayed, wrapped. Fires for every duel-relay frame that
//          physically lands on C's socket. The duel stream rides the ROOM
//          channel (js/supabaseNet.js), and C is subscribed to that room, so
//          this measures Realtime's fan-out.
//   app  — net.on('duel-relay'). Fires only for frames that survive the
//          to/from filter in _onRelayed. This measures what C's app code is
//          ever told about.
//
// Run: node tests/e2e/duelLive.e2e.mjs
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium, startServer, makeChecker, seedProfile, e2eName, portFor } from './lib.mjs';

const PORT = portFor(61); // 59 is partyInviteError's; both are worktree-relative

// The duel is staged in the village square rather than the tavern the client
// boots into: it is the room players actually mill around in, it is big and
// open, and it gives three people room to stand apart.
const ROOM_ID = 'square';
const ROOM_NAME = 'The Old Town Square';
// Distinct tiles, chosen so A and B start ADJACENT (the duel should then fight
// from exactly these tiles) with C well clear of both.
//
// Each entry is a PREFERENCE LIST, not one tile, and the walker takes the first
// one this room can actually reach. The square's furniture is loaded from the
// server (admin layouts), not from the room data in js/rooms.js, so a tile that
// is open in the source can be blocked live: (9,11) reads walkable in
// buildRooms([]) and is solid on the real square. Hardcoding one tile makes the
// suite fail for a furniture change that has nothing to do with duels.
const TILES = {
  A: [{ x: 6, y: 8 }, { x: 6, y: 9 }, { x: 5, y: 8 }],
  B: [{ x: 7, y: 8 }, { x: 7, y: 9 }, { x: 6, y: 8 }],
  C: [{ x: 4, y: 11 }, { x: 10, y: 9 }, { x: 9, y: 9 }, { x: 4, y: 10 }],
};
const { check, state } = makeChecker();
const exe = findChromium();
if (!exe) { console.error('SKIP: no local Chromium build found'); process.exit(0); }

// Persistent profiles + stable names, for the reason partyInviteError documents:
// anonymous sign-ups are capped at 30/hour/IP across every worktree, and a fresh
// context per run burns THREE here. Reusing the profile dir reuses the stored
// session, so repeat runs mint no new users.
const PROFILE_DIR = fileURLToPath(new URL('.profiles/', import.meta.url));
const SHOTS = fileURLToPath(new URL('.artifacts/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const shot = (p, file) => p.screenshot({ path: join(SHOTS, file) }).catch(() => {});

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
  page.on('pageerror', (e) => {
    logs.push(`PAGEERROR: ${e.message}`);
    console.error(`  [${name}] pageerror:`, e.message);
  });
  await page.goto(`http://localhost:${port}/?backend=supabase`, { waitUntil: 'domcontentloaded' });
  const seed = await seedProfile(page, identity);
  await page.click('#btnPlay');
  await page.waitForSelector('.dr-dock', { timeout: 20000 });

  // Both taps, installed before anything can happen. See the header.
  await page.evaluate(() => {
    const net = window.__debug.net;
    window.__raw = [];
    window.__app = [];
    const orig = net._onRelayed.bind(net);
    net._onRelayed = (event, payload) => {
      if (event === 'duel-relay') window.__raw.push({ to: payload && payload.to, from: payload && payload.from, k: payload && payload.data && payload.data.k });
      return orig(event, payload);
    };
    net.on('duel-relay', (m) => window.__app.push({ to: m && m.to, from: m && m.from, k: m && m.data && m.data.k }));
    // Mailbox events too (duel-asked / duel-state), so the handshake half can be
    // told apart from the battle half when something goes quiet.
    window.__rx = [];
    const origUser = net._onUserEvent.bind(net);
    net._onUserEvent = (e, p) => { window.__rx.push({ e, p }); origUser(e, p); };
  });
  return { page, context, logs, name, seed };
}

// ---------------------------------------------------------------- in-page ops
// What this client currently RENDERS of a battle. Pure DOM except for the two
// coordinate fields, which no element carries.
const rendered = (p) => p.evaluate(() => {
  const txt = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : null; };
  const rows = [...document.querySelectorAll('#roster .roster-row')].map((r) => ({
    name: r.querySelector('.rname') ? r.querySelector('.rname').textContent.trim() : null,
    hp: r.querySelector('.rhpn') ? r.querySelector('.rhpn').textContent.trim() : null,
    // The class+level caption and the HP bar are rendered from the unit each
    // client holds, so they catch a field that failed to cross the wire even
    // when the HP NUMBER agrees.
    cls: r.querySelector('.rcls') ? r.querySelector('.rcls').textContent.trim() : null,
    fill: r.querySelector('.rhp-fill') ? r.querySelector('.rhp-fill').style.width : null,
    // the bar's COLOUR, which is the defect: it used to come from the team
    // stylesheet rule, so an opponent at full health painted red
    fillBg: r.querySelector('.rhp-fill')
      ? (r.querySelector('.rhp-fill').style.background || getComputedStyle(r.querySelector('.rhp-fill')).backgroundColor)
      : null,
    side: r.className.includes('player') ? 'player' : (r.className.includes('enemy') ? 'enemy' : '?'),
    done: r.className.includes('done'),
    dead: r.className.includes('dead'),
  }));
  const c = window.game && window.game.controller;
  const b = c && (c.battle || c.shadow);
  return {
    panelVisible: !!document.querySelector('#panel') && !document.querySelector('#panel').classList.contains('hidden'),
    banner: txt('#banner'),
    actions: [...document.querySelectorAll('#actions button')].map((x) => x.textContent.trim()),
    rows,
    roomName: (window.game && window.game.room && window.game.room.name) || null,
    roomId: (window.game && window.game.room && window.game.room.id) || null,
    // The explore view must still be running underneath a duel: the room's own
    // props and every OTHER person in it are still in the scene.
    sceneUnits: (window.game && window.game.units || []).length,
    propCount: (window.game && window.game.props || []).length,
    overlayVisible: !!document.querySelector('#overlay') && !document.querySelector('#overlay').classList.contains('hidden'),
    chatBar: !!document.querySelector('#chatToolbar'),
    phase: b ? b.phase : null,
    turn: b ? b.turn : null,
    units: b ? b.units.map((u) => ({
      name: u.name, team: u.team, x: u.x, y: u.y,
      hp: u.stats ? u.stats.hp : null, maxHp: u.stats ? u.stats.maxHp : null,
      level: u.level, classId: u.classId,
    })) : [],
  };
});

// Drive ONE action for whichever side this client owns, through real taps.
// Fighters are move 4 / range 1. In place they start adjacent, so the attack is
// usually reachable at once; the move half stays in for the cases where the
// placement rule had to separate them.
const takeTurn = (p) => p.evaluate(async () => {
  const c = window.game.controller;
  const isGuest = typeof c.myUnits === 'function';
  const b = isGuest ? c.shadow : c.battle;
  if (!b) return { err: 'no battle on this client' };
  const myTeam = isGuest ? 'enemy' : 'player';
  const mine = b.units.find((u) => u.team === myTeam && u.alive && !u.done);
  const foe = b.units.find((u) => u.team !== myTeam && u.alive);
  if (!mine || !foe) return { err: `no unit to act (mine=${!!mine} foe=${!!foe})` };
  if (b.phase !== myTeam) return { err: `not my phase (phase=${b.phase}, mine=${myTeam})` };

  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  c.onTap({ x: mine.x, y: mine.y }); // select
  await nap(120);

  const inRange = () => b.attackTargets(mine).includes(foe);
  let moved = null;
  if (!inRange()) {
    // moveTiles returns a Set of "x,y" keys, not an array of points.
    const tiles = [...b.moveTiles(mine)].map((k) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    });
    const d = (t) => Math.abs(t.x - foe.x) + Math.abs(t.y - foe.y);
    const best = tiles.sort((m, n) => d(m) - d(n))[0];
    if (best) {
      moved = { x: best.x, y: best.y };
      c.onTap(best);
      // the walk animates; the engine settles the unit at the end of it
      for (let i = 0; i < 60 && (mine.x !== best.x || mine.y !== best.y); i++) await nap(100);
      await nap(300);
      c.onTap({ x: mine.x, y: mine.y }); // re-select after the walk
      await nap(150);
    }
  }
  const hpBefore = foe.stats.hp;
  let attacked = false;
  if (inRange()) {
    c.onTap({ x: foe.x, y: foe.y });
    attacked = true;
    await nap(900); // let the swing resolve + relay
  }
  return { moved, attacked, hpBefore, hpAfter: foe.stats.hp, at: { x: mine.x, y: mine.y }, foeAt: { x: foe.x, y: foe.y } };
});

// End the acting unit's turn without attacking (closes a phase after a move).
const endTurn = (p) => p.evaluate(async () => {
  const c = window.game.controller;
  const isGuest = typeof c.myUnits === 'function';
  const b = isGuest ? c.shadow : c.battle;
  const myTeam = isGuest ? 'enemy' : 'player';
  const mine = b.units.find((u) => u.team === myTeam && u.alive && !u.done);
  if (!mine || b.phase !== myTeam) return false;
  c.onTap({ x: mine.x, y: mine.y });
  await new Promise((r) => setTimeout(r, 150));
  const wait = [...document.querySelectorAll('#actions button')].find((x) => x.textContent.trim() === 'Wait');
  if (wait) { wait.click(); return true; }
  return false;
});

const waitPhase = (p, team, timeout = 25000) => p.waitForFunction((t) => {
  const c = window.game && window.game.controller;
  const b = c && (c.battle || c.shadow);
  return !!b && b.phase === t;
}, team, { timeout }).then(() => true).catch(() => false);

const server = await startServer(PORT);
let a = null; let b = null; let c = null;
const bystander = {};

try {
  a = await openPlayer(PORT, e2eName('DuelA'));
  b = await openPlayer(PORT, e2eName('DuelB'));
  c = await openPlayer(PORT, e2eName('DuelC'));
  for (const p of [a, b, c]) check(`${p.name} profile row seeded`, p.seed.ok);
  if (![a, b, c].every((p) => p.seed.ok)) {
    // AGENTS.md: explicit quota exhaustion looks like this. Say so rather than
    // letting it read as a duel bug.
    throw new Error(`profile seed failed: ${[a, b, c].map((p) => p.seed.reason).filter(Boolean).join(' | ')}`);
  }

  // Reused accounts carry state: a duel left over from a previous run makes the
  // next challenge a legitimate 'already duelling' rejection.
  for (const p of [a, b, c]) {
    await p.page.evaluate(async () => {
      const { invokeFn } = await import('/js/backend.js');
      await invokeFn('duel-cancel', {});
    });
  }
  await a.page.waitForTimeout(1200);
  for (const p of [a, b, c]) await p.page.evaluate(() => { window.__rx.length = 0; window.__raw.length = 0; window.__app.length = 0; });

  // ---------------------------------------------------- the square, apart
  for (const p of [a, b, c]) {
    const moved = await p.page.evaluate((id) => window.__debug.gotoRoom(id), ROOM_ID);
    check(`${p.name} walked into the square`, moved === true);
  }
  await a.page.waitForTimeout(2500); // presence re-joins the new room's channel

  // Walk each player onto their OWN tile. Everyone enters on the room spawn
  // (remote players do not block tiles), so without this the duel would start
  // from a three-way pile-up — which is the bug the placement rule exists for,
  // and which this suite should not be silently relying on.
  const stood = {};
  for (const [p, wanted] of [[a, TILES.A], [b, TILES.B], [c, TILES.C]]) {
    const at = await p.page.evaluate(async (opts) => {
      const pf = await import('/js/pathfinder.js');
      const ctl = window.game.controller;
      const u = ctl.unit;
      const room = window.game.room;
      // First candidate this room can actually walk to from here.
      const target = opts.wanted.find(
        (t) => !room.isBlocked(t.x, t.y) && ((u.x === t.x && u.y === t.y) || !!pf.findPath(room, u.x, u.y, t.x, t.y)),
      );
      if (!target) {
        return { x: u.x, y: u.y, target: null, tried: opts.wanted };
      }
      ctl.onTap(target);
      for (let i = 0; i < 120 && (u.x !== target.x || u.y !== target.y); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return { x: u.x, y: u.y, target, walking: !!u.walking, room: room.id };
    }, { wanted });
    stood[p.name] = { x: at.x, y: at.y };
    check(`${p.name} walked to a tile of its own`,
      !!at.target && at.x === at.target.x && at.y === at.target.y);
    if (!at.target) {
      console.log(`     └─ ${p.name}: none of ${JSON.stringify(at.tried)} is reachable in this room`);
    } else if (at.x !== at.target.x || at.y !== at.target.y) {
      console.log(`     └─ ${p.name} wanted (${at.target.x},${at.target.y}) but stopped at (${at.x},${at.y})`);
    } else {
      console.log(`     └─ ${p.name} @ (${at.x},${at.y})`);
    }
  }
  const away = (p, q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
  check('the two duellists are standing next to each other, on separate tiles',
    away(stood[a.name], stood[b.name]) === 1);
  check('the bystander is standing clear of both',
    away(stood[c.name], stood[a.name]) >= 2 && away(stood[c.name], stood[b.name]) >= 2);
  await a.page.waitForTimeout(1500); // let the walks broadcast

  // ------------------------------------------------------------- presence
  const tile = await a.page.waitForFunction((peer) => {
    const units = window.game?.controller?.remote?.units;
    const u = units && units.get(peer.toLowerCase());
    return u ? { x: u.x, y: u.y } : null;
  }, b.name, { timeout: 30000 }).then((h) => h.jsonValue()).catch(() => null);
  check('A sees B in the room', !!tile);
  console.log(`  A sees B at   ->  ${JSON.stringify(tile)}`);
  check('A sees B on B\u2019s real tile, not the shared spawn',
    !!tile && tile.x === stood[b.name].x && tile.y === stood[b.name].y);
  // C's view of the two BEFORE anything starts — the baseline the "do they
  // freeze?" question is measured against.
  bystander.before = await c.page.evaluate((names) => {
    const u = window.game?.controller?.remote?.units;
    const out = {};
    for (const n of names) {
      const unit = u && u.get(n.toLowerCase());
      out[n] = unit ? { x: unit.x, y: unit.y } : null;
    }
    return out;
  }, [a.name, b.name]);
  console.log(`  C sees before ->  ${JSON.stringify(bystander.before)}`);
  check('the bystander sees both duellists in the room beforehand',
    !!bystander.before[a.name] && !!bystander.before[b.name]);
  check('the bystander sees them on two DIFFERENT tiles',
    !!bystander.before[a.name] && !!bystander.before[b.name] &&
    (bystander.before[a.name].x !== bystander.before[b.name].x ||
     bystander.before[a.name].y !== bystander.before[b.name].y));
  if (!tile) throw new Error('no presence — cannot start a real duel');

  // ------------------------------------------------------------- challenge
  await a.page.evaluate((t) => window.game.controller.onTap(t), tile);
  await a.page.waitForSelector('.infostand--human [data-act="duel"]', { timeout: 10000 });
  const duelLive = await a.page.isEnabled('.infostand--human [data-act="duel"]');
  check('A\'s Duel button is live for a room-mate', duelLive);
  await a.page.click('.infostand--human [data-act="duel"]');

  const asked = await b.page.waitForFunction(
    () => window.__rx.find((r) => r.e === 'duel-asked') || null, null, { timeout: 20000 },
  ).then((h) => h.jsonValue()).catch(() => null);
  check('B receives duel-asked on its mailbox', !!asked);
  console.log(`  B mailbox     ->  ${JSON.stringify(asked)}`);
  const prompt = await b.page.waitForSelector('.party-prompt [data-act="yes"]', { timeout: 15000 })
    .then(() => true).catch(() => false);
  check('B RENDERS the challenge prompt', prompt);
  if (!prompt) throw new Error('no duel prompt on B — cannot accept');

  // ------------------------------------------------------------- countdown
  await b.page.click('.party-prompt [data-act="yes"]');
  const winA = await a.page.waitForSelector('.duel-window', { timeout: 20000 }).then(() => true).catch(() => false);
  const winB = await b.page.waitForSelector('.duel-window', { timeout: 20000 }).then(() => true).catch(() => false);
  check('A renders the duel window', winA);
  check('B renders the duel window', winB);
  const countA = await a.page.textContent('.duel-count').catch(() => null);
  const countB = await b.page.textContent('.duel-count').catch(() => null);
  console.log(`  countdown     ->  A:"${countA}"  B:"${countB}"`);
  check('A shows a live countdown digit', !!countA && /^[0-9]|GO/i.test(countA.trim()));
  check('B shows a live countdown digit', !!countB && /^[0-9]|GO/i.test(countB.trim()));
  await Promise.all([shot(a.page, 'countdown-A.png'), shot(b.page, 'countdown-B.png'), shot(c.page, 'countdown-C.png')]);
  // C, mid-countdown: is any of this visible to a bystander at all?
  bystander.atCountdown = await c.page.evaluate(() => ({
    raw: window.__raw.length, app: window.__app.length, rx: window.__rx.length,
    duelWindow: !!document.querySelector('.duel-window'),
    prompt: !!document.querySelector('.party-prompt'),
  }));

  // ------------------------------------------------------------- battle boot
  const bootA = await a.page.waitForFunction(
    () => document.querySelectorAll('#roster .roster-row').length === 2, null, { timeout: 30000 },
  ).then(() => true).catch(() => false);
  const bootB = await b.page.waitForFunction(
    () => document.querySelectorAll('#roster .roster-row').length === 2, null, { timeout: 30000 },
  ).then(() => true).catch(() => false);
  check('A boots the duel and renders 2 roster rows', bootA);
  check('B boots the duel and renders 2 roster rows', bootB);

  const rA = await rendered(a.page);
  const rB = await rendered(b.page);
  console.log(`  A renders     ->  ${JSON.stringify(rA)}`);
  console.log(`  B renders     ->  ${JSON.stringify(rB)}`);
  // THE HEADLINE CLAIM: nobody went anywhere. The fight is in the square.
  check('A fights in the square, not an arena', rA.roomId === ROOM_ID && rA.roomName === ROOM_NAME);
  check('B fights in the square too', rB.roomId === ROOM_ID && rB.roomName === ROOM_NAME);
  check('A never left the explore view', rA.overlayVisible === false && rA.chatBar === true);
  check('B never left the explore view', rB.overlayVisible === false && rB.chatBar === true);
  check('the square’s furniture is still on A’s screen', rA.propCount > 10);
  check('...and on B’s', rB.propCount > 10);
  check('the bystander is still in A’s scene alongside the two fighters',
    rA.sceneUnits >= 3);
  check('the duellists fight from the tiles they were standing on',
    !!rA.units.find((u) => u.name === a.name && u.x === stood[a.name].x && u.y === stood[a.name].y) &&
    !!rA.units.find((u) => u.name === b.name && u.x === stood[b.name].x && u.y === stood[b.name].y));
  check('and never on the same tile as each other',
    rA.units[0].x !== rA.units[1].x || rA.units[0].y !== rA.units[1].y);
  check('both clients agree on the unit positions',
    JSON.stringify(rA.units.map((u) => [u.name, u.x, u.y])) === JSON.stringify(rB.units.map((u) => [u.name, u.x, u.y])));
  check('both clients agree on starting HP',
    JSON.stringify(rA.rows.map((r) => r.hp)) === JSON.stringify(rB.rows.map((r) => r.hp)));
  check('A (host) opens on the player phase', rA.phase === 'player');
  check('B (guest) sees the same phase', rB.phase === 'player');
  check('B renders its own duellist as the player side',
    !!rB.rows.find((r) => r.name === b.name && r.side === 'player'));

  // ------------------------------------------------------------- a blow each
  // Turn 1: A closes the gap (6 tiles, move 4) and ends. B closes and swings.
  const t1a = await takeTurn(a.page);
  console.log(`  A turn 1      ->  ${JSON.stringify(t1a)}`);
  if (!t1a.attacked) await endTurn(a.page);
  check('A\'s phase handed over to B', await waitPhase(b.page, 'enemy'));

  const t1b = await takeTurn(b.page);
  console.log(`  B turn 1      ->  ${JSON.stringify(t1b)}`);
  check('B (guest) landed an attack that the host resolved', !!t1b.attacked && t1b.hpAfter < t1b.hpBefore);

  let afterB1 = await rendered(a.page);
  let afterB2 = await rendered(b.page);
  check('both screens show the same HP after B\'s blow',
    JSON.stringify(afterB1.rows.map((r) => [r.name, r.hp])) === JSON.stringify(afterB2.rows.map((r) => [r.name, r.hp])));
  console.log(`  after B blow  ->  A:${JSON.stringify(afterB1.rows.map((r) => [r.name, r.hp]))}  B:${JSON.stringify(afterB2.rows.map((r) => [r.name, r.hp]))}`);

  if (!t1b.attacked) await endTurn(b.page);
  check('the turn came back to A', await waitPhase(a.page, 'player'));

  const t2a = await takeTurn(a.page);
  console.log(`  A turn 2      ->  ${JSON.stringify(t2a)}`);
  check('A (host) landed an attack', !!t2a.attacked && t2a.hpAfter < t2a.hpBefore);

  const finA = await rendered(a.page);
  const finB = await rendered(b.page);
  console.log(`  final A       ->  ${JSON.stringify(finA.rows)}`);
  console.log(`  final B       ->  ${JSON.stringify(finB.rows)}`);
  check('both screens show identical HP after a blow from each side',
    JSON.stringify(finA.rows.map((r) => [r.name, r.hp])) === JSON.stringify(finB.rows.map((r) => [r.name, r.hp])));
  // Same roster, same units, so every client-visible field should match — not
  // just the HP number. The caption carries the level and the bar carries the
  // HP fraction; either can disagree while `hp` alone looks fine.
  check('both screens render the same class+level caption for each duellist',
    JSON.stringify(finA.rows.map((r) => [r.name, r.cls])) === JSON.stringify(finB.rows.map((r) => [r.name, r.cls])));
  check('both screens render the same HP bar fill for each duellist',
    JSON.stringify(finA.rows.map((r) => [r.name, r.fill])) === JSON.stringify(finB.rows.map((r) => [r.name, r.fill])));
  check('both screens agree on each duellist\'s level and maxHp',
    JSON.stringify(finA.units.map((u) => [u.name, u.level, u.maxHp])) === JSON.stringify(finB.units.map((u) => [u.name, u.level, u.maxHp])));
  console.log(`  captions A    ->  ${JSON.stringify(finA.rows.map((r) => [r.name, r.cls, r.fill]))}`);
  console.log(`  captions B    ->  ${JSON.stringify(finB.rows.map((r) => [r.name, r.cls, r.fill]))}`);
  console.log(`  units A       ->  ${JSON.stringify(finA.units)}`);
  console.log(`  units B       ->  ${JSON.stringify(finB.units)}`);
  check('both duellists actually took a wound',
    finA.rows.every((r) => r.hp && Number(r.hp) > 0) &&
    finA.rows.some((r) => Number(r.hp) < 34) && finA.rows.filter((r) => Number(r.hp) < 34).length === 2);

  // ---- the three UI defects this pass was meant to close --------------------
  // The roster caption used to drop the level for team 'enemy' (correct for a
  // goblin, wrong for a person), so the same fighter read "Fighter" on one
  // screen and "Fighter L1" on the other.
  check('every duellist carries a level on BOTH screens',
    [...finA.rows, ...finB.rows].every((r) => /L\d+$/.test(r.cls || '')));
  // The HP bar was coloured by TEAM, so each client painted its opponent's bar
  // red — a fighter at full health read as nearly dead, on both screens.
  const RED = /#cc0100|rgb\(204,\s*1,\s*0\)/;
  const GREEN = /#00813e|rgb\(0,\s*129,\s*62\)/;
  check('a duellist above half health never renders a red bar on either screen',
    [...finA.rows, ...finB.rows].every((r) => !RED.test(r.fillBg || '')));
  check('the bars are coloured by health, identically on both screens',
    finA.rows.every((r) => GREEN.test(r.fillBg || '')) &&
    finB.rows.every((r) => GREEN.test(r.fillBg || '')));
  console.log(`  bar colours A ->  ${JSON.stringify(finA.rows.map((r) => [r.name, r.fillBg]))}`);
  console.log(`  bar colours B ->  ${JSON.stringify(finB.rows.map((r) => [r.name, r.fillBg]))}`);
  // The banner used to say "Defeat all enemies" at another player.
  check('neither banner speaks dungeon at a person',
    !/Defeat all enemies/.test(finA.banner || '') && !/Defeat all enemies/.test(finB.banner || ''));
  check('both banners name the opponent instead',
    (finA.banner || '').includes(b.name) && (finB.banner || '').includes(a.name));
  console.log(`  banner A      ->  ${JSON.stringify(finA.banner)}`);
  console.log(`  banner B      ->  ${JSON.stringify(finB.banner)}`);

  await Promise.all([shot(a.page, 'attack-A.png'), shot(b.page, 'attack-B.png'), shot(c.page, 'attack-C.png')]);

  // ------------------------------------------------------------- bystander
  bystander.atAttack = await c.page.evaluate((names) => {
    const remote = window.game?.controller?.remote;
    const units = remote && remote.units;
    const seen = {};
    for (const n of names) {
      const u = units && units.get(n.toLowerCase());
      seen[n] = u
        ? { x: u.x, y: u.y, inScene: (window.game.units || []).includes(u), hasTag: !!(remote.tags && remote.tags.get(n.toLowerCase())) }
        : null;
    }
    return {
      raw: window.__raw.length,
      app: window.__app.length,
      rawKinds: [...new Set(window.__raw.map((r) => r.k))],
      rawTo: [...new Set(window.__raw.map((r) => r.to))],
      roomName: window.game.room && window.game.room.name,
      duelWindow: !!document.querySelector('.duel-window'),
      rosterRows: document.querySelectorAll('#roster .roster-row').length,
      panelVisible: !!document.querySelector('#panel') && !document.querySelector('#panel').classList.contains('hidden'),
      seen,
    };
  }, [a.name, b.name]);

  const by = bystander.atAttack;
  console.log(`\n  --- BYSTANDER (${c.name}) baseline ---`);
  console.log(`  duel-relay frames on C's socket (raw): ${by.raw}   kinds: ${JSON.stringify(by.rawKinds)}   addressed to: ${JSON.stringify(by.rawTo)}`);
  console.log(`  frames C's app code was told about:    ${by.app}`);
  console.log(`  C still in room:                       ${JSON.stringify(by.roomName)}  (panel:${by.panelVisible} rosterRows:${by.rosterRows} duelWindow:${by.duelWindow})`);
  console.log(`  duellists as C renders them:           ${JSON.stringify(by.seen)}`);
  console.log(`  duellist tiles, truth vs C:            A@${JSON.stringify(finA.units.find((u) => u.name === a.name))}`);

  check('C physically RECEIVES the duel stream (it rides the room channel)', by.raw > 0);
  check('C\'s app code is told about none of it (every frame is addressed elsewhere)', by.app === 0);
  check('C renders no duel UI', !by.duelWindow && by.rosterRows === 0);
  check('C is still standing in the square', by.roomName === ROOM_NAME);
  // SYMMETRY. The old teardown lifted one duellist out of the room and left the
  // other standing: attack-C.png showed hb-DuelB frozen in the tavern while
  // hb-DuelA had vanished outright. An in-place duel tears nothing down, so
  // BOTH must still be there — and the failure to catch is one of them missing
  // while the other is fine.
  const present = [a.name, b.name].filter((n) => !!by.seen[n]);
  check('NEITHER duellist vanishes from the bystander\u2019s room', present.length === 2);
  check('...and they are treated identically (no one-vanished asymmetry)',
    present.length === 0 || present.length === 2);
  check('both are still drawn in C\u2019s scene',
    [a.name, b.name].every((n) => !!(by.seen[n] && by.seen[n].inScene)));
  check('both still carry their name tag for C',
    [a.name, b.name].every((n) => !!(by.seen[n] && by.seen[n].hasTag)));
  check('C never sees the two duellists stacked on one tile',
    !by.seen[a.name] || !by.seen[b.name] ||
    by.seen[a.name].x !== by.seen[b.name].x || by.seen[a.name].y !== by.seen[b.name].y);

  // THE question, now answered per duellist: the fight is happening in this very
  // room, so what does a bystander actually see the fighters DOING? Compare C's
  // view now against C's view before the duel started, and against the truth.
  for (const n of [a.name, b.name]) {
    const was = bystander.before[n];
    const now = by.seen[n];
    const truth = finA.units.find((u) => u.name === n);
    const verdict = !now ? 'VANISHED from C\'s room'
      : (was && now.x === was.x && now.y === was.y)
        ? `STILL at (${now.x},${now.y}) — same tile as before the duel`
        : `MOVED to (${now.x},${now.y}) from (${was && was.x},${was && was.y})`;
    const agrees = truth && now && truth.x === now.x && truth.y === now.y;
    console.log(`  ${n}: ${verdict}; the fighter is really at (${truth && truth.x},${truth && truth.y}) — C ${agrees ? 'AGREES' : 'IS STALE'}`);
  }
  bystander.tracking = [a.name, b.name].map((n) => {
    const truth = finA.units.find((u) => u.name === n);
    const now = by.seen[n];
    return !!(truth && now && truth.x === now.x && truth.y === now.y);
  });
  check('C\u2019s view of where each fighter stands matches the real fight',
    bystander.tracking.every(Boolean));
} catch (e) {
  console.error(`\n  SUITE ABORTED: ${e.message}`);
  state.failed++;
  for (const p of [a, b, c]) if (p) await shot(p.page, `abort-${p.name}.png`);
} finally {
  for (const p of [a, b, c]) {
    if (!p) continue;
    await p.page.evaluate(async () => {
      const { invokeFn } = await import('/js/backend.js');
      await invokeFn('duel-cancel', {});
    }).catch(() => {});
  }
  for (const p of [a, b, c]) {
    if (p && p.logs.length) {
      const notable = p.logs.filter((l) => /fail|error|denied|rate limit|anonymous sign-in/i.test(l));
      if (notable.length) console.log(`  [${p.name}] console: ${notable.slice(0, 6).join(' | ')}`);
    }
  }
  for (const p of [a, b, c]) if (p) await p.context.close().catch(() => {});
  server.kill();
}

console.log(`\n  screenshots -> ${SHOTS}`);
console.log(state.failed ? `\n${state.failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(state.failed ? 1 : 0);
