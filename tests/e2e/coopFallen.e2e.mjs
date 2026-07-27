// Downed-hero VISUAL e2e — run with:  node tests/e2e/coopFallen.e2e.mjs
//
// Two surfaces tell a player their hero is down, and neither is checkable from
// a unit suite, because both claims are about pixels:
//
//   IN BATTLE (co-op member)   js/coopBattle.js SpectateController.render
//   AT CAMP    (between rooms) js/runController.js renderCampBody
//
// tests/coopFallen.test.js already proves the battle half in a fake DOM: the
// banner text changes, the action button changes, the class flips to `fallen`.
// What it cannot see is CSS. `.banner.fallen b` is declared AFTER
// `.banner.player b` in css/style.css and wins purely on source order — a rule
// that exists nowhere in the JS, is asserted by nothing in the unit suite, and
// would silently stop applying if anyone moved it, renamed it, or added a later
// `.banner.player` rule. A class name is not a colour, so this suite reads the
// COMPUTED colour out of a real browser instead.
//
// tests/campRevive.test.js likewise proves the camp half's RULES
// (campReviveAction's enable/disable + what consumeFromRun spends) without a
// DOM. What it cannot show is whether a disabled Revive actually reads as
// disabled next to Rest, or whether its label survives the button's width.
//
// So this captures both, because "clearly different" and "clearly labelled" are
// claims about what a player SEES and the only honest check is to look:
//
//   1-living-awaiting-turn.png   battle: my unit is up, "your unit is ready"
//   2-acted-waiting.png          battle: my unit acted, "Waiting for the party…"
//   3-fallen-watching.png        battle: my unit is dead, "you have fallen"
//   4-camp-revive-available.png  camp: hero downed, crystal held — Revive live
//   5-camp-revive-no-crystal.png camp: hero downed, empty bag — Revive greyed
//   6-camp-after-revive.png      camp: the same screen one press later
//   7-member-camp-fallen.png     the MEMBER's screen while the leader decides
//   8-member-camp-revived.png    the same screen once the leader revives them
//   9-member-out-of-run.png      a member NOT revived, in the next battle
//
// Both halves are driven the whole way through the real flow rather than by
// poking a renderer. The battle half: a real `descend` frame raises the real
// party prompt, a real click on "Join the descent" runs main.js's memberUi
// (which is what reveals #panel), and real `relay` frames carry the leader's
// start + phase snapshots into the real CoopMember. The camp half: a real Run
// with `stage: 'camp'` goes through RunController.resume(), the same path a
// player refreshing between battles takes, and the Revive button is CLICKED
// rather than called. So every element measured is the one in index.html with
// css/style.css applied — the same pixels a player gets.
//
// No Supabase traffic is needed: net.emit() delivers frames locally exactly as
// the realtime subscription would, so this runs offline and mints no anon users.
// That is also why it opens its pages itself instead of using lib.mjs's
// openPlayer — see openLocalPlayer below.
import { mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium, startServer, enterFreeRoam, makeChecker, portFor } from './lib.mjs';

const PORT = portFor(36);
const SHOTS = fileURLToPath(new URL('screenshots/', import.meta.url));
const { check, state } = makeChecker();

const LEADER = 'AliceHD';
const ME = 'BobHD';
const FIGURE = 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62';

const exe = findChromium();
if (!exe) {
  console.error('SKIP: no local Chromium build found (npx playwright install chromium)');
  process.exit(0);
}

// lib.mjs's openPlayer additionally seeds a profiles row, because the suites it
// was written for resolve each other by habbo_username over the network. This
// one never talks to another browser — every frame is injected locally — so
// that round trip would only cost an anonymous sign-in from a 30/hour-per-IP
// bucket, and it FAILS loudly besides: the name is already claimed by whichever
// anon user a previous run minted, which the unique index rejects with a 23505.
// A red herring in the log of a suite that is otherwise entirely offline is
// worse than no seed at all, so this seeds only the verified identity that
// requireSignIn() actually reads.
async function openLocalPlayer(browser, port, name, figure) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 750 } });
  await context.addInitScript((id) => {
    localStorage.setItem('habbo-dungeons-identity', JSON.stringify(id));
    localStorage.setItem('habbo-dungeons-char', JSON.stringify({ name: id.name, figure: id.figure }));
  }, {
    name,
    figure,
    uniqueId: `e2e-${name.toLowerCase()}`,
    verifiedAt: new Date().toISOString(),
    classId: 'ranger',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`  [${name}] pageerror:`, e.message));
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
  return page;
}

