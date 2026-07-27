// Co-op "out of the run" tests - run with:  node tests/coopOutOfRun.test.js
//
// The last hole in the downed-hero flow, and the one that lasted longest: what
// a member sees in the battles AFTER the one they died in.
//
// js/run.js instantiateSquad() maps livingSquad() only, so a member who was
// never revived gets no unit in any later battle. Their client then owns
// nothing, and SpectateController.fallen deliberately returns false when
// myUnits() is empty (owning nothing is also true of a plain spectator, and
// accusing a bystander of dying would be worse). So they fell straight through
// to "Waiting for the party..." - for the rest of the run, with no turn ever
// coming. The same false promise the fallen state was added to kill, one
// battle boundary later.
//
// The new state is derived, not announced: `everHadUnit` latches on the first
// time the leader's ordinary start/phase stream hands this client a hero, and
// out-of-run is "latched, but owning nothing now". No new frame, no new field
// on the wire - which matters, because the leader has no idea a given member is
// watching, and a status message would need one.
//
// Both classes are real, on a fake wire shaped like js/supabaseNet.js, driven
// by real `start` frames built the way CoopLeader.battleStarted builds them.
import { CoopMember, SpectateController } from '../js/coopBattle.js';
import { DUNGEONS } from '../js/dungeon.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

const LEADER = 'Alice';
const ME = 'Bob';

// ---- just enough browser ----------------------------------------------------
function el() {
  const node = {
    children: [], className: '', textContent: '', disabled: false, style: {},
    scrollTop: 0, scrollHeight: 0,
    appendChild(c) { node.children.push(c); return c; },
    removeChild(c) { node.children.splice(node.children.indexOf(c), 1); },
    addEventListener() {},
    get childNodes() { return node.children; },
    get firstChild() { return node.children[0]; },
  };
  let html = '';
  Object.defineProperty(node, 'innerHTML', {
    get: () => html,
    set: (v) => { html = v; node.children.length = 0; },
  });
  return node;
}
globalThis.document = { createElement: () => el() };

const stubGame = () => {
  const overlays = { move: new Set(), target: new Set(), skill: new Set(), objective: new Set() };
  return {
    overlays,
    clearOverlays() { for (const k of ['move', 'target', 'skill']) overlays[k].clear(); },
    setController(c) { this.controller = c; },
    setRoom(r) { this.room = r; },
    addUnit() {},
  };
};

// ---- the leader's frames ----------------------------------------------------
const hero = (cid, name, owner, classId) => ({
  cid, x: 2, y: 2, dir: 2, classId, name, level: 1, owner,
  stats: { hp: 18, maxHp: 18, atk: 4, def: 2, mov: 3, rng: 3 },
});

const ALICE = hero('p0', LEADER, LEADER, 'fighter');
const BOB = hero('p1', ME, ME, 'ranger');

/** A `start` frame. `players` is whoever instantiateSquad would have built -
 *  which is the whole point: a member who died and was not revived is simply
 *  absent from the next one. */
const start = (players, nodeIndex = 0, battleName = 'The Test Fight') => ({
  k: 'start',
  dungeonId: DUNGEONS[0].id,
  eventPicks: {},
  seed: 7,
  battleNumber: 1,
  squadSize: players.length,
  nodeIndex,
  battleName,
  enemyCount: 1,
  log: [],
  players,
});

const unit = (cid, over = {}) => ({
  cid, x: 3, y: 2, dir: 2, hp: 18, maxHp: 18, shield: 0,
  rooted: 0, rootedThisTurn: false, moved: false, acted: false, alive: true, ...over,
});

/** A phase frame naming exactly the units on the field. */
const phase = (cids, over = {}) => ({
  k: 'phase',
  phase: 'player',
  turn: 2,
  units: cids.map((c) => unit(c, over[c] || {})),
});

const DEAD = { hp: 0, alive: false };

function member() {
  // `hint` is the static footer <p> from index.html (#panelHint). It is part of
  // the panel but not built by render(), so the controller only ever toggles
  // its display - which is exactly what the hint cases below read.
  const dom = { banner: el(), actions: el(), roster: el(), log: el(), hint: el() };
  const m = new CoopMember({ on: () => () => {}, send: () => {} }, stubGame(), dom, () => ME);
  const ui = { waited: [], waiting(h) { ui.waited.push(h); }, battleReady() {}, exit() {} };
  m.ui = ui;
  m.leaderName = LEADER;
  m.active = true;
  return { m, dom, ui };
}

