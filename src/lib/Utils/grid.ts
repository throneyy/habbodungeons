// Utils/grid.ts

import { GridPosition } from './types';
import { TILE_WIDTH, TILE_HEIGHT } from './habbo';

/**
 * Convert grid coordinates to isometric screen position
 */
export function toIsometricScreenPos(gridPos: GridPosition, gridCols: number, gridRows: number): { x: number; y: number } {
  const { x, y } = gridPos;
  
  // Isometric projection formula
  const pixelX = (x * TILE_WIDTH / 2) - (y * TILE_WIDTH / 2);
  const pixelY = (x * TILE_HEIGHT / 2) + (y * TILE_HEIGHT / 2);
  
  // Center the grid on screen
  const offsetX = (gridCols * TILE_WIDTH) / 2;
  const offsetY = 50;
  
  return {
    x: pixelX + offsetX,
    y: pixelY + offsetY,
  };
}

/**
 * Check if a grid position is valid
 */
export function isValidPosition(pos: GridPosition, gridCols: number, gridRows: number): boolean {
  return pos.x >= 0 && pos.x < gridCols && pos.y >= 0 && pos.y < gridRows;
}

/**
 * Get Manhattan distance between two positions
 */
export function getManhattanDistance(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Helper to check position equality
 */
export const isSamePosition = (p1: GridPosition, p2: GridPosition) => p1.x === p2.x && p1.y === p2.y;

/**
 * Get distance (alias for getManhattanDistance)
 */
export const getDistance = getManhattanDistance;

/**
 * Get all adjacent positions (4-directional)
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
 * BFS to find all reachable tiles within movement range
 * Returns both the reachable tiles and the parent map for pathfinding
 */
export function findReachableTiles(
  startPos: GridPosition,
  moveRange: number,
  gridCols: number,
  gridRows: number,
  occupiedPositions: GridPosition[]
): { reachable: GridPosition[]; paths: Map<string, GridPosition | null> } {
  const reachable: GridPosition[] = [];
  const visited = new Set<string>();
  const queue: Array<{ pos: GridPosition; dist: number }> = [{ pos: startPos, dist: 0 }];
  const paths = new Map<string, GridPosition | null>();
  
  const posKey = (p: GridPosition) => `${p.x},${p.y}`;
  const isOccupied = (p: GridPosition) => 
    occupiedPositions.some(op => op.x === p.x && op.y === p.y);
  
  visited.add(posKey(startPos));
  paths.set(posKey(startPos), null);
  
  while (queue.length > 0) {
    const { pos, dist } = queue.shift()!;
    
    if (dist > 0 && dist <= moveRange) {
      reachable.push(pos);
    }
    
    if (dist < moveRange) {
      const adjacent = getAdjacentPositions(pos);
      
      for (const nextPos of adjacent) {
        const key = posKey(nextPos);
        
        if (
          !visited.has(key) &&
          isValidPosition(nextPos, gridCols, gridRows) &&
          !isOccupied(nextPos)
        ) {
          visited.add(key);
          paths.set(key, pos);
          queue.push({ pos: nextPos, dist: dist + 1 });
        }
      }
    }
  }
  
  return { reachable, paths };
}

/**
 * BFS to find shortest path between two positions
 */
export function findPath(
  startPos: GridPosition,
  endPos: GridPosition,
  gridCols: number,
  gridRows: number,
  occupiedPositions: GridPosition[]
): GridPosition[] | null {
  const visited = new Set<string>();
  const parent = new Map<string, GridPosition>();
  const queue: GridPosition[] = [startPos];
  
  const posKey = (p: GridPosition) => `${p.x},${p.y}`;
  const isOccupied = (p: GridPosition) => 
    occupiedPositions.some(op => op.x === p.x && op.y === p.y);
  
  visited.add(posKey(startPos));
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    // Found destination
    if (current.x === endPos.x && current.y === endPos.y) {
      return reconstructPath(endPos, parent);
    }
    
    const adjacent = getAdjacentPositions(current);
    
    for (const nextPos of adjacent) {
      const key = posKey(nextPos);
      
      if (
        !visited.has(key) &&
        isValidPosition(nextPos, gridCols, gridRows) &&
        (nextPos.x === endPos.x && nextPos.y === endPos.y || !isOccupied(nextPos))
      ) {
        visited.add(key);
        parent.set(key, current);
        queue.push(nextPos);
      }
    }
  }
  
  return null; // No path found
}

/**
 * Reconstruct path from BFS parent map
 */
export function reconstructPath(
  target: GridPosition,
  paths: Map<string, GridPosition | null>
): GridPosition[] {
  const path: GridPosition[] = [];
  const posKey = (p: GridPosition) => `${p.x},${p.y}`;
  
  let current: GridPosition | null = target;
  while (current) {
    path.push(current);
    const parentPos = paths.get(posKey(current));
    if (parentPos === null || !parentPos) break;
    current = parentPos;
  }
  
  return path.reverse();
}

/**
 * Get direction name based on position difference
 */
export function getDirectionFromDelta(dx: number, dy: number): string {
  if (dx > 0 && dy === 0) return 'right';
  if (dx < 0 && dy === 0) return 'left';
  if (dx === 0 && dy > 0) return 'down';
  if (dx === 0 && dy < 0) return 'up';
  if (dx > 0 && dy > 0) return 'down-right';
  if (dx > 0 && dy < 0) return 'up-right';
  if (dx < 0 && dy > 0) return 'down-left';
  if (dx < 0 && dy < 0) return 'up-left';
  return 'down'; // default
}
