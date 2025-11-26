// Components/BattleStage.tsx - Large grid tactical battle visualization

import React, { useMemo } from "react";
import { GridPosition, Combatant, BattleState } from "../lib/Utils/types";
import { generateLargeDungeonGrid, Enemy } from "../lib/gridSystem";
import { gridToScreen, calculateZIndex, calculateGridCenterOffset } from "../lib/isometricUtils";
import { GridRenderer } from "./GridRenderer";
import { EnemySprite as EnemySpriteComponent } from "./EnemySprite";
import { getEnemySpriteUrl as getEnemySprite } from "../lib/enemySprites";

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
  const { allCombatants, partyIds, phase } = state;
  const currentCombatant = allCombatants.find((c) => c.id === state.turnOrder[state.currentTurnIndex]);
  const isPlayerTurn = currentCombatant && currentCombatant.type === "player";
  
  // Generate large dungeon grid
  const dungeonGrid = useMemo(() => generateLargeDungeonGrid(gridSize.cols, gridSize.rows), [gridSize.cols, gridSize.rows]);
  
  // Calculate center offset for the grid
  const gridOffset = useMemo(() => calculateGridCenterOffset(gridSize.cols, gridSize.rows, 1200, 800), [gridSize.cols, gridSize.rows]);

  // Convert enemies to Enemy type for rendering
  const enemies: Enemy[] = useMemo(() => 
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
          {/* Grid Renderer */}
          {showGridOverlay && (
            <GridRenderer
              grid={dungeonGrid}
              offsetX={gridOffset.x}
              offsetY={gridOffset.y}
              showGridLines={isGridEditorActive}
              onTileClick={(pos) => {
                if (isGridEditorActive && onGridCellClick) {
                  onGridCellClick(pos.x, pos.y);
                }
              }}
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
                onClick={() => {
                  console.log("Clicked enemy:", enemy.name);
                }}
              />
            );
          })}
          
          {/* Player Sprites */}
          {allCombatants.filter((c) => c.type === "player").map((combatant) => {
            const screenPos = gridToScreen(combatant.position);
            const finalX = screenPos.x + gridOffset.x;
            const finalY = screenPos.y + gridOffset.y;
            const zIndex = calculateZIndex(combatant.position);
            const avatarUrl = `https://lookup.thequackory.com/habbo-imaging/${encodeURIComponent(combatant.name)}?hotel=COM&size=s&action=std&gesture=std&direction=4&head_direction=4&service=official`;
            
            return (
              <div
                key={combatant.id}
                className="absolute"
                style={{
                  left: `${finalX}px`,
                  top: `${finalY}px`,
                  zIndex: zIndex + 1000,
                  transform: 'translate(-50%, -100%)',
                }}
              >
                <img
                  src={avatarUrl}
                  alt={combatant.name}
                  className="pixelated max-h-24 w-auto drop-shadow-lg"
                  style={{ imageRendering: "pixelated" }}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "/src/assets/npc-warrior.png";
                  }}
                />
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/80 px-2 py-1 rounded text-xs text-white whitespace-nowrap">
                  {combatant.name}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
