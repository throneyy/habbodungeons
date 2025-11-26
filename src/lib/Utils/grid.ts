// Utils/grid.ts

import { GridPosition } from './types';
import { TILE_WIDTH, TILE_HEIGHT } from './habbo';

/**
 * Convert grid coordinates to isometric screen position
 */
export function toIsometricScreenPos(gridPos: GridPosition, gridCols: number, gridRows: number): { x: number; y: number } {
  const { x, y } = gridPos;
  
  // Isometric projection formula
  const isoX = (x - y) * (TILE_WIDTH / 2);
  const isoY = (x + y) * (TILE_HEIGHT / 2);
  
  // Center the grid on screen
  const offsetX = (gridCols * TILE_WIDTH) / 2;
  const offsetY = 50; // Top padding
  
  return {
    x: isoX + offsetX,
    y: isoY + offsetY,
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
 */
export function findReachableTiles(
  startPos: GridPosition,
  moveRange: number,
  gridCols: number,
  gridRows: number,
  occupiedPositions: GridPosition[]
): GridPosition[] {
  const reachable: GridPosition[] = [];
  const visited = new Set<string>();
  const queue: Array<{ pos: GridPosition; dist: number }> = [{ pos: startPos, dist: 0 }];
  
  const posKey = (p: GridPosition) => `${p.x},${p.y}`;
  const isOccupied = (p: GridPosition) => 
    occupiedPositions.some(op => op.x === p.x && op.y === p.y);
  
  visited.add(posKey(startPos));
  
  while (queue.length > 0) {
    const { pos, dist } = queue.shift()!;
    
    if (dist <= moveRange) {
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
          queue.push({ pos: nextPos, dist: dist + 1 });
        }
      }
    }
  }
  
  return reachable;
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
      return reconstructPath(startPos, endPos, parent);
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
  start: GridPosition,
  end: GridPosition,
  parent: Map<string, GridPosition>
): GridPosition[] {
  const path: GridPosition[] = [];
  const posKey = (p: GridPosition) => `${p.x},${p.y}`;
  
  let current = end;
  
  while (current.x !== start.x || current.y !== start.y) {
    path.unshift(current);
    const key = posKey(current);
    const prev = parent.get(key);
    
    if (!prev) break;
    current = prev;
  }
  
  path.unshift(start);
  return path;
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
