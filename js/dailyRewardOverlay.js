// Daily Rewards overlay — the in-game "Wheel of Fortune" popup.
//
// UI only: all gating/streak/landing lives in js/dailyReward.js (pure, tested).
// This renders the hd-ui modal, plays the authentic habbowheel SWF animation on
// a canvas, and lands on the DETERMINISTIC wedge the pure module chose for today
// (never a client-side random — the spin is theatre over a decided outcome).
//
// The wheel art is the extracted furni (assets/ui/wheel/{sheet.png,data.json}):
// a rotating pointer + rim light-chase, drawn frame-by-frame like the old Flash
// client (the disc is isometric, so it is NOT a CSS rotation).
import {
  WEDGES,
  loadDaily,
  saveDaily,
  canClaim,
  landWedge,
  resolveReward,
  claim,
  dayStamp,
} from './dailyReward.js';
import { ensureWheelAssets, wheelData, drawWheelFrame, playWheelClip } from './wheelArt.js';

// thin local aliases so the render code below reads unchanged
const ensureAssets = ensureWheelAssets;
const drawFrame = drawWheelFrame;
const playClip = playWheelClip;

// Open the daily-rewards popup.
//   host        : element to mount into (defaults to document.body)
//   applyPayout : (resolved) => summaryString — grants the reward to the active
//                 run or banks it into a pot (injected by main.js). Called once,
//                 only on a real claim.
//   reduce      : force reduced-motion (tests); defaults to the media query
// Returns { close }.
export async function openDailyReward({ host = document.body, applyPayout, reduce, onClose } = {}) {
  await ensureAssets();
  const data = wheelData(); // frames / anims / poses (loaded above)

  const reduceMotion =
    reduce != null ? reduce : window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let state = loadDaily();
  const today = dayStamp();
  let claimable = canClaim(state, today);
  let phase = claimable ? 'idle' : 'done'; // idle -> spinning -> landed -> done
  let wonWedge = claimable ? null : null;
  let stopWheel = null;
  const lastFocus = document.activeElement;

  // ---- DOM ------------------------------------------------------------------
  const backdrop = document.createElement('div');
  backdrop.className = 'dr-backdrop hd-ui';
  backdrop.setAttribute('role', 'presentation');
  backdrop.innerHTML = `
    <div class="dr-modal hd-card" role="dialog" aria-modal="true" aria-labelledby="drTitle">
      <div class="hd-card-header dr-head">
        <span id="drTitle">Daily Rewards</span>
        <span class="dr-x" role="button" tabindex="0" aria-label="Close">&times;</span>
      </div>
      <div class="hd-card-body" style="display:flex;flex-direction:column;gap:14px">
        <div class="dr-stage">
          <div class="dr-wheel-col">
            <div class="dr-wheel-wrap"><canvas class="dr-wheel" width="124" height="128" aria-hidden="true"></canvas></div>
            <div class="dr-result" role="status" aria-live="polite"></div>
          </div>
          <div class="dr-legend-col">
            <p class="dr-leg-title">Today's prize wheel &middot; 10 wedges</p>
            <div class="dr-legend"></div>
          </div>
        </div>
        <div class="dr-streak">
          <div class="dr-pips" aria-hidden="true"></div>
          <span class="dr-streak-txt"></span>
        </div>
        <div class="dr-cta"><button class="hd-btn hd-btn--green dr-spin" style="font-size:18px;padding:9px 28px"></button></div>
        <div class="dr-cooldown" hidden></div>
      </div>
    </div>`;
  host.appendChild(backdrop);

  const $ = (sel) => backdrop.querySelector(sel);
  const wheelCv = $('.dr-wheel');
  const spinBtn = $('.dr-spin');
  const resultEl = $('.dr-result');
  const cooldownEl = $('.dr-cooldown');

  // legend
  $('.dr-legend').innerHTML = WEDGES.map(
    (w) =>
      `<div class="dr-leg" data-seg="${w.no}"><span class="dr-sw" style="background:${w.sw}"></span><span class="dr-no">#${w.no}</span><span class="dr-amt">${w.label}</span></div>`
  ).join('');

  // streak row (7 pips; the current streak day is highlighted)
  function renderStreak() {
    const today7 = Math.max(1, Math.min(7, claimable ? state.streak + 1 : state.streak || 1));
    $('.dr-pips').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const n = i + 1;
      const cls = n < today7 ? 'dr-pip on' : n === today7 ? 'dr-pip today' : 'dr-pip';
      return `<span class="${cls}"></span>`;
    }).join('');
    const showDay = claimable ? state.streak + 1 : state.streak;
    $('.dr-streak-txt').innerHTML =
      `Daily streak: <b>Day ${showDay || 0}</b> &middot; one free spin a day. Miss a day and it resets.`;
  }

  function highlightWon(seg) {
    for (const l of backdrop.querySelectorAll('.dr-leg')) l.classList.remove('won');
    const leg = backdrop.querySelector(`.dr-leg[data-seg="${seg}"]`);
    if (leg) {
      leg.classList.add('won');
      leg.scrollIntoView({ block: 'nearest' });
    }
  }

  // idle marquee light-chase until the player spins
  function idle() {
    stopWheel && stopWheel();
    stopWheel = playClip('lights', 2, wheelCv);
  }

  function renderPhase() {
    renderStreak();
    if (phase === 'idle') {
      resultEl.innerHTML = "Spin the wheel for today's reward!";
      spinBtn.textContent = 'Spin to Claim \u25b8';
      spinBtn.className = 'hd-btn hd-btn--green dr-spin';
      spinBtn.disabled = false;
      cooldownEl.hidden = true;
    } else if (phase === 'spinning') {
      resultEl.textContent = 'Good luck!';
      spinBtn.textContent = 'Spinning\u2026';
      spinBtn.disabled = true;
    } else if (phase === 'landed') {
      const label = wonWedge ? WEDGES[wonWedge - 1].label : '';
      resultEl.innerHTML = `<span class="dr-win">You won ${label}!</span>`;
      spinBtn.textContent = `Claim ${label} \u2713`;
      spinBtn.className = 'hd-btn dr-spin';
      spinBtn.disabled = false;
    } else if (phase === 'done') {
      // already claimed today (either just now, or on load)
      const wedge = wonWedge != null ? wonWedge : landWedge(state, state.lastClaimDay || today);
      drawFrame(data.poses.land[2][wedge - 1], wheelCv);
      highlightWon(wedge);
      resultEl.innerHTML = wonWedge
        ? `<span class="dr-win">You won ${WEDGES[wonWedge - 1].label}!</span>`
        : 'Come back tomorrow for another spin!';
      spinBtn.textContent = 'Claimed for today';
      spinBtn.className = 'hd-btn dr-spin';
      spinBtn.disabled = true;
      cooldownEl.hidden = false;
      // note: no em-dash — the Volter bitmap font renders it as a music glyph
      cooldownEl.innerHTML = 'Your free spin resets tomorrow. Keep the streak alive!';
    }
  }

  // ---- spin -> land (deterministic) -> claim + payout ----------------------
  function landAndClaim(wedgeNo) {
    // Persist the claim through the pure module (guards double-claim, advances
    // streak). Guarded, so a race can't double-pay.
    const out = claim(state, today);
    if (!out) {
      // someone already claimed (e.g. another tab) — reflect that
      state = loadDaily();
      claimable = false;
      phase = 'done';
      renderPhase();
      return;
    }
    state = out.state;
    saveDaily(state);
    claimable = false; // today's spin is now spent -> streak display shows the actual day
    wonWedge = out.wedgeNo;
    const summary = applyPayout ? applyPayout(out.resolved) : out.resolved.label;
    drawFrame(data.poses.land[2][wonWedge - 1], wheelCv);
    highlightWon(wonWedge);
    phase = 'landed';
    renderPhase();
    if (summary) {
      resultEl.innerHTML = `<span class="dr-win">You won ${WEDGES[wonWedge - 1].label}!</span> <span class="dr-sub">${summary}</span>`;
    }
  }

  function onSpin() {
    if (phase === 'idle') {
      if (!canClaim(state, today)) {
        phase = 'done';
        renderPhase();
        return;
      }
      phase = 'spinning';
      renderPhase();
      const wedgeNo = landWedge(state, today); // decide BEFORE the animation
      stopWheel && stopWheel();
      if (reduceMotion) {
        landAndClaim(wedgeNo);
        return;
      }
      stopWheel = playClip('spin', 2, wheelCv, { loop: false, onEnd: () => landAndClaim(wedgeNo) });
    } else if (phase === 'landed') {
      // acknowledge -> settle into the claimed/cooldown state
      phase = 'done';
      renderPhase();
    }
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    stopWheel && stopWheel();
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    lastFocus && lastFocus.focus && lastFocus.focus();
    onClose && onClose();
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  // wire events
  spinBtn.addEventListener('click', onSpin);
  $('.dr-x').addEventListener('click', close);
  $('.dr-x').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      close();
    }
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);

  // first paint
  renderPhase();
  if (phase !== 'done') idle();
  spinBtn.focus();

  return { close, get phase() { return phase; } };
}
