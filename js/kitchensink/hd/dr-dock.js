import { specimen, section, el } from '../registry.js';
import { wheelCanvas } from './kit.js';

// The dock, exactly as js/dailyRewardDock.js builds it.
function drDock({ dot = true } = {}) {
  return el(
    'div',
    { class: 'dr-dock hd-ui', role: 'img', 'aria-label': 'Daily Spin: a free reward is ready.' },
    dot ? el('img', { class: 'dr-dock-dot', src: 'assets/ui/icons/alert.png', alt: '' }) : null,
    el('span', { class: 'dr-dock-head' }, 'Daily Spin'),
    el('span', { class: 'dr-dock-canvas-wrap' }, wheelCanvas(4, 124, 128)),
    el('span', { class: 'dr-dock-foot' }, el('span', { class: 'dr-dock-cta' }, 'Ready to claim')),
  );
}

export const drDockSection = section({
  id: 'ks/dr/dock',
  title: 'Daily rewards dock',
  blurb:
    'The always visible Daily Spin widget from js/dailyRewardDock.js, pinned to the top right of the square. It hides itself entirely once the day is claimed.',
  specimens: [
    specimen({
      id: 'ks/dr/dock-widget',
      classes: 'dr-dock hd-ui',
      purpose: '150px white widget that opens the claim popup on click.',
      sources: ['js/dailyRewardDock.js', 'tests/e2e/dailyReward.e2e.mjs'],
      stage: 'contain',
      note: 'Staged inside a contained frame. In the app this is position:fixed at top 18px, right 18px.',
      variants: [{ label: 'ready to claim', render: () => drDock() }],
      pseudo: [
        { name: ':hover', effect: 'Widget rises 1px and its green pill presses in.' },
        { name: ':focus-visible', effect: '3px green outline, 2px offset.' },
      ],
    }),
    specimen({
      id: 'ks/dr/dock-head',
      classes: 'dr-dock-head',
      purpose: 'Crimson header strip naming the widget.',
      sources: ['js/dailyRewardDock.js'],
      stage: 'contain',
      highlight: '.dr-dock-head',
      variants: [{ label: 'in context', render: () => drDock({ dot: false }) }],
    }),
    specimen({
      id: 'ks/dr/dock-canvas-wrap',
      classes: 'dr-dock-canvas-wrap',
      purpose: 'White band holding the mini wheel.',
      sources: ['js/dailyRewardDock.js'],
      stage: 'contain',
      highlight: '.dr-dock-canvas-wrap',
      variants: [{ label: 'in context', render: () => drDock({ dot: false }) }],
    }),
    specimen({
      id: 'ks/dr/dock-canvas',
      classes: 'dr-dock-canvas',
      purpose: 'The dock\u2019s mini wheel canvas, drawn from direction 4 of the sheet.',
      sources: ['js/dailyRewardDock.js'],
      stage: 'contain',
      highlight: '.dr-dock-canvas',
      variants: [{ label: 'in context', render: () => drDock({ dot: false }) }],
    }),
    specimen({
      id: 'ks/dr/dock-foot',
      classes: 'dr-dock-foot',
      purpose: 'Padded footer block that holds the call to action.',
      sources: ['js/dailyRewardDock.js'],
      stage: 'contain',
      highlight: '.dr-dock-foot',
      variants: [{ label: 'in context', render: () => drDock({ dot: false }) }],
    }),
    specimen({
      id: 'ks/dr/dock-cta',
      classes: 'dr-dock-cta',
      purpose: 'Green pill reading the claim state.',
      sources: ['js/dailyRewardDock.js', 'tests/e2e/dailyReward.e2e.mjs'],
      stage: 'contain',
      highlight: '.dr-dock-cta',
      variants: [{ label: 'in context', render: () => drDock({ dot: false }) }],
      pseudo: [{ name: '.dr-dock:hover', effect: 'The pill sinks 2px and takes an inset shadow, reading as pressed.' }],
    }),
    specimen({
      id: 'ks/dr/dock-dot',
      classes: 'dr-dock-dot pulse',
      purpose: 'Habbo alert badge over the widget\u2019s corner when a claim is waiting.',
      sources: ['js/dailyRewardDock.js', 'tests/e2e/dailyReward.e2e.mjs'],
      stage: 'contain',
      highlight: '.dr-dock-dot',
      note: 'The pulse animation is suppressed under prefers-reduced-motion by the kit.',
      variants: [
        { label: 'no badge', classes: 'dr-dock-dot[hidden]', render: () => drDock({ dot: false }) },
        {
          label: 'ready',
          classes: 'dr-dock-dot pulse',
          render: () => {
            const dock = drDock();
            dock.querySelector('.dr-dock-dot').classList.add('pulse');
            return dock;
          },
        },
      ],
    }),
  ],
});
