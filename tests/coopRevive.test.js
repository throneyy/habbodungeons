// Co-op camp-revive relay tests — run with:  node tests/coopRevive.test.js
//
// The last gap in the downed-hero flow. A co-op member's hero is a row in the
// LEADER's Run: the leader owns the save, cracks the Revival Crystal at camp
// (js/runController.js renderCampBody), and heals that row locally. The member
// is a different browser holding a replica of the battle just fought — corpse
// included — and nothing in the old code ever told it otherwise. So the player
// who was brought back sat in front of "you have fallen" while the party
// descended without them, and only found out when the next battle happened to
// hand them a unit again.
//
// The fix broadcasts the revive on the EXISTING phase frame — the one
// unitSnapshot() already stamps `alive` onto — rather than a channel of its
// own. These cases prove that end to end rather than by inspection:
//
//   • the frame really goes out, and really carries alive:true for that unit
//   • the member's fallen state clears and the normal turn UI comes back
//   • the member is TOLD, instead of silently un-falling behind an overlay
//   • nobody ELSE on the wire is revived by it
//   • a revive that finds no unit is refused rather than half-sent
//
// A real CoopLeader and a real CoopMember run on a shared fake wire that
// stamps `from` and drops self-echo exactly like js/supabaseNet.js, over a real
// Run, a real Room and a real Battle. Only the browser and the BattleController
// are stubbed. The point is that a hand-built frame could "pass" while the two
// real halves still disagreed about what a revive looks like.
import { CoopLeader, CoopMember } from '../js/coopBattle.js';
import { Run, makeMember, memberStats } from '../js/run.js';
import { buildDungeon } from '../js/dungeon.js';
import { Battle } from '../js/battle.js';
import { campReviveAction } from '../js/runController.js';
import { consumeFromRun, rosterTargets } from '../js/consumableEffects.js';

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

// ---- the wire ---------------------------------------------------------------
// One party channel: send() stamps `from`, the sender never sees its own frame,
// and `to` addresses one recipient (js/supabaseNet.js).
function wire() {
  const peers = new Map();
  return {
    net(name) {
      const handlers = new Map();
      const net = {
        name,
        sent: [],
        on(t, fn) {
          if (!handlers.has(t)) handlers.set(t, new Set());
          handlers.get(t).add(fn);
          return () => handlers.get(t).delete(fn);
        },
        emit(t, m) { for (const fn of [...(handlers.get(t) || [])]) fn(m); },
        send(msg) {
          const payload = { ...msg, from: name };
          net.sent.push(payload);
          for (const peer of peers.values()) {
            if (peer.name === name) continue;
            if (payload.to && payload.to !== peer.name) continue;
            peer.emit(payload.t, payload);
          }
        },
      };
      peers.set(name, net);
      return net;
    },
  };
}

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

/** A live descent: real Run, real battle, leader streaming to a real member.
 *  `hp` seeds the member's hero so a case can start it alive or downed. */
