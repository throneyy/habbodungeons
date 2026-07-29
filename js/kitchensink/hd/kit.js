// Shared builders for the hd-* catalog sections.
//
// These reproduce the app's own markup so a specimen is the real component,
// not an approximation of it: card/pill/btn mirror the shapes js/main.js
// emits, and wheelCanvas paints the same habbowheel sheet the daily-rewards
// UI uses. Anything used by exactly one section stays in that section's
// module instead of here.
import { el } from '../registry.js';
import { ensureWheelAssets, drawWheelFrame, wheelData } from '../../wheelArt.js';

export function card(header, bodyKids, cardClass = 'hd-card') {
  return el(
    'div',
    { class: cardClass },
    header ? el('div', { class: 'hd-card-header' }, header) : null,
    el('div', { class: 'hd-card-body' }, bodyKids),
  );
}

export function pill(label, value) {
  return el(
    'div',
    { class: 'hd-pill' },
    el('span', {}, label),
    el('span', { class: 'hd-pill-value' }, value),
  );
}

export function btn(label, mod = '', attrs = {}) {
  return el('button', { type: 'button', class: `hd-btn${mod ? ` ${mod}` : ''}`, ...attrs }, label);
}

// A wheel canvas showing the idle pose. Deliberately ONE STATIC FRAME: the app
// runs an endless light-chase here, and a catalog that animates forever is
// unreadable and makes every screenshot differ. The motion is documented in the
// specimen note instead.
export function wheelCanvas(dir, w, h) {
  const cv = el('canvas', { class: dir === 4 ? 'dr-dock-canvas' : 'dr-wheel', width: w, height: h, 'aria-hidden': 'true' });
  ensureWheelAssets()
    .then(() => {
      const d = wheelData();
      const key = d && d.poses && d.poses.idle && d.poses.idle[String(dir)];
      if (key) drawWheelFrame(key, cv);
    })
    .catch(() => {
      /* art unavailable offline; the frame still shows the socket it lives in */
    });
  return cv;
}
