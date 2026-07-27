// Camp Revive tests — run with:  node tests/campRevive.test.js
//
// A downed hero could not be brought back at camp even with a Revival Crystal
// in the bag. The revive effect existed and worked (js/consumableEffects.js:
// the `revive` kind + the roster adapter's fallen()), but the only UI that ever
// called it was the Hand — a BATTLE toolbar torn down with the battle
// (leaveRunChrome in js/main.js). So between rooms, the one item in the game
// that answers hp 0 was unreachable, and hp 0 is permanent by design
// (js/run.js: no mid-run revive, and deliberately no gold-priced one either).
//
// This covers the camp button's two halves:
//   • when it may be pressed, and what a DISABLED one says — a greyed "Revive"
//     with no reason cannot tell a player whether to go find a crystal or
//     whether the game thinks nobody is hurt
//   • that pressing it spends exactly one crystal and revives through the
//     EXISTING resolver, rather than a second revive written at the UI layer
//
// campReviveAction() is pure, so the rules are asserted directly; the spend is
// driven through consumeFromRun exactly as renderCampBody does it.
import { campReviveAction } from '../js/runController.js';
import { consumeFromRun, rosterTargets } from '../js/consumableEffects.js';
import { Run, makeMember, memberStats } from '../js/run.js';
import { buildDungeon } from '../js/dungeon.js';
import { CONSUMABLES } from '../js/items.js';

