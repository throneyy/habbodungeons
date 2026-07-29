import { specimen, section, el } from '../registry.js';
import { btn } from './kit.js';

export const buttons = section({
  id: 'ks/hd/buttons',
  title: 'Buttons',
  blurb: 'One chunky button with four colour modifiers. Hover and press are real CSS states, so they are documented rather than faked; move a pointer over a specimen to see them.',
  specimens: [
    specimen({
      id: 'ks/hd/btn',
      classes: 'hd-btn',
      purpose: 'Crimson action button with the kit\u2019s 3px hard drop shadow.',
      sources: ['js/main.js', 'js/runController.js', 'js/screens/retroTitle.js', 'js/dailyRewardOverlay.js'],
      variants: [{ label: 'default', render: () => btn('Open Inventory') }],
      pseudo: [
        { name: ':hover', effect: 'Rises 1px, drop grows to 4px.' },
        { name: ':active', effect: 'Sinks 1px, drop collapses to 1px.' },
        { name: ':disabled', effect: 'Muted ink on beige, no transform, default cursor.' },
      ],
    }),
    specimen({
      id: 'ks/hd/btn-green',
      classes: 'hd-btn hd-btn--green',
      purpose: 'Positive or primary action colour.',
      sources: ['js/main.js', 'js/runController.js', 'js/screens/retroTitle.js', 'js/dailyRewardOverlay.js'],
      variants: [
        { label: 'default', classes: 'hd-btn', render: () => btn('Cancel') },
        { label: 'green', classes: 'hd-btn hd-btn--green', render: () => btn('Begin a Descent', 'hd-btn--green') },
      ],
      pseudo: [{ name: ':hover', effect: 'Fill lightens to #00ab54, border to #b9f373.' }],
    }),
    specimen({
      id: 'ks/hd/btn-white',
      classes: 'hd-btn hd-btn--white',
      purpose: 'Secondary or outline button.',
      sources: ['js/main.js', 'js/runController.js', 'js/screens/retroTitle.js'],
      variants: [{ label: 'white', render: () => btn('Habbo Account', 'hd-btn--white') }],
      pseudo: [{ name: ':hover', effect: 'Fill goes lightgray.' }],
    }),
    specimen({
      id: 'ks/hd/btn-red',
      classes: 'hd-btn hd-btn--red',
      purpose: 'Destructive action colour.',
      status: 'spare',
      sources: [],
      note: 'Complete and ready. Nothing in the game currently offers a destructive action through the kit.',
      variants: [
        { label: 'default', classes: 'hd-btn', render: () => btn('Leave the descent') },
        { label: 'red', classes: 'hd-btn hd-btn--red', render: () => btn('Abandon run', 'hd-btn--red') },
      ],
    }),
    specimen({
      id: 'ks/hd/btn-disabled',
      classes: 'hd-btn hd-btn--disabled',
      purpose: 'Disabled look for elements that cannot carry the disabled attribute.',
      sources: ['js/screens/retroTitle.js'],
      variants: [
        { label: 'modifier', classes: 'hd-btn hd-btn--disabled', render: () => btn('Continue Run', 'hd-btn--disabled') },
        {
          label: 'real attribute',
          classes: 'hd-btn[disabled]',
          note: 'Same rule set, reached through :disabled.',
          render: () => btn('Continue Run', '', { disabled: true }),
        },
      ],
    }),
  ],
});
