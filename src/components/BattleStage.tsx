// Components/BattleStage.tsx - Large grid tactical battle visualization
//
// FIXED:
//  - Player avatars used the dead `lookup.thequackory.com` placeholder, so they
//    rendered as a fallback PNG. Now they use the animated HabboAvatarSprite with
//    the official imager, facing their movement direction and walking between tiles.
//  - The "select a tile to move" phase did nothing: no reachable tiles were shown
//    and tile clicks were only wired to the grid editor. Reachable tiles are now
//    highlighted and clicking one moves the active player.
//  - Clicking an enemy during the attack phase now actually attacks it.

import React, { useMemo } from "react";
import { GridPosition, Combatant, BattleState } from "../lib/Utils/types";
import { generateLargeDungeonGrid, Enemy, findReachableTiles } from "../lib/gridSystem";
import { gridToScreen, calculateZIndex, calculateGridCenterOffset } from "../lib/isometricUtils";
import { getDirectionFromDelta } from "../lib/Utils/grid";
import { DirectionName } from "../lib/Utils/habbo";
import { GridRenderer } from "./GridRenderer";
import { HabboAvatarSprite } from "./HabboAvatarSprite";
import { EnemySprite as EnemySpriteComponent } from "./EnemySprite";
import { getEnemySpriteUrl as getEnemySprite } from "../lib/enemySprites";

const DEFAULT_FIGURE = "hr-100-61.hd-180-1.ch-210-66.lg-270-82.sh-290-62";

interface BattleStageProps {
  state: BattleState;
  dispatch: React.Dispatch<any>;
  backgroundUrl?: string;
  isGridEditorActive?: boolean;
  showGridOverlay?: boolean;
  enabledCells?: Array<{ x: number; y: number }>;
  onGridCellClick?: (x: number, y: number) => void;
  gridSize?: { cols: number; rows: number };
}

/**
 * A single player token that animates between tiles and faces its movement
 * direction. Tracks its previous grid position to derive facing + walk state.
 */
const PlayerToken: React.FC<{
  combatant: Combatant;
  screenX: number;
  screenY: number;
  zIndex: number;
  isActive: boolean;
}> = ({ combatant, screenX, screenY, zIndex, isActive }) => {
  const prevPos = React.useRef<GridPosition>(combatant.position);
  const [direction, setDirection] = React.useState<DirectionName>("down-left");
  const [isWalking, setIsWalking] = React.useState(false);

  React.useEffect(() => {
    const prev = prevPos.current;
    const next = combatant.position;
    if (prev.x !== next.x || prev.y !== next.y) {
      const dir = getDirectionFromDelta(next.x - prev.x, next.y - prev.y) as DirectionName;
      setDirection(dir);
      setIsWalking(true);
      prevPos.current = next;
      const t = setTimeout(() => setIsWalking(false), 420); // match CSS slide
      return () => clearTimeout(t);
    }
  }, [combatant.position.x, combatant.position.y]);

  return (
    <div
      className="absolute"
      style={{
        left: `${screenX}px`,
        top: `${screenY}px`,
        zIndex: zIndex + 1000,
        // Smooth slide between tiles; the walk frames animate during this window.
        transition: "left 0.4s ease-in-out, top 0.4s ease-in-out",
      }}
    >
      <HabboAvatarSprite
        figureString={combatant.figureString || DEFAULT_FIGURE}
        direction={direction}
        isWalking={isWalking}
        heightPx={88}
      />
      <div
        className={`absolute -bottom-6 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-xs whitespace-nowrap ${
          isActive ? "bg-cyan-600 text-white" : "bg-slate-900/80 text-white"
        }`}
      >
        {combatant.name}
      </div>
    </div>
  );
};