const banner = (d) => d.dom.banner.innerHTML;
const buttons = (d) => d.dom.actions.children.map((b) => b.textContent);
const only = (d) => buttons(d).join(' | ');
const hintShown = (d) => d.dom.hint.style.display !== 'none';
const rosterRows = (d) => d.dom.roster.children;
const rosterNames = (d) => rosterRows(d).map((r) => (r.innerHTML.match(/rname">([^<]*)/) || [])[1]);

// ---- the transition, battle to battle ---------------------------------------
console.log('fallen, then left behind');
{
  const d = member();

  // Battle 1: Bob is in it and alive.
  d.m.buildReplica(start([ALICE, BOB]));
  check('the member owns a hero to begin with', d.m.myUnits().length === 1);
  check('and is neither fallen nor out',
    d.m.controller.fallen === false && d.m.controller.outOfRun === false);
  check('the client remembers it has held a hero', d.m.everHadUnit === true);

  // ...and dies in it.
  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: DEAD }));
  check('dying makes them fallen', d.m.controller.fallen === true);
  check('...but not yet out of the run', d.m.controller.outOfRun === false);
  check('the banner is the fallen one', /you have fallen/i.test(banner(d)));
  check('the action area is about THIS fight',
    /watching the rest of the fight/i.test(only(d)));

  // Camp happens, nobody revives them.
  d.m.applyScreen({ k: 'screen', kind: 'camp' });

  // Battle 2: instantiateSquad built only the living, so Bob is absent.
  d.m.buildReplica(start([ALICE], 2, 'The Next Fight'));
  check('the member owns nothing now', d.m.myUnits().length === 0);
  check('the fallen state is gone (there is no corpse here)',
    d.m.controller.fallen === false);
  check('...and out-of-run has taken over', d.m.controller.outOfRun === true);
  check('the banner says they are out of the run',
    /you are out of the run/i.test(banner(d)));
  check('the banner no longer says fallen', !/you have fallen/i.test(banner(d)));
  check('the action area says they are watching the party finish',
    /watching your party finish the run/i.test(only(d)));
  check('and NEVER the waiting-for-a-turn promise',
    !/waiting for the party/i.test(only(d)));
  check('there is nothing to press',
    d.dom.actions.children.every((b) => b.disabled === true));
  check('exactly one thing is said', buttons(d).length === 1);
  check('the banner is tagged out for styling', /\bout\b/.test(d.dom.banner.className));
  check('...and not tagged fallen', !/\bfallen\b/.test(d.dom.banner.className));
}
{
  // It sticks: every later battle, every later phase.
  const d = member();
  d.m.buildReplica(start([ALICE, BOB]));
  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: DEAD }));
  d.m.buildReplica(start([ALICE], 2));

  d.m.applyPhase(phase(['p0', 'e0']));
  check('still out after a phase frame', d.m.controller.outOfRun === true);
  check('still says so', /you are out of the run/i.test(banner(d)));

  d.m.applyPhase({ ...phase(['p0', 'e0']), phase: 'enemy', turn: 3 });
  check('still out through the enemy phase', d.m.controller.outOfRun === true);
  check('the enemy-phase hint is replaced too', !/enemy phase/i.test(only(d)));

  d.m.buildReplica(start([ALICE], 4, 'A Third Fight'));
  check('still out a whole battle later', d.m.controller.outOfRun === true);
  check('and never offered a turn', !/tap your unit/i.test(only(d)));
}

// ---- the two states are not the same ----------------------------------------
console.log('\nout-of-run is not fallen');
{
  const fallenD = member();
  fallenD.m.buildReplica(start([ALICE, BOB]));
  fallenD.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: DEAD }));
  const fallenBanner = banner(fallenD);
  const fallenButtons = only(fallenD);

  const outD = member();
  outD.m.buildReplica(start([ALICE, BOB]));
  outD.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: DEAD }));
  outD.m.buildReplica(start([ALICE], 2));

  check('the banners differ', banner(outD) !== fallenBanner);
  check('the action areas differ', only(outD) !== fallenButtons);
  check('fallen is about the fight, out is about the run',
    /rest of the fight/i.test(fallenButtons) && /finish the run/i.test(only(outD)));
  check('the css hooks differ',
    fallenD.dom.banner.className !== outD.dom.banner.className);
}
{
  // If somehow both could be true, out-of-run wins: "you have fallen" would
  // imply the fight on screen is still the member's to lose.
  const d = member();
  d.m.buildReplica(start([ALICE, BOB]));
  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: DEAD }));
  const c = d.m.controller;
  check('a fallen member with units is not out', c.fallen === true && c.outOfRun === false);

  // force the overlap: latched history, and a corpse still on the field
  const forced = new SpectateController(d.dom, {
    everHadUnit: true,
    leaderName: LEADER,
    shadow: d.m.shadow,
    myUnits: () => [{ alive: false, done: false }],
  });
  check('the forced case really is both', forced.fallen === true && forced.outOfRun === false);
}

