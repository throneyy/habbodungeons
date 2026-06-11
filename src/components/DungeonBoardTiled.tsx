// Components/DungeonBoardTiled.tsx
//
// Tile-based isometric battle arena for the real /battle/:id page.
//
// Key properties:
//  - 12x8 isometric grid built from the same GridRenderer used in /battle-sim.
//  - Background image is rendered inside the same scaled inner-stage box that the
//    tiles live in, so the dungeon art and the tile grid always line up no matter
//    the container size.
//  - Players are HabboAvatarSprite tokens that animate frame-by-frame when their
//    tile position changes (walking instead of sliding). When a player attacks an
//    enemy, their token walks to a tile adjacent to that enemy and back.
//  - Enemies render via EnemySprite on assigned tiles.
//
// Combat logic stays server-driven. This component only owns the visual
// representation of entity positions; it does not mutate battle state.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { GridRenderer } from "./GridRenderer";
import { HabboAvatarSprite } from "./HabboAvatarSprite";
import { EnemySprite } from "./EnemySprite";
import {
  generateLargeDungeonGrid,
  GridPosition,
  getAdjacentPositions,
  isValidGridPosition,
  getTileAt,
} from "@/lib/gridSystem";
import {
  gridToScreen,
  calculateZIndex,
  calculateGridCenterOffset,
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
} from "@/lib/isometricUtils";
import { DirectionName } from "@/lib/Utils/habbo";
import { getDirectionFromDelta, findPath } from "@/lib/Utils/grid";

// Rotated 90° from the original 12x8: now 8 wide, 12 deep so the grid runs
// "into the screen" instead of across it.
const GRID_COLS = 8;
const GRID_ROWS = 12;

// Tight iso bounding box of the diamond. width = (cols+rows) * tileW/2,
// height = (cols+rows-1) * tileH/2 + tileH.
const STAGE_W = (GRID_COLS + GRID_ROWS) * (ISO_TILE_WIDTH / 2); // 320
const STAGE_H = (GRID_COLS + GRID_ROWS - 1) * (ISO_TILE_HEIGHT / 2) + ISO_TILE_HEIGHT; // 168

const DEFAULT_FIGURE = "hr-100-61.hd-180-1.ch-210-66.lg-270-82.sh-290-62";

// On the rotated 8x12 grid, players cluster near the front (high y, high x)
// and enemies near the back (low y, low x). Tiles chosen so a screen-diagonal
// line of party members sits on the right edge of the diamond.
const PLAYER_SLOT_TILES: GridPosition[] = [
  { x: 6, y: 8 },
  { x: 7, y: 7 },
  { x: 5, y: 9 },
  { x: 7, y: 9 },
  { x: 5, y: 7 },
  { x: 6, y: 10 },
];

const ENEMY_SLOT_TILES: GridPosition[] = [
  { x: 1, y: 3 },
  { x: 2, y: 2 },
  { x: 0, y: 4 },
  { x: 2, y: 4 },
  { x: 0, y: 2 },
  { x: 1, y: 5 },
];

interface DungeonEntity {
  id: string;
  type: "player" | "enemy";
  x: number;
  y: number;
  slotId?: string;
  username?: string;
  name?: string;
  habboAvatar?: string | null;
  figureString?: string | null;
  sprite?: string;
  spriteFilename?: string;
  current_hp?: number;
  max_hp?: number;
  isDead?: boolean;
}

interface DungeonBoardTiledProps {
  dungeon: {
    width: number;
    height: number;
    entities: DungeonEntity[];
  };
  backgroundImageUrl: string | null;
  attackingEntityId?: string;
  targetEntityId?: string;
  damageDealt?: { entityId: string; amount: number };
}

// Pick a tile adjacent to `target` that is closest to `from` so the attacker
// walks toward the enemy from their own side rather than around it.
function adjacentTileTowards(
  target: GridPosition,
  from: GridPosition,
  blocked: GridPosition[],
): GridPosition {
  const candidates = getAdjacentPositions(target).filter((p) =>
    isValidGridPosition({ cols: GRID_COLS, rows: GRID_ROWS, tiles: [] }, p) &&
    !blocked.some((b) => b.x === p.x && b.y === p.y),
  );
  if (candidates.length === 0) return target;
  candidates.sort(
    (a, b) =>
      Math.abs(a.x - from.x) + Math.abs(a.y - from.y) -
      (Math.abs(b.x - from.x) + Math.abs(b.y - from.y)),
  );
  return candidates[0];
}

