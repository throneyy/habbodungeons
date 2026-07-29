import { specimen, section, el } from '../registry.js';
import { card } from './kit.js';

export const shell = section({
  id: 'ks/hd/shell',
  title: 'Shell and typography',
  blurb:
    'The two container classes everything else assumes. Both are staged without .hd-ui so you can see what they add rather than what they inherit.',
  specimens: [
    specimen({
      id: 'ks/hd/page',
      classes: 'hd-page',
      purpose: 'Tiled navy starfield wallpaper for the overlay and the preview board.',
      sources: ['js/main.js', 'kitchen-sink.html'],
      stage: 'bare',
      note: 'This whole page carries it on <body>, so the swatch below is the same tile you are already looking at.',
      variants: [
        {
          label: 'wallpaper tile',
          render: () => el('div', { class: 'hd-page', style: 'height:104px;border:1px solid #050a0e;border-radius:8px' }),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/ui',
      classes: 'hd-ui',
      purpose: 'Container scope: Volter at 18px, smoothing off, and the crispify filter on text.',
      sources: ['js/main.js', 'js/runController.js', 'js/dailyRewardOverlay.js', 'js/dailyRewardDock.js'],
      stage: 'bare',
      variants: [
        {
          label: 'without',
          classes: 'hd-card (no .hd-ui ancestor)',
          render: () => card('Unscoped', el('p', {}, 'Falls back to the page font.')),
        },
        {
          label: 'with',
          classes: 'hd-ui > hd-card',
          render: () => el('div', { class: 'hd-ui' }, card('Scoped', el('p', {}, 'Volter, crispified.'))),
        },
      ],
    }),
  ],
});