let failed = 0;
function check(label, cond) {
  if (!cond) failed++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}`);
}

// ---- fixtures ---------------------------------------------------------------
// A REAL Run: canRevive/reviveItem/downedSquad are Run methods and the button
// mirrors canRest(), so stubbing the run would assert nothing about the thing
// that actually ships. Only save() is neutered (no localStorage here).
function run(squadSpec, inventory = []) {
  const squad = squadSpec.map((s, i) =>
    makeMember(s.classId || 'fighter', s.name, { leader: i === 0, hp: s.hp, id: s.name }));
  // makeMember starts everyone at full hp; an explicit hp (including 0) wins.
  squadSpec.forEach((s, i) => { if (s.hp != null) squad[i].hp = s.hp; });
  const r = new Run({ squad, dungeon: buildDungeon('dungeon', {}) });
  r.inventory = [...inventory];
  r.saves = 0;
  r.save = () => { r.saves++; };
  return r;
}
const maxOf = (m) => memberStats(m).maxHp;
const CRYSTAL = 'revival_crystal';
/** The click renderCampBody wires up, verbatim. */
const press = (r) => consumeFromRun(r, campReviveAction(r).itemId, rosterTargets(r));

// ---- when the button is live ------------------------------------------------
console.log('enable / disable');
{
  const r = run([{ name: 'Ana' }, { name: 'Bo', hp: 0 }], [CRYSTAL]);
  const a = campReviveAction(r);
  check('a crystal plus a downed hero enables Revive', a.enabled === true);
  check('run.canRevive() agrees', r.canRevive() === true);
  check('the action carries the item it will spend', a.itemId === CRYSTAL);
  check('the label names the hero coming back', /\bBo\b/.test(a.label));
  check('the label names the item being spent', /Revival Crystal/.test(a.label));
}
{
  // Nobody downed: the crystal is in the bag but there is nothing to spend it
  // on, and resolveEffect would refuse anyway.
  const r = run([{ name: 'Ana' }, { name: 'Bo' }], [CRYSTAL]);
  const a = campReviveAction(r);
  check('a full-health party disables Revive', a.enabled === false);
  check('run.canRevive() agrees', r.canRevive() === false);
  check('the label says nobody is downed', /nobody is downed/i.test(a.label));
  check('the reason is machine-readable too', a.reason === 'nobody downed');
}
{
  // Downed, but no crystal: the label must send the player looking for one.
  const r = run([{ name: 'Ana' }, { name: 'Bo', hp: 0 }], []);
  const a = campReviveAction(r);
  check('no crystal disables Revive', a.enabled === false);
  check('the label names the missing item', /no Revival Crystal/i.test(a.label));
  check('...and does not blame the party', !/nobody is downed/i.test(a.label));
  check('the reason is machine-readable', a.reason === 'no item');
  check('there is no item to spend', a.itemId === null);
}
{
  // Neither: one message, and it must be the one the player can act on last —
  // "nobody is downed" is the reason there is nothing to do at all.
  const r = run([{ name: 'Ana' }, { name: 'Bo' }], []);
  const a = campReviveAction(r);
  check('no crystal and nobody downed still disables', a.enabled === false);
  check('the empty-handed case reports the party, not the bag',
    a.reason === 'nobody downed');
}
{
  // The disabled states must be visibly different from each other and from the
  // live one — three greyed buttons reading "Revive" would teach nothing.
  const live = campReviveAction(run([{ name: 'A' }, { name: 'B', hp: 0 }], [CRYSTAL])).label;
  const noItem = campReviveAction(run([{ name: 'A' }, { name: 'B', hp: 0 }], [])).label;
  const noDowned = campReviveAction(run([{ name: 'A' }, { name: 'B' }], [CRYSTAL])).label;
  check('all three labels differ', new Set([live, noItem, noDowned]).size === 3);
  check('every label still starts with Revive',
    [live, noItem, noDowned].every((l) => /^Revive\b/.test(l)));
}
{
  // Other consumables are not revives: carrying a potion must not light the
  // button up.
  const r = run([{ name: 'Ana' }, { name: 'Bo', hp: 0 }], ['health_potion', 'grand_elixir']);
  check('a bag full of potions does not enable Revive',
    campReviveAction(r).enabled === false);
  check('reviveItem() finds no revive', r.reviveItem() === null);

  r.inventory.push(CRYSTAL);
  check('adding a crystal to that same bag enables it', campReviveAction(r).enabled === true);
  check('and reviveItem() picks the crystal out of the potions',
    r.reviveItem() === CRYSTAL);
}
{
  // Found by effect, not by hardcoded id: the button and the thing it spends
  // are looked up the same way, so a second revive item could never light the
  // button while the click spent something else.
  check('the crystal is the revive consumable in items.js',
    CONSUMABLES[CRYSTAL].effect.kind === 'revive');
  const ids = Object.keys(CONSUMABLES).filter((id) => CONSUMABLES[id].effect.kind === 'revive');
  const r = run([{ name: 'Ana' }, { name: 'Bo', hp: 0 }], ids);
  check('every revive-kind consumable is accepted', ids.includes(campReviveAction(r).itemId));
}
{
  const r = run([{ name: 'Ana', hp: 0 }], [CRYSTAL]);
  check('a wiped party can still be revived from (the leader counts)',
    campReviveAction(r).enabled === true);
}

// ---- pressing it ------------------------------------------------------------
console.log('\nconsuming the crystal');
{
  const r = run([{ name: 'Ana' }, { name: 'Bo', hp: 0 }], [CRYSTAL]);
  const bo = r.squad[1];
  check('the hero starts downed', bo.hp === 0);

  const did = press(r);
  check('the press reports success', did === true);
  check('the hero is back up', bo.hp > 0);
  check('revived at half max HP', bo.hp === Math.ceil(maxOf(bo) / 2));
  check('the crystal is gone from the backpack', !r.inventory.includes(CRYSTAL));
  check('exactly one item was spent', r.inventory.length === 0);
  check('the run was saved', r.saves === 1);
  check('the living member is untouched', r.squad[0].hp === maxOf(r.squad[0]));
  check('the button disables itself afterwards', campReviveAction(r).enabled === false);
}
{
  // One crystal, one hero. The second corpse stays down — no two-for-one.
  const r = run([{ name: 'Ana' }, { name: 'Bo', hp: 0 }, { name: 'Cy', hp: 0 }], [CRYSTAL]);
  press(r);
  check('the first downed hero is revived', r.squad[1].hp > 0);
  check('the second stays down', r.squad[2].hp === 0);
  check('the bag is empty', r.inventory.length === 0);
  const a = campReviveAction(r);
  check('the button reports the missing crystal, not a missing corpse',
    a.enabled === false && a.reason === 'no item');
}
{
  // Two crystals, two corpses: one press each, and the labels track along.
  const r = run([{ name: 'Ana' }, { name: 'Bo', hp: 0 }, { name: 'Cy', hp: 0 }], [CRYSTAL, CRYSTAL]);
  check('the first press names Bo', /\bBo\b/.test(campReviveAction(r).label));
  press(r);
  check('one crystal is left', r.inventory.length === 1);
  check('the next press names Cy', /\bCy\b/.test(campReviveAction(r).label));
  press(r);
  check('both heroes are up', r.squad[1].hp > 0 && r.squad[2].hp > 0);
  check('both crystals are spent', r.inventory.length === 0);
  check('two saves, one per revive', r.saves === 2);
}
{
  // A refused press must not burn the item. This is consumeFromRun's contract
  // and the reason renderCampBody checks its return before re-rendering.
  const r = run([{ name: 'Ana' }, { name: 'Bo' }], [CRYSTAL]);
  const did = consumeFromRun(r, CRYSTAL, rosterTargets(r));
  check('reviving with nobody downed is refused', did === false);
  check('the crystal is NOT consumed', r.inventory.includes(CRYSTAL));
  check('nothing was saved', r.saves === 0);
}
{
  // The disabled button hands back a null itemId; pressing it anyway (a stale
  // click, a keyboard activation) must be a no-op rather than a crash.
  const r = run([{ name: 'Ana' }, { name: 'Bo', hp: 0 }], []);
  const did = press(r);
  check('pressing a disabled Revive does nothing', did === false);
  check('the party is unchanged', r.squad[1].hp === 0);
  check('nothing was saved', r.saves === 0);
}
{
  // Revive is not Rest: it costs no gold, and spending it must not disturb the
  // once-per-camp Rest. A gold price here would contradict run.js's stake.
  const r = run([{ name: 'Ana', hp: 1 }, { name: 'Bo', hp: 0 }], [CRYSTAL]);
  r.gold = 100;
  const goldBefore = r.gold;
  const restedBefore = r.rested;
  press(r);
  check('reviving costs no gold', r.gold === goldBefore);
  check('reviving does not consume the camp Rest', r.rested === restedBefore);
  check('Rest is still available afterwards', r.canRest() === true);
}
{
  // hp 0 stays permanent without a crystal: nothing about adding this button
  // may hand out a free comeback.
  const r = run([{ name: 'Ana' }, { name: 'Bo', hp: 0 }], []);
  r.gold = 9999;
  check('gold alone never revives', campReviveAction(r).enabled === false);
  r.rest();
  check('Rest does not raise the dead', r.squad[1].hp === 0);
  check('...and Rest heals the living', r.squad[0].hp > 0);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall camp revive checks passed');
process.exit(failed ? 1 : 0);