// ---- the frames the leader would send ---------------------------------------
// Shapes copied from the authority itself: CoopLeader.battleStarted's lastStart
// and unitSnapshot() (js/coopBattle.js). nodeIndex 0 is a battle node, and the
// seed makes the member's replica deterministic, so the screenshots are stable
// run to run.
const START = {
  k: 'start',
  dungeonId: 'dungeon',
  eventPicks: {},
  seed: 7,
  battleNumber: 1,
  squadSize: 2,
  nodeIndex: 0,
  battleName: 'The Test Fight',
  enemyCount: 1,
  log: ['The party descends.'],
  players: [
    {
      cid: 'p0', x: 2, y: 2, dir: 2, classId: 'fighter', name: LEADER, level: 1,
      owner: LEADER, figure: FIGURE, stats: { hp: 20, maxHp: 20, atk: 5, def: 2, mov: 3, rng: 1 },
    },
    {
      cid: 'p1', x: 3, y: 2, dir: 2, classId: 'ranger', name: ME, level: 1,
      owner: ME, figure: FIGURE, stats: { hp: 18, maxHp: 18, atk: 4, def: 2, mov: 3, rng: 3 },
    },
  ],
};

const unit = (cid, over = {}) => ({
  cid, x: 3, y: 2, dir: 2, hp: 18, maxHp: 18, shield: 0,
  rooted: 0, rootedThisTurn: false, moved: false, acted: false, alive: true, ...over,
});

const phase = ({ turn = 2, mine = {} } = {}) => ({
  k: 'phase',
  phase: 'player',
  turn,
  units: [
    unit('p0', { x: 2, y: 2, hp: 20, maxHp: 20 }),
    unit('p1', mine),
    unit('e0', { x: 6, y: 6, hp: 10, maxHp: 10 }),
  ],
});

const DEAD = { hp: 0, alive: false };
const ACTED = { moved: true, acted: true };

// A fresh directory per run: a stale PNG from an older build is worse than no
// PNG, because it looks like evidence.
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe, headless: true });
const shots = [];

/** Capture one element and record the path (the battle panel by default). */
async function shot(page, file, selector = '#panel') {
  const path = join(SHOTS, file);
  await page.locator(selector).screenshot({ path });
  shots.push(path);
  return path;
}

/** What the member's panel currently says, plus the RENDERED colour of the
 *  banner's phase text — the half the unit suite is blind to. */
const readPanel = (page) => page.evaluate(() => {
  const banner = document.querySelector('#banner');
  const strong = banner.querySelector('b');
  const buttons = [...document.querySelectorAll('#actions button')];
  return {
    bannerText: banner.textContent,
    bannerClass: banner.className,
    visible: !document.querySelector('#panel').classList.contains('hidden'),
    buttons: buttons.map((b) => b.textContent),
    allDisabled: buttons.every((b) => b.disabled),
    // getComputedStyle, so this is the colour AFTER the cascade picked a winner
    phaseColor: getComputedStyle(strong).color,
    bannerBg: getComputedStyle(banner).backgroundColor,
    rosterDead: [...document.querySelectorAll('#roster .roster-row.dead')].length,
    // The static footer hint from index.html. Read the COMPUTED display, so a
    // rule hiding it some other way would still count as hidden.
    hintShown: getComputedStyle(document.querySelector('#panelHint')).display !== 'none',
  };
});

