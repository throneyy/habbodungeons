// Daily-reward tests — run with:  node tests/dailyReward.test.js
// Covers the day-gate, streak increment/reset, deterministic wedge landing,
// and payout into the run economy. localStorage is shimmed like run.test.js.
globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
})();

import {
  WEDGES,
  freshState,
  dayStamp,
  prevDay,
  canClaim,
  nextStreak,
  landWedge,
  resolveReward,
  claim,
  applyReward,
  loadDaily,
  saveDaily,
  DAILY_KEY,
} from '../js/dailyReward.js';
import { Run, makeMember } from '../js/run.js';
import { buildDungeon } from '../js/dungeon.js';
import { ITEMS } from '../js/items.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

// ---- day helpers -----------------------------------------------------------
console.log('day helpers');
check('dayStamp formats local YYYY-MM-DD', dayStamp(new Date(2026, 6, 25)) === '2026-07-25');
check('prevDay steps back one calendar day', prevDay('2026-07-25') === '2026-07-24');
check('prevDay crosses a month boundary', prevDay('2026-08-01') === '2026-07-31');
check('prevDay crosses a year boundary', prevDay('2026-01-01') === '2025-12-31');

// ---- day-gate --------------------------------------------------------------
console.log('day-gate');
check('fresh state can claim today', canClaim(freshState(1), '2026-07-25') === true);
check('after claiming today, cannot claim again same day', (() => {
  const s = freshState(1);
  const out = claim(s, '2026-07-25');
  return out && canClaim(out.state, '2026-07-25') === false;
})());
check('second claim same day is blocked (returns null)', (() => {
  const s = freshState(1);
  const first = claim(s, '2026-07-25');
  const second = claim(first.state, '2026-07-25');
  return first !== null && second === null;
})());
check('a new day re-opens the spin', (() => {
  const s = freshState(1);
  const first = claim(s, '2026-07-25');
  return canClaim(first.state, '2026-07-26') === true;
})());

// ---- streak increment / reset ---------------------------------------------
console.log('streak');
check('first ever claim sets streak to 1', (() => {
  const out = claim(freshState(7), '2026-07-25');
  return out.state.streak === 1;
})());
check('consecutive-day claim increments the streak', (() => {
  let s = freshState(7);
  s = claim(s, '2026-07-25').state; // day 1
  s = claim(s, '2026-07-26').state; // day 2 (consecutive)
  s = claim(s, '2026-07-27').state; // day 3 (consecutive)
  return s.streak === 3;
})());
check('a skipped day resets the streak to 1', (() => {
  let s = freshState(7);
  s = claim(s, '2026-07-25').state; // day 1
  s = claim(s, '2026-07-26').state; // day 2 -> streak 2
  // skip the 27th entirely
  s = claim(s, '2026-07-28').state; // gap -> reset
  return s.streak === 1;
})());
check('nextStreak previews consecutive vs gap without mutating', (() => {
  let s = freshState(7);
  s = claim(s, '2026-07-25').state; // streak 1, lastClaim 25th
  const consecutive = nextStreak(s, '2026-07-26'); // 2
  const afterGap = nextStreak(s, '2026-07-30'); // 1
  return consecutive === 2 && afterGap === 1 && s.streak === 1;
})());

// ---- deterministic wedge landing ------------------------------------------
console.log('deterministic landing');
check('landWedge is stable for a fixed seed + day', (() => {
  const a = landWedge(freshState(12345), '2026-07-25');
  const b = landWedge(freshState(12345), '2026-07-25');
  return a === b;
})());
check('landWedge stays within 1..10', (() => {
  let ok = true;
  for (let d = 1; d <= 60; d++) {
    const stamp = dayStamp(new Date(2026, 0, d));
    const w = landWedge(freshState(999), stamp);
    if (w < 1 || w > WEDGES.length) ok = false;
  }
  return ok;
})());
check('different seeds diverge across days (not a constant)', (() => {
  const s1 = freshState(1), s2 = freshState(2);
  let anyDiff = false;
  for (let d = 1; d <= 30; d++) {
    const stamp = dayStamp(new Date(2026, 0, d));
    if (landWedge(s1, stamp) !== landWedge(s2, stamp)) anyDiff = true;
  }
  return anyDiff;
})());
check('the wheel exercises a spread of wedges over time', (() => {
  const s = freshState(2024);
  const seen = new Set();
  for (let d = 1; d <= 120; d++) {
    const stamp = dayStamp(new Date(2026, 0, d));
    seen.add(landWedge(s, stamp));
  }
  return seen.size >= 6; // not stuck on one or two wedges
})());
check('claim lands on exactly landWedge for the day', (() => {
  const s = freshState(555);
  const expected = landWedge(s, '2026-07-25');
  const out = claim(s, '2026-07-25');
  return out.wedgeNo === expected;
})());
check('resolveReward is deterministic (same item for same seed+day)', (() => {
  const s = freshState(88);
  // wedge 8 is a Rare Gear item wedge
  const a = resolveReward(s, 8, '2026-07-25');
  const b = resolveReward(s, 8, '2026-07-25');
  return a.kind === 'item' && a.itemId === b.itemId && !!ITEMS[a.itemId];
})());

// ---- payout into the run economy ------------------------------------------
console.log('payout');
function makeRun() {
  const squad = [makeMember('fighter', 'Hero', { leader: true })];
  const dungeon = buildDungeon('dungeon', {});
  const run = new Run({ squad, dungeon, seed: 1 });
  return run;
}
check('gold reward adds to run gold', (() => {
  const run = makeRun();
  const before = run.gold;
  const summary = applyReward({ kind: 'gold', amt: 50, label: '50 Gold' }, run);
  return run.gold === before + 50 && /50/.test(summary);
})());
check('xp reward feeds the leader and can level', (() => {
  const run = makeRun();
  const leader = run.squad.find((m) => m.leader);
  const startLevel = leader.level;
  applyReward({ kind: 'xp', amt: 40, label: '40 XP' }, run); // 40 >= level*20 at L1 -> +2 levels
  return leader.level > startLevel;
})());
check('item reward lands in the inventory', (() => {
  const run = makeRun();
  const s = freshState(88);
  const resolved = resolveReward(s, 8, '2026-07-25');
  const n = run.inventory.length;
  applyReward(resolved, run);
  return run.inventory.length === n + 1 && !!ITEMS[run.inventory[n]];
})());

// ---- persistence -----------------------------------------------------------
console.log('persistence');
check('loadDaily creates + persists a fresh state', (() => {
  localStorage.removeItem(DAILY_KEY);
  const s = loadDaily();
  return typeof s.seed === 'number' && localStorage.getItem(DAILY_KEY) !== null;
})());
check('saveDaily round-trips a claimed state', (() => {
  let s = loadDaily();
  const out = claim({ ...s, lastClaimDay: null, streak: 0 }, '2026-07-25');
  saveDaily(out.state);
  const back = loadDaily();
  return back.lastClaimDay === '2026-07-25' && back.streak === out.state.streak;
})());

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
