// Walking room bots — the catalogue behind the `:npc` admin command.
//
// These are the public-room "bots" of the classic hotel: Avatar-backed figures
// that stand around a spot and idle-wander, rendered live by habbo-imaging like
// every other avatar (js/sprites.js). They are NOT the furni-prop NPCs in
// js/npc.js (the Gatekeeper) — those are dialogue props with sprite sheets.
//
// Identity (name + figure) lives HERE, in code; saved room layouts persist only
// the `key` plus a tile (see serializeBot in js/roomBots.js), exactly like the
// prop NPCs keep their identity in NPCS and the layout keeps their position.
//
// Figure strings are composed from part/colour pairs already proven to render
// on this hotel's imaging endpoint (js/config.js DEFAULT_FIGURE, js/dungeon.js
// FIGURES) — habbo-imaging silently falls back on an unknown pair.
//
// Next field to add here: `dialogue` (a key into js/dialogueData.js) so a bot
// can be talked to the way the Gatekeeper is.
export const ROOM_BOTS = [
  {
    key: 'frank',
    name: 'Frank',
    figure: 'hr-125-1104.hd-190-1026.ch-215-82.lg-280-1189.sh-295-62',
    desc: 'The hotel helper. Has answered that question before.',
  },
  {
    key: 'guide',
    name: 'Fansite Guide',
    figure: 'hr-125-1104.hd-190-1026.ch-260-1314.lg-275-81.sh-295-62',
    desc: 'Points wanderers at the good rooms.',
  },
  {
    key: 'bouncer',
    name: 'The Bouncer',
    figure: 'hd-180-1.cc-3448-110.lg-3449-110.sh-295-62',
    desc: 'Armoured, unimpressed, standing near the door.',
  },
  {
    key: 'barkeep',
    name: 'Barkeep',
    figure: 'hr-125-1104.hd-190-1026.ch-215-64.lg-285-64.sh-295-62',
    desc: 'Pulls the ale, hears everything.',
  },
  {
    key: 'guildmaster',
    name: 'Guild Master',
    figure: 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62.ha-3859-110',
    desc: 'Runs the hall, wears the gold crown to prove it.',
  },
  {
    key: 'sage',
    name: 'Wandering Sage',
    figure: 'hd-180-1.ch-6275-64.ha-6273-64.fa-6271-61.lg-275-81',
    desc: 'Robed, bearded, deliberately vague.',
  },
];

const BY_KEY = new Map(ROOM_BOTS.map((b) => [b.key, b]));

// The definition for a saved bot key, or null when the key is unknown
// (a layout saved against a definition that has since been removed).
export function botDef(key) {
  return BY_KEY.get(key) || null;
}
