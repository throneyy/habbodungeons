/**
 * Base direction lookup for enemy sprites.
 * Defines which direction each enemy's raw PNG asset faces.
 */

type EnemyDirection = "left" | "right";

/**
 * Scale factors for oversized enemy sprites.
 * Default scale is 1.0 (100%). Values < 1.0 shrink the sprite.
 */
export const ENEMY_SCALE_FACTORS: Record<string, number> = {
  "skeleton.png": 0.25, // Skeleton Warrior is too large, scale to 40%
};

export const ENEMY_BASE_DIRECTIONS: Record<string, EnemyDirection> = {
  // Enemies facing LEFT in their base sprites
  "frostbite-spider.png": "left",
  "frost-wolf.png": "left",
  "frost-wraith.png": "left",
  "frozen-goblin.png": "left",
  "glacial-imp.png": "right", // Flipped to face right
  "ice-shade.png": "left",
  "skeleton.png": "right",
  "undead-habbo.png": "left",
  "werewolf.png": "left",
  "swamp-lurker.png": "left",
  "void-stalker.png": "left",
  "frost-mutant.png": "left",
  "frost-brute.png": "left",
  "ice-elemental.png": "left",
  "flaming-phantom.png": "right",
  "infernal-hound.png": "right", // Flipped to face right
  "fire-drake.png": "left",

  // Enemies facing RIGHT in their base sprites
  "ice-guardian.png": "right",
  "iced-stone-dragon.png": "right",
  "goblin-trio.png": "right",

  // Boss enemies (front-facing)
  "ice-knight-boss.png": "left",
  "mystic-shaman-boss.png": "left",
  "blood-dragon-boss.gif": "left",

  // Animated enemies (GIF sprites)
  "frost-undead.gif": "right", // Faces right naturally, no flip needed
  "ice-tiger.gif": "left",
};

export function getEnemyBaseDirection(spriteFilename: string): EnemyDirection {
  return ENEMY_BASE_DIRECTIONS[spriteFilename] || "left";
}

export function getEnemyScaleFactor(spriteFilename: string): number {
  return ENEMY_SCALE_FACTORS[spriteFilename] || 1.0;
}
