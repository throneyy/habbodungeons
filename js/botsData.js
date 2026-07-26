// Walking room bots — the catalogue behind the `:npc` admin command.
//
// These are the public-room "bots" of the classic hotel: Avatar-backed figures
// that stand around a spot and idle-wander, rendered live by habbo-imaging like
// every other avatar (js/sprites.js). They are NOT the furni-prop NPCs in
// js/npc.js (the Gatekeeper) — those are dialogue props with sprite sheets.
//
// SOURCE OF THIS ROSTER
// Recovered from the Quackster/Havana emulator project, file
// tools/migrations/update.1.3.sql, table `rooms_bots` — the names, mottos and
// the `figure_flash` column are reproduced verbatim from that dump; no figure
// string here has been adjusted, "improved" or invented.
//
// All 33 rows of that INSERT are present. The first nine below are the order
// they were first committed in; the remaining 24 follow in `rooms_bots` id
// order. `name` is the dump's name trimmed (row 40 is stored as 'Eric  ') and
// `motto` is its `mission` column — including ScubaJoe's, which is empty.
//
// Two figure strings are DUPLICATED in the source data, and are kept that way
// rather than nudged apart to look tidier:
//   • Chloe and Ariel share hr-500-59.sh-730-107.ch-650-107.hd-600-1.lg-696-96
//   • Berith and Laura share hr-836-37.lg-715-72.ch-822-62.hd-600-1.sh-730-62
// 31 distinct figure strings across the 33 bots. Berith and Laura therefore
// render byte-identically (neither carries anything); Chloe and Ariel don't,
// only because they hold different drinks (Cola vs Coffee).
//
// Provenance caveat: Havana is a v14-era Habbo emulator, i.e. a community
// reconstruction of the hotel's bot roster. Treat this as emulator data, NOT as
// claimed Sulake canon — the real hotel's bots may well have differed.
//
// Frank and Mandy are deliberately absent: they do not appear in that dump.
// Rather than invent figures for them and pass the result off as recovered
// data, they are simply left out. Add them only if a real source turns up.
//
// Only the fields carried in the source data are recorded here (name, motto,
// figure). The hotel room each bot stood in is deliberately NOT reproduced:
// it wasn't part of the data used, and guessing it would be invention.
//
// Identity (name + figure) lives HERE, in code; saved room layouts persist only
// the `key` plus a tile (see serializeBot in js/roomBots.js), exactly like the
// prop NPCs keep their identity in NPCS and the layout keeps their position.
//
// Every figure below was byte-verified against the live imaging endpoint before
// being committed (.gg/verify-bot-figures.mjs): all 33 render a real avatar at
// direction 2, none matches the empty/nonsense-figure fallback, and the only
// byte-identical pair is Berith/Laura — a duplicate in the source data itself.
//
// `carry` (optional) is a habbo-imaging hand-item id resolved BY NAME from
// js/handItems.js — never a bare number — and is threaded into the imaging URL
// as `action=crr=<id>` (js/sprites.js). Bots without one render unchanged.
//
// A carry is set only where the dump's `hand_items` column (the drinks a bot
// serves) names something HAND_ITEMS actually has, taking the first such name
// in the list: Regina's 'Coffee' maps, Reginaldo's 'Water,Juice,Lemonade,Tea'
// maps to nothing at all, so he is left without one. No id is guessed to fill
// a gap — an unmapped drink means no carry.
//
// Next field to add here: `dialogue` (a key into js/dialogueData.js) so a bot
// can be talked to the way the Gatekeeper is.
import { handItemId } from './handItems.js';

