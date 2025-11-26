// Components/BattleStage.tsx

import React, { useMemo, useState, useEffect } from "react";
import { GridPosition, Combatant, BattleState } from "../lib/Utils/types";
import {
  toIsometricScreenPos,
  findReachableTiles,
  reconstructPath,
  isSamePosition,
  getDistance,
} from "../lib/Utils/grid";
import { DirectionName, TILE_WIDTH, TILE_HEIGHT } from "../lib/Utils/habbo";
import { EnemySprite } from "./EnemySprite";
import { ENEMY_SPRITE_MAP } from "../lib/enemySprites";

interface BattleStageProps {
  state: BattleState;
  dispatch: React.Dispatch<any>;
  backgroundUrl?: string;
  isGridEditorActive?: boolean;
  showGridOverlay?: boolean;
  enabledCells?: Array<{ x: number; y: number }>;
  onGridCellClick?: (x: number, y: number) => void;
}

type AnimatedPosition = {
  combatantId: string;
  pos: GridPosition;
  isMoving: boolean;
  direction: DirectionName;
};

const getDirectionName = (from: GridPosition, to: GridPosition): DirectionName => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (dx === 0 && dy === -1) return "up";
  if (dx === 1 && dy === 0) return "right";
  if (dx === 0 && dy === 1) return "down";
  if (dx === -1 && dy === 0) return "left";
  if (dx > 0 && dy < 0) return "up-right";
  if (dx > 0 && dy > 0) return "down-right";
  if (dx < 0 && dy > 0) return "down-left";
  if (dx < 0 && dy < 0) return "up-left";

  return "down";
};

const getHabboAvatarUrl = (username: string) =>
  `https://lookup.thequackory.com/habbo-imaging/${encodeURIComponent(username)}?hotel=COM&size=s&action=std&gesture=std&direction=4&head_direction=4&service=official`;

// Helper function to get sprite URL for an enemy by name
const getEnemySpriteUrl = (enemyName: string, currentSprite?: string): string => {
  // If enemy already has a sprite property, use it
  if (currentSprite && currentSprite.trim() !== "") {
    return currentSprite;
  }
  // Otherwise, try to map the enemy name to a sprite from ENEMY_SPRITE_MAP
  const spriteName = enemyName.toLowerCase().replace(/\s+/g, "-") + ".png";
  if (ENEMY_SPRITE_MAP[spriteName]) {
    return `/src/assets/${spriteName}`;
  }
  // Default fallback sprite
  return "/src/assets/ice-elemental.png";
};

