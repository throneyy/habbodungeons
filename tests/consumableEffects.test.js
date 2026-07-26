// Consumable effect tests — run with:  node tests/consumableEffects.test.js
// Covers the unified resolver in js/consumableEffects.js through BOTH target
// adapters: the roster one (between rooms) and the battle one (live units).
// Every kind is asserted twice, once per adapter, because these were two
// separate hand-written switches in main.js until they were merged and had
// already drifted apart.
import {
  resolveEffect, consumeFromRun, rosterTargets, battleTargets,
} from '../js/consumableEffects.js';
import { makeMember, memberStats } from '../js/run.js';
import { CONSUMABLES } from '../js/items.js';
import { Unit } from '../js/units.js';
import { CLASSES } from '../js/classes.js';

let failed = 0;
function check(label, cond) {
  if (!cond) failed++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}`);
}

// ---- fixtures --------------------------------------------------------------
// A fake run: only the three things the module touches (squad, inventory,
// save). Real Run needs a dungeon and localStorage; the shape is what matters.
function fakeRun(squad, inventory = []) {
  return { squad, inventory, saves: 0, save() { this.saves++; } };
}
const member = (opts) => makeMember('fighter', opts.name || 'Hero', opts);
const maxOf = (m) => memberStats(m).maxHp;

// A fake live unit with the same accessor surface the adapter reads. `alive`
// is a getter, matching js/units.js (alive <=> stats.hp > 0 once stats exist).
function fakeUnit(id, hp, { leader = false, team = 'player', xp = 0 } = {}) {
  const m = makeMember('fighter', id, { id });
  return {
    id, team, xp, useSprites: leader,
    stats: { hp, maxHp: memberStats(m).maxHp },
    get alive() { return this.stats.hp > 0; },
  };
}
const fakeBattle = (units) => ({ units });

// A REAL Unit for the buff tests: buffs live on the unit, not in the adapter,
// so a hand-rolled stub would assert nothing. Only a room with heightAt is
// needed (Avatar reads it once for z).
const fakeRoom = { heightAt: () => 0 };
function buffableUnit(id, hp, { leader = false, team = 'player', classId = 'fighter' } = {}) {
  return new Unit(fakeRoom, null, 0, 0, { id, team, classId, hp, useSprites: leader });
}

// ---- heal ------------------------------------------------------------------
console.log('heal');
{
  const lead = member({ name: 'Lead', leader: true, hp: 5 });
  const run = fakeRun([lead]);
  resolveEffect({ kind: 'heal', n: 8 }, rosterTargets(run));
  check('roster: heals the leader by n', lead.hp === 13);
}
{
  const lead = member({ name: 'Lead', leader: true, hp: maxOf(member({})) - 2 });
  const run = fakeRun([lead]);
  resolveEffect({ kind: 'heal', n: 999 }, rosterTargets(run));
  check('roster: clamps to maxHp', lead.hp === maxOf(lead));
}
{
  const lead = member({ name: 'Lead', leader: true });
  const run = fakeRun([lead]);
  check('roster: refuses at full HP (item not wasted)',
    resolveEffect({ kind: 'heal', n: 8 }, rosterTargets(run)) === false);
}
{
  // the drift fix: a downed hero needs a revive, not a potion
  const dead = member({ name: 'Dead', leader: true, hp: 0 });
  const run = fakeRun([dead]);
  const did = resolveEffect({ kind: 'heal', n: 8 }, rosterTargets(run));
  check('roster: will not heal a dead member', did === false && dead.hp === 0);
}
{
  const u = fakeUnit('u1', 5, { leader: true });
  const run = fakeRun([]);
  resolveEffect({ kind: 'heal', n: 8 }, battleTargets(run, fakeBattle([u])));
  check('battle: heals the leader unit by n', u.stats.hp === 13);
}
{
  const u = fakeUnit('u1', 2, { leader: true });
  const run = fakeRun([]);
  resolveEffect({ kind: 'heal', n: 999 }, battleTargets(run, fakeBattle([u])));
  check('battle: clamps to maxHp', u.stats.hp === u.stats.maxHp);
}
{
  // a corpse on the field is filtered out of players, so there is no target
  const dead = fakeUnit('u1', 0, { leader: true });
  const run = fakeRun([]);
  const did = resolveEffect({ kind: 'heal', n: 8 }, battleTargets(run, fakeBattle([dead])));
  check('battle: a dead unit is not a heal target', did === false && dead.stats.hp === 0);
}
{
  // no useSprites unit -> falls back to the first living player
  const other = fakeUnit('u2', 4);
  const run = fakeRun([]);
  resolveEffect({ kind: 'heal', n: 3 }, battleTargets(run, fakeBattle([other])));
  check('battle: falls back to the first living player as leader', other.stats.hp === 7);
}
{
  const enemy = fakeUnit('e1', 4, { team: 'enemy' });
  const run = fakeRun([]);
  const did = resolveEffect({ kind: 'heal', n: 5 }, battleTargets(run, fakeBattle([enemy])));
  check('battle: never heals the enemy team', did === false && enemy.stats.hp === 4);
}

// ---- healAll ---------------------------------------------------------------
console.log('healAll');
{
  const a = member({ name: 'A', leader: true, hp: 5 });
  const b = member({ name: 'B', hp: 6 });
  const dead = member({ name: 'Dead', hp: 0 });
  const run = fakeRun([a, b, dead]);
  const did = resolveEffect({ kind: 'healAll', n: 5 }, rosterTargets(run));
  check('roster: heals every LIVING member',
    did && a.hp === 10 && b.hp === 11 && dead.hp === 0);
}
{
  const a = member({ name: 'A', leader: true, hp: 5 });
  const full = member({ name: 'Full' });
  const run = fakeRun([a, full]);
  resolveEffect({ kind: 'healAll', n: 999 }, rosterTargets(run));
  check('roster: clamps each member to its own maxHp',
    a.hp === maxOf(a) && full.hp === maxOf(full));
}
{
  const run = fakeRun([member({ name: 'Full', leader: true })]);
  check('roster: refuses when everyone is already full',
    resolveEffect({ kind: 'healAll', n: 5 }, rosterTargets(run)) === false);
}
{
  const a = fakeUnit('u1', 5, { leader: true });
  const b = fakeUnit('u2', 6);
  const dead = fakeUnit('u3', 0);
  const enemy = fakeUnit('e1', 3, { team: 'enemy' });
  const run = fakeRun([]);
  const did = resolveEffect({ kind: 'healAll', n: 5 }, battleTargets(run, fakeBattle([a, b, dead, enemy])));
  check('battle: heals living players only, never the dead or the enemy',
    did && a.stats.hp === 10 && b.stats.hp === 11 && dead.stats.hp === 0 && enemy.stats.hp === 3);
}

// ---- revive ----------------------------------------------------------------
console.log('revive');
{
  const lead = member({ name: 'Lead', leader: true });
  const dead = member({ name: 'Dead', hp: 0 });
  const run = fakeRun([lead, dead]);
  const did = resolveEffect({ kind: 'revive' }, rosterTargets(run));
  check('roster: restores a fallen member at half max HP',
    did && dead.hp === Math.ceil(maxOf(dead) / 2));
}
{
  const run = fakeRun([member({ name: 'Lead', leader: true })]);
  check('roster: refuses when nobody has fallen',
    resolveEffect({ kind: 'revive' }, rosterTargets(run)) === false);
}
{
  // the deliberate difference: someone who fell in an EARLIER battle (no unit
  // on this field) can come back...
  const onField = member({ name: 'Downed', id: 'm1', hp: 0 });
  const earlier = member({ name: 'Earlier', id: 'm2', hp: 0 });
  const run = fakeRun([onField, earlier]);
  const battle = fakeBattle([fakeUnit('m1', 0), fakeUnit('u9', 10, { leader: true })]);
  const did = resolveEffect({ kind: 'revive' }, battleTargets(run, battle));
  check('battle: revives the hero who fell in an EARLIER battle',
    did && earlier.hp === Math.ceil(maxOf(earlier) / 2));
  check('battle: leaves the corpse ON this field alone (writeBack would re-down it)',
    onField.hp === 0);
}
{
  // ...and when the only fallen hero IS on the field, the item is refused
  const onField = member({ name: 'Downed', id: 'm1', hp: 0 });
  const run = fakeRun([onField]);
  const battle = fakeBattle([fakeUnit('m1', 0), fakeUnit('u9', 10, { leader: true })]);
  const did = resolveEffect({ kind: 'revive' }, battleTargets(run, battle));
  check('battle: refuses when the only fallen hero is on this field',
    did === false && onField.hp === 0);
}

// ---- xp --------------------------------------------------------------------
console.log('xp');
{
  const lead = member({ name: 'Lead', leader: true, xp: 3 });
  const run = fakeRun([lead]);
  const did = resolveEffect({ kind: 'xp', n: 2 }, rosterTargets(run));
  check('roster: grants xp to the leader', did && lead.xp === 5);
}
{
  // THE DRIFT FIX: main.js's roster path did `leader.xp += n` with no guard,
  // so an empty squad threw a TypeError. The battle path guarded it.
  const run = fakeRun([]);
  let threw = false;
  let did = null;
  try { did = resolveEffect({ kind: 'xp', n: 2 }, rosterTargets(run)); } catch { threw = true; }
  check('roster: xp is a no-op with no leader (was a TypeError)', !threw && did === false);
}
{
  const run = fakeRun([]);
  let threw = false;
  let did = null;
  try { did = resolveEffect({ kind: 'xp', n: 2 }, battleTargets(run, fakeBattle([]))); } catch { threw = true; }
  check('battle: xp is a no-op with no living unit', !threw && did === false);
}
{
  // same class of bug, same fix: heal on an empty squad must not throw either
  const run = fakeRun([]);
  let threw = false;
  try { resolveEffect({ kind: 'heal', n: 8 }, rosterTargets(run)); } catch { threw = true; }
  check('roster: heal with no leader does not throw', !threw);
}
{
  const u = fakeUnit('u1', 10, { leader: true, xp: 1 });
  const run = fakeRun([]);
  resolveEffect({ kind: 'xp', n: 2 }, battleTargets(run, fakeBattle([u])));
  check('battle: grants xp to the leader unit', u.xp === 3);
}

// ---- buff ------------------------------------------------------------------
// Battle-scoped: it raises the LIVE unit's stats and is discarded with the
// unit at writeBack. It must never touch buffAtk, which is Inspire's.
console.log('buff');
{
  const u = buffableUnit('u1', 10, { leader: true });
  const base = u.stats.atk;
  const run = fakeRun([]);
  const did = resolveEffect({ kind: 'buff', stat: 'atk', n: 3 }, battleTargets(run, fakeBattle([u])));
  check('battle: raises the leader unit\'s ATK', did && u.stats.atk === base + 3);
  check('battle: records the buff on the unit', u.buffs.length === 1 && u.buffs[0].n === 3);
}
{
  // the Ranger's dagger profile is fed by the same atk bonus as the bow
  const u = buffableUnit('r1', 10, { leader: true, classId: 'ranger' });
  const bow = u.stats.atk;
  const dagger = u.stats.closeRange.atk;
  const run = fakeRun([]);
  resolveEffect({ kind: 'buff', stat: 'atk', n: 3 }, battleTargets(run, fakeBattle([u])));
  check('battle: raises closeRange.atk too (ranger keeps the buff in melee)',
    u.stats.atk === bow + 3 && u.stats.closeRange.atk === dagger + 3);
}
{
  const u = buffableUnit('u1', 10, { leader: true });
  const run = fakeRun([]);
  const t = battleTargets(run, fakeBattle([u]));
  resolveEffect({ kind: 'buff', stat: 'atk', n: 3 }, t);
  check('battle: leaves buffAtk at 0 so Inspire is unaffected', u.buffAtk === 0);
  resolveEffect({ kind: 'buff', stat: 'atk', n: 3 }, t);
  check('battle: a second tonic stacks additively',
    u.stats.atk === CLASSES.fighter.atk + 6 && u.buffs.length === 2);
}
{
  const u = buffableUnit('u1', 10, { leader: true });
  const base = { def: u.stats.def, spd: u.stats.spd };
  const run = fakeRun([]);
  const t = battleTargets(run, fakeBattle([u]));
  const d = resolveEffect({ kind: 'buff', stat: 'def', n: 2 }, t);
  const s = resolveEffect({ kind: 'buff', stat: 'spd', n: 1 }, t);
  check('battle: def and spd need no new kind',
    d && s && u.stats.def === base.def + 2 && u.stats.spd === base.spd + 1);
}
{
  const u = buffableUnit('u1', 10, { leader: true });
  const before = { ...u.stats };
  const run = fakeRun([]);
  const t = battleTargets(run, fakeBattle([u]));
  const bogus = resolveEffect({ kind: 'buff', stat: 'luck', n: 3 }, t);
  const missing = resolveEffect({ kind: 'buff', n: 3 }, t);
  const nan = resolveEffect({ kind: 'buff', stat: 'atk' }, t);
  check('battle: an unknown, missing or amount-less stat is refused (no NaN)',
    bogus === false && missing === false && nan === false
    && u.stats.atk === before.atk && u.buffs.length === 0);
}
{
  // between rooms there is no live Unit to hold the buff, so the tonic is kept
  const lead = member({ name: 'Lead', leader: true });
  const run = fakeRun([lead], ['strength_tonic']);
  const ok = consumeFromRun(run, 'strength_tonic', rosterTargets(run));
  check('roster: refuses a buff and keeps the item',
    ok === false && run.inventory.length === 1 && run.saves === 0);
}
{
  const u = buffableUnit('u1', 10, { leader: true });
  const base = u.stats.atk;
  const run = fakeRun([], ['strength_tonic']);
  const ok = consumeFromRun(run, 'strength_tonic', battleTargets(run, fakeBattle([u])));
  check('battle: the shipped Strength Tonic grants +3 ATK and is spent',
    ok && u.stats.atk === base + 3 && run.inventory.length === 0 && run.saves === 1);
}
{
  // the fx hook is what draws the gold burst + "+n ATK" floater
  const u = buffableUnit('u1', 10, { leader: true });
  const fx = [];
  const battle = { units: [u], onFx: (e) => fx.push(e) };
  resolveEffect({ kind: 'buff', stat: 'atk', n: 3 }, battleTargets(fakeRun([]), battle));
  check('battle: fires the buff fx once, on the drinker',
    fx.length === 1 && fx[0].kind === 'buff' && fx[0].target === u && fx[0].amount === 3);
}
{
  // a unit built from a saved buff list (forward-compat with run scope)
  const u = new Unit(fakeRoom, null, 0, 0, { classId: 'ranger', buffs: [{ stat: 'atk', n: 2 }] });
  check('constructor: opts.buffs folds into stats at build time',
    u.stats.atk === CLASSES.ranger.atk + 2
    && u.stats.closeRange.atk === CLASSES.ranger.closeRange.atk + 2);
}

// ---- unknown / malformed ---------------------------------------------------
console.log('guards');
{
  const run = fakeRun([member({ name: 'Lead', leader: true, hp: 1 })]);
  check('an unknown kind resolves to false (item not eaten)',
    resolveEffect({ kind: 'transmute', n: 3 }, rosterTargets(run)) === false);
  check('a missing effect resolves to false', resolveEffect(null, rosterTargets(run)) === false);
  check('missing targets resolve to false', resolveEffect({ kind: 'heal', n: 1 }, null) === false);
}

// ---- consumeFromRun: inventory + save bookkeeping ---------------------------
console.log('consumeFromRun');
{
  const lead = member({ name: 'Lead', leader: true, hp: 5 });
  const run = fakeRun([lead], ['health_potion', 'grand_elixir']);
  const ok = consumeFromRun(run, 'health_potion', rosterTargets(run));
  check('spends the item and saves on success',
    ok && run.inventory.length === 1 && !run.inventory.includes('health_potion') && run.saves === 1);
  check('and the effect landed', lead.hp === 5 + CONSUMABLES.health_potion.effect.n);
}
{
  const lead = member({ name: 'Lead', leader: true }); // full HP
  const run = fakeRun([lead], ['health_potion']);
  const ok = consumeFromRun(run, 'health_potion', rosterTargets(run));
  check('a wasted effect keeps the item and does not save',
    ok === false && run.inventory.length === 1 && run.saves === 0);
}
{
  const run = fakeRun([member({ name: 'Lead', leader: true, hp: 1 })], []);
  check('an item not in the backpack is refused',
    consumeFromRun(run, 'health_potion', rosterTargets(run)) === false && run.saves === 0);
}
{
  const run = fakeRun([member({ name: 'Lead', leader: true, hp: 1 })], ['iron_sword']);
  check('a non-consumable is refused',
    consumeFromRun(run, 'iron_sword', rosterTargets(run)) === false && run.inventory.length === 1);
}
{
  check('a null run is refused', consumeFromRun(null, 'health_potion', null) === false);
}
{
  // every shipped consumable resolves through SOME adapter. Most kinds land on
  // the roster; `buff` is battle-scoped by design, so it is asserted through
  // the battle adapter instead (see the buff section below for the refusal).
  const kinds = new Set(Object.values(CONSUMABLES).map((c) => c.effect.kind));
  check('every shipped consumable kind is handled by the resolver',
    [...kinds].every((kind) => {
      const lead = member({ name: 'Lead', leader: true, hp: 1 });
      const dead = member({ name: 'Dead', hp: 0 });
      const run = fakeRun([lead, dead]);
      if (kind === 'buff') {
        const u = buffableUnit('u1', 10, { leader: true });
        return resolveEffect({ kind, stat: 'atk', n: 1 }, battleTargets(run, fakeBattle([u]))) === true;
      }
      return resolveEffect({ kind, n: 1 }, rosterTargets(run)) === true;
    }));
}

console.log(failed ? `\n${failed} test(s) failed` : '\nall consumable-effect tests passed');
process.exit(failed ? 1 : 0);