export const BattleStage: React.FC<BattleStageProps> = ({
  state,
  dispatch,
  backgroundUrl,
  isGridEditorActive = false,
  showGridOverlay = true,
  enabledCells = [],
  onGridCellClick,
  gridSize = { cols: 40, rows: 40 },
}) => {
  const { allCombatants } = state;
  const currentCombatant = allCombatants.find((c) => c.id === state.turnOrder[state.currentTurnIndex]);
  const isPlayerTurn = !!currentCombatant && currentCombatant.type === "player";

  const dungeonGrid = useMemo(
    () => generateLargeDungeonGrid(gridSize.cols, gridSize.rows),
    [gridSize.cols, gridSize.rows]
  );

  const gridOffset = useMemo(
    () => calculateGridCenterOffset(gridSize.cols, gridSize.rows, 1200, 800),
    [gridSize.cols, gridSize.rows]
  );

  const enemies: Enemy[] = useMemo(
    () =>
      allCombatants
        .filter((c) => c.type === "enemy")
        .map((c) => ({
          id: c.id,
          name: c.name,
          type: c.name.toLowerCase().replace(/\s+/g, "-"),
          position: c.position,
          spriteUrl: c.sprite || getEnemySprite(c.name.toLowerCase().replace(/\s+/g, "-") + ".png"),
          hp: c.hp,
          maxHp: c.maxHp,
          level: 1,
        })),
    [allCombatants]
  );

  // Tiles the active player can move to this turn (only during the move phase).
  const reachableTiles: GridPosition[] = useMemo(() => {
    if (!isPlayerTurn || state.phase !== "selectingTile" || state.selectedAction !== "move" || !currentCombatant) {
      return [];
    }
    const blocked = allCombatants
      .filter((c) => c.id !== currentCombatant.id)
      .map((c) => c.position);
    return findReachableTiles(dungeonGrid, currentCombatant.position, currentCombatant.moveRange, blocked);
  }, [isPlayerTurn, state.phase, state.selectedAction, currentCombatant, allCombatants, dungeonGrid]);

  const isReachable = (pos: GridPosition) =>
    reachableTiles.some((t) => t.x === pos.x && t.y === pos.y);

  const handleTileClick = (pos: GridPosition) => {
    // Grid editor takes priority when active.
    if (isGridEditorActive && onGridCellClick) {
      onGridCellClick(pos.x, pos.y);
      return;
    }
    // Otherwise: if we're choosing a move destination and the tile is reachable, move there.
    if (isPlayerTurn && state.phase === "selectingTile" && state.selectedAction === "move" && isReachable(pos)) {
      dispatch({ type: "RESOLVE_ACTION", actionType: "move", targetPos: pos });
    }
  };

  const handleEnemyClick = (enemyId: string, enemyName: string) => {
    if (isPlayerTurn && state.phase === "selectingTile" && state.selectedAction === "attack") {
      dispatch({ type: "RESOLVE_ACTION", actionType: "attack", targetId: enemyId });
    } else {
      console.log("Clicked enemy:", enemyName);
    }
  };

  return (
    <div className="relative w-full aspect-video overflow-hidden rounded-lg border-4 border-slate-700">
      {/* Dungeon Background */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-90"
        style={{
          backgroundImage: `url(${backgroundUrl || "/src/assets/icedungeon.png"})`,
          backgroundSize: "125%",
          backgroundPosition: "center",
        }}
      />

      {/* Dark overlay for better sprite contrast */}
      <div className="absolute inset-0 bg-slate-900/40" />

      <div className="absolute inset-0 overflow-auto">
        <div className="relative min-w-full min-h-full">
          {/* Grid Renderer with reachable-tile highlighting + click-to-move */}
          {showGridOverlay && (
            <GridRenderer
              grid={dungeonGrid}
              offsetX={gridOffset.x}
              offsetY={gridOffset.y}
              highlightedTiles={reachableTiles}
              showGridLines={isGridEditorActive}
              onTileClick={handleTileClick}
            />
          )}

          {/* Enemy Sprites */}
          {enemies.map((enemy) => {
            const screenPos = gridToScreen(enemy.position);
            const finalX = screenPos.x + gridOffset.x;
            const finalY = screenPos.y + gridOffset.y;
            const zIndex = calculateZIndex(enemy.position);
            const spriteFilename = enemy.spriteUrl.split("/").pop() || "";

            return (
              <EnemySpriteComponent
                key={enemy.id}
                spriteUrl={enemy.spriteUrl}
                spriteFilename={spriteFilename}
                name={enemy.name}
                position={enemy.position}
                shouldFace="right"
                screenX={finalX}
                screenY={finalY}
                zIndex={zIndex}
                onClick={() => handleEnemyClick(enemy.id, enemy.name)}
              />
            );
          })}

          {/* Player Sprites (animated, facing movement direction) */}
          {allCombatants
            .filter((c) => c.type === "player")
            .map((combatant) => {
              const screenPos = gridToScreen(combatant.position);
              const finalX = screenPos.x + gridOffset.x;
              const finalY = screenPos.y + gridOffset.y;
              const zIndex = calculateZIndex(combatant.position);

              return (
                <PlayerToken
                  key={combatant.id}
                  combatant={combatant}
                  screenX={finalX}
                  screenY={finalY}
                  zIndex={zIndex}
                  isActive={currentCombatant?.id === combatant.id}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
};