function descent() {
  const bus = wire();

  // --- the leader's run (the authority for both heroes) ---
  const squad = [
    makeMember('fighter', LEADER, { leader: true, id: 'm-alice' }),
    makeMember('ranger', ME, { id: 'm-bob' }),
  ];
  const dungeon = buildDungeon('dungeon', {});
  const run = new Run({ squad, dungeon, seed: 7 });
  run.save = () => {};

  const leaderNet = bus.net(LEADER);
  const leader = new CoopLeader(leaderNet, () => LEADER);
  leader.setOwner('m-bob', ME, null); // Bo's hero belongs to Bob's browser

  // --- the real battle the leader is the authority over ---
  const node = dungeon.nodes[0];
  const room = node.makeRoom({ seed: 7 });
  const players = run.instantiateSquad(room, [{ x: 2, y: 2, dir: 2 }, { x: 3, y: 2, dir: 2 }]);
  const enemies = node.makeEnemies(room, { seed: 7, battleNumber: 1, squadSize: 2 });
  const battle = new Battle(room, [...players, ...enemies], { objective: node.objective });
  const bc = { canSelect: () => true, render() {}, refreshOverlays() {} };

  // --- the member's browser ---
  const memberNet = bus.net(ME);
  const dom = { banner: el(), actions: el(), roster: el(), log: el() };
  const member = new CoopMember(memberNet, stubGame(), dom, () => ME);
  const ui = {
    classId: 'ranger', figure: null, waited: [],
    waiting(html) { ui.waited.push(html); },
    battleReady() {}, exit() {},
  };
  member.activate(LEADER, ui);

  leader.battleStarted({ battle, bc, players, enemies, node, run });

  return {
    bus, run, leader, leaderNet, member, memberNet, dom, ui, battle, players,
    bo: run.squad[1],
    boUnit: players.find((u) => u.id === 'm-bob'),
    myUnit: () => member.myUnits()[0] || null,
    stop() { leader.end(); member.deactivate(); },
  };
}

/** Kill the member's hero the way a battle would, and sync it out. */
function killMember(d) {
  d.boUnit.stats.hp = 0;
  d.leader.syncPhase(true);
}

/** The leader finishes the battle and puts the party at camp. */
function toCamp(d) {
  d.run.writeBack ? d.run.writeBack(d.players) : null;
  d.bo.hp = 0; // the roster half of dying (Run.writeBack does this for real)
  d.leader.screen('camp');
}

const bannerOf = (d) => d.dom.banner.innerHTML;
const buttonsOf = (d) => d.dom.actions.children.map((b) => b.textContent).join(' | ');
const lastWaiting = (d) => d.ui.waited[d.ui.waited.length - 1] || '';

// ---- the frame itself -------------------------------------------------------
console.log('the revive rides the existing phase frame');
{
  const d = descent();
  killMember(d);
  toCamp(d);
  d.leaderNet.sent.length = 0; // watch only what the revive sends

  d.bo.hp = Math.ceil(memberStats(d.bo).maxHp / 2); // what run.js's revive writes
  const did = d.leader.rosterRevived(d.bo);

  check('the revive reports success', did === true);
  const frames = d.leaderNet.sent.filter((m) => m.t === 'relay');
  check('exactly one relay frame goes out', frames.length === 1);
  // Everything below reads the frame. Default it rather than index blindly: a
  // regression that stops the broadcast should FAIL these checks, not crash the
  // file and take the other 40 with it.
  const f = (frames[0] || {}).data || {};
  const units = f.units || [];
  check('it is a PHASE frame, not a new message kind', f.k === 'phase');
  check('no new channel was invented', (frames[0] || {}).t === 'relay');
  const mine = units.find((u) => u.cid === 'p1');
  check('it carries the revived unit', !!mine);
  check('the unit is flagged alive — the field unitSnapshot already stamps',
    !!mine && mine.alive === true);
  check('and carries the roster hp', !!mine && mine.hp === d.bo.hp);
  check('the whole field is still snapshotted, not just the one unit',
    units.length > 1);
  check('the other hero is untouched',
    (units.find((u) => u.cid === 'p0') || {}).alive === true);
  d.stop();
}

