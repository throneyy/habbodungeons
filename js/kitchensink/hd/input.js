import { specimen, section, el } from '../registry.js';

export const inputs = section({
  id: 'ks/hd/input',
  title: 'Text input',
  blurb: 'The kit\u2019s only form control.',
  specimens: [
    specimen({
      id: 'ks/hd/input-field',
      classes: 'hd-input',
      purpose: 'White field with the same 15px radius and hard drop as the buttons.',
      sources: ['js/main.js', 'js/screens/retroTitle.js'],
      stage: 'card',
      variants: [
        {
          label: 'empty',
          classes: 'hd-input',
          render: () => el('input', { class: 'hd-input', type: 'text', placeholder: 'Habbo name', 'aria-label': 'Habbo name, empty example' }),
        },
        {
          label: 'filled',
          classes: 'hd-input',
          render: () => el('input', { class: 'hd-input', type: 'text', value: 'Adventurer', 'aria-label': 'Habbo name, filled example' }),
        },
      ],
      pseudo: [
        { name: '::placeholder', effect: 'Grey #777.' },
        { name: ':focus', effect: 'Inset 2px green outline. Click a field above to see it.' },
      ],
    }),
  ],
});