// ---- what out-of-run must NOT catch -----------------------------------------
console.log('\nnot everyone with no units is out');
{
  // A pure spectator: never had a hero, so the party has not left them behind.
  // This is the case that stops the banner accusing a bystander.
  const d = member();
  d.m.buildReplica(start([ALICE], 0));
  check('a member who never had a hero owns nothing', d.m.myUnits().length === 0);
  check('...and has no history to latch', d.m.everHadUnit === false);
  check('...so is NOT out of the run', d.m.controller.outOfRun === false);
  check('...and is not told they are', !/out of the run/i.test(banner(d)));
  check('they get the ordinary spectator wait', /waiting for the party/i.test(only(d)));
}
{
  // A member whose hero is alive is obviously not out, however quiet the turn.
  const d = member();
  d.m.buildReplica(start([ALICE, BOB]));
  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: { moved: true, acted: true } }));
  check('an acted member is not out', d.m.controller.outOfRun === false);
  check('...and still waits for the party normally',
    /waiting for the party/i.test(only(d)));
}
{
  // A member who WAS revived reappears in the next start frame, so they are
  // never out. This is the join between this state and the camp revive.
  const d = member();
  d.m.buildReplica(start([ALICE, BOB]));
  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: DEAD }));
  check('fallen after dying', d.m.controller.fallen === true);

  d.m.applyScreen({ k: 'screen', kind: 'camp' });
  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: { hp: 9, alive: true } })); // the revive
  check('the revive clears fallen', d.m.controller.fallen === false);
  check('...and they are not out', d.m.controller.outOfRun === false);

  d.m.buildReplica(start([ALICE, BOB], 2)); // revived, so back in the squad
  check('a revived member is in the next battle', d.m.myUnits().length === 1);
  check('...and is never told they are out', d.m.controller.outOfRun === false);
  check('...and gets the normal turn UI',
    /your unit is ready|party is moving/i.test(banner(d)));
}
{
  // The end-of-descent screens belong to the party, not to one member's state.
  const d = member();
  d.m.buildReplica(start([ALICE, BOB]));
  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: DEAD }));
  d.m.buildReplica(start([ALICE], 2));
  check('out of the run going in', d.m.controller.outOfRun === true);

  d.m.applyEnd({ k: 'end', result: 'won' });
  check('victory still reads as victory', /Victory!/.test(banner(d)));
  check('...and not as being out', !/out of the run/i.test(banner(d)));
  check('the out tag is dropped at the end screen',
    !/\bout\b/.test(d.dom.banner.className));
}
{
  // A fresh descent is a clean slate: the latch must not survive one.
  const d = member();
  d.m.buildReplica(start([ALICE, BOB]));
  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: DEAD }));
  d.m.buildReplica(start([ALICE], 2));
  check('out of this run', d.m.controller.outOfRun === true);

  d.m.deactivate();
  check('leaving the descent clears the history', d.m.everHadUnit === false);
  check('...and the between-rooms flag', d.m.betweenRooms === false);
}