export const BattleStage: React.FC<BattleStageProps> = ({
  state,
  dispatch,
  backgroundUrl,
  isGridEditorActive = false,
  showGridOverlay = true,
  enabledCells = [],
  onGridCellClick,
}) => {
  const { allCombatants, partyIds, gridCols, gridRows, phase } = state;
  const currentCombatant = allCombatants.find((c) => c.id === state.turnOrder[state.currentTurnIndex]);
  const isPlayerTurn = currentCombatant && currentCombatant.type === "player";

  const [animatedPositions, setAnimatedPositions] = useState<AnimatedPosition[]>(
    allCombatants.map((c) => ({
      combatantId: c.id,
      pos: c.position,
      isMoving: false,
      direction: "down" as DirectionName,
    })),
  );

  useEffect(() => {
    setAnimatedPositions(
      allCombatants.map((c) => {
        const currentAnim = animatedPositions.find((a) => a.combatantId === c.id);
        return {
          combatantId: c.id,
          pos: c.position,
          isMoving: false,
          direction: currentAnim?.direction || ("down" as DirectionName),
        };
      }),
    );
  }, [allCombatants.length]);

  const blockingTiles = useMemo(() => {
    // If using grid editor, only include tiles that are enabled
    const baseTiles = allCombatants
      .map((c) => c.position)
      .filter((p) => !isSamePosition(p, currentCombatant?.position || { x: -1, y: -1 }));

    if (isGridEditorActive || enabledCells.length > 0) {
      // When grid editor is active or we have enabled cells, treat disabled cells as blocking
      return baseTiles;
    }

    return baseTiles;
  }, [allCombatants, currentCombatant, isGridEditorActive, enabledCells]);

  const { reachable, paths } = useMemo(() => {
    if (state.phase !== "selectingTile" || state.selectedAction !== "move" || !currentCombatant) {
      return { reachable: [], paths: new Map<string, GridPosition | null>() };
    }

    // Calculate reachable tiles considering enabled cells
    const result = findReachableTiles(
      currentCombatant.position,
      currentCombatant.moveRange,
      gridCols,
      gridRows,
      blockingTiles,
    );

    // If we have enabled cells configured, filter reachable tiles to only include enabled ones
    if (enabledCells.length > 0 && !isGridEditorActive) {
      const filteredReachable = result.reachable.filter((tile) =>
        enabledCells.some((enabled) => enabled.x === tile.x && enabled.y === tile.y),
      );
      return { reachable: filteredReachable, paths: result.paths };
    }

    return result;
  }, [
    state.phase,
    state.selectedAction,
    currentCombatant,
    gridCols,
    gridRows,
    blockingTiles,
    enabledCells,
    isGridEditorActive,
  ]);

  const handleTileClick = (targetPos: GridPosition) => {
    // Grid editor mode
    if (isGridEditorActive && onGridCellClick) {
      onGridCellClick(targetPos.x, targetPos.y);
      return;
    }

    if (!currentCombatant || !isPlayerTurn) return;

    if (state.phase === "selectingTile") {
      if (state.selectedAction === "move") {
        const isReachable = reachable.some((p) => isSamePosition(p, targetPos));
        if (isReachable) {
          const path = reconstructPath(targetPos, paths);
          dispatch({ type: "RESOLVE_ACTION", actionType: "move", targetPos });
        }
      } else if (state.selectedAction === "attack" || state.selectedAction === "skill") {
        const targetCombatant = allCombatants.find(
          (c) => isSamePosition(c.position, targetPos) && c.id !== currentCombatant.id,
        );
        const range = state.selectedAction === "attack" ? 1 : state.selectedSkillId ? 3 : 1;

        if (targetCombatant && getDistance(currentCombatant.position, targetPos) <= range) {
          dispatch({
            type: "RESOLVE_ACTION",
            actionType: state.selectedAction,
            targetId: targetCombatant.id,
            skillId: state.selectedSkillId,
          });
        }
      }
    }
  };

  const getScreenPositionStyle = (x: number, y: number) => {
    const pixelX = (x - y) * (TILE_WIDTH / 2);
    const pixelY = (x + y) * (TILE_HEIGHT / 2);

    return {
      left: `${pixelX + TILE_WIDTH / 2}px`,
      top: `${pixelY}px`,
      zIndex: 100 + y,
    };
  };

  const renderTiles = () => {
    const tiles: JSX.Element[] = [];

    for (let y = 0; y < gridRows; y++) {
      for (let x = 0; x < gridCols; x++) {
        const pos: GridPosition = { x, y };
        const screenPos = getScreenPositionStyle(x, y);

        const isCellEnabled = enabledCells.length === 0 || enabledCells.some((cell) => cell.x === x && cell.y === y);
        const isReachableMove = state.selectedAction === "move" && reachable.some((p) => isSamePosition(p, pos));
        const enemyAtPos = allCombatants.find((c) => c.type === "enemy" && isSamePosition(c.position, pos));
        const isAttackableEnemy =
          state.selectedAction === "attack" &&
          currentCombatant &&
          enemyAtPos &&
          getDistance(currentCombatant.position, pos) <= 1;

        let tileClass = "absolute cursor-pointer transition-all";

        if (isGridEditorActive) {
          // Grid editor mode
          tileClass += isCellEnabled
            ? " bg-green-500/30 hover:bg-green-400/50 border-2 border-green-400"
            : " bg-red-500/20 hover:bg-red-400/30 border-2 border-red-600/50";
        } else if (!showGridOverlay) {
          // Grid hidden
          tileClass += " border-0";
        } else {
          // Normal battle mode
          tileClass += " border border-slate-600/30";

          if (isReachableMove && isCellEnabled) {
            tileClass += " bg-cyan-500/40 hover:bg-cyan-400/60 border-2 border-cyan-300 shadow-lg shadow-cyan-500/50";
          } else if (isAttackableEnemy) {
            tileClass +=
              " bg-red-500/50 hover:bg-red-400/70 border-2 border-red-300 shadow-lg shadow-red-500/50 animate-pulse";
          } else if (!isCellEnabled) {
            // Disabled cell - show as blocked
            tileClass += " bg-gray-900/50 border-gray-700";
          }
        }

        tiles.push(
          <div
            key={`${x}-${y}`}
            className={tileClass}
            style={{
              ...screenPos,
              width: `${TILE_WIDTH}px`,
              height: `${TILE_HEIGHT}px`,
            }}
            onClick={() => handleTileClick(pos)}
          >
            {isGridEditorActive && (
              <div className="text-[8px] text-white/70 absolute top-0 left-0 p-0.5">
                {x},{y}
              </div>
            )}
          </div>,
        );
      }
    }
    return tiles;
  };

  return (
    <div className="relative w-full aspect-video overflow-hidden rounded-lg border-4 border-slate-700">
      {/* Dungeon Background */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-90"
        style={{
          backgroundImage: `url(${backgroundUrl || "/src/assets/icedungeon.png"})`,
          backgroundSize: "110%",
          backgroundPosition: "center",
        }}
      />

      {/* Dark overlay for better sprite contrast */}
      <div className="absolute inset-0 bg-black/30" />

      <div className="absolute left-1/2 top-1/3 transform -translate-x-1/2 z-10">
        {renderTiles()}

        {allCombatants.map((combatant) => {
          const animState = animatedPositions.find((a) => a.combatantId === combatant.id) || {
            pos: combatant.position,
            isMoving: false,
            direction: "down" as DirectionName,
          };

          const screenPos = getScreenPositionStyle(animState.pos.x, animState.pos.y);

          if (combatant.type === "enemy") {
            const spriteFilename = combatant.sprite?.split("/").pop() || "ice-guardian.png";
            return (
              <div
                key={combatant.id}
                className="absolute transform -translate-x-1/2 -translate-y-full"
                style={screenPos}
              >
                <EnemySprite
                  spriteUrl={getEnemySpriteUrl(combatant.name, combatant.sprite)}
                  spriteFilename={spriteFilename}
                  name={combatant.name}
                  shouldFace="right"
                  className="max-h-32 w-auto"
                />
              </div>
            );
          } else if (combatant.type === "player") {
            const avatarUrl = getHabboAvatarUrl(combatant.name);
            return (
              <div
                key={combatant.id}
                className="absolute transform -translate-x-1/2 -translate-y-full"
                style={screenPos}
              >
                <img
                  src={avatarUrl}
                  alt={combatant.name}
                  className="pixelated max-h-24 w-auto"
                  style={{ imageRendering: "pixelated" }}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "/src/assets/npc-warrior.png";
                  }}
                />
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
};
