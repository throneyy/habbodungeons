// habbo-imaging carry-item IDs — the `crr=N` hand items.
//
// The avatar renderer takes `action=crr=N` and draws item N in the avatar's
// carrying hand. This file maps that ID space in two tables, built by two
// passes of the same research method:
//
//   HAND_ITEMS    N = 0..60    drinks, food and props. Room bots carry these
//                              (js/botsData.js).
//   WEAPON_ITEMS  N = 61..300  the weapon//class-flavour subset of the upper
//                              range. Players carry these, mapped per class by
//                              js/classWeapons.js.
//
// The method, both times (research passes, not copied from a fansite): render
// every ID at direction 2, size b, and byte-hash (md5) the returned PNG against
// the empty-hand baseline `action=crr` (no item id). An ID whose bytes differ
// from that baseline is drawing something; an ID whose bytes match it exactly is
// drawing nothing. Survivors were then read off a zoomed contact sheet of the
// actual render — nothing in either table is guessed.
//
// The two tables differ in how complete they are, deliberately:
//   • HAND_ITEMS is EXHAUSTIVE for 0..60. Every ID in that range not listed
//     renders nothing — byte-identical to the empty-hand baseline. That is
//     0, 4, 7, 8, 10..32, 34..41 and 49.
//   • WEAPON_ITEMS is a FILTERED subset of 61..300. Most of that range draws
//     something (232 of 240 ids), but it is overwhelmingly more food, drink and
//     decor; only the ids confirmed by eye to be a weapon or class-flavour prop
//     are kept. See the note above that table.
//
// One dead ID is kept on purpose: 49 (Soda4) is real in the client's item list,
// so it stays here to keep the numbering faithful, but it has NO ART on
// habbo-imaging — it renders empty across directions 0..3 and sizes b/m/s.
// Anything assigning a hand item must skip it, or the avatar stands there
// empty-handed.
export const HAND_ITEMS = Object.freeze({
  1: 'Soda',
  2: 'Carrot',
  3: 'Icecream',
  5: 'Cola',
  6: 'Coffee',
  9: 'Potion',
  33: 'Lime',
  42: 'Sake',
  43: 'Soda2',
  44: 'Soda3',
  45: 'Cocktail',
  46: 'Fish',
  47: 'Punch',
  48: 'OrangeSoda',
  49: 'Soda4', // no art on habbo-imaging — renders empty-handed
  50: 'Pear',
  51: 'Apple',
  52: 'Orange',
  53: 'Pineapple',
  54: 'Punch2',
  55: 'Soda5',
  56: 'Vile',
  57: 'BirdToy1',
  58: 'BirdToy2',
  59: 'BirdToy3',
  60: 'Lolipop',
});

const BY_NAME = new Map(Object.entries(HAND_ITEMS).map(([id, name]) => [name, Number(id)]));

// Look an item id up by name (case-sensitive, as spelled above) so callers can
// say handItemId('Cola') instead of burying a bare 5 in a definition. Throws on
// an unknown name: a typo'd item would otherwise render as an invisible empty
// hand and read like a figure bug rather than a code bug.
export function handItemId(name) {
  const id = BY_NAME.get(name);
  if (id === undefined) throw new Error(`unknown hand item "${name}"`);
  return id;
}

// Melee/caster weapon items — a further verification pass over the same ID
// space (N = 61..300), same method as above: every ID rendered, byte-hashed
// against the empty-hand baseline, then the survivors read off a zoomed
// contact sheet. 232 of 240 ids in that range draw *something* (mostly food/
// drink/decor carries, like the table above); WEAPON_ITEMS lists only the
// ones confirmed by eye to be a melee/caster weapon or a class-flavour prop,
// each cross-checked at multiple directions before being kept. Everything
// else in 61..300 (phones, produce, balloons, flowers, fish, etc.) is
// deliberately left out of this map — it isn't a weapon.
export const WEAPON_ITEMS = Object.freeze({
  111: 'Torch', // flame-topped rod — not currently assigned to a class
  118: 'TreeBranch', // gnarled wooden branch — warlock's focus
  136: 'Telescope', // banded tapering tube — bard's attack pose
  140: 'Hammer', // square-headed mallet on a handle — cleric's attack pose
  142: 'Wand', // orb-topped wand — mage's melee (non-range) attack
  151: 'Lantern', // hooded lantern — cleric's idle/heal carry
  166: 'SpellBook', // open book, glowing page — mage/cleric ranged (spell) attack
  241: 'Sword', // longsword — melee default (fighter and unassigned classes)
  257: 'Bat', // club/bat silhouette — barbarian
  275: 'Bow', // drawn bow, strung arrow — archer/ranger
  289: 'Dagger', // short single-edged blade — rogue
});