try {
  const me = await openLocalPlayer(browser, PORT, ME, FIGURE);
  await enterFreeRoam(me);

  // ---- join a descent, through the real prompt ------------------------------
  console.log('co-op member joins a descent');
  await me.evaluate((from) => {
    window.__debug.net.emit('descend', { t: 'descend', from, dungeon: 'dungeon' });
  }, LEADER);
  await me.waitForSelector('.party-prompt', { timeout: 5000 });
  check('the descend prompt is raised', await me.isVisible('.party-prompt'));
  await me.click('.party-prompt [data-act="join"]');

  // the leader's opening frame builds the replica and reveals the battle panel
  await me.evaluate(({ from, data }) => {
    window.__debug.net.emit('relay', { t: 'relay', from, data });
  }, { from: LEADER, data: START });
  await me.waitForSelector('#panel:not(.hidden)', { timeout: 10000 });
  await me.waitForFunction(() => document.querySelectorAll('#roster .roster-row').length > 0,
    null, { timeout: 10000 });
  check('the battle panel is showing', await me.isVisible('#panel'));
  check('the replica built a roster', await me.evaluate(
    () => document.querySelectorAll('#roster .roster-row').length >= 3));

  const send = (data) => me.evaluate(({ from, d }) => {
    window.__debug.net.emit('relay', { t: 'relay', from, data: d });
  }, { from: LEADER, d: data });

  // ---- state 1: alive, my turn ---------------------------------------------
  console.log('\nstate 1: living member awaiting their turn');
  await send(phase());
  const living = await readPanel(me);
  check('banner offers the member their turn', /your unit is ready/i.test(living.bannerText));
  check('the action area prompts a command', /tap your unit/i.test(living.buttons.join(' ')));
  check('banner is not marked fallen', !/\bfallen\b/.test(living.bannerClass));
  check('no unit is dead on the roster yet', living.rosterDead === 0);
  check('a player who can command sees the command hint', living.hintShown === true);
  await shot(me, '1-living-awaiting-turn.png');

  // ---- state 2: alive but acted (the state fallen used to be confused with) --
  console.log('\nstate 2: member has acted, waiting on the party');
  await send(phase({ mine: ACTED }));
  const acted = await readPanel(me);
  check('banner says the party is moving', /party is moving/i.test(acted.bannerText));
  check('the action area says waiting for the party',
    /waiting for the party/i.test(acted.buttons.join(' ')));
  check('an acted member is still not fallen', !/\bfallen\b/.test(acted.bannerClass));
  check('an acted member is not told they fell', !/fallen/i.test(acted.bannerText));
  await shot(me, '2-acted-waiting.png');

  // ---- state 3: fallen -------------------------------------------------------
  console.log('\nstate 3: member has fallen');
  await send(phase({ mine: DEAD }));
  const fallen = await readPanel(me);
  check('banner says the member has fallen', /you have fallen/i.test(fallen.bannerText));
  check('the action area says they are watching the rest of the fight',
    /watching the rest of the fight/i.test(fallen.buttons.join(' ')));
  check('the fallen screen is NOT the waiting screen',
    !/waiting for the party/i.test(fallen.buttons.join(' ')));
  check('there is nothing to press', fallen.allDisabled);
  check('exactly one thing is said', fallen.buttons.length === 1);
  check('the members corpse shows on the roster', fallen.rosterDead === 1);
  // The footer hint reads "Tap your unit -> blue to move..." - a tutorial for
  // commanding a unit, sitting under an action area that just said there is
  // nothing to press.
  check('the tap-your-unit hint is hidden from a fallen member',
    fallen.hintShown === false);
  await shot(me, '3-fallen-watching.png');

  // ---- the part only a browser can answer -----------------------------------
  // The class is applied ALONGSIDE `player` (the phase is still the player
  // phase), so `.banner.fallen b` only wins on source order. If it ever stops
  // winning, the banner keeps its fallen TEXT while wearing the live-turn blue
  // — the state would look, at a glance, exactly like the one it exists to be
  // distinguished from. That is invisible to a unit test and visible here.
  console.log('\nthe greyed tint is really applied (computed style)');
  check('the fallen class rides alongside the phase class',
    /\bplayer\b/.test(fallen.bannerClass) && /\bfallen\b/.test(fallen.bannerClass));
  check('the living banner is the player-phase blue',
    living.phaseColor === 'rgb(28, 94, 158)');
  check('an acted member keeps that same blue', acted.phaseColor === living.phaseColor);
  check('the fallen banner is NOT the live-turn blue', fallen.phaseColor !== living.phaseColor);
  check('the fallen banner picks up the greyed tint',
    fallen.phaseColor === 'rgb(107, 107, 107)');
  // Grey, specifically: equal channels, and darker than the white bubble it
  // sits on, so it reads as drained rather than as another phase colour.
  const rgb = fallen.phaseColor.match(/\d+/g).map(Number);
  check('the tint is a true grey (r === g === b)', rgb[0] === rgb[1] && rgb[1] === rgb[2]);
  check('the tint is still legible on the white bubble',
    rgb[0] < 160 && fallen.bannerBg === 'rgb(255, 255, 255)');

  // ==========================================================================
  // CAMP: the other place a downed hero has to be told about
  // ==========================================================================
  // A fresh page, because the first one is mid-battle and camp is a different
  // screen entirely. The run is staged and handed to RunController.resume(),
  // which is the real between-battles entry point (stage 'camp' -> showCamp).
  const camp = await openLocalPlayer(browser, PORT, ME, FIGURE);
  await enterFreeRoam(camp);
  // Entering the square fires the room-discovery ribbon (js/roomBanner.js),
  // which animates over the top of everything for a couple of seconds. Let it
  // finish before capturing, or it lands across a camp screenshot and obscures
  // the very row being documented.
  await camp.waitForFunction(() => !document.querySelector('.rd-play'),
    null, { timeout: 10000 }).catch(() => {});

  /** Stage a camp with Bo downed, carrying `inventory`, and render it. */
  const stageCamp = (inventory) => camp.evaluate((inv) => {
    const { Run, makeMember, buildDungeon } = window.__debug;
    const squad = [
      makeMember('fighter', 'You', { leader: true }),
      makeMember('ranger', 'Bo'),
    ];
    const r = new Run({ squad, dungeon: buildDungeon('dungeon', {}) });
    r.squad[0].hp = 6; // the survivor is hurt, so REST is genuinely live...
    r.squad[1].hp = 0; // ...while Bo fell in the battle just fought
    r.inventory = inv;
    r.gold = 200; // ...and affordable: an honest enabled-vs-disabled side by side
    r.stage = 'camp';
    r.nodeIndex = 1;
    window.run.resume(r); // the real resume path -> showCamp -> renderCampBody
  }, inventory);

  /** What the camp action row says, and whether its buttons are really live. */
  const readCamp = () => camp.evaluate(() => {
    const btns = [...document.querySelectorAll('.camp-actions button')];
    const find = (re) => btns.find((b) => re.test(b.textContent)) || null;
    const revive = find(/^Revive/);
    const rest = find(/^Rest/);
    return {
      buttons: btns.map((b) => b.textContent),
      reviveLabel: revive ? revive.textContent : null,
      reviveDisabled: revive ? revive.disabled : null,
      // The disabled look is an ink/background swap (.hd-btn:disabled in
      // css/habbo-ui.css), not an opacity fade — so read the paint itself.
      reviveInk: revive ? getComputedStyle(revive).color : null,
      reviveBg: revive ? getComputedStyle(revive).backgroundColor : null,
      restLabel: rest ? rest.textContent : null,
      restDisabled: rest ? rest.disabled : null,
      restInk: rest ? getComputedStyle(rest).color : null,
      restBg: rest ? getComputedStyle(rest).backgroundColor : null,
      downedCards: document.querySelectorAll('.squad-grid .card.downed').length,
      hpLines: [...document.querySelectorAll('.squad-grid .card-hp')].map((e) => e.textContent),
    };
  });

  // ---- state 4: downed hero, crystal in the bag -----------------------------
  console.log('\nstate 4: camp with a downed hero and a crystal');
  await stageCamp(['revival_crystal', 'iron_sword']);
  await camp.waitForSelector('.camp-actions button', { timeout: 10000 });
  const withCrystal = await readCamp();
  check('the camp screen shows the downed hero', withCrystal.downedCards === 1);
  check('the card reads Downed', withCrystal.hpLines.some((t) => /Downed/.test(t)));
  check('a Revive button sits in the camp actions', withCrystal.reviveLabel !== null);
  check('Revive is enabled with a crystal held', withCrystal.reviveDisabled === false);
  check('the label names the hero coming back', /\bBo\b/.test(withCrystal.reviveLabel));
  check('the label names the crystal', /Revival Crystal/.test(withCrystal.reviveLabel));
  check('Revive sits next to Rest',
    /^Rest/.test(withCrystal.buttons[0]) && /^Revive/.test(withCrystal.buttons[1]));
  check('Rest is genuinely live here, so this is a fair comparison',
    withCrystal.restDisabled === false);
  check('an enabled Revive is painted exactly like the enabled Rest',
    withCrystal.reviveInk === withCrystal.restInk
    && withCrystal.reviveBg === withCrystal.restBg);
  await shot(camp, '4-camp-revive-available.png', '.hd-landing');

  // ---- state 5: downed hero, no crystal -------------------------------------
  console.log('\nstate 5: camp with a downed hero and no crystal');
  await stageCamp(['iron_sword']);
  await camp.waitForSelector('.camp-actions button', { timeout: 10000 });
  const noCrystal = await readCamp();
  check('the hero is still shown as downed', noCrystal.downedCards === 1);
  check('Revive is disabled without a crystal', noCrystal.reviveDisabled === true);
  check('the label says which item is missing',
    /no Revival Crystal/i.test(noCrystal.reviveLabel));
  check('it does not blame the party instead',
    !/nobody is downed/i.test(noCrystal.reviveLabel));
  check('the two camp states read differently',
    noCrystal.reviveLabel !== withCrystal.reviveLabel);
  // The disabled LOOK is CSS the unit suite cannot see. `disabled` alone paints
  // nothing: without .hd-btn:disabled landing, a dead Revive would sit beside a
  // live Rest looking every bit as pressable, and the label would be the only
  // hint that the game had already refused.
  check('a disabled Revive is repainted, not just flagged',
    noCrystal.reviveBg !== noCrystal.restBg || noCrystal.reviveInk !== noCrystal.restInk);
  check('it wears the disabled ink', noCrystal.reviveInk === 'rgb(102, 95, 73)');
  check('it wears the disabled background', noCrystal.reviveBg === 'rgb(231, 224, 207)');
  check('...while Rest beside it stays live and white',
    noCrystal.restDisabled === false && noCrystal.restBg === 'rgb(255, 255, 255)');
  check('the same Revive looked different when it was enabled',
    withCrystal.reviveBg !== noCrystal.reviveBg);
  await shot(camp, '5-camp-revive-no-crystal.png', '.hd-landing');

  // ---- pressing it, for real -------------------------------------------------
  // Not campReviveAction() called by hand: the actual button, clicked, so the
  // wiring in renderCampBody is what gets exercised.
  console.log('\ncamp Revive is really wired up');
  await stageCamp(['revival_crystal']);
  await camp.waitForSelector('.camp-actions button', { timeout: 10000 });
  await camp.click('.camp-actions button:has-text("Revive")');
  const revived = await camp.evaluate(() => {
    const r = window.run.run;
    const bo = r.squad[1];
    return {
      hp: bo.hp,
      maxHp: window.__debug.memberStats(bo).maxHp,
      inventory: [...r.inventory],
      gold: r.gold,
    };
  });
  const after = await readCamp();
  check('clicking Revive brings the hero back', revived.hp > 0);
  check('revived at half max HP', revived.hp === Math.ceil(revived.maxHp / 2));
  check('the crystal was spent', !revived.inventory.includes('revival_crystal'));
  check('no gold was charged', revived.gold === 200);
  check('the camp screen repainted without the corpse', after.downedCards === 0);
  check('the hero now shows real HP', after.hpLines.every((t) => !/Downed/.test(t)));
  check('Revive disables itself, now blaming nothing but a whole party',
    after.reviveDisabled === true && /nobody is downed/i.test(after.reviveLabel));
  await shot(camp, '6-camp-after-revive.png', '.hd-landing');

  // ==========================================================================
  // THE MEMBER'S SIDE OF THAT SAME REVIVE
  // ==========================================================================
  // The camp screens above are the LEADER's browser. The revived hero belongs
  // to somebody else, sitting behind a "the party makes camp" overlay with no
  // view of the leader's backpack — so until the leader broadcasts, being
  // revived and still being dead look identical over there.
  //
  // Back to the member page, which is still holding the fallen battle from
  // state 3. The two frames below are exactly what CoopLeader sends: `screen`
  // from RunController.showCamp, and the phase snapshot rosterRevived()
  // re-broadcasts with `alive` flipped. That the LEADER really emits this frame
  // is tests/coopRevive.test.js's job (it runs a real CoopLeader over a real
  // Run and reads the wire); what only a browser can show is what the member
  // then SEES.
  console.log('\nstate 7: the member waits at camp, still fallen');
  await send({ k: 'screen', kind: 'camp' });
  await me.waitForSelector('#overlay .hd-landing', { timeout: 10000 });

  const readMemberScreen = () => me.evaluate(() => {
    const card = document.querySelector('#overlay .hd-card-body');
    const panel = document.querySelector('#panel');
    const banner = document.querySelector('#banner');
    return {
      overlayText: card ? card.textContent.trim() : null,
      overlayShown: !document.querySelector('#overlay').classList.contains('hidden'),
      panelHidden: panel.classList.contains('hidden'),
      // the battle panel underneath, still holding the last thing it rendered
      bannerText: banner.textContent,
      bannerClass: banner.className,
      buttons: [...document.querySelectorAll('#actions button')].map((b) => b.textContent),
    };
  });

  const memberAtCamp = await readMemberScreen();
  check('the member is on the camp overlay', memberAtCamp.overlayShown);
  check('it says the party is making camp', /party makes camp/i.test(memberAtCamp.overlayText));
  check('it does not yet mention a revive', !/revived/i.test(memberAtCamp.overlayText));
  check('the battle panel is hidden behind it', memberAtCamp.panelHidden === true);
  check('and the panel underneath still holds the fallen state',
    /you have fallen/i.test(memberAtCamp.bannerText));
  await shot(me, '7-member-camp-fallen.png', '#overlay .hd-landing');

  // ---- state 8: the leader spends the crystal -------------------------------
  // The phase frame rosterRevived() re-broadcasts: same units, same shape, this
  // one standing again.
  console.log('\nstate 8: the leader revives them');
  await send(phase({ turn: 2, mine: { hp: 13, alive: true } }));
  await me.waitForFunction(
    () => /revived/i.test(document.querySelector('#overlay .hd-card-body').textContent),
    null, { timeout: 10000 }
  );
  const memberRevived = await readMemberScreen();
  check('the member is told they were revived',
    /revived you/i.test(memberRevived.overlayText));
  check('the leader is named', /Alice/i.test(memberRevived.overlayText));
  check('the two member screens read differently',
    memberRevived.overlayText !== memberAtCamp.overlayText);
  check('the panel underneath dropped the fallen banner',
    !/you have fallen/i.test(memberRevived.bannerText));
  check('...and is no longer tagged fallen',
    !/\bfallen\b/.test(memberRevived.bannerClass));
  check('...and no longer says they are only watching',
    !/watching the rest of the fight/i.test(memberRevived.buttons.join(' ')));
  await shot(me, '8-member-camp-revived.png', '#overlay .hd-landing');

  // ==========================================================================
  // THE MEMBER WHO IS NEVER REVIVED
  // ==========================================================================
  // A separate page, because this member's descent has to fork away from the
  // revived one: same death, no crystal. In the NEXT battle the leader's start
  // frame simply does not list them (js/run.js instantiateSquad builds
  // livingSquad only), so their client owns nothing at all - which is how it
  // knows, with no new frame, that the party has gone on without it.
  console.log('\nstate 9: a member the party left behind');
  const left = await openLocalPlayer(browser, PORT, ME, FIGURE);
  await enterFreeRoam(left);
  await left.waitForFunction(() => !document.querySelector('.rd-play'),
    null, { timeout: 10000 }).catch(() => {});

  const sendTo = (page, data) => page.evaluate(({ from, d }) => {
    window.__debug.net.emit('relay', { t: 'relay', from, data: d });
  }, { from: LEADER, d: data });

  await left.evaluate((from) => {
    window.__debug.net.emit('descend', { t: 'descend', from, dungeon: 'dungeon' });
  }, LEADER);
  await left.waitForSelector('.party-prompt', { timeout: 5000 });
  await left.click('.party-prompt [data-act="join"]');

  // battle 1: in it, then killed in it
  await sendTo(left, START);
  await left.waitForSelector('#panel:not(.hidden)', { timeout: 10000 });
  await sendTo(left, phase({ mine: DEAD }));
  const beforeNext = await left.evaluate(() => ({
    banner: document.querySelector('#banner').textContent,
    buttons: [...document.querySelectorAll('#actions button')].map((b) => b.textContent),
  }));
  check('they die in the first battle', /you have fallen/i.test(beforeNext.banner));

  // camp comes and goes with no crystal spent, then the party descends again
  await sendTo(left, { k: 'screen', kind: 'camp' });
  await sendTo(left, {
    ...START,
    nodeIndex: 2,
    battleName: 'The Next Fight',
    players: START.players.filter((p) => p.owner === LEADER), // the living only
  });
  await left.waitForFunction(
    () => /out of the run/i.test(document.querySelector('#banner').textContent),
    null, { timeout: 10000 }
  );
  const outOfRun = await left.evaluate(() => {
    const banner = document.querySelector('#banner');
    const btns = [...document.querySelectorAll('#actions button')];
    const ghostRow = document.querySelector('#roster .roster-row.ghost');
    const leaderRow = [...document.querySelectorAll('#roster .roster-row')]
      .find((r) => !r.classList.contains('ghost') && !r.classList.contains('enemy'));
    const gs = ghostRow ? getComputedStyle(ghostRow) : null;
    return {
      bannerText: banner.textContent,
      bannerClass: banner.className,
      phaseColor: getComputedStyle(banner.querySelector('b')).color,
      buttons: btns.map((b) => b.textContent),
      allDisabled: btns.every((b) => b.disabled),
      panelShown: !document.querySelector('#panel').classList.contains('hidden'),
      hintShown: getComputedStyle(document.querySelector('#panelHint')).display !== 'none',
      ghost: ghostRow ? ghostRow.textContent : null,
      ghostDead: ghostRow ? ghostRow.classList.contains('dead') : null,
      ghostBorder: gs ? gs.borderTopStyle : null,
      ghostOpacity: gs ? Number(gs.opacity) : null,
      ghostStrike: gs ? gs.textDecoration : '',
      leaderRowOpacity: leaderRow ? Number(getComputedStyle(leaderRow).opacity) : null,
      livingRows: document.querySelectorAll('#roster .roster-row:not(.dead)').length,
    };
  });

  check('the next battle runs without them', outOfRun.panelShown === true);
  check('the banner says they are out of the run',
    /out of the run/i.test(outOfRun.bannerText));
  check('it no longer says they have fallen',
    !/you have fallen/i.test(outOfRun.bannerText));
  check('the action area says they are watching the party finish',
    /watching your party finish the run/i.test(outOfRun.buttons.join(' ')));
  check('and NEVER the waiting-for-a-turn promise',
    !/waiting for the party/i.test(outOfRun.buttons.join(' ')));
  check('there is nothing to press', outOfRun.allDisabled);
  check('exactly one thing is said', outOfRun.buttons.length === 1);
  check('the banner is tagged out, not fallen',
    /\bout\b/.test(outOfRun.bannerClass) && !/\bfallen\b/.test(outOfRun.bannerClass));
  // .banner.out b has to win over .banner.player b the same way .fallen does:
  // a live-turn blue banner reading "You are out of the run" would be the same
  // mixed signal all over again.
  check('the out banner wears the drained grey, not the live-turn blue',
    outOfRun.phaseColor === 'rgb(107, 107, 107)' && outOfRun.phaseColor !== living.phaseColor);
  check('this screen differs from the fallen one they saw before',
    outOfRun.buttons.join(' ') !== beforeNext.buttons.join(' '));
  check('the tap-your-unit hint is hidden from them too',
    outOfRun.hintShown === false);

  // Their own name must not silently vanish from their own roster: the leader
  // stopped sending their unit, so the row is drawn from the details latched
  // while they still had one.
  check('the member is still on their own roster', outOfRun.ghost !== null);
  check('their row is greyed out as dead', outOfRun.ghostDead === true);
  check('...and dashed, since they are not on this field',
    outOfRun.ghostBorder === 'dashed');
  check('...visibly faded against the living rows',
    outOfRun.ghostOpacity < 0.5 && outOfRun.leaderRowOpacity === 1);
  check('...and struck through', outOfRun.ghostStrike.includes('line-through'));
  check('the row names them', /BobHD/.test(outOfRun.ghost));
  check('the leader is still listed as living', outOfRun.livingRows >= 1);
  await shot(left, '9-member-out-of-run.png');

  // ---- the screenshots are real ---------------------------------------------
  console.log('\ncaptured artifacts');
  check('all nine states were captured', shots.length === 9);
  for (const p of shots) {
    check(`PNG written: ${p.split(/[\\/]/).pop()}`,
      existsSync(p) && statSync(p).size > 1000);
  }
} catch (e) {
  state.failed++;
  console.error('  FAIL  (exception)', e.message);
} finally {
  await browser.close().catch(() => {});
  server.kill();
}

if (shots.length) {
  console.log('\n  screenshots:');
  for (const p of shots) console.log(`    ${p}`);
}
console.log(state.failed ? `\n${state.failed} e2e check(s) FAILED` : '\nAll downed-hero e2e checks passed');
process.exit(state.failed ? 1 : 0);
