// Two real Supabase-backed clients in the Fogwood Forest: one hunts a critter
// to death and the OTHER one has to see the whole thing.
//
// What's under test (js/exploreController.js + js/supabaseNet.js +
// js/remotePlayers.js): wildlife has no server authority at all. Every client
// spawns its own Unit for every critter from the same room DATA and runs its
// own copy of the fight. Before the 'struck' broadcast, that meant combat was
// invisible to everyone else — client A's spiderling died on A's screen and
// went on grazing on B's, and the two woods silently diverged for the rest of
// the session. The wire now carries the whole outcome of a swing (attacker,
// facing, critter id, damage, crit, impact delay, respawn delay) so B replays
// the identical strike against its own copy of the same creature.
//
// The four things B must observe, all asserted below:
//   1. the attacker's avatar plays the attack pose, facing the way they swung
//      (RemotePlayers.onStruck sets dir + attackUntil → Avatar.action() 'atk')
//   2. the damage floater pops with the SAME number A rolled (no re-roll)
//   3. the critter Unit is removed from B's world too (it actually dies)
//   4. it comes back at the same moment on both clients — this is what the
//      dropped `Math.random() * 3000` respawn jitter used to make impossible:
//      the same creature reappeared on its home tile seconds apart on the two
//      screens even when everything else lined up.
//
// Screenshots (.gg/screenshots/critter-strike-sync/): both sides mid-swing
// (between the broadcast and the impact) and both sides just after the kill.
//
// Run: node tests/e2e/critterStrikeSync.e2e.mjs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium, startServer, makeChecker, portFor } from './lib.mjs';

const PORT = portFor(57); // per-worktree base (lib.mjs), was 8657
const ROOM_BUTTON = 2; // #exploreBar: 0 tavern, 1 square, 2 Fogwood Forest (mirkwood)
const ROOM_ID = 'mirkwood';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = join(ROOT, '.gg', 'screenshots', 'critter-strike-sync');
const { check, state } = makeChecker();

const exe = findChromium();
if (!exe) { console.error('SKIP: no local Chromium build found'); process.exit(0); }
mkdirSync(OUT, { recursive: true });
const stamp = Date.now();

async function openPlayer(browser, identity) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 750 } });
  await context.addInitScript((id) => {
    localStorage.setItem('habbo-dungeons-identity', JSON.stringify(id));
    localStorage.setItem('habbo-dungeons-char', JSON.stringify({ name: id.name, figure: id.figure }));
  }, identity);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`  [${identity.name}] pageerror:`, e.message));
  await page.goto(`http://localhost:${PORT}/?backend=supabase`, { waitUntil: 'domcontentloaded' });
  return { context, page, name: identity.name };
}

// Idle wander is per-client random by design (js/exploreController.wander) and
// is NOT part of what's synchronised — pin every critter on its home tile so
// the two screenshots frame the same scene and the beside-tile A walks to is
// stable. The strike path itself is untouched.
const pinCritters = (page) => page.evaluate(() => {
  for (const c of window.__debug.explore.critters) {
    c.step = null;
    c.path = [];
    c.x = c.critter.home.x;
    c.y = c.critter.home.y;
    c.z = window.game.room.heightAt(c.x, c.y);
    c.critter.nextWander = Infinity;
  }
});