// ---- the footer hint --------------------------------------------------------
// index.html pins a static hint under the panel: "Tap your unit -> blue to move,
// red to attack, green to use a skill." It is the one part of the panel render()
// does not build, so it kept instructing players who have no unit to tap - an
// action area saying there is nothing to press, with a tutorial for commanding
// units directly beneath it.
console.log('\nthe footer hint');
{
  const d = member();
  d.m.buildReplica(start([ALICE, BOB]));
  check('a member with a hero gets the command hint', hintShown(d) === true);

  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: { moved: true, acted: true } }));
  check('...and still gets it after acting', hintShown(d) === true);

  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: DEAD }));
  check('a FALLEN member is not told to tap a unit', hintShown(d) === false);

  d.m.buildReplica(start([ALICE], 2));
  check('an OUT-OF-RUN member is not either', hintShown(d) === false);
  check('...and is out, so that is the right reason', d.m.controller.outOfRun === true);
}
{
  // It comes back: a revived member has a unit to tap again.
  const d = member();
  d.m.buildReplica(start([ALICE, BOB]));
  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: DEAD }));
  check('hidden while fallen', hintShown(d) === false);

  d.m.applyScreen({ k: 'screen', kind: 'camp' });
  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: { hp: 9, alive: true } })); // the revive
  check('a revive brings the hint back', hintShown(d) === true);

  d.m.buildReplica(start([ALICE, BOB], 2));
  check('...and it survives into the next battle', hintShown(d) === true);
}
{
  // A plain spectator never had a unit, so the hint is equally useless to them.
  const d = member();
  d.m.buildReplica(start([ALICE]));
  check('a spectator is not out of the run', d.m.controller.outOfRun === false);
  check('but the hint is still hidden from them', hintShown(d) === false);
}
{
  // The end-of-battle screens are not a live field: the hint has nothing to do
  // with victory or defeat either way, and must not flash back on.
  const d = member();
  d.m.buildReplica(start([ALICE, BOB]));
  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: DEAD }));
  d.m.applyEnd({ k: 'end', result: 'won' });
  check('the hint stays hidden on the victory screen', hintShown(d) === false);
}
{
  // No hint element at all (a panel built before index.html grew one, or the
  // duel panel) must not throw.
  const dom = { banner: el(), actions: el(), roster: el(), log: el() };
  const m = new CoopMember({ on: () => () => {}, send: () => {} }, stubGame(), dom, () => ME);
  m.ui = { waiting() {}, battleReady() {}, exit() {} };
  m.leaderName = LEADER;
  m.active = true;
  m.buildReplica(start([ALICE, BOB]));
  m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: DEAD }));
  check('a panel with no hint element renders fine',
    /you have fallen/i.test(dom.banner.innerHTML));
}

// ---- the member keeps their own roster row ----------------------------------
// The leader's start frame lists the living only, so an out-of-run member's
// hero is not on the field and the ordinary roster loop cannot draw them. Left
// alone their own name vanishes from their own roster - which reads as a
// disconnect rather than as being out, and breaks continuity with the fallen
// screen one battle earlier, where their corpse WAS listed.
console.log('\nthe out-of-run member keeps their roster row');
{
  const d = member();
  d.m.buildReplica(start([ALICE, BOB]));
  check('both heroes are listed to begin with',
    rosterNames(d).includes(ME) && rosterNames(d).includes(LEADER));

  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: DEAD }));
  check('the corpse is still listed while fallen', rosterNames(d).includes(ME));
  check('...as a dead row',
    rosterRows(d).some((r) => /\bdead\b/.test(r.className) && r.innerHTML.includes(ME)));
  check('...and not as a ghost (they are on this field)',
    !rosterRows(d).some((r) => /\bghost\b/.test(r.className)));

  d.m.buildReplica(start([ALICE], 2));
  check('the leader is on the next roster', rosterNames(d).includes(LEADER));
  check('the member is STILL on their own roster', rosterNames(d).includes(ME));
  const row = rosterRows(d).find((r) => r.innerHTML.includes(ME));
  check('their row is marked dead', !!row && /\bdead\b/.test(row.className));
  check('...and marked ghost (not on this field)', !!row && /\bghost\b/.test(row.className));
  check('...with no HP left', !!row && /width:0%/.test(row.innerHTML));
  check('...and the fallen cross', !!row && row.innerHTML.includes('\u2715'));
  check('it remembers the class they played', !!row && /Ranger/i.test(row.innerHTML));
  check('the ghost is last, under the living', rosterNames(d).pop() === ME);
  check('no phantom rows for anyone else', rosterRows(d).length === 3);
}
{
  // A living member is never ghosted, and neither is a plain spectator.
  const d = member();
  d.m.buildReplica(start([ALICE, BOB]));
  d.m.applyPhase(phase(['p0', 'p1', 'e0']));
  check('a living member has no ghost row',
    !rosterRows(d).some((r) => /\bghost\b/.test(r.className)));

  const s = member();
  s.m.buildReplica(start([ALICE]));
  check('a spectator has no ghost row',
    !rosterRows(s).some((r) => /\bghost\b/.test(r.className)));
  check('...and is not on the roster at all', !rosterNames(s).includes(ME));
}
{
  // Revived: back on the field for real, so no ghost duplicate of themselves.
  const d = member();
  d.m.buildReplica(start([ALICE, BOB]));
  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: DEAD }));
  d.m.applyScreen({ k: 'screen', kind: 'camp' });
  d.m.applyPhase(phase(['p0', 'p1', 'e0'], { p1: { hp: 9, alive: true } }));
  d.m.buildReplica(start([ALICE, BOB], 2));
  check('a revived member is listed once',
    rosterNames(d).filter((n) => n === ME).length === 1);
  check('...and not as a ghost',
    !rosterRows(d).some((r) => /\bghost\b/.test(r.className)));
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall out-of-run checks passed');
process.exit(failed ? 1 : 0);
