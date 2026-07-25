import { Unit } from './units.js';

// The M1 demo encounter, staged on the Crypt: your squad enters at the bottom
// and must fight up to the raised altar, where ranged enemies hold the high
// ground (showing off height bonuses, line-of-sight, and the class triangle).
// Enemy names come from v1's bestiary; their class picks the archetype.
export function buildCryptEncounter(room) {
  const P = (x, y, classId, opts = {}) =>
    new Unit(room, null, x, y, { team: 'player', classId, dir: 0, ...opts });
  const E = (x, y, classId, name, opts = {}) =>
    new Unit(room, null, x, y, { team: 'enemy', classId, name, dir: 4, ...opts });

  const players = [
    P(6, 10, 'fighter', { name: 'You', useSprites: true }), // rendered as your Habbo
    P(8, 10, 'ranger', { name: 'Ranger' }),
    P(7, 11, 'mage', { name: 'Mage' }),
  ];

  const enemies = [
    E(6, 4, 'fighter', 'Skeleton'), // melee bruiser guarding the floor
    E(9, 4, 'rogue', 'Sewer Rat'), // fast melee flanker
    E(7, 1, 'ranger', 'Crypt Spider'), // ranged, on the altar (height 2)
    E(8, 2, 'mage', 'Ember Elemental'), // caster, on the altar
  ];

  return { players, enemies };
}