// ---- what the member makes of it -------------------------------------------
console.log('\nthe member comes back');
{
  const d = descent();
  check('the member starts alive', d.member.myLiveness() === 'up');

  killMember(d);
  check('the member is fallen after dying', d.member.controller.fallen === true);
  check('...and their panel says so', /you have fallen/i.test(bannerOf(d)));

  toCamp(d);
  check('at camp the member is on the waiting overlay',
    /party makes camp/i.test(lastWaiting(d)));
  check('the member is STILL fallen underneath', d.member.controller.fallen === true);
  check('the stale panel still shows the corpse', /you have fallen/i.test(bannerOf(d)));

  d.bo.hp = Math.ceil(memberStats(d.bo).maxHp / 2);
  d.leader.rosterRevived(d.bo);

  check('the member is no longer fallen', d.member.controller.fallen === false);
  check('their replica hero is standing again', !!d.myUnit() && d.myUnit().alive === true);
  check('at the hp the leader roster says', !!d.myUnit() && d.myUnit().stats.hp === d.bo.hp);
  check('which is half of max',
    !!d.myUnit() && d.myUnit().stats.hp === Math.ceil(memberStats(d.bo).maxHp / 2));
  check('the panel drops the fallen banner', !/you have fallen/i.test(bannerOf(d)));
  check('the panel drops the watching button',
    !/watching the rest of the fight/i.test(buttonsOf(d)));
  check('the banner is no longer tagged fallen', !/\bfallen\b/.test(d.dom.banner.className));
  d.stop();
}
{
  // Being TOLD is the point: the battle panel is hidden behind the camp overlay,
  // so a revive that only repainted the panel would be invisible until the next
  // battle — which is the bug, not the fix.
  const d = descent();
  killMember(d);
  toCamp(d);
  const before = d.ui.waited.length;

  d.bo.hp = 9;
  d.leader.rosterRevived(d.bo);

  check('the member gets a fresh overlay', d.ui.waited.length === before + 1);
  check('it says they were revived', /revived you/i.test(lastWaiting(d)));
  check('it names the leader who did it', /Alice/.test(lastWaiting(d)));
  check('it no longer says the party is merely making camp',
    !/party makes camp/i.test(lastWaiting(d)));
  d.stop();
}
{
  // ...and only when it is news. A phase frame that changes nothing must not
  // announce a revive, or every snapshot at camp would claim one.
  const d = descent();
  killMember(d);
  toCamp(d);

  d.leader.syncPhase(true); // a plain re-sync, nobody revived
  check('a re-sync of a dead hero announces nothing',
    !/revived you/i.test(lastWaiting(d)));
  check('...and leaves them fallen', d.member.controller.fallen === true);

  d.bo.hp = 9;
  d.leader.rosterRevived(d.bo);
  const count = d.ui.waited.length;
  d.leader.syncPhase(true); // re-sync AFTER the revive
  check('a re-sync of a living hero does not re-announce',
    d.ui.waited.length === count);
  d.stop();
}
{
  // In-battle, a revive is impossible (hp 0 is permanent for the run), so the
  // announcement must never fire over a live fight — the panel is the screen
  // there, and an overlay would cover it.
  const d = descent();
  check('the member is not between rooms during a battle',
    d.member.betweenRooms === false);
  killMember(d);
  const before = d.ui.waited.length;
  d.boUnit.stats.hp = 5; // an impossible mid-battle resurrection
  d.leader.syncPhase(true);
  check('no overlay is thrown over a live battle', d.ui.waited.length === before);
  check('the panel still tracks the change', d.member.controller.fallen === false);
  d.stop();
}

// ---- the next battle --------------------------------------------------------
console.log('\nback to normal on the next battle');
{
  const d = descent();
  killMember(d);
  toCamp(d);
  d.bo.hp = Math.ceil(memberStats(d.bo).maxHp / 2);
  d.leader.rosterRevived(d.bo);

  // The leader descends again: a revived hero is in livingSquad, so they get a
  // unit in the next battle the ordinary way.
  d.run.nodeIndex = 2;
  const node = d.run.dungeon.nodes[2];
  const room = node.makeRoom({ seed: 7 });
  const players = d.run.instantiateSquad(room, [{ x: 2, y: 2, dir: 2 }, { x: 3, y: 2, dir: 2 }]);
  const enemies = node.makeEnemies(room, { seed: 7, battleNumber: 2, squadSize: 2 });
  const battle = new Battle(room, [...players, ...enemies], { objective: node.objective });
  d.leader.battleStarted({
    battle, bc: { canSelect: () => true, render() {}, refreshOverlays() {} },
    players, enemies, node, run: d.run,
  });

  check('the revived hero is in the next battle',
    players.some((u) => u.id === 'm-bob'));
  check('the member owns a unit again', d.member.myUnits().length === 1);
  check('the member is not fallen', d.member.controller.fallen === false);
  check('the member is back in the battle screen, not an overlay',
    d.member.betweenRooms === false);
  check('the panel offers the normal turn UI',
    /your unit is ready|party is moving/i.test(bannerOf(d)));
  check('and never the fallen banner', !/you have fallen/i.test(bannerOf(d)));
  d.stop();
}

