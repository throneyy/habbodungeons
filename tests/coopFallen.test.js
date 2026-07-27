// Co-op member "you have fallen" tests — run with:  node tests/coopFallen.test.js
//
// A co-op member watches the leader's battle through a replica (js/coopBattle.js
// CoopMember + SpectateController). When their own unit dies there is no revive
// to wait for — js/run.js commits to hp 0 meaning downed for the rest of the
// run — so the screen has to say so.
//
// The bug this suite exists for: render() asked one question, `mineReady =
// myUnits().some(u => u.alive && !u.done)`, and a dead member answered it the
// same way a living member who had already acted did. Both fell through to
// "Waiting for the party…" — a promise of a turn that was never coming, with
// the fallen player's own corpse on the roster right beside it.
//
// Two states that look identical and mean opposite things is the whole bug, so
// these cases assert them AGAINST each other: the fallen screen must differ
// from the waiting screen, not merely contain some word about dying.
//
// Everything is driven through the real path — a real `start` frame builds a
// real replica (real Room, real Units, real query-only Battle), then real
// `phase` frames carry the `alive` flags unitSnapshot() puts on the wire. Only
// the browser is faked: a tiny document + a stub Game, because the assertions
// are about what the member's panel says.
import { CoopMember } from '../js/coopBattle.js';
import { DUNGEONS } from '../js/dungeon.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

