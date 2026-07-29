import { specimen, section, el } from '../registry.js';
import { card, pill } from './kit.js';

export const cards = section({
  id: 'ks/hd/cards',
  title: 'Cards',
  blurb: 'The white panel every overlay screen is assembled from.',
  specimens: [
    specimen({
      id: 'ks/hd/card',
      classes: 'hd-card',
      purpose: 'White panel: 1px ink border, 15px radius, soft drop shadow.',
      sources: ['js/main.js', 'js/runController.js', 'js/screens/retroTitle.js', 'js/dailyRewardOverlay.js'],
      variants: [
        { label: 'with header', render: () => card('Player Identity', el('p', {}, 'Body copy sits on white.')) },
        { label: 'body only', classes: 'hd-card', render: () => card(null, el('p', {}, 'No header strip.')) },
      ],
    }),
    specimen({
      id: 'ks/hd/card-body',
      classes: 'hd-card-body',
      purpose: '18px padded card interior.',
      sources: ['js/main.js', 'js/runController.js', 'js/screens/retroTitle.js', 'js/dailyRewardOverlay.js', 'tests/e2e/coopFallen.e2e.mjs'],
      highlight: '.hd-card-body',
      variants: [{ label: 'in context', render: () => card('Expedition Records', pill('Gold carried', '128')) }],
    }),
    specimen({
      id: 'ks/hd/card-header',
      classes: 'hd-card-header',
      purpose: 'Crimson title strip capping a card.',
      sources: ['js/main.js', 'js/runController.js', 'js/screens/retroTitle.js', 'js/dailyRewardOverlay.js'],
      highlight: '.hd-card-header',
      variants: [{ label: 'in context', render: () => card('Origins Skill Trees', el('p', {}, 'Header is always crimson.')) }],
    }),
    specimen({
      id: 'ks/hd/card-well',
      classes: 'hd-card-well',
      purpose: 'Tinted logo or art well inside a card, above the body.',
      status: 'spare',
      sources: [],
      highlight: '.hd-card-well',
      variants: [
        {
          label: 'as designed',
          render: () =>
            el(
              'div',
              { class: 'hd-card' },
              el('div', { class: 'hd-card-header' }, 'Habbo Dungeons'),
              el(
                'div',
                { class: 'hd-card-well' },
                el('img', { src: 'assets/ui/logos/habbo-dungeons-club.gif', alt: 'Habbo Dungeons', style: 'image-rendering:pixelated' }),
              ),
              el('div', { class: 'hd-card-body' }, el('p', {}, 'Well sits between header and body.')),
            ),
        },
      ],
    }),
  ],
});