const PlayerToken: React.FC<{
  entity: DungeonEntity;
  tile: GridPosition;
  offsetX: number;
  offsetY: number;
  blockedTiles: GridPosition[];
}> = ({ entity, tile, offsetX, offsetY, blockedTiles }) => {
  // The tile the sprite is *currently rendered on* (steps along a BFS path
  // one tile at a time, ~500ms per step, Habbo-style).
  const [currentTile, setCurrentTile] = useState<GridPosition>(tile);
  const [direction, setDirection] = useState<DirectionName>("down-left");
  const [isWalking, setIsWalking] = useState(false);
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathRef = useRef<GridPosition[]>([]);
  const STEP_MS = 500;

  // When the target tile changes, compute a BFS path from where we currently
  // are and start stepping along it.
  useEffect(() => {
    if (currentTile.x === tile.x && currentTile.y === tile.y) return;
    // Don't treat our own current tile as blocked.
    const blocked = blockedTiles.filter(
      (b) =>
        !(b.x === currentTile.x && b.y === currentTile.y) &&
        !(b.x === tile.x && b.y === tile.y),
    );
    const path = findPath(currentTile, tile, GRID_COLS, GRID_ROWS, blocked);
    if (!path || path.length < 2) {
      // No path -> just snap.
      setCurrentTile(tile);
      return;
    }
    pathRef.current = path.slice(1); // drop start tile
    setIsWalking(true);

    const step = () => {
      const next = pathRef.current.shift();
      if (!next) {
        setIsWalking(false);
        return;
      }
      setCurrentTile((prev) => {
        const dir = getDirectionFromDelta(
          next.x - prev.x,
          next.y - prev.y,
        ) as DirectionName;
        setDirection(dir);
        return next;
      });
      stepTimer.current = setTimeout(step, STEP_MS);
    };
    if (stepTimer.current) clearTimeout(stepTimer.current);
    stepTimer.current = setTimeout(step, 0);

    return () => {
      if (stepTimer.current) clearTimeout(stepTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile.x, tile.y]);

  useEffect(() => () => {
    if (stepTimer.current) clearTimeout(stepTimer.current);
  }, []);

  const screen = gridToScreen(currentTile);
  const left = screen.x + offsetX;
  const top = screen.y + offsetY;
  const z = calculateZIndex(currentTile) + 1000;

  return (
    <div
      className="absolute"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        zIndex: z,
        transition: `left ${STEP_MS}ms linear, top ${STEP_MS}ms linear`,
        opacity: entity.isDead ? 0.35 : 1,
        filter: entity.isDead ? "grayscale(1)" : undefined,
      }}
    >
      <HabboAvatarSprite
        figureString={entity.figureString || DEFAULT_FIGURE}
        direction={direction}
        isWalking={isWalking}
        heightPx={64}
      />
    </div>
  );
};

