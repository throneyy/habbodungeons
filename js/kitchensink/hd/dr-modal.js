import { specimen, section, el } from '../registry.js';
import { WEDGES } from '../../dailyReward.js';
import { btn, wheelCanvas } from './kit.js';

function legendRow(w, won = false) {
  return el(
    'div',
    { class: `dr-leg${won ? ' won' : ''}` },
    el('span', { class: 'dr-sw', style: `background:${w.sw}` }),
    el('span', { class: 'dr-no' }, `#${w.no}`),
    el('span', { class: 'dr-amt' }, w.label),
  );
}

function pips(streak = 4) {
  return el(
    'div',
    { class: 'dr-pips', 'aria-hidden': 'true' },
    Array.from({ length: 7 }, (_, i) => {
      const n = i + 1;
      const cls = n < streak ? 'dr-pip on' : n === streak ? 'dr-pip today' : 'dr-pip';
      return el('span', { class: cls });
    }),
  );
}

// The whole daily-rewards modal, exactly as js/dailyRewardOverlay.js builds it.
// Reused by every dr-* modal specimen so each child is shown in real context.
function drModal() {
  return el(
    'div',
    { class: 'dr-modal hd-card' },
    el(
      'div',
      { class: 'hd-card-header dr-head' },
      el('span', {}, 'Daily Rewards'),
      el('span', { class: 'dr-x', role: 'img', 'aria-label': 'Close' }, '\u00d7'),
    ),
    el(
      'div',
      { class: 'hd-card-body', style: 'display:flex;flex-direction:column;gap:14px' },
      el(
        'div',
        { class: 'dr-stage' },
        el(
          'div',
          { class: 'dr-wheel-col' },
          el('div', { class: 'dr-wheel-wrap' }, wheelCanvas(2, 124, 128)),
          el(
            'div',
            { class: 'dr-result' },
            el('span', { class: 'dr-win' }, 'You won 100 Gold'),
            el('span', { class: 'dr-sub' }, 'Wedge #6'),
          ),
        ),
        el(
          'div',
          { class: 'dr-legend-col' },
          el('p', { class: 'dr-leg-title' }, "Today's prize wheel \u00b7 10 wedges"),
          el('div', {}, WEDGES.slice(0, 6).map((w) => legendRow(w, w.no === 6))),
        ),
      ),
      el('div', { class: 'dr-streak' }, pips(4), el('span', { class: 'dr-streak-txt' }, [
        el('b', {}, '4'),
        ' day streak',
      ])),
      el('div', { class: 'dr-cta' }, btn('Spin the wheel', 'hd-btn--green', { style: 'font-size:18px;padding:9px 28px' })),
      el('div', { class: 'dr-cooldown' }, 'Next spin in 7h 12m'),
    ),
  );
}

