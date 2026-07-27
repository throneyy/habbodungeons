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
//   C     a BYSTANDER off to the side, in no duel at all. C is part of the
//         test's own choreography (it walks, it taps, it gets cleaned up).
//   D     a GENUINE bystander. D joins the square BEFORE the duellists ever get
//         there, is never spoken to, never taps anything, and takes part in no
//         setup step aimed at the duel. It exists because a real player standing
//         in the village reported seeing no combat at all while a duel ran, and
//         C — wired up by the test itself — could not have caught that.
//         Every hop from "bytes arrived" to "a number was drawn" is counted
//         separately on D (window.__chain), so a drop names its own link.
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
// OPTIONAL: a real player watching this run from their own browser on the
// deployed site. Same Supabase project, same room channel, different build.
//
// DEFAULTS TO EMPTY — no human required — because this suite runs in the
// unattended `bun run test:e2e` gate, and a suite that aborts unless a specific
// person happens to be standing in the live square is a suite the gate can
// never pass. It previously defaulted to `throney` (this repo's admin, see
// ADMIN_NAMES in js/config.js), which made `test:e2e` exit 1 on every machine
// including CI, for a reason that had nothing to do with duelling.
//
// Opt IN when a human is genuinely watching and you want that confirmed:
//
//   HD_DUEL_WATCHER=myhabbo  node tests/e2e/duelLive.e2e.mjs
//
// With it empty the suite still runs IN FULL — browser D is an in-test client
// the test never wires up, so the spectator layer is still measured on a client
// that was left alone; what is lost is only the confirmation that a HUMAN on
// the deployed build saw the same fight.
const WATCHER = process.env.HD_DUEL_WATCHER ?? '';
// Distinct tiles, chosen so A and B start ADJACENT (the duel should then fight
// from exactly these tiles) with C well clear of both.
//
// Each entry is a PREFERENCE LIST, not one tile, and the walker takes the first
// one this room can actually reach. The square's furniture is loaded from the
// server (admin layouts), not from the room data in js/rooms.js, so a tile that
// is open in the source can be blocked live: (9,11) reads walkable in
// buildRooms([]) and is solid on the real square. Hardcoding one tile makes the
// suite fail for a furniture change that has nothing to do with duels.
// The duellists start APART now, not side by side. placeDuellists no longer
// drags them together (it only un-stacks and un-blocks), so the gap survives
// into the fight and somebody has to walk — which is the point: a ranger
// should be able to shoot across it, and a fighter should have to close it.
const TILES = {
  A: [{ x: 3, y: 8 }, { x: 3, y: 9 }, { x: 4, y: 8 }],
  B: [{ x: 7, y: 8 }, { x: 7, y: 9 }, { x: 6, y: 8 }],
  C: [{ x: 4, y: 11 }, { x: 10, y: 9 }, { x: 9, y: 9 }, { x: 4, y: 10 }],
  D: [{ x: 9, y: 9 }, { x: 10, y: 9 }, { x: 4, y: 10 }, { x: 4, y: 11 }],
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

// A wall-clock marker for each beat of the duel, so a human watching the room in
// their own browser can line up what they SAW against what the test DID.
const t0 = Date.now();
const beat = (what) => {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  const el = ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
  console.log(`  ▶ [${hh}:${mm}:${ss}.${ms}  +${el}s]  ${what}`);
};

async function openPlayer(port, name, build = {}) {
  // A duellist is the player's ACTUAL character, so the two fighters are
  // deliberately different: a ranger who has ground out an Origins tree skill
  // and is carrying gear, against a plain melee fighter. Two fighters standing
  // adjacent proved almost nothing about the engine — this exercises reach,
  // walking, equipment stats and a real unlocked skill.
  const identity = {
    name,
    figure: 'hd-180-1.ch-255-66.lg-280-110.sh-305-62',
    uniqueId: `e2e-${name.toLowerCase()}`,
    verifiedAt: new Date().toISOString(),
    classId: build.classId || 'fighter',
    // What Identity.unlockedSkills() reads. 'net' is Fishing 5 — a damage +
    // root skill with range 3, so it is castable without closing.
    unlockedSkills: build.skillIds || [],
    fishingLevel: build.fishingLevel || 0,
    gardeningLevel: build.gardeningLevel || 0,
  };
  const context = await chromium.launchPersistentContext(join(PROFILE_DIR, name), {
    executablePath: exe,
    headless: true,
    viewport: { width: 1100, height: 750 },
  });
  await context.addInitScript((seed) => {
    localStorage.setItem('habbo-dungeons-identity', JSON.stringify(seed.id));
    localStorage.setItem('habbo-dungeons-char', JSON.stringify({ name: seed.id.name, figure: seed.id.figure }));
  }, { id: identity });
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
    // ...and the READ-ONLY spectator event. A bystander is now told about the
    // fight on `duel-watch`, which no command handler subscribes to — the whole
    // point of the split, so the two are counted separately.
    window.__watch = [];
    net.on('duel-watch', (m) => window.__watch.push({ to: m && m.to, from: m && m.from, k: m && m.data && m.data.k }));

    // ---- CHAIN TRACE, one counter per link ---------------------------------
    // A real player standing in the village reported seeing no combat at all
    // during a duel, so every hop between "the socket received bytes" and "the
    // screen drew a number" is counted separately. Whichever counter is the
    // first zero is the link that drops the frame; anything downstream of it is
    // a symptom, not the cause.
    window.__chain = {
      L1_roomTopic: null,      // are we even on the room channel, and which one
      L2_broadcast: 0,         // the ch.on('broadcast', duel-relay) handler fired
      L3_onRelayed: 0,         // ...and reached _onRelayed
      L3_watchBranch: 0,       // ...and took the addressed-to-someone-else branch
      L4_listeners: null,      // how many duel-watch subscribers exist
      L5_specFrames: 0,        // DuelSpectator.onFrame was called
      L5_specKinds: [],
      L6_specStart: 0,         // ...and onStart accepted it (watching went true)
      L6_startRejected: null,  // ...or why it did not
      L7_applyBars: 0,         // ...and bars were pushed onto real avatars
    };
    const chain = window.__chain;
    const spec = window.__debug.duelWatch();
    chain.L4_listeners = (net.handlers && net.handlers.get && net.handlers.get('duel-watch'))
      ? net.handlers.get('duel-watch').size : null;

    const origRelayed = net._onRelayed.bind(net);
    net._onRelayed = (event, payload) => {
      if (event === 'duel-relay') {
        chain.L3_onRelayed++;
        if (payload && payload.to && payload.to !== net.name) chain.L3_watchBranch++;
      }
      return origRelayed(event, payload);
    };
    const origFrame = spec.onFrame.bind(spec);
    spec.onFrame = (m) => {
      chain.L5_specFrames++;
      const k = m && m.data && m.data.k;
      if (k && !chain.L5_specKinds.includes(k)) chain.L5_specKinds.push(k);
      const was = spec.watching;
      const r = origFrame(m);
      if (k === 'start') {
        if (spec.watching && !was) chain.L6_specStart++;
        else if (!spec.watching) {
          chain.L6_startRejected =
            `roomId=${m.data.roomId} here=${window.game.room && window.game.room.id} units=${(m.data.units || []).length}`;
        }
      }
      return r;
    };
    const origBars = spec.applyBars.bind(spec);
    spec.applyBars = () => { chain.L7_applyBars++; return origBars(); };
    // Every combat effect this client renders. The floating damage number is
    // the thing a spectator actually SEES, and it lives for 800ms on a canvas,
    // so it has to be captured as it is queued rather than screenshotted for.
    window.__fx = [];
    const game = window.game;
    const origFx = game.addFx.bind(game);
    game.addFx = (fx) => { window.__fx.push({ type: fx.type, text: fx.text, x: fx.x, y: fx.y }); return origFx(fx); };
    // Every duel call this client makes to the live backend, with what came
    // back. The abandonment watchdog polls duel-claim from inside a try/catch
    // that swallows everything (js/main.js startDuelWatchdog), so without this
    // a claim that is never sent and a claim that is refused every time look
    // identical from outside: both are just a duel that never ends.
    window.__sends = [];
    const origSend = net.send.bind(net);
    net.send = (m) => {
      const out = origSend(m);
      if (m && typeof m.t === 'string' && m.t.startsWith('duel-')) {
        const at = Math.round(performance.now());
        Promise.resolve(out).then(
          (res) => window.__sends.push({ at, t: m.t, res }),
          (err) => window.__sends.push({ at, t: m.t, err: String(err && err.message || err) }),
        );
      }
      return out;
    };

    // Every notice the duel UI puts on screen. `You win the duel!` is a
    // .party-prompt--notice that DELETES ITSELF after 3.5s (DuelUI.flash), so a
    // waitForSelector racing a claim that can take most of a minute would miss
    // the very message it is there to prove. Recorded as it is inserted, from
    // the DOM rather than from any internal, because the string a player reads
    // is the thing under test.
    window.__notices = [];
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1 || !n.classList || !n.classList.contains('party-prompt')) continue;
          const t = (n.textContent || '').trim();
          if (t) window.__notices.push(t);
        }
      }
    }).observe(document.body, { childList: true });

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
      // the character that travelled: reach, and the unlocked tree skills
      range: u.stats ? u.stats.range : null,
      atk: u.stats ? u.stats.atk : null,
      skills: (u.skills || []).map((s) => s.id),
    })) : [],
  };
});

