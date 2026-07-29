import { specimen, section, el } from '../registry.js';

export const loading = section({
  id: 'ks/hd/loading',
  title: 'Loading',
  blurb: 'Website fetches only (profile search, motto verify, Habbo sync, cloud check). Never the in-game client.',
  specimens: [
    specimen({
      id: 'ks/hd/loading-row',
      classes: 'hd-loading',
      purpose: 'Pixel loading GIF beside a status line. The image is decorative; the text carries the meaning.',
      sources: ['js/main.js'],
      stage: 'card',
      variants: [
        {
          label: 'inline',
          render: () =>
            el('div', { class: 'hd-loading', role: 'status' }, [
              el('img', { src: 'assets/ui/loading-habbos.gif', alt: '' }),
              el('span', {}, 'Checking your motto'),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/loading-center',
      classes: 'hd-loading hd-loading--center',
      purpose: 'Stacked and centred variant for an otherwise empty card body.',
      sources: ['js/main.js'],
      stage: 'card',
      variants: [
        {
          label: 'centred',
          render: () =>
            el('div', { class: 'hd-loading hd-loading--center', role: 'status' }, [
              el('img', { src: 'assets/ui/loading-habbos.gif', alt: '' }),
              el('span', {}, 'Looking up that Habbo'),
            ]),
        },
      ],
    }),
  ],
});
