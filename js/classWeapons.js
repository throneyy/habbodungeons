// Per-class weapon assignment for the habbo-imaging avatar's carry poses
// (crr= hand items, see js/handItems.js WEAPON_ITEMS for the verified id ->
// name map). Consumed by js/sprites.js (AvatarSprites), which loads and
// renders these per the class the local avatar is playing.
//
// Every entry:
//   atk  - held during the 'atk' swing pose (js/avatar.js action()) — this is
//          the MELEE (non-range) attack. Always set; classes with no
//          confirmed weapon of their own fall back to the sword (fighter's
//          default melee item). Mage's melee attack is the wand, not the
//          spell book (the book is reserved for their ranged cast — see
//          `bow` below).
//   idle - held whenever NOT mid-swing (the 'std' pose, and the off frame of
//          the 'atk' cycle). Optional: only the cleric has one today (the
//          lantern), so their Heal-adjacent stance reads as "support", not
//          "unarmed" — everyone else is empty-handed until they swing.
//   bow  - held during the 'bow' pose (js/exploreController.js shoot(), the
//          ranged-attack draw — originally archery-only, now the general
//          "attacking from range" pose for any class the archery target
//          minigame hands off to). Optional: rangers hold their real bow;
//          casters (mage, cleric) hold the same spell book for their ranged
//          cast, so a cleric's ranged attack reads identically to a mage's —
//          both are "casting", not drawing a bow. Every other class keeps
//          the empty-hand reach for that pose.
import { WEAPON_ITEMS } from './handItems.js';

const ID = Object.fromEntries(Object.entries(WEAPON_ITEMS).map(([id, name]) => [name, Number(id)]));

export const CLASS_WEAPON = Object.freeze({
  fighter: { atk: ID.Sword },
  barbarian: { atk: ID.Bat },
  rogue: { atk: ID.Dagger },
  ranger: { atk: ID.Sword, bow: ID.Bow },
  mage: { atk: ID.Wand, bow: ID.SpellBook },
  warlock: { atk: ID.TreeBranch },
  cleric: { atk: ID.Hammer, idle: ID.Lantern, bow: ID.SpellBook },
  bard: { atk: ID.Sword }, // no confirmed bard-flavour item yet
});

export function weaponFor(classId) {
  return CLASS_WEAPON[classId] || CLASS_WEAPON.fighter;
}
