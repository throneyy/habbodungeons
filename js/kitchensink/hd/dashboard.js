import { specimen, section, el } from '../registry.js';
import { btn } from './kit.js';

function statBlock(label, value, blue = false) {
  return el(
    'div',
    { class: `hd-statblock${blue ? ' hd-statblock--blue' : ''}` },
    el('div', { class: 'hd-statblock-label' }, label),
    el('div', { class: 'hd-statblock-value' }, value),
  );
}

export const stats = section({
  id: 'ks/hd/stats',
  title: 'Dashboard stats',
  blurb: 'The character sheet: a big level block, an HP meter, chunky stat blocks, and the three-up action row under them.',
  specimens: [
    specimen({
      id: 'ks/hd/stat-lead',
      classes: 'hd-stat-lead',
      purpose: 'Two-up lead block holding the level and the HP meter. Collapses to one column under 560px.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-stat-lead',
      variants: [
        {
          label: 'lead block',
          render: () =>
            el('div', { class: 'hd-stat-lead' }, [
              el('div', { class: 'hd-stat-big' }, [
                el('div', { class: 'hd-stat-big-label' }, 'Level'),
                el('div', { class: 'hd-stat-big-value' }, '7'),
              ]),
              el('div', {}, [
                el('div', { class: 'hd-hpbar-label' }, [el('span', {}, 'HP'), el('span', {}, '32 / 40')]),
                el('div', { class: 'hd-hpbar' }, el('div', { class: 'hd-hpbar-fill', style: 'width:80%' })),
              ]),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/stat-big',
      classes: 'hd-stat-big',
      purpose: 'Crimson big-number block.',
      sources: ['js/main.js'],
      stage: 'card',
      variants: [
        {
          label: 'level',
          render: () =>
            el('div', { class: 'hd-stat-big', style: 'max-width:200px' }, [
              el('div', { class: 'hd-stat-big-label' }, 'Level'),
              el('div', { class: 'hd-stat-big-value' }, '7'),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/stat-big-label',
      classes: 'hd-stat-big-label',
      purpose: 'Uppercase label above the big number.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-stat-big-label',
      variants: [
        {
          label: 'in context',
          render: () =>
            el('div', { class: 'hd-stat-big', style: 'max-width:200px' }, [
              el('div', { class: 'hd-stat-big-label' }, 'Level'),
              el('div', { class: 'hd-stat-big-value' }, '7'),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/stat-big-value',
      classes: 'hd-stat-big-value',
      purpose: '34px big number.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-stat-big-value',
      variants: [
        {
          label: 'in context',
          render: () =>
            el('div', { class: 'hd-stat-big', style: 'max-width:200px' }, [
              el('div', { class: 'hd-stat-big-label' }, 'Level'),
              el('div', { class: 'hd-stat-big-value' }, '7'),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/hpbar-label',
      classes: 'hd-hpbar-label',
      purpose: 'Label and numbers row sitting above the HP meter.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-hpbar-label',
      variants: [
        {
          label: 'in context',
          render: () =>
            el('div', {}, [
              el('div', { class: 'hd-hpbar-label' }, [el('span', {}, 'HP'), el('span', {}, '32 / 40')]),
              el('div', { class: 'hd-hpbar' }, el('div', { class: 'hd-hpbar-fill', style: 'width:80%' })),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/hpbar',
      classes: 'hd-hpbar',
      purpose: '16px meter track that clips its fill.',
      sources: ['js/main.js'],
      stage: 'card',
      variants: [
        { label: 'full', classes: 'hd-hpbar', render: () => el('div', { class: 'hd-hpbar' }, el('div', { class: 'hd-hpbar-fill', style: 'width:100%' })) },
        { label: 'wounded', classes: 'hd-hpbar', render: () => el('div', { class: 'hd-hpbar' }, el('div', { class: 'hd-hpbar-fill', style: 'width:38%' })) },
        { label: 'empty', classes: 'hd-hpbar', render: () => el('div', { class: 'hd-hpbar' }, el('div', { class: 'hd-hpbar-fill', style: 'width:0%' })) },
      ],
    }),
    specimen({
      id: 'ks/hd/hpbar-fill',
      classes: 'hd-hpbar-fill',
      purpose: 'Yellow fill inside the track. Width is set inline from live HP.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-hpbar-fill',
      variants: [{ label: 'at 62%', render: () => el('div', { class: 'hd-hpbar' }, el('div', { class: 'hd-hpbar-fill', style: 'width:62%' })) }],
    }),
    specimen({
      id: 'ks/hd/statgrid',
      classes: 'hd-statgrid',
      purpose: 'Auto-fit grid of stat blocks, minimum column 78px.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-statgrid',
      variants: [
        {
          label: 'full line',
          render: () =>
            el('div', { class: 'hd-statgrid' }, [
              statBlock('MP', '18', true),
              statBlock('ATK', '9'),
              statBlock('DEF', '6', true),
              statBlock('SPD', '5'),
              statBlock('MOV', '4', true),
              statBlock('RNG', '1'),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/statblock',
      classes: 'hd-statblock',
      purpose: 'Yellow chunky stat block.',
      sources: ['js/main.js'],
      stage: 'card',
      variants: [{ label: 'yellow', render: () => el('div', { style: 'max-width:100px' }, statBlock('ATK', '9')) }],
    }),
    specimen({
      id: 'ks/hd/statblock-blue',
      classes: 'hd-statblock hd-statblock--blue',
      purpose: 'Pale blue variant, used for the secondary stats in the line.',
      sources: ['js/main.js'],
      stage: 'card',
      variants: [
        { label: 'yellow', classes: 'hd-statblock', render: () => el('div', { style: 'max-width:100px' }, statBlock('ATK', '9')) },
        { label: 'blue', classes: 'hd-statblock hd-statblock--blue', render: () => el('div', { style: 'max-width:100px' }, statBlock('DEF', '6', true)) },
      ],
    }),
    specimen({
      id: 'ks/hd/statblock-label',
      classes: 'hd-statblock-label',
      purpose: 'Uppercase stat name.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-statblock-label',
      variants: [{ label: 'in context', render: () => el('div', { style: 'max-width:100px' }, statBlock('SPD', '5')) }],
    }),
    specimen({
      id: 'ks/hd/statblock-value',
      classes: 'hd-statblock-value',
      purpose: '24px stat number.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-statblock-value',
      variants: [{ label: 'in context', render: () => el('div', { style: 'max-width:100px' }, statBlock('SPD', '5')) }],
    }),
    specimen({
      id: 'ks/hd/action-body',
      classes: 'hd-card-body hd-action-body',
      purpose: 'Centred card body: a short blurb over one big button, 120px minimum height.',
      sources: ['js/main.js'],
      highlight: '.hd-action-body',
      variants: [
        {
          label: 'three up',
          render: () =>
            el('div', { class: 'hd-landing-row' }, [
              el('div', { class: 'hd-landing-col hd-card' }, [
                el('div', { class: 'hd-card-header' }, 'Join Adventure'),
                el('div', { class: 'hd-card-body hd-action-body' }, [
                  el('p', {}, 'Descend solo as your avatar through the Gatekeeper\u2019s arch.'),
                  btn('Begin a Descent', 'hd-btn--green'),
                ]),
              ]),
              el('div', { class: 'hd-landing-col hd-card' }, [
                el('div', { class: 'hd-card-header' }, 'Skill Trees'),
                el('div', { class: 'hd-card-body hd-action-body' }, [
                  el('p', {}, 'Your Water and Nature battle skills, unlocked from real Origins levels.'),
                  btn('View Skills', 'hd-btn--green'),
                ]),
              ]),
            ]),
        },
      ],
    }),
  ],
});
