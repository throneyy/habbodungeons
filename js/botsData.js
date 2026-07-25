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
// being committed: each renders a distinct avatar, none falls back to the
// default/nude figure, and no two are identical.
//
// `carry` (optional) is a habbo-imaging hand-item id resolved BY NAME from
// js/handItems.js — never a bare number — and is threaded into the imaging URL
// as `action=crr=<id>` (js/sprites.js). Bots without one render unchanged.
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
];

const BY_KEY = new Map(ROOM_BOTS.map((b) => [b.key, b]));

// The definition for a saved bot key, or null when the key is unknown
// (a layout saved against a definition that has since been removed).
export function botDef(key) {
  return BY_KEY.get(key) || null;
}