// One rAF probe per client, armed BEFORE the swing, that timestamps every
// observable moment with wall-clock Date.now() — both pages run in the same
// browser on the same machine, so those are directly comparable, which
// per-page performance.now() origins are not.
const armProbe = (page, { critterId, specName, home, otherName }) => page.evaluate((cfg) => {
  const d = window.__debug;
  const key = cfg.otherName.toLowerCase();
  const probe = {
    struck: null, // the 'struck' payload off the wire (never on the attacker)
    pose: null, // the OTHER player's avatar mid-attack
    selfPose: null, // our own avatar mid-attack (the attacker's side)
    dmgFloat: null, // the damage number
    xpFloat: null, // the "+n xp" trickle — attacker only
    death: null, // critter gone from explore.critters + its queued rebirth
    respawn: null, // it's back
  };
  window.__probe = probe;
  d.net.on('struck', (m) => { if (!probe.struck) probe.struck = { ...m, at: Date.now() }; });

  const tick = () => {
    const now = performance.now();
    const u = d.remote.units.get(key);
    if (u && !probe.pose && u.attackUntil > now) {
      probe.pose = { dir: u.dir, action: u.action(), remainMs: Math.round(u.attackUntil - now), at: Date.now() };
    }
    const me = d.explore.unit;
    if (me && !probe.selfPose && me.attackUntil > now) {
      probe.selfPose = { dir: me.dir, action: me.action(), at: Date.now() };
    }
    for (const f of window.game.fx) {
      if (f.type !== 'float' || now < f.start) continue;
      const text = String(f.text);
      if (!probe.dmgFloat && /^\d+!?$/.test(text)) probe.dmgFloat = { text, color: f.color, at: Date.now() };
      if (!probe.xpFloat && /xp$/.test(text)) probe.xpFloat = { text, at: Date.now() };
    }
    const live = d.explore.critters.some((c) => c.critter.id === cfg.critterId);
    if (!probe.death && !live) {
      const r = d.explore.respawns.find(
        (q) => q.spec.name === cfg.specName && q.tile.x === cfg.home.x && q.tile.y === cfg.home.y
      );
      probe.death = { at: Date.now(), queuedInMs: r ? Math.round(r.at - now) : null };
    }
    if (probe.death && !probe.respawn && live) probe.respawn = { at: Date.now() };
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, { critterId, specName, home, otherName });

const readProbe = (page) => page.evaluate(() => window.__probe);

// The whole room is fitted on screen (game.recenter), so a raw viewport shot
// puts the fight in a ~60px patch behind the treeline. Clip to the tile the
// fight happens on — iso.js is already loaded as a module, so importing it in
// the page hands back the same tileToScreen the renderer used.
async function shotFight(page, path, home) {
  const clip = await page.evaluate(async (t) => {
    const { tileToScreen } = await import('/js/iso.js');
    const room = window.game.room;
    const p = tileToScreen(t.x, t.y, room.heightAt(t.x, t.y), room.zoom);
    const W = 520;
    const H = 380;
    const cx = p.x + window.game.cam.x;
    const cy = p.y + window.game.cam.y;
    const clamp = (v, max) => Math.max(0, Math.min(v, max));
    return {
      x: clamp(Math.round(cx - W / 2), window.innerWidth - W),
      y: clamp(Math.round(cy - H * 0.62), window.innerHeight - H),
      width: W, height: H,
    };
  }, home);
  await page.screenshot({ path, clip });
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe, headless: true });

try {
  console.log('=== critter strike sync: A hunts, B must see the kill and the rebirth ===\n');

  const idA = {
    name: `HuntA${stamp % 10000}`,
    figure: 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62',
    uniqueId: `e2e-hunta-${stamp}`,
    verifiedAt: new Date().toISOString(),
    classId: 'fighter',
  };
  const idB = {
    name: `HuntB${stamp % 10000}`,
    figure: 'hr-100-61.hd-180-1.ch-210-66.lg-270-82.sh-290-80',
    uniqueId: `e2e-huntb-${stamp}`,
    verifiedAt: new Date().toISOString(),
    classId: 'ranger',
  };

  const A = await openPlayer(browser, idA);
  const B = await openPlayer(browser, idB);
  for (const c of [A, B]) {
    await c.page.click('#btnPlay');
    await c.page.waitForSelector('.dr-dock', { timeout: 15000 });
  }
  for (const c of [A, B]) {
    await c.page.waitForFunction(() => window.__debug.net.connected === true, { timeout: 20000 });
  }

  // Both into the Fogwood — the only room carrying critters DATA.
  for (const c of [A, B]) {
    await c.page.evaluate((i) => document.querySelectorAll('#exploreBar button[data-room]')[i].click(), ROOM_BUTTON);
    await c.page.waitForFunction((rid) => window.game.room && window.game.room.id === rid, ROOM_ID, { timeout: 10000 });
    await c.page.evaluate((rid) => { if (window.__debug.net.room !== rid) window.__debug.net.join(rid); }, ROOM_ID);
  }
  await B.page.waitForFunction(
    (n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()),
    A.name, { timeout: 15000 }
  );
  await A.page.waitForFunction(
    (n) => [...window.__debug.remote.units.keys()].includes(n.toLowerCase()),
    B.name, { timeout: 15000 }
  );
  console.log(`both clients in ${ROOM_ID}, seeing each other\n`);

  await pinCritters(A.page);
  await pinCritters(B.page);

  // ---- 0. the ids themselves ---------------------------------------------
  // Nobody hands these out: they're derived from the spec name + home tile in
  // room DATA, which both clients load identically. If that ever stops being
  // true, every assertion below is meaningless, so check it first. The target
  // is a low-HP spec (Crebain/Bog Frog, hp <= 4) so the minimum roll of 4
  // guarantees a one-swing kill and the test never depends on a lucky crit.
  const rosterOf = (page) => page.evaluate(() =>
    window.__debug.explore.critters.map((c) => c.critter.id).sort());
  const idsA = await rosterOf(A.page);
  const idsB = await rosterOf(B.page);
  check('both clients derive the same critter id set from room data',
    idsA.length > 0 && JSON.stringify(idsA) === JSON.stringify(idsB));

  const target = await A.page.evaluate(() => {
    const c = window.__debug.explore.critters.find((u) => u.critter.spec.hp <= 4);
    if (!c) return null;
    return {
      id: c.critter.id,
      specName: c.critter.spec.name,
      home: { x: c.critter.home.x, y: c.critter.home.y },
      hp: c.critter.spec.hp,
      respawnMs: c.critter.spec.respawnMs,
    };
  });
  if (!target) throw new Error('no one-shot critter spec found in the room data');
  console.log(`target: ${target.id} (hp ${target.hp}, respawnMs ${target.respawnMs})`);
  check('the target id exists on client B too (same name@home derivation)', idsB.includes(target.id));

  const probeCfg = { critterId: target.id, specName: target.specName, home: target.home };
  await armProbe(A.page, { ...probeCfg, otherName: B.name });
  await armProbe(B.page, { ...probeCfg, otherName: A.name });

  // ---- 1. A hunts ---------------------------------------------------------
  // Warp A onto the beside tile the hunt would have walked to (the walk isn't
  // what's under test and a long path through the treeline just adds flake),
  // then take the real gesture: explore.hunt() → isBeside → strike().
  const swing = await A.page.evaluate((id) => {
    const d = window.__debug;
    const c = d.explore.critters.find((u) => u.critter.id === id);
    const spot = d.explore.nearestBesideTile(c);
    const me = d.explore.unit;
    me.step = null;
    me.path = [];
    me.x = spot.x;
    me.y = spot.y;
    me.z = window.game.room.heightAt(spot.x, spot.y);
    d.net.move(me.x, me.y);
    d.explore.hunt(c);
    const s = d.explore.strikes[d.explore.strikes.length - 1];
    return {
      at: Date.now(),
      stand: { x: me.x, y: me.y },
      dir: me.dir,
      dmg: s ? s.dmg : null,
      crit: s ? s.crit : null,
      respawn: s ? s.respawn : null,
      mine: s ? s.mine : null,
      lethal: s ? s.dmg >= c.stats.hp : null,
    };
  }, target.id);
  console.log(`A swings: ${JSON.stringify(swing)}`);
  check('A queued its own strike (damage rolled once, locally)', swing.dmg > 0 && swing.mine === true);
  check('the swing is lethal (one-shot spec — no dependence on a lucky roll)', swing.lethal === true);
  check('A broadcasts the spec respawn delay verbatim (no local jitter)', swing.respawn === target.respawnMs);

  // ---- 2. mid-swing: the pose on both screens -----------------------------
  // Impact is 250ms after the swing and the pose runs 600ms, so this window
  // catches both avatars mid-jab, before the damage lands.
  await A.page.waitForTimeout(120);
  await Promise.all([
    shotFight(A.page, join(OUT, 'A-mid-swing.png'), target.home),
    shotFight(B.page, join(OUT, 'B-mid-swing.png'), target.home),
  ]);

  // ---- 3. the kill lands on both ------------------------------------------
  for (const c of [A, B]) {
    await c.page.waitForFunction(
      (id) => window.__probe.death !== null || !window.__debug.explore.critters.some((u) => u.critter.id === id),
      target.id, { timeout: 8000 }
    ).catch(() => {});
  }
  // The damage floater only lives 800ms from impact and the capture pipeline
  // eats a few hundred of those — shoot as soon as the unit drops.
  await A.page.waitForTimeout(60);
  await Promise.all([
    shotFight(A.page, join(OUT, 'A-after-kill.png'), target.home),
    shotFight(B.page, join(OUT, 'B-after-kill.png'), target.home),
  ]);

  const killA = await readProbe(A.page);
  const killB = await readProbe(B.page);
  console.log(`\nA probe: ${JSON.stringify({ struck: killA.struck, selfPose: killA.selfPose, dmgFloat: killA.dmgFloat, xpFloat: killA.xpFloat, death: killA.death })}`);
  console.log(`B probe: ${JSON.stringify({ struck: killB.struck, pose: killB.pose, dmgFloat: killB.dmgFloat, xpFloat: killB.xpFloat, death: killB.death })}\n`);

  // the wire
  check('B received a struck broadcast', !!killB.struck);
  check('A does NOT receive its own strike back (broadcast self:false)', killA.struck === null);
  if (killB.struck) {
    check('broadcast carries the attacker name', killB.struck.name === A.name);
    check('broadcast carries the deterministic critter id', killB.struck.id === target.id);
    check('broadcast carries A\'s exact damage roll', killB.struck.dmg === swing.dmg);
    check('broadcast carries the crit flag', killB.struck.crit === swing.crit);
    check('broadcast carries the impact delay', killB.struck.impact > 0);
    check('broadcast carries the respawn delay', killB.struck.respawn === target.respawnMs);
  }

  // 1. the attack pose
  check('B saw A\'s avatar play the attack pose', !!killB.pose && killB.pose.action === 'atk');
  check('B saw A facing the direction A swung in', !!killB.pose && killB.pose.dir === swing.dir);
  check('A played the pose on its own screen too', !!killA.selfPose && killA.selfPose.action === 'atk');

  // 2. the damage floater
  check('B popped a damage floater', !!killB.dmgFloat);
  check('A popped a damage floater', !!killA.dmgFloat);
  check('both floaters show the SAME number (B replayed, never re-rolled)',
    !!killA.dmgFloat && !!killB.dmgFloat && killA.dmgFloat.text === killB.dmgFloat.text);
  check('the floater matches the roll on the wire',
    !!killB.dmgFloat && killB.dmgFloat.text === (swing.crit ? `${swing.dmg}!` : String(swing.dmg)));
  check('the kill banks XP for the attacker only', !!killA.xpFloat && killB.xpFloat === null);

  // 3. the critter dies on both
  check('the critter unit is gone on A', !!killA.death);
  check('the critter unit is gone on B', !!killB.death);
  if (killA.death && killB.death) {
    const skew = Math.abs(killA.death.at - killB.death.at);
    console.log(`death skew between the two clients: ${skew}ms`);
    check(`both clients drop the unit within 750ms (skew ${skew}ms)`, skew < 750);
    // The jitter is what this test exists to keep out: pre-fix these two
    // numbers were independent draws from an 8000-11000ms range.
    check(`A queues the rebirth at the spec delay, no jitter (${killA.death.queuedInMs}ms)`,
      Math.abs(killA.death.queuedInMs - target.respawnMs) < 400);
    check(`B queues the rebirth at the same delay (${killB.death.queuedInMs}ms)`,
      Math.abs(killB.death.queuedInMs - target.respawnMs) < 400);
  }

  // ---- 4. the rebirth, on the same schedule -------------------------------
  console.log(`\nwaiting out the ${target.respawnMs}ms respawn on both clients…`);
  for (const c of [A, B]) {
    await c.page.waitForFunction(() => window.__probe.respawn !== null,
      { timeout: target.respawnMs + 8000, polling: 100 }).catch(() => {});
  }
  const endA = await readProbe(A.page);
  const endB = await readProbe(B.page);
  check('the critter respawned on A', !!endA.respawn);
  check('the critter respawned on B', !!endB.respawn);
  if (endA.respawn && endB.respawn) {
    const skew = Math.abs(endA.respawn.at - endB.respawn.at);
    const elapsedA = endA.respawn.at - endA.death.at;
    const elapsedB = endB.respawn.at - endB.death.at;
    console.log(`respawn: A after ${elapsedA}ms, B after ${elapsedB}ms — skew ${skew}ms`);
    check(`both clients rebirth it at the same moment (skew ${skew}ms < 750ms)`, skew < 750);
    check(`A waited the spec delay, not a jittered one (${elapsedA}ms)`, Math.abs(elapsedA - target.respawnMs) < 900);
    check(`B waited the spec delay, not a jittered one (${elapsedB}ms)`, Math.abs(elapsedB - target.respawnMs) < 900);
  }
  const backA = await rosterOf(A.page);
  const backB = await rosterOf(B.page);
  check('the reborn critter carries the same id on both clients',
    backA.includes(target.id) && backB.includes(target.id));
  check('both rosters are identical again after the whole exchange',
    JSON.stringify(backA) === JSON.stringify(backB));

  console.log(state.failed === 0
    ? '\nALL CHECKS PASSED — the kill and the rebirth reach both clients in lockstep'
    : `\n${state.failed} CHECK(S) FAILED`);
  console.log(`screenshots: ${OUT}`);

  await A.context.close();
  await B.context.close();
} catch (e) {
  console.error('ERROR:', e.stack || e.message);
  state.failed++;
} finally {
  await browser.close();
  server.kill();
}
process.exit(state.failed ? 1 : 0);
