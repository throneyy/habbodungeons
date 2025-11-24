/**
 * Base direction lookup for enemy sprites.
 * Defines which direction each enemy's raw PNG asset faces.
 */

type EnemyDirection = "left" | "right";

export const ENEMY_BASE_DIRECTIONS: Record<string, EnemyDirection> = {
  // Enemies facing LEFT in their base sprites
  "frostbite-spider.png": "left",
  "frost-wolf.png": "left",
  "frost-wraith.png": "left",
  "frozen-goblin.png": "left",
  "glacial-imp.png": "right",  // Flipped to face right
  "ice-shade.png": "left",
  "giant-rat.png": "left",
  "skeleton.png": "left",
  "undead-habbo.png": "left",
  "werewolf.png": "left",
  "swamp-lurker.png": "left",
  "void-stalker.png": "left",
  "frost-mutant.png": "left",
  "frost-brute.png": "left",
  "ice-elemental.png": "left",
  "flaming-phantom.png": "right",
  "infernal-hound.png": "right",  // Flipped to face right
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
  "frost-undead.gif": "left", // Updated: faces left naturally
  "ice-tiger.gif": "left",
};

export function getEnemyBaseDirection(spriteFilename: string): EnemyDirection {
  return ENEMY_BASE_DIRECTIONS[spriteFilename] || "left";
}
