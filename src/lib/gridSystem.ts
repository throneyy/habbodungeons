// lib/gridSystem.ts - Large-scale isometric grid system

export interface GridPosition {
  x: number;
  y: number;
}

export type TileVariant = "ice" | "stone" | "crystal" | "chasm" | "decor";

export interface Tile {
  id: string;
  position: GridPosition;
  walkable: boolean;
  height: number;
  variant: TileVariant;
}

export interface DungeonGrid {
  cols: number;
  rows: number;
  tiles: Tile[];
}

export interface Enemy {
  id: string;
  name: string;
  type: string;
  position: GridPosition;
  spriteUrl: string;
  hp: number;
  maxHp: number;
  level: number;
}

/**
 * Generate a large dungeon grid with 1200-1500+ cells
 */
export function generateLargeDungeonGrid(cols = 40, rows = 40): DungeonGrid {
  const tiles: Tile[] = [];
  
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const id = `tile-${x}-${y}`;
      
      // Add some variation to make it interesting
      const rand = Math.random();
      let variant: TileVariant = "ice";
      let walkable = true;
      
      if (rand > 0.95) {
        variant = "crystal";
        walkable = false;
      } else if (rand > 0.90) {
        variant = "stone";
      } else if (rand > 0.85) {
        variant = "decor";
      }
      
      tiles.push({
        id,
        position: { x, y },
        walkable,
        height: 0,
        variant,
      });
    }
  }
  
  return { cols, rows, tiles };
}

/**
 * Get tile at specific position
 */
export function getTileAt(grid: DungeonGrid, pos: GridPosition): Tile | undefined {
  const index = pos.y * grid.cols + pos.x;
  return grid.tiles[index];
}

/**
 * Check if position is valid in grid
 */
export function isValidGridPosition(grid: DungeonGrid, pos: GridPosition): boolean {
  return pos.x >= 0 && pos.x < grid.cols && pos.y >= 0 && pos.y < grid.rows;
}

/**
 * Get adjacent positions (4-directional)
 */
export function getAdjacentPositions(pos: GridPosition): GridPosition[] {
  return [
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x, y: pos.y - 1 },
  ];
}

/**
 * BFS pathfinding for large grids
 */
export function findPath(
  grid: DungeonGrid,
  start: GridPosition,
  end: GridPosition,
  blockedPositions: GridPosition[] = []
): GridPosition[] | null {
  const queue: Array<{ pos: GridPosition; path: GridPosition[] }> = [
    { pos: start, path: [start] },
  ];
  const visited = new Set<string>();
  visited.add(`${start.x},${start.y}`);
  
  const isBlocked = (pos: GridPosition) =>
    blockedPositions.some((bp) => bp.x === pos.x && bp.y === pos.y);
  
  while (queue.length > 0) {
    const { pos, path } = queue.shift()!;
    
    if (pos.x === end.x && pos.y === end.y) {
      return path;
    }
    
    const adjacent = getAdjacentPositions(pos);
    
    for (const next of adjacent) {
      const key = `${next.x},${next.y}`;
      const tile = getTileAt(grid, next);
      
      if (
        !visited.has(key) &&
        isValidGridPosition(grid, next) &&
        tile?.walkable &&
        !isBlocked(next)
      ) {
        visited.add(key);
        queue.push({ pos: next, path: [...path, next] });
      }
    }
  }
  
  return null;
}

/**
 * Find reachable tiles within movement range
 */
export function findReachableTiles(
  grid: DungeonGrid,
  start: GridPosition,
  range: number,
  blockedPositions: GridPosition[] = []
): GridPosition[] {
  const reachable: GridPosition[] = [];
  const queue: Array<{ pos: GridPosition; dist: number }> = [{ pos: start, dist: 0 }];
  const visited = new Set<string>();
  visited.add(`${start.x},${start.y}`);
  
  const isBlocked = (pos: GridPosition) =>
    blockedPositions.some((bp) => bp.x === pos.x && bp.y === pos.y);
  
  while (queue.length > 0) {
    const { pos, dist } = queue.shift()!;
    
    if (dist > 0 && dist <= range) {
      reachable.push(pos);
    }
    
    if (dist < range) {
      const adjacent = getAdjacentPositions(pos);
      
      for (const next of adjacent) {
        const key = `${next.x},${next.y}`;
        const tile = getTileAt(grid, next);
        
        if (
          !visited.has(key) &&
          isValidGridPosition(grid, next) &&
          tile?.walkable &&
          !isBlocked(next)
        ) {
          visited.add(key);
          queue.push({ pos: next, dist: dist + 1 });
        }
      }
    }
  }
  
  return reachable;
}
