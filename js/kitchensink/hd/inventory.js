import { specimen, section, el } from '../registry.js';
import { ITEMS, CONSUMABLES, RARITY, bonusText } from '../../items.js';
import { itemIconCanvas } from '../../ui/itemIcon.js';
import { pill } from './kit.js';

const INV_ICON = 56; // .hd-inv-card-art box, same as js/main.js

// Rarity hex to the card's soft glow tint. Same function as js/main.js.
function hexToGlow(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 'transparent';
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.55)`;
}

// The real inventory card from js/main.js invCardHtml(), as a node so the art
// canvas can paint actual extracted furni pixels instead of a placeholder.
function invCard(it, { type, equipped = false } = {}) {
  const rc = RARITY[it.rarity] || RARITY.common;
  const art = itemIconCanvas(it.icon, INV_ICON);
  art.className = 'hd-inv-card-art';
  art.setAttribute('role', 'img');
  art.setAttribute('aria-label', it.name);
  const stat = it.bonus ? bonusText(it) : it.effectText || '';
  return el(
    'div',
    {
      class: 'hd-inv-card',
      style: `--hd-rarity:${rc.color};--hd-rarity-ink:${rc.color};--hd-rarity-glow:${hexToGlow(rc.color)}`,
    },
    art,
    el(
      'div',
      { class: 'hd-inv-card-body' },
      el('span', { class: 'hd-inv-card-name' }, it.name),
      el(
        'span',
        { class: 'hd-inv-card-meta' },
        el('span', {}, type),
        el('span', { class: 'hd-inv-card-rarity' }, rc.name),
        equipped ? el('span', { class: 'hd-inv-equipped' }, '\u2713 Equipped') : null,
      ),
      stat ? el('span', { class: 'hd-inv-card-stat' }, stat) : null,
      it.blurb ? el('span', { class: 'hd-inv-card-blurb' }, it.blurb) : null,
    ),
  );
}

const WEAPON = ITEMS.kingslayer;
const ARMOR = ITEMS.chainmail;
const RARE = ITEMS.frostbrand;
const POTION = CONSUMABLES.health_potion;

const invSection = (title, cards) =>
  el(
    'div',
    { class: 'hd-card hd-inv-section' },
    el('div', { class: 'hd-card-header' }, title),
    el('div', { class: 'hd-card-body' }, el('div', { class: 'hd-inv-cards' }, cards)),
  );

export const inventory = section({
  id: 'ks/hd/inventory',
  title: 'Inventory page',
  blurb: 'One titled panel per item type, each a grid of rarity-rimmed cards. Art is the real extracted furni for each item.',
  specimens: [
    specimen({
      id: 'ks/hd/inv-section',
      classes: 'hd-card hd-inv-section',
      purpose: 'One titled panel per item type. Consecutive panels get a 16px gap.',
      sources: ['js/main.js'],
      variants: [
        {
          label: 'two panels',
          render: () =>
            el('div', {}, [
              invSection('Weapons', [invCard(WEAPON, { type: 'Weapon', equipped: true })]),
              invSection('Armor', [invCard(ARMOR, { type: 'Armor' })]),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/inv-section-title',
      classes: 'hd-inv-section-title',
      purpose: 'Section heading row holding a title and its count.',
      status: 'spare',
      sources: [],
      note: 'Superseded: the live panels title themselves with .hd-card-header instead.',
      stage: 'card',
      highlight: '.hd-inv-section-title',
      variants: [
        {
          label: 'as designed',
          render: () =>
            el('div', { class: 'hd-inv-section-title' }, [
              el('span', {}, 'Weapons'),
              el('span', { class: 'hd-inv-section-count' }, '3 items'),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/inv-section-count',
      classes: 'hd-inv-section-count',
      purpose: 'Small grey item count beside a section title.',
      status: 'spare',
      sources: [],
      stage: 'card',
      highlight: '.hd-inv-section-count',
      variants: [
        {
          label: 'as designed',
          render: () =>
            el('div', { class: 'hd-inv-section-title' }, [
              el('span', {}, 'Consumables'),
              el('span', { class: 'hd-inv-section-count' }, '12 items'),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/inv-cards',
      classes: 'hd-inv-cards',
      purpose: 'Auto-fill grid of item cards, minimum column 232px.',
      sources: ['js/main.js'],
      highlight: '.hd-inv-cards',
      variants: [
        {
          label: 'grid',
          render: () =>
            invSection('Loot', [
              invCard(WEAPON, { type: 'Weapon', equipped: true }),
              invCard(RARE, { type: 'Weapon' }),
              invCard(ARMOR, { type: 'Armor' }),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/inv-card',
      classes: 'hd-inv-card',
      purpose: 'Item card rimmed and glowed by rarity through --hd-rarity and --hd-rarity-glow.',
      sources: ['js/main.js'],
      stage: 'card',
      variants: [
        { label: 'common', classes: 'hd-inv-card (--hd-rarity #b8b0a0)', render: () => invCard(ITEMS.padded_vest, { type: 'Armor' }) },
        { label: 'rare', classes: 'hd-inv-card (--hd-rarity #4f8fd0)', render: () => invCard(RARE, { type: 'Weapon' }) },
        { label: 'legendary', classes: 'hd-inv-card (--hd-rarity #f6c343)', render: () => invCard(WEAPON, { type: 'Weapon', equipped: true }) },
      ],
    }),
    specimen({
      id: 'ks/hd/inv-card-art',
      classes: 'hd-inv-card-art',
      purpose: '56px pixelated canvas painting the item\u2019s real furni sprite.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-inv-card-art',
      variants: [{ label: 'in context', render: () => invCard(RARE, { type: 'Weapon' }) }],
    }),
    specimen({
      id: 'ks/hd/inv-card-body',
      classes: 'hd-inv-card-body',
      purpose: 'Text column beside the art, stacked with a 3px gap.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-inv-card-body',
      variants: [{ label: 'in context', render: () => invCard(RARE, { type: 'Weapon' }) }],
    }),
    specimen({
      id: 'ks/hd/inv-card-name',
      classes: 'hd-inv-card-name',
      purpose: 'Item name, inked with the rarity colour.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-inv-card-name',
      variants: [{ label: 'in context', render: () => invCard(WEAPON, { type: 'Weapon' }) }],
    }),
    specimen({
      id: 'ks/hd/inv-card-meta',
      classes: 'hd-inv-card-meta',
      purpose: 'Uppercase type and rarity row under the name.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-inv-card-meta',
      variants: [{ label: 'in context', render: () => invCard(ARMOR, { type: 'Armor' }) }],
    }),
    specimen({
      id: 'ks/hd/inv-card-rarity',
      classes: 'hd-inv-card-rarity',
      purpose: 'The rarity word inside the meta row, tinted to the rarity colour.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-inv-card-rarity',
      variants: [{ label: 'in context', render: () => invCard(WEAPON, { type: 'Weapon' }) }],
    }),
    specimen({
      id: 'ks/hd/inv-equipped',
      classes: 'hd-inv-equipped',
      purpose: 'Green chip marking gear currently worn by the run leader.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-inv-equipped',
      variants: [
        { label: 'equipped', render: () => invCard(WEAPON, { type: 'Weapon', equipped: true }) },
        { label: 'loose', classes: 'hd-inv-card-meta (no chip)', render: () => invCard(WEAPON, { type: 'Weapon' }) },
      ],
    }),
    specimen({
      id: 'ks/hd/inv-card-stat',
      classes: 'hd-inv-card-stat',
      purpose: 'Bold stat line, the item\u2019s bonus or its effect text.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-inv-card-stat',
      variants: [
        { label: 'gear bonus', render: () => invCard(WEAPON, { type: 'Weapon' }) },
        { label: 'consumable effect', render: () => invCard(POTION, { type: 'Consumable' }) },
      ],
    }),
    specimen({
      id: 'ks/hd/inv-card-blurb',
      classes: 'hd-inv-card-blurb',
      purpose: 'Italic flavour text closing the card.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-inv-card-blurb',
      variants: [{ label: 'in context', render: () => invCard(WEAPON, { type: 'Weapon' }) }],
    }),
    specimen({
      id: 'ks/hd/inv-stat-pills',
      classes: 'hd-inv-stat-pills',
      purpose: 'Auto-fit grid of pills, minimum column 120px, that drops the stacked pill margin.',
      sources: ['js/main.js'],
      stage: 'card',
      highlight: '.hd-inv-stat-pills',
      variants: [
        {
          label: 'stat grid',
          render: () =>
            el('div', { class: 'hd-inv-stat-pills' }, [
              pill('Level', '7'),
              pill('HP', '32 / 40'),
              pill('MP', '12 / 18'),
              pill('ATK', '9'),
              pill('DEF', '6'),
              pill('Gold', '128'),
            ]),
        },
      ],
    }),
    specimen({
      id: 'ks/hd/inv-empty-note',
      classes: 'hd-inv-empty-note',
      purpose: 'Grey line standing in for an inventory that has nothing in it yet.',
      sources: ['js/main.js'],
      variants: [
        {
          label: 'no descent',
          render: () =>
            el(
              'div',
              { class: 'hd-card hd-inv-section' },
              el('div', { class: 'hd-card-header' }, 'Inventory'),
              el(
                'div',
                { class: 'hd-card-body' },
                el(
                  'p',
                  { class: 'hd-inv-empty-note' },
                  'No descent underway. Loot, gear and gold live inside a run; begin a descent to start collecting.',
                ),
              ),
            ),
        },
      ],
    }),
  ],
});
