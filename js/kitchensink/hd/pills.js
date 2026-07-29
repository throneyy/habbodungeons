import { specimen, section, el } from '../registry.js';
import { pill } from './kit.js';

export const pillsBadges = section({
  id: 'ks/hd/pills',
  title: 'Pills and badges',
  blurb: 'Yellow data rows and small count chips. Both are staged on a card body, which is the only place they appear in the app.',
  specimens: [
    specimen({
      id: 'ks/hd/pill',
      classes: 'hd-pill',
      purpose: 'Yellow stat row: label left, value right. Stacks with an 8px gap.',
      sources: ['js/main.js', 'js/screens/retroTitle.js'],
      stage: 'card',
      variants: [
        { label: 'single', render: () => pill('Habbo name', 'Adventurer') },
        {
          label: 'stacked',
          classes: 'hd-pill + hd-pill',
          render: () => el('div', {}, [pill('Current descent', 'The Dungeon'), pill('Battles cleared', '7'), pill('Heroes standing', '3')]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/pill-value',
      classes: 'hd-pill-value',
      purpose: 'Right aligned value half of a pill.',
      sources: ['js/main.js', 'js/screens/retroTitle.js'],
      stage: 'card',
      highlight: '.hd-pill-value',
      variants: [{ label: 'in context', render: () => pill('Gold carried', '128') }],
    }),
    specimen({
      id: 'ks/hd/badge',
      classes: 'hd-badge',
      purpose: 'Small round chip for counts and short labels.',
      sources: ['js/main.js', 'js/screens/retroTitle.js'],
      stage: 'card',
      variants: [
        {
          label: 'default',
          render: () =>
            el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, [
              el('span', { class: 'hd-badge' }, 'Crypt'),
              el('span', { class: 'hd-badge' }, 'Hall'),
              el('span', { class: 'hd-badge' }, 'Vault'),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/badge-yellow',
      classes: 'hd-badge hd-badge--yellow',
      purpose: 'Yellow fill variant, used to mark a boss room or a count worth spotting.',
      sources: ['js/main.js', 'js/screens/retroTitle.js'],
      stage: 'card',
      variants: [
        { label: 'default', classes: 'hd-badge', render: () => el('span', { class: 'hd-badge' }, '4 battles') },
        { label: 'yellow', classes: 'hd-badge hd-badge--yellow', render: () => el('span', { class: 'hd-badge hd-badge--yellow' }, 'BOSS') },
      ],
    }),
  ],
});