// ---- what it must NOT do ----------------------------------------------------
console.log('\nthe revive is aimed');
{
  // Somebody else's revive is not mine. The leader's own hero going down and
  // coming back must not clear a member's fallen state.
  const d = descent();
  killMember(d);
  toCamp(d);
  const alice = d.run.squad[0];
  alice.hp = 1;
  d.leader.rosterRevived(alice);
  check('reviving the leader leaves the member fallen',
    d.member.controller.fallen === true);
  check('...and tells them nothing', !/revived you/i.test(lastWaiting(d)));
  check('...and their hero stays down', !!d.myUnit() && d.myUnit().alive === false);
  d.stop();
}
{
  // A roster member with no unit on the last field (never descended, or the
  // battle was already torn down) is refused rather than half-broadcast.
  const d = descent();
  killMember(d);
  toCamp(d);
  d.leaderNet.sent.length = 0;
  const ghost = makeMember('mage', 'Nobody', { id: 'm-ghost' });
  ghost.hp = 5;
  check('an unknown member is refused', d.leader.rosterRevived(ghost) === false);
  check('nothing is sent for one', d.leaderNet.sent.length === 0);
  check('a null member is refused', d.leader.rosterRevived(null) === false);
  d.stop();
}
{
  const d = descent();
  killMember(d);
  toCamp(d);
  d.leader.teardownBattle(); // no live field at all
  check('a revive with no battle is refused', d.leader.rosterRevived(d.bo) === false);
  d.stop();
}

// ---- the camp button really drives it ---------------------------------------
// campReviveAction hands back the member it is about, so the click has someone
// to broadcast. Re-deriving it after consumeFromRun would read a roster the
// revive had already changed and find the WRONG hero (or none).
console.log('\nthe camp button carries the hero it revives');
{
  const d = descent();
  killMember(d);
  toCamp(d);
  d.run.inventory = ['revival_crystal'];

  const rv = campReviveAction(d.run);
  check('the action is enabled', rv.enabled === true);
  check('it names the hero', rv.member === d.bo);

  // exactly what renderCampBody's click handler does
  const ok = consumeFromRun(d.run, rv.itemId, rosterTargets(d.run));
  check('the crystal is spent', ok === true && d.run.inventory.length === 0);
  d.leader.rosterRevived(rv.member);

  check('the member is revived on the other browser',
    d.member.controller.fallen === false && !!d.myUnit() && d.myUnit().alive === true);
  check('and was told', /revived you/i.test(lastWaiting(d)));
  d.stop();
}
{
  // Two corpses, one crystal: only the hero the button named comes back.
  const d = descent();
  killMember(d);
  toCamp(d);
  d.run.squad[0].hp = 0; // the leader is down too
  d.run.inventory = ['revival_crystal'];

  const rv = campReviveAction(d.run);
  check('the button names the FIRST downed hero', rv.member === d.run.squad[0]);
  consumeFromRun(d.run, rv.itemId, rosterTargets(d.run));
  d.leader.rosterRevived(rv.member);
  check('the member, revived second, is still fallen',
    d.member.controller.fallen === true);
  check('...and still down on the roster', d.bo.hp === 0);
  d.stop();
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall co-op revive checks passed');
process.exit(failed ? 1 : 0);
