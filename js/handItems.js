// habbo-imaging carry-item IDs — the `crr=N` hand items.
//
// The avatar renderer takes `action=crr=N` (see SWORD_ITEM / crr=241 in
// js/sprites.js) and draws item N in the avatar's carrying hand. This is the
// verified map of that ID space for N = 0..60.
//
// How this was verified (research pass, not copied from a fansite): every ID
// 0..60 was rendered at direction 2, size b, and the returned PNG was byte-
// hashed (md5) against the empty-hand baseline `action=crr` (no item id). An ID
// whose bytes differ from that baseline is drawing something; an ID whose bytes
// match it exactly is drawing nothing. Every ID listed below was then read off
// a zoomed contact sheet of the actual render — none are guessed.
//
// Two facts worth keeping:
//   • Every ID in 0..60 NOT listed here renders nothing — it is byte-identical
//     to the empty-hand baseline. That is 0, 4, 7, 8, 10..32, 34..41 and 49.
//   • 49 (Soda4) is real in the client's item list and is kept here so the
//     numbering stays faithful, but it has NO ART on habbo-imaging: it renders
//     empty across directions 0..3 and sizes b/m/s. Anything assigning a hand
//     item should skip it, or the avatar stands there empty-handed.
//
// IDs above 60 also render (61+ is a further, uncatalogued item range) and are
// deliberately not listed — they were not identified, and this map only carries
// what was actually seen.
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
