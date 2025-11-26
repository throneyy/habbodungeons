// Utils/types.ts

export type GridPosition = { x: number; y: number; };

export type AreaOfEffect = "single" | "line" | "cross" | "diamond" | "allEnemies";

export type Skill = {
  id: string;
  name: string;
  description: string;
  range: number; // in tiles
  areaOfEffect: AreaOfEffect;
  power: number;
  costMp?: number;
};

export type CombatantType = "player" | "enemy";

export type Combatant = {
  id: string;
  name: string;
  type: CombatantType;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  spd: number;
  figureString?: string; // For Habbo avatars
  position: GridPosition;
  moveRange: number;
  skills: Skill[];
  isDefending: boolean;
};

export type PlayerProfile = {
  habboId: string;
  habboName: string;
  figureString: string;
  level: number;
  xp: number;
  // Other player-specific stats
};

export type BattlePhase = "idle" | "selectingAction" | "selectingTile" | "animating" | "resolving" | "finished";

export type BattleState = {
  gridCols: number;
  gridRows: number;
  allCombatants: Combatant[];
  partyIds: string[];
  enemyIds: string[];
  turnOrder: string[];
  currentTurnIndex: number;
  phase: BattlePhase;
  selectedAction: "move" | "attack" | "skill" | "defend" | "item" | null;
  selectedSkillId: string | null;
};
