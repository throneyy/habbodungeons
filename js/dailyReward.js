// Daily Rewards — the once-a-day "Wheel of Fortune" spin.
//
// PURE logic + persistence (no DOM); the overlay (js/dailyRewardOverlay.js)
// renders it and the animation. Kept pure so the day-gate, streak, and
// deterministic wedge landing are unit-testable under Node (tests shim
// localStorage), exactly like run.js.
//
// Determinism mirrors the run economy: the landed wedge is drawn from the same
// mulberry32/hashSeed PRNG as encounters, keyed by (per-install seed, local
// day) — so a given install lands on the same wedge for a given day, and item
// payouts roll reproducibly. The spin is gated to once per local calendar day
// and the streak increments on consecutive days / resets after a gap, like a
// classic daily login reward.
import { mulberry32, hashSeed } from './encounterGen.js';
import { rollItem, ITEMS } from './items.js';

export const DAILY_KEY = 'habbo-dungeons-daily';

// The 10 wheel wedges, in the sprite's wedge order (matches the extracted
// habbowheel landed poses 1..10). `sw` is the swatch shown in the legend,
// keyed to the wedge colour on the disc. `reward` is the economy payout:
//   gold: flat gold      xp: leader XP      item: a rollItem() of that tier
export const WEDGES = [
  { no: 1, label: '25 Gold', sw: '#c99a2e', reward: { kind: 'gold', amt: 25 } },
  { no: 2, label: 'Common Gear', sw: '#8f1f3a', reward: { kind: 'item', tier: 1 } },
  { no: 3, label: '50 Gold', sw: '#7a8f2a', reward: { kind: 'gold', amt: 50 } },
  { no: 4, label: '40 XP', sw: '#a83fb0', reward: { kind: 'xp', amt: 40 } },
  { no: 5, label: 'Fine Gear', sw: '#4f8f3a', reward: { kind: 'item', tier: 2 } },
  { no: 6, label: '100 Gold', sw: '#d0761f', reward: { kind: 'gold', amt: 100 } },
  { no: 7, label: '60 XP', sw: '#6a5b2a', reward: { kind: 'xp', amt: 60 } },
  { no: 8, label: 'Rare Gear', sw: '#3f6f9f', reward: { kind: 'item', tier: 3 } },
  { no: 9, label: '75 Gold', sw: '#c9b02e', reward: { kind: 'gold', amt: 75 } },
  { no: 10, label: 'Epic Haul', sw: '#b03030', reward: { kind: 'item', tier: 3 } },
];

// ---- day helpers (LOCAL calendar day, so "one a day" matches the player) ----

// Local YYYY-MM-DD for a Date (not UTC — the gate is about the player's day).
export function dayStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// The calendar day before a YYYY-MM-DD stamp (parsed at local noon to dodge DST
// edge cases), returned as a stamp. Used to detect a consecutive-day streak.
export function prevDay(stamp) {
  const [y, m, d] = stamp.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setDate(dt.getDate() - 1);
  return dayStamp(dt);
}

// ---- state ------------------------------------------------------------------

// A fresh install state. seed is rolled once and persisted so wedge landings
// are stable per install (pass a fixed seed in tests).
export function freshState(seed) {
  return {
    v: 1,
    seed: seed != null ? seed >>> 0 : (Math.random() * 0x100000000) >>> 0,
    lastClaimDay: null, // YYYY-MM-DD of the last claimed spin
    streak: 0, // consecutive days claimed (0 before the first spin)
    totalClaims: 0,
  };
}

// Has today's free spin NOT been taken yet?
export function canClaim(state, today = dayStamp()) {
  return !!state && state.lastClaimDay !== today;
}

// What the streak BECOMES if a spin is claimed on `today`:
//   last claim was yesterday  -> streak + 1 (consecutive)
//   last claim was today       -> unchanged (already counted; shouldn't happen
//                                 behind canClaim, but kept correct)
//   otherwise (gap or first)   -> 1 (reset / start)
export function nextStreak(state, today = dayStamp()) {
  if (!state || !state.lastClaimDay) return 1;
  if (state.lastClaimDay === today) return state.streak;
  if (state.lastClaimDay === prevDay(today)) return state.streak + 1;
  return 1;
}

// The deterministic landed wedge (1..10) for this install on this day.
export function landWedge(state, today = dayStamp()) {
  const rng = mulberry32(hashSeed(state.seed, `wheel:${today}`));
  return 1 + Math.floor(rng() * WEDGES.length);
}

// Resolve a wedge's abstract reward into a concrete grant. Item wedges roll a
// real ITEMS id from the seeded stream (same day -> same item), so the preview
// label and the actual payout always agree.
export function resolveReward(state, wedgeNo, today = dayStamp()) {
  const wedge = WEDGES[wedgeNo - 1];
  const r = wedge.reward;
  if (r.kind === 'item') {
    const rng = mulberry32(hashSeed(state.seed, `wheel-item:${today}:${wedgeNo}`));
    const itemId = rollItem(r.tier, rng);
    return { kind: 'item', itemId, label: ITEMS[itemId] ? ITEMS[itemId].name : wedge.label };
  }
  if (r.kind === 'xp') return { kind: 'xp', amt: r.amt, label: `${r.amt} XP` };
  return { kind: 'gold', amt: r.amt, label: `${r.amt} Gold` };
}

// Take today's spin: guarded by canClaim. Returns the outcome WITHOUT mutating
// the passed state (returns a new state to persist), so callers stay explicit.
//   { state, wedgeNo, resolved }  on success
//   null                          if already claimed today
export function claim(state, today = dayStamp()) {
  if (!canClaim(state, today)) return null;
  const wedgeNo = landWedge(state, today);
  const resolved = resolveReward(state, wedgeNo, today);
  const next = {
    ...state,
    lastClaimDay: today,
    streak: nextStreak(state, today),
    totalClaims: (state.totalClaims || 0) + 1,
  };
  return { state: next, wedgeNo, resolved };
}

// ---- payout into the run economy -------------------------------------------

// Roster-level XP with the run's level curve (mirrors run.js / main.js
// grantMemberXp so leveling stays consistent).
function grantMemberXp(m, n) {
  m.xp += n;
  while (m.xp >= m.level * 20) {
    m.xp -= m.level * 20;
    m.level++;
  }
}

// Apply a resolved reward to an active Run (mutates it; caller saves). Returns
// a short human summary. When there is no active run, the caller banks it into
// a pot instead (see bankReward in main.js) — this function assumes a run.
export function applyReward(resolved, run) {
  if (resolved.kind === 'gold') {
    run.addGold(resolved.amt);
    return `+${resolved.amt} gold`;
  }
  if (resolved.kind === 'xp') {
    const leader = run.squad.find((m) => m.leader) || run.squad[0];
    if (leader) grantMemberXp(leader, resolved.amt);
    return `+${resolved.amt} XP`;
  }
  if (resolved.kind === 'item') {
    run.addLoot(resolved.itemId);
    return `${ITEMS[resolved.itemId] ? ITEMS[resolved.itemId].name : resolved.itemId} added`;
  }
  return 'reward granted';
}

// ---- persistence (localStorage; cloud mirror is optional, injected) ---------

export function loadDaily() {
  let d = null;
  try {
    d = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null');
  } catch {
    d = null;
  }
  if (!d || typeof d.seed !== 'number') {
    const fresh = freshState();
    saveDaily(fresh);
    return fresh;
  }
  return d;
}

export function saveDaily(state) {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable; ignore */
  }
}