export const drModalSection = section({
  id: 'ks/dr/modal',
  title: 'Daily rewards modal',
  blurb:
    'The claim popup from js/dailyRewardOverlay.js. The wheel canvas shows one static idle frame here; in the app it runs a continuous light chase.',
  specimens: [
    specimen({
      id: 'ks/dr/backdrop',
      classes: 'dr-backdrop hd-ui',
      purpose: 'Fixed dimmed backdrop that centres the claim modal over the client.',
      sources: ['js/dailyRewardOverlay.js'],
      stage: 'contain',
      note: 'Staged inside a contained frame. In the app this is position:fixed and covers the viewport at z-index 60.',
      variants: [{ label: 'over the stage', render: () => el('div', { class: 'dr-backdrop' }, drModal()) }],
    }),
    specimen({
      id: 'ks/dr/modal-card',
      classes: 'dr-modal hd-card',
      purpose: 'The claim card itself: 560px maximum, scrolls when the viewport is short.',
      sources: ['js/dailyRewardOverlay.js', 'tests/e2e/dailyReward.e2e.mjs'],
      note: 'Its dr-pop entry animation is suppressed under prefers-reduced-motion by the kit.',
      variants: [{ label: 'whole modal', render: () => drModal() }],
    }),
    specimen({
      id: 'ks/dr/head',
      classes: 'hd-card-header dr-head',
      purpose: 'Title row of the modal: caption left, close control right.',
      sources: ['js/dailyRewardOverlay.js'],
      highlight: '.dr-head',
      variants: [{ label: 'in context', render: () => drModal() }],
    }),
    specimen({
      id: 'ks/dr/x',
      classes: 'dr-x',
      purpose: 'Close control on the crimson header.',
      sources: ['js/dailyRewardOverlay.js', 'tests/e2e/dailyReward.e2e.mjs'],
      highlight: '.dr-x',
      variants: [{ label: 'in context', render: () => drModal() }],
      pseudo: [{ name: ':hover', effect: 'Plate darkens to 34% black.' }],
    }),
    specimen({
      id: 'ks/dr/stage',
      classes: 'dr-stage',
      purpose: 'Two column area holding the wheel and the prize legend. Stacks under 520px.',
      sources: ['js/dailyRewardOverlay.js'],
      highlight: '.dr-stage',
      variants: [{ label: 'in context', render: () => drModal() }],
    }),
    specimen({
      id: 'ks/dr/wheel-col',
      classes: 'dr-wheel-col',
      purpose: 'Left column: the wheel over its result line.',
      sources: ['js/dailyRewardOverlay.js'],
      highlight: '.dr-wheel-col',
      variants: [{ label: 'in context', render: () => drModal() }],
    }),
    specimen({
      id: 'ks/dr/wheel-wrap',
      classes: 'dr-wheel-wrap',
      purpose: 'Tinted well framing the wheel canvas.',
      sources: ['js/dailyRewardOverlay.js'],
      stage: 'card',
      highlight: '.dr-wheel-wrap',
      variants: [{ label: 'alone', render: () => el('div', { class: 'dr-wheel-wrap' }, wheelCanvas(2, 124, 128)) }],
    }),
    specimen({
      id: 'ks/dr/wheel',
      classes: 'dr-wheel',
      purpose: 'The habbowheel furni canvas, pixelated, painted frame by frame.',
      sources: ['js/dailyRewardOverlay.js'],
      stage: 'card',
      highlight: '.dr-wheel',
      variants: [{ label: 'idle pose', render: () => el('div', { class: 'dr-wheel-wrap' }, wheelCanvas(2, 124, 128)) }],
    }),
    specimen({
      id: 'ks/dr/result',
      classes: 'dr-result',
      purpose: 'Live region under the wheel announcing what the spin landed on.',
      sources: ['js/dailyRewardOverlay.js', 'tests/e2e/dailyReward.e2e.mjs'],
      stage: 'card',
      variants: [
        { label: 'idle', classes: 'dr-result', render: () => el('div', { class: 'dr-result' }) },
        {
          label: 'won',
          classes: 'dr-result > dr-win + dr-sub',
          render: () =>
            el('div', { class: 'dr-result' }, [el('span', { class: 'dr-win' }, 'You won 100 Gold'), el('span', { class: 'dr-sub' }, 'Wedge #6')]),
        },
      ],
    }),
    specimen({
      id: 'ks/dr/win',
      classes: 'dr-win',
      purpose: 'Green emphasis on the winning line.',
      sources: ['js/dailyRewardOverlay.js'],
      stage: 'card',
      highlight: '.dr-win',
      variants: [
        {
          label: 'in context',
          render: () =>
            el('div', { class: 'dr-result' }, [el('span', { class: 'dr-win' }, 'You won 100 Gold'), el('span', { class: 'dr-sub' }, 'Wedge #6')]),
        },
      ],
    }),
    specimen({
      id: 'ks/dr/sub',
      classes: 'dr-sub',
      purpose: 'Small grey second line under the result.',
      sources: ['js/dailyRewardOverlay.js'],
      stage: 'card',
      highlight: '.dr-sub',
      variants: [
        {
          label: 'in context',
          render: () =>
            el('div', { class: 'dr-result' }, [el('span', { class: 'dr-win' }, 'You won 100 Gold'), el('span', { class: 'dr-sub' }, 'Wedge #6')]),
        },
      ],
    }),
    specimen({
      id: 'ks/dr/legend-col',
      classes: 'dr-legend-col',
      purpose: 'Right column holding the prize legend.',
      sources: ['js/dailyRewardOverlay.js'],
      highlight: '.dr-legend-col',
      variants: [{ label: 'in context', render: () => drModal() }],
    }),
    specimen({
      id: 'ks/dr/leg-title',
      classes: 'dr-leg-title',
      purpose: 'Uppercase caption above the legend.',
      sources: ['js/dailyRewardOverlay.js'],
      stage: 'card',
      highlight: '.dr-leg-title',
      variants: [{ label: 'alone', render: () => el('p', { class: 'dr-leg-title' }, "Today's prize wheel \u00b7 10 wedges") }],
    }),
    specimen({
      id: 'ks/dr/leg',
      classes: 'dr-leg',
      purpose: 'One yellow legend row per wedge. Gains an outline and green amount when it is the winner.',
      sources: ['js/dailyRewardOverlay.js', 'tests/e2e/dailyReward.e2e.mjs'],
      stage: 'card',
      variants: [
        { label: 'default', classes: 'dr-leg', render: () => el('div', {}, WEDGES.slice(0, 3).map((w) => legendRow(w))) },
        { label: 'won', classes: 'dr-leg won', render: () => legendRow(WEDGES[5], true) },
      ],
    }),
    specimen({
      id: 'ks/dr/sw',
      classes: 'dr-sw',
      purpose: 'Colour swatch matching that wedge on the disc.',
      sources: ['js/dailyRewardOverlay.js'],
      stage: 'card',
      highlight: '.dr-sw',
      variants: [{ label: 'in context', render: () => legendRow(WEDGES[0]) }],
    }),
    specimen({
      id: 'ks/dr/no',
      classes: 'dr-no',
      purpose: 'Wedge number, the quietest element in the row.',
      sources: ['js/dailyRewardOverlay.js'],
      stage: 'card',
      highlight: '.dr-no',
      variants: [{ label: 'in context', render: () => legendRow(WEDGES[0]) }],
    }),
    specimen({
      id: 'ks/dr/amt',
      classes: 'dr-amt',
      purpose: 'Prize amount, pushed to the right edge of the row.',
      sources: ['js/dailyRewardOverlay.js'],
      stage: 'card',
      highlight: '.dr-amt',
      variants: [
        { label: 'default', render: () => legendRow(WEDGES[0]) },
        { label: 'won', classes: 'dr-leg.won .dr-amt', render: () => legendRow(WEDGES[5], true) },
      ],
    }),
    specimen({
      id: 'ks/dr/streak',
      classes: 'dr-streak',
      purpose: 'Seven day streak row: pips beside their caption.',
      sources: ['js/dailyRewardOverlay.js'],
      stage: 'card',
      highlight: '.dr-streak',
      variants: [
        {
          label: 'day 4',
          render: () => el('div', { class: 'dr-streak' }, [pips(4), el('span', { class: 'dr-streak-txt' }, [el('b', {}, '4'), ' day streak'])]),
        },
      ],
    }),
    specimen({
      id: 'ks/dr/pips',
      classes: 'dr-pips',
      purpose: 'Container for the seven day pips.',
      sources: ['js/dailyRewardOverlay.js'],
      stage: 'card',
      highlight: '.dr-pips',
      variants: [{ label: 'day 4', render: () => pips(4) }],
    }),
    specimen({
      id: 'ks/dr/pip',
      classes: 'dr-pip',
      purpose: 'One day pip: hollow ahead of today, yellow behind it, green on today.',
      sources: ['js/dailyRewardOverlay.js'],
      stage: 'card',
      variants: [
        { label: 'day 1', classes: 'dr-pip / dr-pip today', render: () => pips(1) },
        { label: 'day 4', classes: 'dr-pip on / today', render: () => pips(4) },
        { label: 'day 7', classes: 'dr-pip on / today', render: () => pips(7) },
      ],
    }),
    specimen({
      id: 'ks/dr/streak-txt',
      classes: 'dr-streak-txt',
      purpose: 'Caption naming the streak, with the count in bold.',
      sources: ['js/dailyRewardOverlay.js'],
      stage: 'card',
      highlight: '.dr-streak-txt',
      variants: [{ label: 'in context', render: () => el('span', { class: 'dr-streak-txt' }, [el('b', {}, '4'), ' day streak']) }],
    }),
    specimen({
      id: 'ks/dr/cta',
      classes: 'dr-cta',
      purpose: 'Centred row holding the single spin or claim button.',
      sources: ['js/dailyRewardOverlay.js'],
      stage: 'card',
      highlight: '.dr-cta',
      variants: [
        {
          label: 'ready',
          render: () => el('div', { class: 'dr-cta' }, btn('Spin the wheel', 'hd-btn--green', { style: 'font-size:18px;padding:9px 28px' })),
        },
        {
          label: 'claimed',
          render: () => el('div', { class: 'dr-cta' }, btn('Come back tomorrow', 'hd-btn--disabled', { style: 'font-size:18px;padding:9px 28px' })),
        },
      ],
    }),
    specimen({
      id: 'ks/dr/cooldown',
      classes: 'dr-cooldown',
      purpose: 'Small grey line telling you when the next spin unlocks.',
      sources: ['js/dailyRewardOverlay.js', 'tests/e2e/dailyReward.e2e.mjs'],
      stage: 'card',
      variants: [{ label: 'waiting', render: () => el('div', { class: 'dr-cooldown' }, 'Next spin in 7h 12m') }],
    }),
  ],
});