export const DungeonBoardTiled: React.FC<DungeonBoardTiledProps> = ({
  dungeon,
  backgroundImageUrl,
  attackingEntityId,
  targetEntityId,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Static grid (no random unwalkable tiles for the real arena - we want a clean
  // tactical floor that mirrors the dungeon art behind it).
  const grid = useMemo(() => {
    const g = generateLargeDungeonGrid(GRID_COLS, GRID_ROWS);
    g.tiles = g.tiles.map((t) => ({ ...t, walkable: true, variant: "ice" as const }));
    return g;
  }, []);

  const offset = useMemo(
    () => calculateGridCenterOffset(GRID_COLS, GRID_ROWS, STAGE_W, STAGE_H),
    [],
  );

  // Fit the native-size inner stage to the container while preserving aspect.
  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const measure = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const s = Math.min(cw / STAGE_W, ch / STAGE_H);
      setScale(s > 0 ? s : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute home tile for each entity, then decide if attacker should walk to
  // an adjacent-target tile this frame.
  const layout = useMemo(() => {
    const players = dungeon.entities.filter((e) => e.type === "player");
    const enemies = dungeon.entities.filter((e) => e.type === "enemy");

    const homeFor = (e: DungeonEntity, indexAmongType: number): GridPosition => {
      if (e.type === "player") {
        const slotIdx = e.slotId
          ? Math.max(0, parseInt(e.slotId.replace(/[^0-9]/g, ""), 10) - 1)
          : indexAmongType;
        return PLAYER_SLOT_TILES[slotIdx % PLAYER_SLOT_TILES.length];
      }
      return ENEMY_SLOT_TILES[indexAmongType % ENEMY_SLOT_TILES.length];
    };

    const homeMap = new Map<string, GridPosition>();
    players.forEach((p, i) => homeMap.set(p.id, homeFor(p, i)));
    enemies.forEach((e, i) => homeMap.set(e.id, homeFor(e, i)));

    // If a player is attacking an enemy, walk them to a tile adjacent to that
    // enemy (chosen on the side closest to the player's home tile).
    const tileFor = (e: DungeonEntity): GridPosition => {
      const home = homeMap.get(e.id)!;
      if (
        e.type === "player" &&
        attackingEntityId === e.id &&
        targetEntityId &&
        targetEntityId !== e.id
      ) {
        const targetHome = homeMap.get(targetEntityId);
        if (targetHome) {
          const blocked = Array.from(homeMap.entries())
            .filter(([id]) => id !== e.id && id !== targetEntityId)
            .map(([, p]) => p);
          return adjacentTileTowards(targetHome, home, blocked);
        }
      }
      return home;
    };

    return dungeon.entities.map((e) => ({ entity: e, tile: tileFor(e) }));
  }, [dungeon.entities, attackingEntityId, targetEntityId]);

  return (
    <div className="absolute inset-0 w-full h-full flex items-center justify-center">
      <div
        ref={wrapperRef}
        className="relative w-[95%] max-w-[1600px] mx-auto aspect-[16/10] rounded-lg overflow-hidden border-4 border-border/50 shadow-2xl bg-habbo-dark"
      >
        {/* Native-size inner stage: tiles + bg live here, scaled together. */}
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            width: `${STAGE_W}px`,
            height: `${STAGE_H}px`,
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          {/* Background image temporarily disabled - it never lined up with the
              isometric tiles. The plain dark backdrop on the outer wrapper now
              acts as the arena floor until we have proper tile-aligned art. */}
          <div className="absolute inset-0 bg-slate-900/20" />

          {/* Tile grid (clip-path diamonds, click no-op for now). */}
          <GridRenderer
            grid={grid}
            offsetX={offset.x}
            offsetY={offset.y}
            highlightedTiles={[]}
            showGridLines={false}
          />

          {/* Enemies */}
          {layout
            .filter(({ entity }) => entity.type === "enemy")
            .map(({ entity, tile }) => {
              const screen = gridToScreen(tile);
              const finalX = screen.x + offset.x;
              const finalY = screen.y + offset.y;
              const z = calculateZIndex(tile);
              const spriteUrl = entity.sprite || "";
              const filename =
                entity.spriteFilename || (spriteUrl ? spriteUrl.split("/").pop() : "");
              if (!spriteUrl) return null;
              return (
                <EnemySprite
                  key={entity.id}
                  spriteUrl={spriteUrl}
                  spriteFilename={filename || undefined}
                  name={undefined}
                  position={tile}
                  shouldFace="right"
                  screenX={finalX}
                  screenY={finalY}
                  zIndex={z}
                  style={{
                    opacity: entity.isDead ? 0.35 : 1,
                    filter: entity.isDead ? "grayscale(1)" : undefined,
                    transition: "left 0.4s ease-in-out, top 0.4s ease-in-out",
                  }}
                />
              );
            })}

          {/* Players */}
          {layout
            .filter(({ entity }) => entity.type === "player")
            .map(({ entity, tile }) => {
              // Block other entities' home tiles so pathfinding routes around them.
              const blocked = layout
                .filter((l) => l.entity.id !== entity.id && !l.entity.isDead)
                .map((l) => l.tile);
              return (
                <PlayerToken
                  key={entity.id}
                  entity={entity}
                  tile={tile}
                  offsetX={offset.x}
                  offsetY={offset.y}
                  blockedTiles={blocked}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default DungeonBoardTiled;