// ---- just enough browser ----------------------------------------------------
// render() builds buttons with document.createElement and clears containers by
// assigning innerHTML = '' — so `innerHTML` has to be a real setter that drops
// children, or every render would stack on the last one and the assertions
// would be reading history.
function el() {
  const node = {
    children: [],
    className: '',
    textContent: '',
    disabled: false,
    style: {},
    scrollTop: 0,
    scrollHeight: 0,
    appendChild(c) { node.children.push(c); return c; },
    removeChild(c) { node.children.splice(node.children.indexOf(c), 1); },
    addEventListener(t, fn) { node.onclick = fn; },
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

function stubGame() {
  const overlays = { move: new Set(), target: new Set(), skill: new Set(), objective: new Set() };
  return {
    overlays,
    units: [],
    clearOverlays() { for (const k of ['move', 'target', 'skill']) overlays[k].clear(); },
    setController(c) { this.controller = c; },
    setRoom(r) { this.room = r; },
    addUnit(u) { this.units.push(u); },
  };
}

// ---- a live descent, seen from the member's seat ----------------------------
const LEADER = 'Alice';
const ME = 'Bob';

const startFrame = () => ({
  k: 'start',
  dungeonId: DUNGEONS[0].id,
  eventPicks: {},
  seed: 7,
  battleNumber: 1,
  squadSize: 2,
  nodeIndex: 0, // a battle node
  battleName: 'The Test Fight',
  enemyCount: 1,
  log: [],
  players: [
    {
      cid: 'p0', x: 2, y: 2, dir: 2, classId: 'fighter', name: LEADER, level: 1,
      owner: LEADER, stats: { hp: 20, maxHp: 20, atk: 5, def: 2, mov: 3, rng: 1 },
    },
    {
      cid: 'p1', x: 3, y: 2, dir: 2, classId: 'ranger', name: ME, level: 1,
      owner: ME, stats: { hp: 18, maxHp: 18, atk: 4, def: 2, mov: 3, rng: 3 },
    },
  ],
});

/** A member mid-battle: replica built, nothing dead yet. */
function member() {
  const dom = { banner: el(), actions: el(), roster: el(), log: el() };
  const game = stubGame();
  const sent = [];
  const net = { on: () => () => {}, send: (m) => sent.push(m) };
  const m = new CoopMember(net, game, dom, () => ME);
  m.ui = { waiting() {}, battleReady() {}, exit() {} };
  m.leaderName = LEADER;
  m.active = true;
  m.buildReplica(startFrame());
  return { m, dom, game, sent };
}

/** A phase frame in the shape unitSnapshot() puts on the wire (coopBattle.js
 *  line ~260). `mine` / `leader` override just the fields a case cares about. */
const phaseFrame = ({ phase = 'player', turn = 2, mine = {}, leader = {} } = {}) => ({
  k: 'phase',
  phase,
  turn,
  units: [
    {
      cid: 'p0', x: 2, y: 2, dir: 2, hp: 20, maxHp: 20, shield: 0,
      rooted: 0, rootedThisTurn: false, moved: false, acted: false, alive: true, ...leader,
    },
    {
      cid: 'p1', x: 3, y: 2, dir: 2, hp: 18, maxHp: 18, shield: 0,
      rooted: 0, rootedThisTurn: false, moved: false, acted: false, alive: true, ...mine,
    },
    {
      cid: 'e0', x: 6, y: 6, dir: 2, hp: 10, maxHp: 10, shield: 0,
      rooted: 0, rootedThisTurn: false, moved: false, acted: false, alive: true,
    },
  ],
});

/** My unit, killed: hp 0 and alive false, exactly as the leader would send it. */
const DEAD = { hp: 0, alive: false };
/** My unit, alive but finished for this turn — the state that used to be
 *  indistinguishable from being dead. */
const ACTED = { moved: true, acted: true };

const banner = (dom) => dom.banner.innerHTML;
const buttons = (dom) => dom.actions.children.map((b) => b.textContent);
const only = (dom) => buttons(dom).join(' | ');

// ---- the fallen state -------------------------------------------------------
console.log('member falls');
{
  const { m, dom } = member();
  m.applyPhase(phaseFrame());
  const aliveBanner = banner(dom);
  const aliveButtons = only(dom);

  m.applyPhase(phaseFrame({ mine: DEAD }));
  check('the member knows it has fallen', m.controller.fallen === true);
  check('the banner says the member has fallen', /you have fallen/i.test(banner(dom)));
  check('the banner no longer offers a turn',
    !/your unit is ready/i.test(banner(dom)));
  check('the action area says they are watching the rest of the fight',
    /watching the rest of the fight/i.test(only(dom)));
  check('the fallen screen is NOT the waiting screen',
    !/waiting for the party/i.test(only(dom)));
  check('the fallen banner differs from the living one', banner(dom) !== aliveBanner);
  check('the fallen actions differ from the living ones', only(dom) !== aliveButtons);
  check('exactly one thing is said, not a stack of hints', buttons(dom).length === 1);
  check('there is nothing to press', dom.actions.children.every((b) => b.disabled === true));
  check('the banner is tagged fallen for styling',
    /\bfallen\b/.test(dom.banner.className));
  check('the descent is still identified', /Co-op: Alice's descent/.test(banner(dom)));
}
{
  // The comparison that IS the bug: alive-but-acted vs dead must not render
  // the same screen.
  const { m, dom } = member();
  m.applyPhase(phaseFrame({ mine: ACTED }));
  const waitingBanner = banner(dom);
  const waitingButtons = only(dom);
  check('a living member who already acted still waits for the party',
    /waiting for the party/i.test(waitingButtons));
  check('...and is not told they have fallen', !/fallen/i.test(waitingBanner));
  check('...and is not marked fallen', m.controller.fallen === false);

  m.applyPhase(phaseFrame({ mine: DEAD }));
  check('a DEAD member gets a different banner than an acted one',
    banner(dom) !== waitingBanner);
  check('a DEAD member gets different actions than an acted one',
    only(dom) !== waitingButtons);
}
{
  // The fallen state holds across the turn cycle — there is no revive, so it
  // must never quietly fall back to "your unit is ready".
  const { m, dom } = member();
  m.applyPhase(phaseFrame({ mine: DEAD }));
  m.applyPhase(phaseFrame({ phase: 'enemy', mine: DEAD }));
  check('still fallen through the enemy phase', /you have fallen/i.test(banner(dom)));
  check('the enemy-phase hint is replaced too', !/enemy phase…/i.test(only(dom)));
  check('still watching', /watching the rest of the fight/i.test(only(dom)));

  // Next turn: everything resets for the living, nothing resets for the dead.
  m.applyPhase(phaseFrame({ phase: 'player', turn: 3, mine: DEAD }));
  check('a new turn does not revive the member', m.controller.fallen === true);
  check('the new turn number still shows', /Turn 3/.test(banner(dom)));
  check('no command prompt returns', !/tap your unit/i.test(only(dom)));
  check('and never a wait prompt', !/waiting for the party/i.test(only(dom)));
}
{
  // The battle's own ending outranks one member's state: won/lost is the
  // party's outcome and the screen it lands on is the run's, not a corpse's.
  const { m, dom } = member();
  m.applyPhase(phaseFrame({ mine: DEAD }));
  m.applyEnd({ k: 'end', result: 'won' });
  check('victory still reads as victory for a fallen member',
    /Victory!/.test(banner(dom)) && !/you have fallen/i.test(banner(dom)));
  check('the fallen tag is dropped at the end screen',
    !/\bfallen\b/.test(dom.banner.className));

  const b = member();
  b.m.applyPhase(phaseFrame({ mine: DEAD }));
  b.m.applyEnd({ k: 'end', result: 'lost' });
  check('defeat reads as defeat', /Defeated/.test(banner(b.dom)));
}

// ---- what "fallen" must not mean --------------------------------------------
console.log('not fallen');
{
  const { m, dom } = member();
  m.applyPhase(phaseFrame());
  check('a living member is not fallen', m.controller.fallen === false);
  check('a living member is prompted to command', /tap your unit/i.test(only(dom)));

  // Someone ELSE dying is not my problem: the leader's unit going down leaves
  // my own screen exactly as it was.
  const beforeBanner = banner(dom);
  m.applyPhase(phaseFrame({ leader: DEAD }));
  check('the leader dying does not make ME fallen', m.controller.fallen === false);
  check('...and my banner is unchanged', banner(dom) === beforeBanner);
  check('...and I can still command my unit', /tap your unit/i.test(only(dom)));
}
{
  // A client that owns nothing (a pure spectator, or a replica caught between
  // frames) has not "fallen" — it never had a unit to lose. Guarding this is
  // what keeps the banner from accusing a bystander of dying.
  const { m, dom } = member();
  for (const u of m.byCid.values()) u.owner = null;
  m.applyPhase(phaseFrame({ mine: DEAD }));
  check('a member owning no units is not fallen', m.controller.fallen === false);
  check('...and is not told it has fallen', !/you have fallen/i.test(banner(dom)));
}

// ---- a dead unit is not a live selection ------------------------------------
// The fallen screen is only honest if nothing underneath still treats the
// corpse as commandable — a stale selection would put Attack/Wait buttons back
// on screen and let the member fire commands the leader can only reject.
console.log('dead unit is uncommandable');
{
  const { m, dom, game, sent } = member();
  m.applyPhase(phaseFrame());
  const myUnit = m.byCid.get('p1');
  m.controller.select(myUnit);
  check('a living unit can be selected', m.controller.sel === myUnit);
  check('selecting it offers actions', /Wait/.test(only(dom)));

  m.applyPhase(phaseFrame({ mine: DEAD }));
  check('the dead unit is dropped as the selection', m.controller.sel === null);
  check('its action buttons are gone', !/Wait/.test(only(dom)));
  check('the fallen state shows instead', /watching the rest of the fight/i.test(only(dom)));
  check('its move overlays are cleared', game.overlays.move.size === 0);
  check('its target overlays are cleared', game.overlays.target.size === 0);

  const before = sent.length;
  m.controller.onTap({ x: myUnit.x, y: myUnit.y }); // tap the corpse
  check('tapping a dead unit does not select it', m.controller.sel === null);
  check('tapping a dead unit sends no command', sent.length === before);
  check('the fallen screen survives the tap',
    /watching the rest of the fight/i.test(only(dom)));
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall co-op fallen checks passed');
process.exit(failed ? 1 : 0);
