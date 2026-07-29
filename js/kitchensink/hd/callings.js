import { specimen, section, el } from '../registry.js';
import { CLASSES } from '../../classes.js';

// The real calling chip from js/main.js classChip().
function classChip(id, on = false) {
  const c = CLASSES[id];
  const skill = c.skill ? ` \u00b7 ${c.skill.name}` : '';
  return el(
    'button',
    { type: 'button', class: `hd-class${on ? ' on' : ''}`, style: `--cc:${c.color}` },
    el('b', {}, c.name),
    el('span', {}, `${c.archetype}${skill}`),
  );
}

export const callings = section({
  id: 'ks/hd/callings',
  title: 'Calling chips',
  blurb: 'The class picker. Each chip takes its rib colour from the real CLASSES entry through an inline --cc.',
  specimens: [
    specimen({
      id: 'ks/hd/class-row',
      classes: 'hd-class-row',
      purpose: 'Wrapping row that holds the calling chips.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-class-row',
      variants: [
        {
          label: 'every calling',
          render: () => el('div', { class: 'hd-class-row' }, Object.keys(CLASSES).map((id) => classChip(id, id === 'fighter'))),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/class',
      classes: 'hd-class',
      purpose: 'One calling chip: class-coloured left rib, name, archetype and skill.',
      sources: ['js/main.js'],
      stage: 'card',
      variants: [
        { label: 'default', classes: 'hd-class', render: () => classChip('mage') },
        { label: 'selected', classes: 'hd-class on', render: () => classChip('cleric', true) },
      ],
      pseudo: [{ name: ':hover', effect: 'Rises 1px, drop grows to 3px.' }],
    }),
  ],
});
