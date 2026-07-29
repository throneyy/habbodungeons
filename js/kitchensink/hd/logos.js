import { specimen, section, el } from '../registry.js';

export const logos = section({
  id: 'ks/hd/logos',
  title: 'Logos',
  blurb: 'Pre-generated habbofont.net phrase art, plus a text fallback rebuilt from stacked text shadows.',
  specimens: [
    specimen({
      id: 'ks/hd/logo',
      classes: 'hd-logo',
      purpose: 'Outlined crimson Volter wordmark: white inner ring, dark outer ring, soft drop.',
      sources: ['js/main.js', 'js/roomBanner.js'],
      variants: [{ label: 'default', render: () => el('span', { class: 'hd-logo' }, 'Habbo Dungeons') }],
    }),
    specimen({
      id: 'ks/hd/logo-img',
      classes: 'hd-logo-img',
      purpose: 'Committed ribbon or club-font GIF, kept pixelated at native size.',
      sources: ['js/main.js'],
      variants: [
        {
          label: 'ribbon',
          render: () => el('img', { class: 'hd-logo-img', src: 'assets/ui/logos/player-dashboard-ribbon.gif', alt: 'PLAYER DASHBOARD' }),
        },
        {
          label: 'club',
          render: () => el('img', { class: 'hd-logo-img', src: 'assets/ui/logos/habbo-dungeons-club.gif', alt: 'Habbo Dungeons' }),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/logo-img-center',
      classes: 'hd-logo-img hd-logo-img--center',
      purpose: 'Centres a logo image in its row with auto side margins.',
      status: 'spare',
      sources: [],
      variants: [
        {
          label: 'default',
          classes: 'hd-logo-img',
          render: () => el('div', {}, el('img', { class: 'hd-logo-img', src: 'assets/ui/logos/inventory-ribbon.gif', alt: 'INVENTORY' })),
        },
        {
          label: 'centred',
          classes: 'hd-logo-img hd-logo-img--center',
          render: () =>
            el('div', {}, el('img', { class: 'hd-logo-img hd-logo-img--center', src: 'assets/ui/logos/inventory-ribbon.gif', alt: 'INVENTORY' })),
        },
      ],
    }),
  ],
});
