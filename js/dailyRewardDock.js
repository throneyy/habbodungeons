// Daily Rewards dock — the always-visible "Daily Spin" widget pinned to the
// bottom-right of the square while you roam. It advertises the once-a-day spin
// (a pulsing alert badge when a claim is available), plays the wheel's idle
// light-chase, and opens the full Daily Rewards popup on click.
//
// UI only: gating/streak/payout live in js/dailyReward.js (pure, tested). This
// just reflects canClaim() and hands off to the popup opener injected by main.js.
import { loadDaily, canClaim } from './dailyReward.js';
import { ensureWheelAssets, playWheelClip } from './wheelArt.js';

const ALERT_ICON = 'assets/ui/icons/alert.png';

// Mount the dock into `host`. `onOpen` opens the popup (main.js wires it to the
// same openDailyWheel() the Gatekeeper uses) and resolves when the popup closes,
// so the dock can refresh its claimable state. Returns { destroy, refresh }.
export function mountDailyDock({ host = document.body, onOpen } = {}) {
  const el = document.createElement('div');
  el.className = 'dr-dock hd-ui';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.innerHTML = `
    <img class="dr-dock-dot" src="${ALERT_ICON}" alt="" aria-hidden="true" hidden />
    <span class="dr-dock-head">Daily Spin</span>
    <span class="dr-dock-canvas-wrap"><canvas class="dr-dock-canvas" width="124" height="128" aria-hidden="true"></canvas></span>
    <span class="dr-dock-foot"><span class="dr-dock-cta"></span></span>`;
  host.appendChild(el);

  const dot = el.querySelector('.dr-dock-dot');
  const cta = el.querySelector('.dr-dock-cta');
  const canvas = el.querySelector('.dr-dock-canvas');
  let stopAnim = null;
  let opening = false;

  // Reflect whether today's spin is still available.
  function refresh() {
    const claimable = canClaim(loadDaily());
    dot.hidden = !claimable;
    dot.classList.toggle('pulse', claimable);
    cta.textContent = claimable ? 'Ready to claim' : 'Come back tomorrow';
    el.setAttribute(
      'aria-label',
      claimable
        ? 'Daily Spin \u2014 a free reward is ready. Open daily rewards.'
        : 'Daily Spin \u2014 claimed for today. Open daily rewards.'
    );
  }

  async function open() {
    if (opening) return;
    opening = true;
    try {
      // main.js resolves this once the popup has been opened; it also calls our
      // refresh() when the popup closes (so the badge clears after a claim).
      onOpen && (await onOpen());
    } finally {
      opening = false;
    }
  }

  el.addEventListener('click', open);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });

  // start the idle marquee light-chase (dir 4, the compact bottom-right view)
  ensureWheelAssets()
    .then(() => {
      stopAnim = playWheelClip('lights', 4, canvas);
    })
    .catch(() => {
      /* asset load failed; the dock still opens the popup, just static */
    });

  refresh();

  return {
    refresh,
    destroy() {
      stopAnim && stopAnim();
      el.remove();
    },
  };
}