// Drive ONE action for whichever side this client owns, through real taps.
// Fighters are move 4 / range 1. In place they start adjacent, so the attack is
// usually reachable at once; the move half stays in for the cases where the
// placement rule had to separate them.
const takeTurn = (p, opts = {}) => p.evaluate(async (o) => {
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
  const from = { x: mine.x, y: mine.y };
  const gap = () => Math.max(Math.abs(mine.x - foe.x), Math.abs(mine.y - foe.y));
  const startGap = gap();
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
    // PLAY THE CLASS, don't just charge. Closing to melee is correct for a
    // fighter and actively wrong for a ranger: its bow has min 2, so standing
    // adjacent drops it onto the close-range dagger (atk 6 vs the bow's 9) and
    // throws away the entire reason to be a ranger. Prefer a tile that puts the
    // foe inside [min, range]; among those, stand as FAR back as allowed.
    const cheb = (t) => Math.max(Math.abs(t.x - foe.x), Math.abs(t.y - foe.y));
    const st = mine.stats;
    const good = tiles.filter((t) => cheb(t) >= (st.min || 1) && cheb(t) <= st.range);
    const best = good.length
      ? good.sort((m, n) => cheb(n) - cheb(m))[0] // hang back at max reach
      : tiles.sort((m, n) => cheb(m) - cheb(n))[0]; // can't reach at all: close in
    // A no-op "move" onto the tile we already occupy is not a move. A ROOTED
    // duellist's move set collapses to exactly that one tile, so without this
    // the timeline would report a walk that never happened.
    if (best && (best.x !== mine.x || best.y !== mine.y)) {
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
  const rootedBefore = foe.rooted || 0;

  // A REAL UNLOCKED TREE SKILL, cast the way a player casts one: pick it out of
  // the action list, then tap the target. Every duel run so far produced plain
  // swings only, so the skill half of the command set — the half a player
  // actually grinds Fishing/Gardening for — has never been exercised live.
  //
  // enterSkill takes an INDEX on the guest's controller (the relay sends the
  // index, not the object) and ignores the second argument on the host's, so
  // passing both keeps one driver working from either seat.
  const skills = mine.skills || [];
  const skillIdx = skills.findIndex(
    (sk) => sk && sk.target === 'enemy' && b.skillTargets(mine, sk).includes(foe),
  );
  let skill = null;
  if (o.useSkill && skillIdx >= 0) {
    const sk = skills[skillIdx];
    const castFrom = { x: mine.x, y: mine.y };
    const castAt = { x: foe.x, y: foe.y };
    const reach = gap();
    c.enterSkill(sk, skillIdx);
    await nap(200);
    c.onTap({ x: foe.x, y: foe.y });
    await nap(1100); // resolve + relay + the guest's phase snapshot
    skill = {
      id: sk.id, name: sk.name, kind: sk.kind,
      castFrom, castAt, reach,
      dmg: hpBefore - foe.stats.hp,
      rootedBefore,
      // BOTH halves of a root, because the turn boundary moves it between them:
      // resolveSkill sets `rooted`, then the victim's resetTurn converts it into
      // `rootedThisTurn` (the flag moveTiles actually reads) and decrements the
      // counter. Casting ends the caster's phase, so by the time this is read
      // the handover has usually already happened and `rooted` is back to 0 —
      // reading only that would report a root that plainly did land as absent.
      rootedAfter: foe.rooted || 0,
      rootedTurnAfter: !!foe.rootedThisTurn,
      foeHpAfter: foe.stats.hp,
    };
  }

  // A plain swing, unless the skill has already spent this unit's turn.
  const hpBeforeAtk = foe.stats.hp;
  let attacked = false;
  if (!mine.acted && inRange()) {
    c.onTap({ x: foe.x, y: foe.y });
    attacked = true;
    await nap(900); // let the swing resolve + relay
  }
  return {
    moved, attacked, skill, hpBefore, hpAfter: foe.stats.hp,
    atkDmg: attacked ? hpBeforeAtk - foe.stats.hp : 0,
    from, at: { x: mine.x, y: mine.y }, foeAt: { x: foe.x, y: foe.y },
    startGap, range: gap(), // reach the blow was actually struck at
    cls: mine.classId, skills: skills.map((s) => s.id),
    skillIdx,
    // How many tiles this unit could reach this turn. A rooted duellist's set
    // collapses to its own tile — that is how a root is observed from outside.
    moveTiles: b.moveTiles(mine).size,
    rooted: mine.rooted || 0, rootedThisTurn: !!mine.rootedThisTurn,
  };
}, opts);

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

// ------------------------------------------------------------- endings: ops

// THE SERVER'S OWN RECORD of every duel this player is in. RLS on `duels` is
// participants-only SELECT (20260726120000_duels.sql), so this is read from a
// duellist's session and is the row itself — not the client's belief about it.
// A fight that ends must reach 'done'; 'asked' or 'countdown' is the pair still
// looking busy to duel-challenge, which is what would leave them unable to
// duel again.
const duelRows = (p) => p.evaluate(async () => {
  const sb = await window.__debug.supabase(); // async: it lazy-loads the client
  if (!sb) return { err: 'no supabase client on this page' };
  const { data, error } = await sb
    .from('duels')
    .select('id,status,a_name,b_name,room_id,updated_at')
    .order('updated_at', { ascending: false })
    .limit(10);
  if (error) return { err: `${error.code || ''} ${error.message}`.trim() };
  return { rows: data || [] };
});

const LIVE_STATUS = ['asked', 'countdown'];
const liveRows = (r) => (r.rows || []).filter((x) => LIVE_STATUS.includes(x.status));

// Ask the LIVE backend whether this player may duel again, by actually trying.
// A settled row frees both sides; an unsettled one answers "already duelling",
// which is the exact refusal a stuck row produces for a real player.
const challengeProbe = (p, name) => p.evaluate(async (n) => {
  const { invokeFn } = await import('/js/backend.js');
  try {
    return await invokeFn('duel-challenge', { name: n });
  } catch (e) {
    return { ok: false, reason: `threw: ${e.message}` };
  }
}, name);

const cancelDuel = (p) => p.evaluate(async () => {
  const { invokeFn } = await import('/js/backend.js');
  try { return await invokeFn('duel-cancel', {}); } catch { return null; }
}).catch(() => null);

// What a BYSTANDER still has dressed on screen. The two things that must not
// outlive the fight are the HP bar (unit.stats — explore avatars carry none)
// and the crossed-swords tag.
const watched = (p, names) => p.evaluate((ns) => {
  const remote = window.game?.controller?.remote;
  const units = remote && remote.units;
  const spec = window.__debug.duelWatch();
  return {
    watching: spec.watching,
    fighters: spec.fighters.slice(),
    endFrames: (window.__watch || []).filter((w) => w.k === 'end').length,
    watchKinds: [...new Set((window.__watch || []).map((w) => w.k))],
    bars: ns.map((n) => {
      const u = units && units.get(n.toLowerCase());
      return { name: n, present: !!u, hp: u && u.stats ? u.stats.hp : null, duellist: !!(u && u.duellist) };
    }),
    tags: ns.map((n) => {
      const t = remote && remote.tags && remote.tags.get(n.toLowerCase());
      return { name: n, present: !!t, text: t ? t.textContent : null, marked: !!(t && t.classList.contains('name-tag--duel')) };
    }),
  };
}, names);

// Wait for a bystander to put the room back to normal: no fight being watched,
// and for every fighter still visible, no HP bar and no crossed swords.
//
// A fighter who is GONE counts as clear — a closed browser takes its avatar out
// of the room with it, and there is nothing left to draw a bar over.
const waitCleared = (p, names, timeout = 30000) => p.waitForFunction((ns) => {
  const remote = window.game?.controller?.remote;
  const units = remote && remote.units;
  const spec = window.__debug.duelWatch();
  if (spec.watching) return false;
  return ns.every((n) => {
    const u = units && units.get(n.toLowerCase());
    const t = remote && remote.tags && remote.tags.get(n.toLowerCase());
    const barGone = !u || !u.stats;
    const tagGone = !t || !t.classList.contains('name-tag--duel');
    return barGone && tagGone;
  });
}, names, { timeout }).then(() => true).catch(() => false);

// The duel screen folded and this client is back in explore: endDuel's own
// visible effect, independent of the wording of any message.
//
// Deliberately NOT `#roster .roster-row === 0`: endDuel hides the panel but
// leaves the last fight's roster rows in the hidden DOM. Asserting on them
// made this fail against a working product - and worse, the same mistake in
// stageDuel's boot check (rows left over from the PREVIOUS duel satisfy it
// instantly) is what made a duel that never started look booted.
const waitDuelOver = (p, timeout = 30000) => p.waitForFunction(() => {
  const panel = document.querySelector('#panel');
  const folded = !panel || panel.classList.contains('hidden');
  return folded
    && !window.__debug.duelHost()
    && !window.__debug.duelGuest();
}, null, { timeout }).then(() => true).catch(() => false);

const waitNotice = (p, source, timeout = 30000) => p.waitForFunction(
  (src) => (window.__notices || []).find((t) => new RegExp(src, 'i').test(t)) || null,
  source, { timeout },
).then((h) => h.jsonValue()).catch(() => null);

// Stage a fresh duel between two live clients through the real UI: tap, Duel,
// accept, both boot. Returns false if any leg of it did not land.
async function stageDuel(host, guest) {
  const at = await host.page.evaluate((n) => {
    const u = window.game?.controller?.remote?.units?.get(n.toLowerCase());
    return u ? { x: u.x, y: u.y } : null;
  }, guest.name);
  if (!at) return { ok: false, why: `${host.name} cannot see ${guest.name} in the room` };
  await host.page.evaluate((t) => window.game.controller.onTap(t), at);
  const btn = await host.page.waitForSelector('.infostand--human [data-act="duel"]', { timeout: 15000 })
    .then(() => true).catch(() => false);
  if (!btn) return { ok: false, why: 'no Duel button on the infostand' };
  await host.page.click('.infostand--human [data-act="duel"]');
  const prompt = await guest.page.waitForSelector('.party-prompt [data-act="yes"]', { timeout: 25000 })
    .then(() => true).catch(() => false);
  if (!prompt) return { ok: false, why: `${guest.name} never got the challenge prompt` };
  await guest.page.click('.party-prompt [data-act="yes"]');
  // A live duel OBJECT on each client, never roster rows: rows from the
  // previous duel are still in the hidden DOM, so a row count is true again
  // the instant the last duel ended and would "boot" a duel that never began.
  const booted = await Promise.all([host, guest].map((p) => p.page.waitForFunction(
    () => !!(window.__debug.duelHost() || window.__debug.duelGuest()),
    null, { timeout: 40000 },
  ).then(() => true).catch(() => false)));
  if (!booted.every(Boolean)) return { ok: false, why: `duel did not start (host:${booted[0]} guest:${booted[1]})` };
  // ...and then the battle itself, which is what a fight needs.
  const fought = await Promise.all([host, guest].map((p) => p.page.waitForFunction(
    () => {
      const c = window.game.controller;
      return !!(c && (c.battle || c.shadow));
    }, null, { timeout: 40000 },
  ).then(() => true).catch(() => false)));
  if (!fought.every(Boolean)) return { ok: false, why: `battle did not boot (host:${fought[0]} guest:${fought[1]})` };
  return { ok: true };
}

// Walk a client into the square and onto the first of `wanted` it can reach.
// Shared by the opening setup and by the RE-OPENED browser the third ending
// needs (a context closed to simulate a disconnect cannot be reused).
async function enterSquare(p, wanted) {
  await p.page.evaluate((id) => window.__debug.gotoRoom(id), ROOM_ID);
  await p.page.waitForTimeout(2500); // presence re-joins the room's channel
  return p.page.evaluate(async (opts) => {
    const pf = await import('/js/pathfinder.js');
    const ctl = window.game.controller;
    const u = ctl.unit;
    const room = window.game.room;
    const target = opts.wanted.find(
      (t) => !room.isBlocked(t.x, t.y)
        && ((u.x === t.x && u.y === t.y) || !!pf.findPath(room, u.x, u.y, t.x, t.y)),
    );
    if (!target) return { x: u.x, y: u.y, target: null };
    ctl.onTap(target);
    for (let i = 0; i < 120 && (u.x !== target.x || u.y !== target.y); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return { x: u.x, y: u.y, target, room: room.id };
  }, { wanted });
}

const server = await startServer(PORT);
let a = null; let b = null; let c = null; let d = null;
// B's browser is closed ON PURPOSE mid-suite (the disconnect ending), so every
// later use of it has to know that rather than discover it as an exception.
let bClosed = false;
const bystander = {};
const genuine = {};

try {
  // A: a RANGER (range 3, min 2) carrying Net, an unlocked Fishing tree skill.
  // B: a plain melee FIGHTER (range 1). Different classes, so the run exercises
  // reach, walking and a real skill rather than two identical melee swings.
  a = await openPlayer(PORT, e2eName('DuelA'), {
    classId: 'ranger', skillIds: ['net'], fishingLevel: 10,
  });
  b = await openPlayer(PORT, e2eName('DuelB'), { classId: 'fighter' });
  c = await openPlayer(PORT, e2eName('DuelC'));
  d = await openPlayer(PORT, e2eName('DuelD'));
  for (const p of [a, b, c, d]) check(`${p.name} profile row seeded`, p.seed.ok);
  if (![a, b, c, d].every((p) => p.seed.ok)) {
    // AGENTS.md: explicit quota exhaustion looks like this. Say so rather than
    // letting it read as a duel bug.
    throw new Error(`profile seed failed: ${[a, b, c, d].map((p) => p.seed.reason).filter(Boolean).join(' | ')}`);
  }

  // ---- D enters the square FIRST, and is then left entirely alone -----------
  // The duellists arrive into a room D is already standing in, which is the
  // ordering a real villager experiences. D takes part in no setup below: no
  // duel-cancel, no tap, no challenge. It only stands there and watches.
  check('the genuine bystander walked into the square first',
    await d.page.evaluate((id) => window.__debug.gotoRoom(id), ROOM_ID) === true);
  await d.page.waitForTimeout(2500); // its room channel subscribes before anyone else's
  const dStood = await d.page.evaluate(async (wanted) => {
    const pf = await import('/js/pathfinder.js');
    const ctl = window.game.controller;
    const u = ctl.unit;
    const room = window.game.room;
    const t = wanted.find((q) => !room.isBlocked(q.x, q.y)
      && ((u.x === q.x && u.y === q.y) || !!pf.findPath(room, u.x, u.y, q.x, q.y)));
    if (!t) return { x: u.x, y: u.y };
    ctl.onTap(t);
    for (let i = 0; i < 120 && (u.x !== t.x || u.y !== t.y); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return { x: u.x, y: u.y };
  }, TILES.D);
  console.log(`  ${d.name} (genuine bystander) standing at ${JSON.stringify(dStood)} BEFORE the duellists arrive`);

  // Reused accounts carry state: a duel left over from a previous run makes the
  // next challenge a legitimate 'already duelling' rejection.
  for (const p of [a, b, c]) {
    await p.page.evaluate(async () => {
      const { invokeFn } = await import('/js/backend.js');
      await invokeFn('duel-cancel', {});
    });
  }
  await a.page.waitForTimeout(1200);
  for (const p of [a, b, c, d]) await p.page.evaluate(() => {
    window.__rx.length = 0; window.__raw.length = 0; window.__app.length = 0;
    window.__watch.length = 0; window.__fx.length = 0;
  });

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
  check('the two duellists are standing APART, with a gap to close or shoot across',
    away(stood[a.name], stood[b.name]) > 1);
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

  // ---- WHO ELSE IS IN THIS ROOM --------------------------------------------
  // The point of this run is that a real player is watching from their own
  // browser on the deployed site. They are on the same Supabase project and the
  // same `room:square` channel as these localhost contexts, so if they are
  // really here they show up in this roster — and if they do not, the run
  // proves nothing about what they can see.
  const roster = await a.page.evaluate(() => {
    const ctl = window.game.controller;
    const remote = ctl && ctl.remote;
    const mine = ctl && ctl.unit;
    const out = [];
    if (mine) out.push({ name: window.__debug.net.name, x: mine.x, y: mine.y, self: true });
    for (const [key, u] of (remote && remote.units) || []) {
      out.push({ name: u.name || key, x: u.x, y: u.y, self: false });
    }
    return { room: window.game.room.id, topic: window.__debug.net.roomChannel ? window.__debug.net.roomChannel.topic : null, members: out };
  });
  console.log(`
  --- ROOM ROSTER as ${a.name} sees it (${roster.topic}) ---`);
  for (const m of roster.members) {
    console.log(`    ${m.self ? '*' : ' '} ${String(m.name).padEnd(14)} (${m.x},${m.y})${m.self ? '  [this test context]' : ''}`);
  }
  const testNames = [a, b, c, d].map((p) => p.name.toLowerCase());
  const outsiders = roster.members.filter((m) => !testNames.includes(String(m.name).toLowerCase()));
  const watcher = WATCHER
    ? roster.members.find((m) => String(m.name).toLowerCase() === WATCHER.toLowerCase())
    : null;
  console.log(`  outsiders (not this test): ${outsiders.length ? outsiders.map((m) => `${m.name}(${m.x},${m.y})`).join(', ') : 'NONE'}`);

  if (!WATCHER) {
    console.log(`  ℹ  HD_DUEL_WATCHER is empty — no human observer required.`);
    console.log(`     Browser D still measures a client the test never wires up.
`);
  } else if (!watcher) {
    console.error(`
  ############################################################`);
    console.error(`  #  ❌  "${WATCHER}" IS NOT IN THIS ROOM.`);
    console.error(`  #`);
    console.error(`  #  The roster above is what ${a.name} can see on ${roster.topic}.`);
    console.error(`  #  Every name in it belongs to this test. Nobody else is here,`);
    console.error(`  #  so running the duel would prove nothing about what you see.`);
    console.error(`  #`);
    console.error(`  #  Check: are you in The Old Town Square (not the tavern), on`);
    console.error(`  #  habbodungeons.com, with multiplayer connected?`);
    console.error(`  #`);
    console.error(`  #  Not you? Export your own name instead:`);
    console.error(`  #    HD_DUEL_WATCHER=<habbo name> node tests/e2e/duelLive.e2e.mjs`);
    console.error(`  #  ...or HD_DUEL_WATCHER= (empty) to run with nobody watching.`);
    console.error(`  ############################################################
`);
    throw new Error(`"${WATCHER}" not on the room channel — stopping, nobody is watching`);
  } else {
    console.log(`  ✅ "${WATCHER}" IS HERE, standing at (${watcher.x},${watcher.y}) — running the duel.
`);
  }

  // ------------------------------------------------------------- challenge
  await a.page.evaluate((t) => window.game.controller.onTap(t), tile);
  await a.page.waitForSelector('.infostand--human [data-act="duel"]', { timeout: 10000 });
  const duelLive = await a.page.isEnabled('.infostand--human [data-act="duel"]');
  check('A\'s Duel button is live for a room-mate', duelLive);
  beat(`CHALLENGE SENT — ${a.name} clicks Duel on ${b.name}`);
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
  beat(`ACCEPTED — ${b.name} takes the challenge`);
  await b.page.click('.party-prompt [data-act="yes"]');
  const winA = await a.page.waitForSelector('.duel-window', { timeout: 20000 }).then(() => true).catch(() => false);
  const winB = await b.page.waitForSelector('.duel-window', { timeout: 20000 }).then(() => true).catch(() => false);
  check('A renders the duel window', winA);
  check('B renders the duel window', winB);
  beat('COUNTDOWN STARTED — 3-2-1-GO on both screens');
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

  // The watchdog now runs during the countdown as well as the fight, so an
  // ORDINARY countdown must stay silent. `lastHeardAt` is 0 until the first
  // relay frame, so treating relay silence as evidence before the battle
  // exists would fire a claim on every duel ever started and flash the
  // server's refusal - "<opponent> is still here" - over the player's own
  // 3-2-1. That is why the watchdog only counts relay silence once a battle is
  // running, and this is the assertion that keeps it that way.
  const idleClaims = await Promise.all([a, b].map((p) => p.page.evaluate(
    () => ({
      claims: window.__sends.filter((s) => s.t === 'duel-claim').length,
      stillHere: window.__notices.filter((t) => /is still here/i.test(t)),
    }),
  )));
  console.log(`  claims during a NORMAL countdown ->  ${JSON.stringify(idleClaims)}`);
  check('a normal countdown sends no abandonment claim at all',
    idleClaims.every((x) => x.claims === 0));
  check('...so no “still here” refusal is ever flashed at a duellist',
    idleClaims.every((x) => x.stillHere.length === 0));

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
  // ---- what just shipped: the real character, and a real gap ---------------
  const uA = rA.units.find((u) => u.name === a.name);
  const uB = rA.units.find((u) => u.name === b.name);
  console.log(`  A unit        ->  ${JSON.stringify(uA)}`);
  console.log(`  B unit        ->  ${JSON.stringify(uB)}`);
  check('A fights as a RANGER, not a default fighter', uA.classId === 'ranger');
  check('B fights as a fighter', uB.classId === 'fighter');
  check('the two duellists are DIFFERENT classes', uA.classId !== uB.classId);
  check('A carries its unlocked tree skill into the duel',
    (uA.skills || []).includes('net'));
  check('...and the guest’s client agrees it has it',
    ((rB.units.find((u) => u.name === a.name) || {}).skills || []).includes('net'));
  check('a ranger keeps its ranged reach (3) in a duel', uA.range === 3);
  check('...and the fighter keeps melee reach (1)', uB.range === 1);
  check('the ranger has less HP than the fighter (real class stats)',
    uA.maxHp < uB.maxHp);
  // Placement no longer drags them together.
  const gap0 = Math.max(Math.abs(uA.x - uB.x), Math.abs(uA.y - uB.y));
  console.log(`  opening gap   ->  ${gap0} tiles`);
  check('the duel opens with the fighters APART, as they were standing', gap0 > 1);
  check('...so the melee fighter cannot reach yet', gap0 > uB.range);

  check('A (host) opens on the player phase', rA.phase === 'player');
  check('B (guest) sees the same phase', rB.phase === 'player');
  check('B renders its own duellist as the player side',
    !!rB.rows.find((r) => r.name === b.name && r.side === 'player'));

  // ---------------------------------------------------- the fight itself
  // The two start APART, so the opening is a real tactical exchange rather than
  // two adjacent fighters trading swings:
  //
  //   turn 1  A (ranger) casts NET across the gap — damage + ROOT
  //   turn 1  B (fighter) is rooted: cannot move, cannot reach, loses the turn
  //   turn 2  A looses a plain bow shot from range
  //   turn 2  B (root expired) closes the distance and swings
  //   turn 3  A shoots again — the beat the bystander screenshots are taken on
  beat(`BATTLE BOOTED — fighting in place in ${ROOM_NAME}`);

  // One line per thing that actually HAPPENED, read out of the driver's own
  // report so the tiles and numbers are what the engine did.
  const beatTurn = (who, foeName, t, label) => {
    if (!t || t.err) return beat(`${label} — ${who}: ${(t && t.err) || 'no report'}`);
    if (t.moved) beat(`MOVE — ${who} walks (${t.from.x},${t.from.y}) → (${t.at.x},${t.at.y})`);
    if (t.skill) {
      const s = t.skill;
      beat(
        `SKILL — ${who} casts ${s.name} on ${foeName}: ` +
        `(${s.castFrom.x},${s.castFrom.y}) → (${s.castAt.x},${s.castAt.y}) at range ${s.reach}, ` +
        `${s.dmg} damage (${foeName} ${s.foeHpAfter} left)` +
        `${s.rootedAfter > s.rootedBefore ? `, ROOTED ${s.rootedAfter}` : ''}`,
      );
    }
    if (t.attacked) {
      beat(`${label} — ${who} hits ${foeName} for ${t.atkDmg} (${t.hpAfter} left) from range ${t.range}`);
    } else if (!t.skill) {
      beat(
        `NO ACTION — ${who} could not reach ${foeName} (range ${t.range})` +
        `${t.rootedThisTurn ? ' — ROOTED, move set is 1 tile' : ''}`,
      );
    }
  };

  // What a client can see of the fight without having resolved any of it.
  const seenBy = (p) => p.evaluate(() => {
    const c = window.game.controller;
    const b = c.shadow || c.battle;
    const el = document.querySelector('#log');
    return {
      log: el ? el.textContent : '',
      units: (b ? b.units : []).map((u) => ({
        name: u.name, hp: u.stats ? u.stats.hp : null,
        rooted: u.rooted || 0, rootedThisTurn: !!u.rootedThisTurn,
      })),
    };
  });

  // ---- turn 1: the ranger casts a REAL unlocked tree skill ----------------
  const t1a = await takeTurn(a.page, { useSkill: true });
  beatTurn(a.name, b.name, t1a, 'ATTACK 1');
  console.log(`  A turn 1      ->  ${JSON.stringify(t1a)}`);

  check('the ranger found its unlocked skill in range', t1a.skillIdx >= 0);
  check('the ranger CAST its unlocked tree skill', !!t1a.skill && t1a.skill.id === 'net');
  check('...from range, without closing to melee', !!t1a.skill && t1a.skill.reach >= 2);
  check('the skill did damage', !!t1a.skill && t1a.skill.dmg > 0);
  check('...and rooted the target',
    !!t1a.skill && (t1a.skill.rootedAfter > t1a.skill.rootedBefore || t1a.skill.rootedTurnAfter));

  // SERVER-SIDE RESOLUTION. The host's Battle is the authority in a duel; the
  // guest never runs resolveSkill. So the proof that the skill resolved on the
  // authority (rather than only painting on the caster's screen) is that the
  // GUEST's own client — a separate browser — shows the same HP, the same root,
  // and the log line the authority's logMsg produced and relayed.
  const gSaw = await seenBy(b.page);
  const hSaw = await seenBy(a.page);
  console.log(`  guest log     ->  ${JSON.stringify(gSaw.log.slice(-160))}`);
  console.log(`  guest units   ->  ${JSON.stringify(gSaw.units)}`);
  console.log(`  host  units   ->  ${JSON.stringify(hSaw.units)}`);
  check('the skill resolved SERVER-SIDE: the guest\u2019s log carries the authority\u2019s line',
    /Net/.test(gSaw.log));
  check('...and that log no longer speaks dungeon at a person',
    !/Defeat all enemies/.test(gSaw.log) && /Duel vs /.test(gSaw.log));
  check('...naming caster and target', new RegExp(`${a.name}.*Net.*${b.name}`).test(gSaw.log));
  check('...and the guest shows the SAME HP the authority applied',
    JSON.stringify(gSaw.units.map((u) => [u.name, u.hp])) ===
    JSON.stringify(hSaw.units.map((u) => [u.name, u.hp])));
  const gRoot = gSaw.units.find((u) => u.name === b.name) || {};
  check('...and the guest knows its duellist is ROOTED',
    gRoot.rooted > 0 || gRoot.rootedThisTurn === true);
  check('both clients agree on the root, counter and flag',
    JSON.stringify(gSaw.units.map((u) => [u.name, u.rooted, u.rootedThisTurn])) ===
    JSON.stringify(hSaw.units.map((u) => [u.name, u.rooted, u.rootedThisTurn])));

  if (!t1a.attacked && !t1a.skill) await endTurn(a.page);
  check('A\'s phase handed over to B', await waitPhase(b.page, 'enemy'));

  // ---- turn 1: the rooted fighter loses its move --------------------------
  const t1b = await takeTurn(b.page);
  beatTurn(b.name, a.name, t1b, 'ATTACK 2');
  console.log(`  B turn 1      ->  ${JSON.stringify(t1b)}`);
  check('the rooted fighter could not move', t1b.moveTiles <= 1);
  check('...so it could not reach across the gap', t1b.attacked === false);
  check('...and its own client knows why', t1b.rootedThisTurn === true);
  if (!t1b.attacked && !t1b.skill) await endTurn(b.page);
  check('the turn came back to A', await waitPhase(a.page, 'player'));

  // ---- turn 2: a plain bow shot, then the freed fighter closes ------------
  const t2a = await takeTurn(a.page);
  beatTurn(a.name, b.name, t2a, 'ATTACK 1');
  console.log(`  A turn 2      ->  ${JSON.stringify(t2a)}`);
  check('the ranger also lands a plain shot', !!t2a.attacked && t2a.atkDmg > 0);
  check('...still from range, without closing', t2a.range >= 2);
  if (!t2a.attacked && !t2a.skill) await endTurn(a.page);
  check('B gets its phase back', await waitPhase(b.page, 'enemy'));

  const t2b = await takeTurn(b.page);
  beatTurn(b.name, a.name, t2b, 'ATTACK 2');
  console.log(`  B turn 2      ->  ${JSON.stringify(t2b)}`);
  check('the root expired, so the fighter could move again', t2b.moveTiles > 1);
  check('B (guest) landed an attack that the host resolved', !!t2b.attacked && t2b.atkDmg > 0);
  check('the melee fighter struck only once adjacent', t2b.range <= 1);
  check('...having closed the gap to do it', t2b.startGap > 1 ? t2b.moved !== null : true);

  let afterB1 = await rendered(a.page);
  let afterB2 = await rendered(b.page);
  check('both screens show the same HP after B\'s blow',
    JSON.stringify(afterB1.rows.map((r) => [r.name, r.hp])) === JSON.stringify(afterB2.rows.map((r) => [r.name, r.hp])));
  console.log(`  after B blow  ->  A:${JSON.stringify(afterB1.rows.map((r) => [r.name, r.hp]))}  B:${JSON.stringify(afterB2.rows.map((r) => [r.name, r.hp]))}`);

  if (!t2b.attacked && !t2b.skill) await endTurn(b.page);
  check('the turn came back to A again', await waitPhase(a.page, 'player'));

  // Screenshot C *while the blow is landing*. The damage float lives 800ms on a
  // canvas, so the capture has to race the attack rather than follow it: the
  // fighters' own turn and the bystander's snapshot run together.
  for (const p of [c, d]) await p.page.evaluate(() => { window.__fx.length = 0; });
  const [t3a] = await Promise.all([
    takeTurn(a.page),
    (async () => {
      await c.page.waitForTimeout(320);
      await shot(c.page, 'hit-C.png');
    })(),
    (async () => {
      await d.page.waitForTimeout(320);
      await shot(d.page, 'hit-D.png');
    })(),
  ]);
  beatTurn(a.name, b.name, t3a, 'ATTACK 3');
  console.log(`  A turn 3      ->  ${JSON.stringify(t3a)}`);
  check('A (host) landed an attack', !!t3a.attacked && t3a.atkDmg > 0);
  // THE RANGER'S WHOLE REASON TO EXIST: reach.
  console.log(`  A turn 1 reach ->  startGap ${t1a.startGap}, cast at ${t1a.skill && t1a.skill.reach}, moved: ${JSON.stringify(t1a.moved)}`);
  check('the ranger acted from RANGE, without closing to melee', t1a.skill.reach >= 2);
  check('...and never walked into contact', t1a.range > 1);

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
  // Compared against each fighter's OWN maxHp: the two are different classes
  // now (ranger 26, fighter 34), so a hardcoded number would silently pass for
  // the ranger whether or not it had been touched.
  check('both duellists actually took a wound, and both are still standing',
    finA.units.every((u) => u.hp > 0 && u.hp < u.maxHp));

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
    const spec = window.__debug.duelWatch();
    return {
      raw: window.__raw.length,
      app: window.__app.length,
      watch: window.__watch.length,
      watchKinds: [...new Set(window.__watch.map((r) => r.k))],
      rawKinds: [...new Set(window.__raw.map((r) => r.k))],
      rawTo: [...new Set(window.__raw.map((r) => r.to))],
      roomName: window.game.room && window.game.room.name,
      duelWindow: !!document.querySelector('.duel-window'),
      rosterRows: document.querySelectorAll('#roster .roster-row').length,
      panelVisible: !!document.querySelector('#panel') && !document.querySelector('#panel').classList.contains('hidden'),
      infostand: !!document.querySelector('.infostand--human'),
      // What the SPECTATOR renders of the fight.
      watching: spec.watching,
      fighters: spec.fighters.slice(),
      readout: spec.readout(),
      floats: window.__fx.filter((f) => f.type === 'float').map((f) => f.text),
      bursts: window.__fx.filter((f) => f.type === 'burst').length,
      // HP bars: game.drawHpBar draws for any unit carrying stats, and colours
      // by health when duellist is set. These fields ARE the render source.
      bars: names.map((n) => {
        const u = units && units.get(n.toLowerCase());
        return { name: n, hp: u && u.stats ? u.stats.hp : null, maxHp: u && u.stats ? u.stats.maxHp : null, duellist: !!(u && u.duellist) };
      }),
      // the "these two are fighting" cue on the name tags
      tags: names.map((n) => {
        const t = remote && remote.tags && remote.tags.get(n.toLowerCase());
        return { name: n, text: t ? t.textContent : null, marked: !!(t && t.classList.contains('name-tag--duel')) };
      }),
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

  console.log(`  spectator readout:                     ${JSON.stringify(by.readout)}`);
  console.log(`  damage numbers C rendered:             ${JSON.stringify(by.floats)}  (bursts: ${by.bursts})`);
  console.log(`  HP bars C draws:                       ${JSON.stringify(by.bars)}`);
  console.log(`  name tags C draws:                     ${JSON.stringify(by.tags)}`);

  check('C physically RECEIVES the duel stream (it rides the room channel)', by.raw > 0);
  // THE SPLIT. `duel-relay` means "addressed to me" and is the command path, so
  // a spectator must still get nothing there. `duel-watch` is the read-only
  // render feed, and is where the fight now arrives.
  check('C is told NOTHING on the command event (duel-relay)', by.app === 0);
  check('C IS told about the fight on the read-only event (duel-watch)', by.watch > 0);
  check('...and that feed carries the blows, not just the setup',
    by.watchKinds.includes('fx') && by.watchKinds.includes('start'));

  // ---- what a bystander actually SEES ---------------------------------------
  check('C is watching the duel', by.watching === true);
  check('C knows both fighters', by.fighters.length === 2 &&
    by.fighters.includes(a.name) && by.fighters.includes(b.name));
  // The headline: a damage number popped on the bystander's screen when a hit
  // landed. Captured as it was queued, because it only lives 800ms on a canvas.
  check('a damage number appears on C\u2019s screen when a hit lands', by.floats.length > 0);
  check('...and it is a real number, not an empty float',
    by.floats.every((t) => /^\d+!?$/.test(String(t || ''))));
  check('C also renders the impact ring for each blow', by.bursts > 0);
  // C's HP must be the duellists' HP. It is copied off the authoritative echo
  // (serializeFx tHp / the phase snapshot), never recomputed.
  const truth = {};
  for (const r of finA.rows) truth[r.name] = Number(r.hp);
  console.log(`  duellists\u2019 HP:                          ${JSON.stringify(truth)}`);
  check('C\u2019s HP readout matches the duellists\u2019 screens exactly',
    by.fighters.every((n) => by.readout[n] === truth[n]));
  check('C draws an HP bar over BOTH fighters',
    by.bars.every((x) => x.hp != null && x.maxHp > 0));
  check('...showing the same HP the fighters see',
    by.bars.every((x) => x.hp === truth[x.name]));
  check('those bars are health-coloured, not monster-red (both are people)',
    by.bars.every((x) => x.duellist === true));
  check('C can tell the two are duelling, not idling',
    by.tags.every((t) => t.marked && /\u2694/.test(t.text || '')));

  // ---- ...and stays a pure spectator ----------------------------------------
  check('C renders no duel UI', !by.duelWindow && by.rosterRows === 0);
  check('C has no battle panel', by.panelVisible === false);
  check('C has no roster', by.rosterRows === 0);
  check('C has no infostand open on a fighter', by.infostand === false);
  check('C is still standing in the square', by.roomName === ROOM_NAME);

  // ACTIVE probe: C tries to click a duellist mid-fight. Spectating is
  // read-only, so the tap must open nothing — no infostand means no Trade,
  // Duel or Invite button to press at someone who is busy.
  const meddle = await c.page.evaluate((names) => {
    const ctl = window.game.controller;
    const remote = ctl.remote;
    const u = remote.units.get(names[0].toLowerCase());
    if (!u) return { tapped: false };
    ctl.onTap({ x: u.x, y: u.y });
    return {
      tapped: true,
      infostand: !!document.querySelector('.infostand--human'),
      panel: !!document.querySelector('#panel') && !document.querySelector('#panel').classList.contains('hidden'),
      roster: document.querySelectorAll('#roster .roster-row').length,
    };
  }, [a.name, b.name]);
  console.log(`  C taps a fighter ->  ${JSON.stringify(meddle)}`);
  check('tapping a duellist opens no infostand for a spectator',
    meddle.tapped && meddle.infostand === false);
  check('...and still gives C no battle panel or roster',
    meddle.panel === false && meddle.roster === 0);
  // The command path stayed shut throughout: C sent nothing and was answered
  // nothing. (heard/rejects would show a refusal frame coming back.)
  check('C never received a reply on the command event',
    await c.page.evaluate(() => window.__app.length) === 0);
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

  // ================= THE GENUINE BYSTANDER (D) ==============================
  // D joined the square before the duellists, was never spoken to, and did
  // nothing but stand there. If the spectator layer only works for a client the
  // test itself wired up, this is where that shows.
  genuine.at = await d.page.evaluate((names) => {
    const remote = window.game?.controller?.remote;
    const units = remote && remote.units;
    const spec = window.__debug.duelWatch();
    const chain = window.__chain;
    chain.L1_roomTopic = window.__debug.net.roomChannel
      ? window.__debug.net.roomChannel.topic : null;
    return {
      chain,
      specAttached: spec.unsubs.length,
      watching: spec.watching,
      fighters: spec.fighters.slice(),
      readout: spec.readout(),
      floats: window.__fx.filter((f) => f.type === 'float').map((f) => f.text),
      bursts: window.__fx.filter((f) => f.type === 'burst').length,
      roomId: window.game.room && window.game.room.id,
      panelVisible: !!document.querySelector('#panel') && !document.querySelector('#panel').classList.contains('hidden'),
      rosterRows: document.querySelectorAll('#roster .roster-row').length,
      duelWindow: !!document.querySelector('.duel-window'),
      bars: names.map((n) => {
        const u = units && units.get(n.toLowerCase());
        return { name: n, hp: u && u.stats ? u.stats.hp : null, maxHp: u && u.stats ? u.stats.maxHp : null, duellist: !!(u && u.duellist) };
      }),
      tags: names.map((n) => {
        const t = remote && remote.tags && remote.tags.get(n.toLowerCase());
        return { name: n, marked: !!(t && t.classList.contains('name-tag--duel')) };
      }),
      poses: names.map((n) => {
        const u = units && units.get(n.toLowerCase());
        return { name: n, everSwung: !!(u && u.attackUntil > 0) };
      }),
    };
  }, [a.name, b.name]);

  const g = genuine.at;
  console.log(`\n  --- GENUINE BYSTANDER (${d.name}) chain trace ---`);
  console.log(`  L1 room channel:        ${g.chain.L1_roomTopic}`);
  console.log(`  L3 _onRelayed fired:    ${g.chain.L3_onRelayed}   (watch branch: ${g.chain.L3_watchBranch})`);
  console.log(`  L4 duel-watch listeners:${g.chain.L4_listeners}`);
  console.log(`  L5 spectator frames:    ${g.chain.L5_specFrames}   kinds: ${JSON.stringify(g.chain.L5_specKinds)}`);
  console.log(`  L6 start accepted:      ${g.chain.L6_specStart}   ${g.chain.L6_startRejected ? `(rejected: ${g.chain.L6_startRejected})` : ''}`);
  console.log(`  L7 applyBars calls:     ${g.chain.L7_applyBars}`);
  console.log(`  renders  ->  floats:${JSON.stringify(g.floats)} bursts:${g.bursts}`);
  console.log(`  bars     ->  ${JSON.stringify(g.bars)}`);
  console.log(`  readout  ->  ${JSON.stringify(g.readout)}`);

  // Supabase prefixes the topic ('realtime:room:square'), so match the suffix.
  check('D is on the same room channel as the duel',
    String(g.chain.L1_roomTopic || '').endsWith(`room:${ROOM_ID}`));
  check('D\u2019s socket delivered duel frames into _onRelayed', g.chain.L3_onRelayed > 0);
  check('...which took the addressed-to-someone-else branch', g.chain.L3_watchBranch > 0);
  check('D has the spectator subscribed to duel-watch', g.chain.L4_listeners >= 1 && g.specAttached >= 1);
  check('D\u2019s spectator was handed those frames', g.chain.L5_specFrames > 0);
  check('...including the start and the blows',
    g.chain.L5_specKinds.includes('start') && g.chain.L5_specKinds.includes('fx'));
  check('D accepted the start frame and began watching', g.chain.L6_specStart > 0 && g.watching === true);
  check('D knows both fighters', g.fighters.length === 2 &&
    g.fighters.includes(a.name) && g.fighters.includes(b.name));

  // The two things a real player said were missing.
  check('D RENDERS a damage number when a hit lands', g.floats.length > 0);
  check('...a real number, not an empty float',
    g.floats.every((t) => /^\d+!?$/.test(String(t || ''))));
  check('D renders the impact ring too', g.bursts > 0);
  check('D draws an HP bar over BOTH fighters',
    g.bars.every((x) => x.hp != null && x.maxHp > 0));
  check('...with the same HP the duellists see',
    g.bars.every((x) => x.hp === truth[x.name]));
  check('D\u2019s HP readout matches the duellists\u2019 screens', 
    g.fighters.every((n) => g.readout[n] === truth[n]));
  check('D\u2019s bars are health-coloured (both fighters are people)',
    g.bars.every((x) => x.duellist === true));
  check('D saw the fighters swing', g.poses.every((x) => x.everSwung));
  check('D can tell they are duelling', g.tags.every((t) => t.marked));

  // ...and D is still a pure spectator.
  check('D has no battle panel, roster or duel window',
    g.panelVisible === false && g.rosterRows === 0 && g.duelWindow === false);
  check('D never left the square', g.roomId === ROOM_ID);

  // ======================= ENDING 1: A FORFEIT ==============================
  // The fight above is still live and both fighters are still standing, which
  // is the point: a forfeit is a decision taken MID-FIGHT, not a way of
  // acknowledging a knockout that already happened.
  //
  // Nothing here is simulated. B presses the real Forfeit button, the live
  // duel-forfeit function settles the real row, and the win arrives on each
  // player's own mailbox stamped from their own side.
  for (const p of [a, b, c, d]) {
    await p.page.evaluate(() => { window.__notices.length = 0; window.__watch.length = 0; });
  }
  const forfeitBtn = await b.page.evaluate(() => {
    const btn = [...document.querySelectorAll('#actions button')]
      .find((x) => x.textContent.trim() === 'Forfeit');
    if (!btn) return false;
    btn.click();
    return true;
  });
  check(`${b.name} has a Forfeit button mid-fight`, forfeitBtn === true);
  beat(`FORFEIT — ${b.name} yields to ${a.name}`);
  if (!forfeitBtn) throw new Error('no Forfeit button on the guest — cannot test the ending');

  // ---- the survivor is told, in words, that they won ----------------------
  const winNotice = await waitNotice(a.page, 'win the duel', 30000);
  const loseNotice = await waitNotice(b.page, 'lost the duel|forfeit', 30000);
  console.log(`  ${a.name} notice   ->  ${JSON.stringify(winNotice)}`);
  console.log(`  ${b.name} notice   ->  ${JSON.stringify(loseNotice)}`);
  check('the surviving player is told they WON', !!winNotice && /win the duel/i.test(winNotice));
  check('...and the message names the forfeit as the reason',
    !!winNotice && /forfeit/i.test(winNotice));
  check('the player who yielded is told they LOST',
    !!loseNotice && /lost the duel/i.test(loseNotice));
  check('each side is told from its OWN point of view — no shared payload',
    !!winNotice && !!loseNotice && winNotice !== loseNotice);
  check(`${a.name}'s duel screen folded back to explore`, await waitDuelOver(a.page));
  check(`${b.name}'s duel screen folded back to explore`, await waitDuelOver(b.page));
  beat('FORFEIT SETTLED — both screens back in the square');

  // ---- the row is terminal, so neither is left looking "already duelling" --
  const rowsAfterForfeit = await duelRows(a.page);
  const rowsAfterForfeitB = await duelRows(b.page);
  console.log(`  duels row (A) ->  ${JSON.stringify(rowsAfterForfeit).slice(0, 400)}`);
  check('the challenger can read the duel row (participant RLS)', !rowsAfterForfeit.err);
  check('the forfeiter can read it too', !rowsAfterForfeitB.err);
  check('the forfeited duel reached a TERMINAL status',
    !rowsAfterForfeit.err && liveRows(rowsAfterForfeit).length === 0);
  check('...specifically done, not cancelled — this fight was decided',
    !rowsAfterForfeit.err && (rowsAfterForfeit.rows[0] || {}).status === 'done');
  check('and the loser’s own view of the row agrees',
    !rowsAfterForfeitB.err && liveRows(rowsAfterForfeitB).length === 0);

  // ---- the bystanders put the room back --------------------------------
  // The failure this guards is specific: a fight that ends without telling the
  // room leaves HP bars and crossed swords hanging over two idle avatars until
  // DuelSpectator's 90s stale sweep. Both are asserted CLEARED, and the `end`
  // frame is counted, so a pass cannot come from the sweep instead.
  const clearedC = await waitCleared(c.page, [a.name, b.name], 25000);
  const clearedD = await waitCleared(d.page, [a.name, b.name], 25000);
  const afterC = await watched(c.page, [a.name, b.name]);
  const afterD = await watched(d.page, [a.name, b.name]);
  console.log(`  C after forfeit ->  ${JSON.stringify(afterC)}`);
  console.log(`  D after forfeit ->  ${JSON.stringify(afterD)}`);
  await Promise.all([shot(c.page, 'forfeit-C.png'), shot(d.page, 'forfeit-D.png')]);

  for (const [who, st, ok] of [[c.name, afterC, clearedC], [d.name, afterD, clearedD]]) {
    check(`${who} stopped watching when the duel was forfeited`, ok && st.watching === false);
    check(`${who} took the HP bars back off both avatars`,
      st.bars.every((x) => !x.present || x.hp === null));
    check(`${who} took the crossed swords off both name tags`,
      st.tags.every((t) => !t.marked && !/\u2694/.test(t.text || '')));
    check(`${who} was TOLD the duel ended (not left to the 90s stale sweep)`,
      st.endFrames > 0);
  }

  // ======================= ENDING 2: A DISCONNECT ===========================
  // A second real duel, then one browser is closed OUTRIGHT — no forfeit, no
  // goodbye, the same thing a player does by shutting the lid. The survivor
  // must not be stranded in a fight nobody can finish.
  //
  // Booting this duel at all is the operational proof of the paragraph above:
  // duel-challenge refuses a player whose last row is unsettled, so a second
  // duel between the SAME two players can only start if the forfeit really did
  // free them both.
  beat('SECOND DUEL — staging a fresh fight between the same two players');
  for (const p of [a, b, c, d]) {
    await p.page.evaluate(() => { window.__notices.length = 0; window.__watch.length = 0; });
  }
  const staged = await stageDuel(a, b);
  if (!staged.ok) console.error(`     └─ ${staged.why}`);
  check('the two players can duel AGAIN after the forfeit (the row freed them)',
    staged.ok === true);
  if (!staged.ok) throw new Error(`second duel would not start: ${staged.why}`);
  beat('SECOND DUEL BOOTED — both fighting in the square again');

  const liveDuring = await duelRows(a.page);
  check('...and the server has a LIVE row for it while it is being fought',
    !liveDuring.err && liveRows(liveDuring).length === 1);

  // ---- pull the plug ------------------------------------------------------
  await shot(b.page, 'predisconnect-B.png');
  const disconnectAt = Date.now();
  await b.context.close();
  bClosed = true;
  beat(`DISCONNECT — ${b.name}'s browser is closed outright, mid-duel`);

  // The claim is not instant BY DESIGN and the budget below is the sum of the
  // real constants, not a guess: the host's watchdog waits ~16s for the relay
  // to go quiet, then polls duel-claim every 3s, and the SERVER refuses every
  // one of those until the abandoned player's presence row goes stale — up to
  // one heartbeat (20s, js/supabaseNet.js) plus PRESENCE_TTL_MS (30s). Roughly
  // 70s worst case. Anything less would be a client asserting a disconnect,
  // which is exactly what claimFlow refuses to let it do.
  const claimNotice = await waitNotice(a.page, 'win the duel', 120000);
  const claimSecs = ((Date.now() - disconnectAt) / 1000).toFixed(1);
  console.log(`  ${a.name} notice   ->  ${JSON.stringify(claimNotice)}  (after ${claimSecs}s)`);
  beat(`CLAIM SETTLED — ${a.name} awarded the win ${claimSecs}s after the disconnect`);
  check('the abandoned player is told they WON', !!claimNotice && /win the duel/i.test(claimNotice));
  check('...and the message says the opponent disconnected',
    !!claimNotice && /disconnect|left the room/i.test(claimNotice));
  check(`${a.name}'s duel screen folded back to explore`, await waitDuelOver(a.page));
  await shot(a.page, 'disconnect-A.png');

  // ---- terminal row, so the survivor is not stuck "already duelling" ------
  const rowsAfterClaim = await duelRows(a.page);
  console.log(`  duels row (A) ->  ${JSON.stringify(rowsAfterClaim).slice(0, 400)}`);
  check('the abandoned duel reached a TERMINAL status',
    !rowsAfterClaim.err && liveRows(rowsAfterClaim).length === 0);
  check('...specifically done — an abandoned fight was still decided',
    !rowsAfterClaim.err && (rowsAfterClaim.rows[0] || {}).status === 'done');

  // ...and prove it operationally against the live backend: the survivor can
  // throw down a new gauntlet at once. A stuck row answers "already duelling".
  const freeProbe = await challengeProbe(a.page, c.name);
  console.log(`  A challenges ${c.name} ->  ${JSON.stringify(freeProbe)}`);
  check('the surviving player is free to duel again immediately',
    !!freeProbe && freeProbe.ok === true);
  check('...and is not refused as “already duelling”',
    !/already duelling/i.test((freeProbe && freeProbe.reason) || ''));
  await cancelDuel(a.page);
  await c.page.evaluate(() => {
    const no = document.querySelector('.party-prompt [data-act="no"]');
    if (no) no.click();
  }).catch(() => {});

  // ---- and the room stops looking like a fight ---------------------------
  const clearedC2 = await waitCleared(c.page, [a.name, b.name], 30000);
  const clearedD2 = await waitCleared(d.page, [a.name, b.name], 30000);
  const endC = await watched(c.page, [a.name, b.name]);
  const endD = await watched(d.page, [a.name, b.name]);
  const clearSecs = (Date.now() - disconnectAt) / 1000;
  console.log(`  C after disconnect ->  ${JSON.stringify(endC)}`);
  console.log(`  D after disconnect ->  ${JSON.stringify(endD)}`);
  await Promise.all([shot(c.page, 'disconnect-C.png'), shot(d.page, 'disconnect-D.png')]);

  for (const [who, st, ok] of [[c.name, endC, clearedC2], [d.name, endD, clearedD2]]) {
    check(`${who} stopped watching the abandoned duel`, ok && st.watching === false);
    check(`${who} left no HP bar hanging over an idle avatar`,
      st.bars.every((x) => !x.present || x.hp === null));
    check(`${who} left no crossed swords on an idle name tag`,
      st.tags.every((t) => !t.marked && !/\u2694/.test(t.text || '')));
    check(`${who} was TOLD the duel ended`, st.endFrames > 0);
  }
  // The 90s stale sweep (DuelSpectator.STALE_MS) would eventually clear the
  // room on its own, which would make the four checks above pass for entirely
  // the wrong reason. Beating it is the assertion that the ENDING did it.
  console.log(`  room cleared ${clearSecs.toFixed(1)}s after the disconnect (stale sweep is 90s)`);
  check('the room was cleared by the ending, not by the 90s stale sweep',
    clearSecs < 85);

  // ============ ENDING 3: A DISCONNECT DURING THE 3-2-1 COUNTDOWN ==========
  // The regression this file exists to hold down. `startDuelWatchdog` used to
  // bail on `!duelHost.battle`, and `battle` is only set when the guest's
  // hello lands - so a guest who closed their browser during the countdown was
  // never claimed against. Measured live before the fix: 124 seconds, ZERO
  // duel-claim calls sent, the row pinned at 'countdown', and BOTH players then
  // permanently refused with "you are already duelling" - unrecoverable, since
  // the client only sends duel-cancel while it still holds a duel object.
  //
  // This is the one ending a player cannot work around, so it is asserted the
  // hardest: the claim must actually be SENT, and both players must be free
  // afterwards.
  beat('THIRD DUEL — the guest will vanish during the countdown, not the fight');
  b = await openPlayer(PORT, e2eName('DuelB'), { classId: 'fighter' });
  bClosed = false;
  check(`${b.name}'s browser is back`, !!b.seed.ok);
  const bBack = await enterSquare(b, TILES.B);
  console.log(`  ${b.name} back in the square at (${bBack.x},${bBack.y})`);
  check(`${b.name} rejoined the square`, bBack.room === ROOM_ID);
  for (const p of [a, c, d]) {
    // __sends TOO. Ending 2's successful claim is still in this array, and
    // "some claim succeeded" would match it - the assertion below would then
    // pass for a countdown claim that never happened, which is precisely the
    // stale-evidence mistake that hid this bug in the first place.
    await p.page.evaluate(() => {
      window.__notices.length = 0; window.__watch.length = 0; window.__sends.length = 0;
    });
  }

  // Challenge and accept, but do NOT wait for the battle: the window being
  // tested is the one before it exists.
  // A has just probed a challenge at C and cancelled it, and B's presence row
  // is seconds old. Either can make this challenge a legitimate refusal, so
  // the RESPONSE is read rather than blindly waiting for a prompt that a
  // refused challenge will never produce - a 25s timeout naming nothing is
  // how this ending failed once already.
  await cancelDuel(a.page);
  let sawB = false;
  let asked3 = null;
  for (let attempt = 1; attempt <= 4 && !(asked3 && asked3.ok); attempt++) {
    const at3 = await a.page.evaluate((n) => {
      const u = window.game?.controller?.remote?.units?.get(n.toLowerCase());
      return u ? { x: u.x, y: u.y } : null;
    }, b.name);
    if (!at3) {
      console.log(`     └─ attempt ${attempt}: ${a.name} cannot see ${b.name} yet — waiting`);
      await a.page.waitForTimeout(3000);
      continue;
    }
    sawB = true;
    await a.page.evaluate(() => { window.__sends.length = 0; });
    await a.page.evaluate((t) => window.game.controller.onTap(t), at3);
    await a.page.waitForSelector('.infostand--human [data-act="duel"]', { timeout: 15000 });
    await a.page.click('.infostand--human [data-act="duel"]');
    asked3 = await a.page.waitForFunction(
      () => (window.__sends.find((s) => s.t === 'duel-challenge') || {}).res || null,
      null, { timeout: 15000 },
    ).then((h) => h.jsonValue()).catch(() => null);
    if (asked3 && asked3.ok) break;
    console.log(`     └─ challenge attempt ${attempt} refused: ${JSON.stringify(asked3)} — retrying`);
    await a.page.waitForTimeout(4000);
  }
  console.log(`  third challenge ->  ${JSON.stringify(asked3)}`);
  // Retries are logged, not counted as failures: only the final outcome is a
  // claim about the product. `check` takes (name, cond) and has no soft mode,
  // so asserting inside the loop would fail the suite for an attempt that the
  // next one recovered.
  check(`${a.name} can see ${b.name} again`, sawB);
  check('the third challenge is accepted by the server', !!asked3 && asked3.ok === true);
  // 60s, not 25s: b's browser was CLOSED and re-opened moments ago, so this wait
  // covers a cold page boot plus a fresh realtime subscribe. Standalone that
  // lands in ~8s, but inside `bun run test:e2e` — nine suites deep, four
  // browsers live — it reproducibly overran 25s while the server had already
  // returned ok:true, failing the gate on test tightness rather than product.
  const prompt3 = await b.page.waitForSelector('.party-prompt [data-act="yes"]', { timeout: 60000 })
    .then(() => true).catch(() => false);
  check(`${b.name} received the third challenge prompt`, prompt3);
  if (!prompt3) throw new Error('no prompt on the re-opened guest — cannot test a countdown abandonment');
  beat(`ACCEPTED — ${b.name} takes the third challenge`);
  await b.page.click('.party-prompt [data-act="yes"]');

  // The countdown is live on the host and the battle has NOT booted. That
  // pairing is the precondition of the bug, so it is asserted rather than
  // assumed - without it this ending would silently become a duplicate of
  // ending 2.
  const inCountdown = await a.page.waitForFunction(() => {
    const h = window.__debug.duelHost();
    return !!h && !h.battle;
  }, null, { timeout: 30000 }).then(() => true).catch(() => false);
  check(`${a.name} is mid-countdown: a duel exists but no battle yet`, inCountdown);
  const preRow = await duelRows(a.page);
  console.log(`  row mid-countdown ->  ${JSON.stringify((preRow.rows || [])[0])}`);
  check('...and the server row says countdown',
    !preRow.err && ((preRow.rows || [])[0] || {}).status === 'countdown');

  await shot(a.page, 'countdown-disconnect-A.png');
  const cdAt = Date.now();
  await b.context.close();
  bClosed = true;
  beat(`DISCONNECT — ${b.name}'s browser closed DURING the 3-2-1`);

  const cdNotice = await waitNotice(a.page, 'win the duel', 120000);
  const cdSecs = ((Date.now() - cdAt) / 1000).toFixed(1);
  // The notice paints from the server's duel-ended broadcast, which can beat
  // the fetch promise that records the winning send. Wait for the send itself
  // to land in __sends, or the successful call is read a moment too early and
  // only the refusals are seen.
  await a.page.waitForFunction(
    () => window.__sends.some((s) => s.t === 'duel-claim' && s.res && s.res.ok && s.res.ended),
    null, { timeout: 15000 },
  ).catch(() => {});
  const claims = await a.page.evaluate(
    () => window.__sends.filter((s) => s.t === 'duel-claim'),
  );
  console.log(`  ${a.name} notice   ->  ${JSON.stringify(cdNotice)}  (after ${cdSecs}s)`);
  console.log(`  duel-claim calls ->  ${JSON.stringify(claims)}`);
  beat(`COUNTDOWN CLAIM SETTLED — ${a.name} freed ${cdSecs}s after the disconnect`);

  // THE REGRESSION ASSERTION. Before the fix this was 0 for as long as anyone
  // was willing to wait.
  check('the host actually SENDS duel-claim for a countdown abandonment',
    claims.length > 0);
  check('...and the server settled one of them',
    claims.some((s) => s.res && s.res.ok && s.res.ended));
  // The presence rule is untouched: while the opponent's presence row is still
  // fresh the server refuses, and the client keeps asking rather than
  // asserting a win of its own.
  const refusals = claims.filter((s) => s.res && s.res.ok === false);
  console.log(`  refusals before it settled: ${refusals.length} — ${JSON.stringify([...new Set(refusals.map((s) => s.res.reason))])}`);
  check('a live opponent is never claimed against (refusals are the normal path)',
    refusals.every((s) => /is still here/i.test(s.res.reason || '')));
  check('the abandoned player is told they WON', !!cdNotice && /win the duel/i.test(cdNotice));
  check('...naming the disconnect', !!cdNotice && /disconnect|left the room/i.test(cdNotice));
  check(`${a.name}'s duel screen folded back to explore`, await waitDuelOver(a.page));
  await shot(a.page, 'countdown-disconnect-settled-A.png');

  const cdRows = await duelRows(a.page);
  console.log(`  duels row (A) ->  ${JSON.stringify((cdRows.rows || [])[0])}`);
  check('the abandoned COUNTDOWN reached a terminal status',
    !cdRows.err && liveRows(cdRows).length === 0);
  check('...specifically done', !cdRows.err && (cdRows.rows[0] || {}).status === 'done');

  // The lockout is what actually hurt a player, so it is proven gone against
  // the live backend rather than inferred from the row.
  const freeAgain = await challengeProbe(a.page, c.name);
  console.log(`  A challenges ${c.name} ->  ${JSON.stringify(freeAgain)}`);
  check('the survivor is NOT locked out of duelling afterwards',
    !!freeAgain && freeAgain.ok === true);
  check('...and specifically not refused “you are already duelling”',
    !/already duelling/i.test((freeAgain && freeAgain.reason) || ''));
  await cancelDuel(a.page);
  await c.page.evaluate(() => {
    const no = document.querySelector('.party-prompt [data-act="no"]');
    if (no) no.click();
  }).catch(() => {});

  // A countdown never painted HP bars, so the bystanders should simply be
  // clean - and must not have been left watching a fight that never started.
  const cdC = await watched(c.page, [a.name, b.name]);
  const cdD = await watched(d.page, [a.name, b.name]);
  console.log(`  C after countdown-disconnect ->  ${JSON.stringify(cdC)}`);
  console.log(`  D after countdown-disconnect ->  ${JSON.stringify(cdD)}`);
  await Promise.all([
    shot(c.page, 'countdown-disconnect-C.png'),
    shot(d.page, 'countdown-disconnect-D.png'),
  ]);
  for (const [who, st] of [[c.name, cdC], [d.name, cdD]]) {
    check(`${who} is not left watching a duel that never started`, st.watching === false);
    check(`${who} has no HP bar over anyone`, st.bars.every((x) => !x.present || x.hp === null));
    check(`${who} has no crossed swords over anyone`,
      st.tags.every((t) => !t.marked && !/\u2694/.test(t.text || '')));
  }
} catch (e) {
  console.error(`\n  SUITE ABORTED: ${e.message}`);
  state.failed++;
  // B may have been closed on purpose already — screenshotting it would throw
  // inside the abort handler and hide the real failure.
  for (const p of [a, bClosed ? null : b, c, d]) if (p) await shot(p.page, `abort-${p.name}.png`);
} finally {
  const openPages = [a, bClosed ? null : b, c].filter(Boolean);
  for (const p of openPages) { // NOT d: it was never in a duel to cancel
    await p.page.evaluate(async () => {
      const { invokeFn } = await import('/js/backend.js');
      await invokeFn('duel-cancel', {});
    }).catch(() => {});
  }
  for (const p of [a, b, c, d]) {
    if (p && p.logs.length) {
      const notable = p.logs.filter((l) => /fail|error|denied|rate limit|anonymous sign-in/i.test(l));
      if (notable.length) console.log(`  [${p.name}] console: ${notable.slice(0, 6).join(' | ')}`);
    }
  }

  // --- blocked-tile mismatch report -------------------------------------
  //
  // duelBattle.js's buildReplica warns when a guest's own reading of the room
  // disagrees with the host's obstacle snapshot. The host wins so nobody ever
  // desyncs, which is exactly why it went unexplained for so long: it is
  // invisible unless something looks for it. The filter above does NOT match it
  // (no 'fail'/'error'/'denied'), so it is hunted explicitly and printed
  // VERBATIM — the warning names the differing tile keys and the room, and those
  // keys identify the piece of furniture, which is the whole diagnosis.
  //
  // Leading theory is staleness rather than logic: each client builds its rooms
  // from its own AdminApi.loadLayouts() at explore start (js/main.js), and that
  // fetch can fail to defaults, be served stale, or predate an admin edit the
  // other client already has. A run where the warning is ABSENT is evidence,
  // not proof, so the absence is stated as plainly as a hit would be.
  const mismatches = [];
  for (const p of [a, b, c, d]) {
    for (const l of p ? p.logs : []) if (l.includes('blocked-tile mismatch')) mismatches.push({ who: p.name, line: l });
  }
  console.log(`\n  ── blocked-tile mismatch ──`);
  if (!mismatches.length) {
    console.log(`  none: no client disagreed with the host's obstacle snapshot in this run.`);
  } else {
    console.log(`  ${mismatches.length} occurrence(s) — verbatim:`);
    for (const m of mismatches) console.log(`  [${m.who}] ${m.line}`);
  }
  // Each client's own view, so a hit can be attributed instead of guessed at:
  // a client that fell back to the DEFAULT layout has a different prop count.
  for (const p of [a, b, c, d]) {
    if (!p) continue;
    const view = await p.page
      .evaluate(() => {
        const g = window.game || (window.__hd && window.__hd.game);
        const r = g && g.room;
        if (!r) return null;
        return { room: r.id, props: (r.props || []).length, blocked: r.blockers ? r.blockers.size : -1 };
      })
      .catch(() => null);
    console.log(`  [${p.name}] ${view ? `room ${view.room}: ${view.props} props, ${view.blocked} blocked tiles` : 'room unreadable (page closed)'}`);
  }
  for (const p of [a, b, c, d]) if (p) await p.context.close().catch(() => {});
  server.kill();
}

console.log(`\n  screenshots -> ${SHOTS}`);
console.log(state.failed ? `\n${state.failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(state.failed ? 1 : 0);
