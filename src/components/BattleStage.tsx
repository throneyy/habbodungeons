// Components/BattleStage.tsx - Large grid tactical battle visualization
//
// FIXED (previous patch):
//  - Player avatars use the animated HabboAvatarSprite with the official imager.
//  - Reachable tiles highlight during the move phase; clicking one moves you;
//    clicking an enemy in the attack phase attacks it.
//
// FIXED (this patch):
//  - Habbos WALK now, they don't glide: movement animates tile-by-tile along a
//    BFS path through walkable tiles (the old single CSS slide cut diagonally
//    across the whole move — through walls and over chasms).
//  - Depth sorting: players no longer float in front of every enemy. Both use
//    the same isometric z formula, so standing behind something occludes you.
//  - The default background is a proper Vite asset import ("/src/assets/..."
//    string paths 404 in production builds).

import React, { useMemo } from "react";
import { GridPosition, Combatant, BattleState } from "../lib/Utils/types";
import { generateLargeDungeonGrid, Enemy, findReachableTiles, getTileAt } from "../lib/gridSystem";
import { gridToScreen, calculateZIndex, calculateGridCenterOffset } from "../lib/isometricUtils";
import { getDirectionFromDelta } from "../lib/Utils/grid";
import { DirectionName } from "../lib/Utils/habbo";
import { GridRenderer } from "./GridRenderer";
import { HabboAvatarSprite } from "./HabboAvatarSprite";
import { EnemySprite as EnemySpriteComponent } from "./EnemySprite";
import { getEnemySpriteUrl as getEnemySprite } from "../lib/enemySprites";
import defaultDungeonBg from "../assets/icedungeon.png";

const DEFAULT_FIGURE = "hr-100-61.hd-180-1.ch-210-66.lg-270-82.sh-290-62";

/** ms per tile step — close to the classic Habbo walk cadence. */
const STEP_MS = 240;

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
 * BFS path through walkable, unoccupied tiles (8-directional, like Habbo).
 * Returns the steps from start (exclusive) to goal (inclusive). Falls back to
 * a direct hop if no path exists so the token can never get stuck.
 */
function findPath(
  grid: ReturnType<typeof generateLargeDungeonGrid>,
  start: GridPosition,
  goal: GridPosition,
  blocked: GridPosition[],
): GridPosition[] {
  const key = (p: GridPosition) => `${p.x},${p.y}`;
  if (start.x === goal.x && start.y === goal.y) return [];

  const blockedSet = new Set(blocked.map(key));
  blockedSet.delete(key(goal));

  const cameFrom = new Map<string, GridPosition>();
  const visited = new Set<string>([key(start)]);
  const queue: GridPosition[] = [start];
  const dirs = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
  ];

  let guard = 0;
  while (queue.length > 0 && guard++ < 8000) {
    const cur = queue.shift()!;
    if (cur.x === goal.x && cur.y === goal.y) {
      const path: GridPosition[] = [];
      let node: GridPosition | undefined = cur;
      while (node && !(node.x === start.x && node.y === start.y)) {
        path.unshift(node);
        node = cameFrom.get(key(node));
      }
      return path;
    }
    for (const d of dirs) {
      const np = { x: cur.x + d.x, y: cur.y + d.y };
      const nk = key(np);
      if (visited.has(nk) || blockedSet.has(nk)) continue;
      const tile = getTileAt(grid, np);
      if (!tile || !tile.walkable) continue;
      visited.add(nk);
      cameFrom.set(nk, cur);
      queue.push(np);
    }
  }
  return [goal]; // no path: hop directly rather than freeze
}

/**
 * A single player token that walks tile-by-tile along a real path, facing each
 * step's direction — Habbos walk, they don't glide.
 */
const PlayerToken: React.FC<{
  combatant: Combatant;
  grid: ReturnType<typeof generateLargeDungeonGrid>;
  blocked: GridPosition[];
  toScreen: (pos: GridPosition) => { x: number; y: number };
  isActive: boolean;
}> = ({ combatant, grid, blocked, toScreen, isActive }) => {
  const [renderPos, setRenderPos] = React.useState<GridPosition>(combatant.position);
  const renderPosRef = React.useRef<GridPosition>(combatant.position);
  const [direction, setDirection] = React.useState<DirectionName>("down-left");
  const [isWalking, setIsWalking] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const from = renderPosRef.current;
    const to = combatant.position;
    if (from.x === to.x && from.y === to.y) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    const path = findPath(grid, from, to, blocked);
    setIsWalking(true);

    let i = 0;
    let cur = from;
    const step = () => {
      if (i >= path.length) {
        setIsWalking(false);
        timerRef.current = null;
        return;
      }
      const next = path[i];
      const dir = getDirectionFromDelta(next.x - cur.x, next.y - cur.y) as DirectionName;
      setDirection(dir);
      renderPosRef.current = next;
      setRenderPos(next);
      cur = next;
      i++;
      timerRef.current = setTimeout(step, STEP_MS);
    };
    step();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combatant.position.x, combatant.position.y]);

  const screen = toScreen(renderPos);
  // Same depth formula as enemies (+1 so the avatar sits above its own tile,
  // but still sorts correctly against everything else on the grid).
  const zIndex = calculateZIndex(renderPos) + 1;

  return (
    <div
      className="absolute"
      style={{
        left: `${screen.x}px`,
        top: `${screen.y}px`,
        zIndex,
        // One smooth slide per tile step; the walk frames animate inside it.
        transition: `left ${STEP_MS}ms linear, top ${STEP_MS}ms linear`,
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

  const toScreen = React.useCallback(
    (pos: GridPosition) => {
      const s = gridToScreen(pos);
      return { x: s.x + gridOffset.x, y: s.y + gridOffset.y };
    },
    [gridOffset.x, gridOffset.y]
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
          level: (c as any).level ?? 1,
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
      {/* Dungeon Background (imported asset so production builds resolve it) */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-90"
        style={{
          backgroundImage: `url(${backgroundUrl || defaultDungeonBg})`,
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
            const screenPos = toScreen(enemy.position);
            const zIndex = calculateZIndex(enemy.position) + 1;
            const spriteFilename = enemy.spriteUrl.split("/").pop() || "";

            return (
              <EnemySpriteComponent
                key={enemy.id}
                spriteUrl={enemy.spriteUrl}
                spriteFilename={spriteFilename}
                name={enemy.name}
                position={enemy.position}
                shouldFace="right"
                screenX={screenPos.x}
                screenY={screenPos.y}
                zIndex={zIndex}
                onClick={() => handleEnemyClick(enemy.id, enemy.name)}
              />
            );
          })}

          {/* Player Sprites (walk tile-by-tile, facing each step) */}
          {allCombatants
            .filter((c) => c.type === "player")
            .map((combatant) => {
              const blocked = allCombatants
                .filter((c) => c.id !== combatant.id)
                .map((c) => c.position);
              return (
                <PlayerToken
                  key={combatant.id}
                  combatant={combatant}
                  grid={dungeonGrid}
                  blocked={blocked}
                  toScreen={toScreen}
                  isActive={currentCombatant?.id === combatant.id}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
};