export const ROOM_BOTS = [
  {
    key: 'harry',
    name: 'Harry',
    motto: 'Happy to help',
    figure: 'hr-831-61.ch-809-62.sh-290-110.hd-180-1.lg-285-64',
  },
  {
    key: 'marcus',
    name: 'Marcus',
    motto: 'Man of Talent',
    figure: 'hr-155-32.sh-290-63.ch-235-78.hd-180-1.lg-285-81',
    carry: handItemId('Cola'),
  },
  {
    key: 'piers',
    name: 'Piers',
    motto: 'The master of the kitchen!',
    figure: 'hr-891-61.ha-1024-62.ch-220-62.fa-1204-62.sh-300-62.hd-180-1.lg-280-62',
  },
  {
    key: 'ingemar',
    name: 'Ingemar',
    motto: 'Snowballs, schnowballs',
    figure: 'ha-1010-62.ch-210-62.sh-290-80.hd-180-2.lg-270-62',
    carry: handItemId('Coffee'),
  },
  {
    key: 'chloe',
    name: 'Chloe',
    motto: 'Service with a smile',
    figure: 'hr-500-59.sh-730-107.ch-650-107.hd-600-1.lg-696-96',
    carry: handItemId('Cola'),
  },
  {
    key: 'jem',
    name: 'Jem',
    motto: "Don't look down",
    figure: 'hr-832-61.lg-715-97.ch-650-71.hd-600-10.sh-730-97',
    carry: handItemId('Cola'),
  },
  {
    key: 'miho',
    name: 'Miho',
    motto: "My katana thinks you're cute!",
    figure: 'hr-829-53.lg-280-62.ch-245-62.hd-180-2.sh-290-80',
  },
  {
    key: 'amber',
    name: 'Amber',
    motto: 'On the crest of a wave',
    figure: 'hr-575-36.sh-730-67.ch-685-93.hd-600-1.lg-827-67',
  },
  {
    key: 'ray',
    name: 'Ray',
    motto: 'Chill out and have a coconut!',
    figure: 'hr-829-34.lg-281-72.ch-803-62.hd-180-19.sh-295-68',
    carry: handItemId('Cola'),
  },
  // --- the remaining 24 rows of the dump, in `rooms_bots` id order ---------
  {
    key: 'xenia',
    name: 'Xenia',
    motto: 'The belle of the Battle Ball',
    figure: 'hr-834-61.sh-730-80.ch-825-62.hd-600-5.lg-827-72',
  },
  {
    key: 'pamela',
    name: 'Pamela',
    motto: ':)',
    figure: 'hr-836-37.sh-730-62.ch-822-62.hd-600-2.lg-715-96',
  },
  {
    key: 'regina',
    name: 'Regina',
    motto: 'I know, right?',
    figure: 'hr-832-35.sh-730-97.ch-685-62.hd-600-1.lg-715-97',
    carry: handItemId('Coffee'),
  },
  {
    key: 'james',
    name: 'James',
    motto: 'Nemo my name forever more',
    figure: 'hr-100-41.lg-270-110.ch-260-62.hd-180-1.sh-300-110',
  },
  {
    key: 'marion',
    name: 'Marion',
    motto: 'I want to be Bonnie Blond!',
    figure: 'hr-840-37.lg-715-97.ch-685-110.hd-600-13.sh-730-62',
  },
  {
    key: 'brone',
    name: 'Brone',
    motto: 'Happy to help',
    figure: 'hr-125-41.ch-235-110.sh-300-110.hd-180-3.lg-280-110',
  },
  {
    key: 'dave',
    name: 'Dave',
    motto: 'Hello, hello',
    figure: 'hr-115-41.ch-230-62.fa-1208-63.sh-300-62.hd-180-1.lg-270-96',
  },
  {
    key: 'sadie',
    name: 'Sadie',
    motto: "Happy St. Patrick's Day!",
    figure: 'hr-515-35.lg-695-96.ch-650-107.hd-600-1.sh-725-81',
  },
  {
    key: 'reginaldo',
    name: 'Reginaldo',
    motto: ':)',
    figure: 'hr-100-41.sh-300-73.ch-809-62.hd-180-10.lg-270-110',
  },
  {
    key: 'billy',
    name: 'Billy',
    motto: 'You can call me Bill',
    figure: 'hr-155-35.ch-805-82.sh-290-64.hd-180-1.lg-270-87',
    carry: handItemId('Coffee'),
  },
  {
    key: 'phillip',
    name: 'Phillip',
    motto: 'Why not try a nice burger?',
    figure: 'sh-300-88.hr-155-40.ch-215-69.hd-180-1.lg-285-64',
    carry: handItemId('Cola'),
  },
  {
    key: 'ariel',
    name: 'Ariel',
    motto: 'Happy to help',
    // byte-identical to Chloe's figure in the dump — see the duplicates note above
    figure: 'hr-500-59.sh-730-107.ch-650-107.hd-600-1.lg-696-96',
    carry: handItemId('Coffee'),
  },
  {
    key: 'marcel',
    name: 'Marcel',
    motto: 'In search of lost time',
    figure: 'hr-831-41.lg-270-88.ch-809-68.hd-180-1.sh-300-63',
  },
  {
    key: 'berith',
    name: 'Berith',
    motto: 'Serving you with a smile :)',
    // byte-identical to Laura's figure in the dump — see the duplicates note above
    figure: 'hr-836-37.lg-715-72.ch-822-62.hd-600-1.sh-730-62',
  },
  {
    key: 'dj_von_beathoven',
    name: 'DJ von Beathoven',
    motto: 'Turn the music up!',
    figure: 'hr-110-42.ch-235-107.sh-290-80.he-1604-62.hd-180-3.lg-270-62',
  },
  {
    key: 'maarit',
    name: 'Maarit',
    motto: ':)',
    figure: 'hr-836-35.sh-907-62.ch-685-110.hd-600-1.lg-705-110',
  },
  {
    key: 'scubajoe',
    name: 'ScubaJoe',
    motto: '', // the dump's `mission` really is empty for this row
    figure: 'hr-125-37.ch-225-62.sh-290-80.hd-180-5.lg-270-62',
    carry: handItemId('Cola'),
  },
  {
    key: 'skye',
    name: 'Skye',
    motto: 'On the top of the world',
    figure: 'hr-833-34.lg-705-78.ch-819-78.hd-605-2.sh-730-68',
    carry: handItemId('Cola'),
  },
  {
    key: 'gino',
    name: 'Gino',
    motto: 'The master of pizza!',
    figure: 'ha-1024-62.ch-230-62.sh-300-62.hd-180-1.lg-285-62',
  },
  {
    key: 'carlo',
    name: 'Carlo',
    motto: 'The master of pizza',
    figure: 'lg-285-62.ch-220-62.hd-180-1.sh-300-62',
  },
  {
    key: 'lofar',
    name: 'Lofar',
    motto: 'Service without gravity :)',
    figure: 'hr-155-35.ha-1023-62.ch-210-62.sh-290-80.hd-180-1.lg-270-62',
    carry: handItemId('Cola'),
  },
  {
    key: 'eric',
    name: 'Eric', // dump stores it as 'Eric  ' — trailing whitespace trimmed
    motto: ':)',
    figure: 'lg-281-62.ch-235-73.hd-180-5.sh-290-77',
  },
  {
    key: 'laura',
    name: 'Laura',
    motto: 'Keeps you cool',
    // byte-identical to Berith's figure in the dump — see the duplicates note above
    figure: 'hr-836-37.lg-715-72.ch-822-62.hd-600-1.sh-730-62',
  },
  {
    key: 'tao',
    name: 'Tao',
    motto: 'Tea is serenity',
    figure: 'lg-270-62.ch-210-73.hd-207-3.fa-1208-62.sh-290-81',
  },
];

const BY_KEY = new Map(ROOM_BOTS.map((b) => [b.key, b]));

// The definition for a saved bot key, or null when the key is unknown
// (a layout saved against a definition that has since been removed).
export function botDef(key) {
  return BY_KEY.get(key) || null;
}
