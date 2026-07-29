import { specimen, section, el } from '../registry.js';
import { card } from './kit.js';

export const layout = section({
  id: 'ks/hd/layout',
  title: 'Landing layout',
  blurb: 'Structure only. Widths mirror Bootstrap 5 container-md at 768, 992, 1200 and 1400px.',
  specimens: [
    specimen({
      id: 'ks/hd/landing',
      classes: 'hd-landing',
      purpose: 'Centred stack of full-width cards with 16px gaps and 12px side gutters.',
      sources: ['js/main.js', 'js/runController.js'],
      highlight: '.hd-landing',
      variants: [
        {
          label: 'stack',
          render: () =>
            el('div', { class: 'hd-landing', style: 'margin:0' }, [
              card('Player Identity', el('p', {}, 'First panel.')),
              card('Player Stats', el('p', {}, 'Second panel.')),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/landing-row',
      classes: 'hd-landing-row',
      purpose: 'Wrapping two or three column row inside the landing stack.',
      sources: ['js/main.js'],
      highlight: '.hd-landing-row',
      variants: [
        {
          label: 'three up',
          render: () =>
            el('div', { class: 'hd-landing-row' }, [
              card('Join Adventure', el('p', {}, 'Column one.'), 'hd-landing-col hd-card'),
              card('Loot', el('p', {}, 'Column two.'), 'hd-landing-col hd-card'),
              card('Skill Trees', el('p', {}, 'Column three.'), 'hd-landing-col hd-card'),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/landing-col',
      classes: 'hd-landing-col',
      purpose: 'Flexible column, flex: 1 1 320px, that reflows to full width when it cannot fit.',
      sources: ['js/main.js'],
      highlight: '.hd-landing-col',
      variants: [
        {
          label: 'two up',
          render: () =>
            el('div', { class: 'hd-landing-row' }, [
              card('Left', el('p', {}, 'Shares the row.'), 'hd-landing-col hd-card'),
              card('Right', el('p', {}, 'Shares the row.'), 'hd-landing-col hd-card'),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/footer',
      classes: 'hd-footer',
      purpose: 'Dim 9px footer strip closing a landing page.',
      sources: ['js/main.js'],
      variants: [
        {
          label: 'with link',
          render: () =>
            el(
              'div',
              { class: 'hd-footer' },
              el('p', { style: 'margin:0' }, [
                'Habbo Dungeons is a fan project and is not affiliated with, endorsed or sponsored by ',
                el('a', { href: '#ks/hd/footer' }, 'Habbo'),
                ' or Sulake Oy.',
              ]),
            ),
        },
      ],
      pseudo: [{ name: 'a:hover', effect: 'Link ink goes white.' }],
    }),
  ],
});
