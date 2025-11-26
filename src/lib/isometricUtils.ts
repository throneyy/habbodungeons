// lib/isometricUtils.ts - Isometric coordinate conversion and rendering math

import { GridPosition } from './gridSystem';

export const ISO_TILE_WIDTH = 32;
export const ISO_TILE_HEIGHT = 16;

/**
 * Convert grid coordinates to isometric screen coordinates
 */
export function gridToScreen(gridPos: GridPosition): { x: number; y: number } {
  const { x, y } = gridPos;
  
  // Classic isometric formula
  const screenX = (x - y) * (ISO_TILE_WIDTH / 2);
  const screenY = (x + y) * (ISO_TILE_HEIGHT / 2);
  
  return { x: screenX, y: screenY };
}

/**
 * Convert screen coordinates to grid coordinates (approximate)
 */
export function screenToGrid(screenX: number, screenY: number): GridPosition {
  // Inverse isometric formula
  const gridX = Math.floor((screenX / (ISO_TILE_WIDTH / 2) + screenY / (ISO_TILE_HEIGHT / 2)) / 2);
  const gridY = Math.floor((screenY / (ISO_TILE_HEIGHT / 2) - screenX / (ISO_TILE_WIDTH / 2)) / 2);
  
  return { x: gridX, y: gridY };
}

/**
 * Calculate z-index for depth sorting
 */
export function calculateZIndex(gridPos: GridPosition, heightOffset = 0): number {
  return Math.floor(gridPos.x + gridPos.y + heightOffset);
}

/**
 * Get viewport bounds for culling (only render visible tiles)
 */
export function getVisibleTileBounds(
  scrollX: number,
  scrollY: number,
  viewportWidth: number,
  viewportHeight: number,
  gridCols: number,
  gridRows: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  // Add padding for smooth scrolling
  const padding = 5;
  
  const topLeft = screenToGrid(scrollX - padding * ISO_TILE_WIDTH, scrollY - padding * ISO_TILE_HEIGHT);
  const bottomRight = screenToGrid(
    scrollX + viewportWidth + padding * ISO_TILE_WIDTH,
    scrollY + viewportHeight + padding * ISO_TILE_HEIGHT
  );
  
  return {
    minX: Math.max(0, topLeft.x),
    maxX: Math.min(gridCols - 1, bottomRight.x),
    minY: Math.max(0, topLeft.y),
    maxY: Math.min(gridRows - 1, bottomRight.y),
  };
}

/**
 * Calculate grid center offset for centering the dungeon
 */
export function calculateGridCenterOffset(
  gridCols: number,
  gridRows: number,
  containerWidth: number,
  containerHeight: number
): { x: number; y: number } {
  const gridScreenWidth = gridCols * ISO_TILE_WIDTH;
  const gridScreenHeight = gridRows * ISO_TILE_HEIGHT;
  
  return {
    x: (containerWidth - gridScreenWidth) / 2 + (gridCols * ISO_TILE_WIDTH) / 2,
    y: (containerHeight - gridScreenHeight) / 2,
  };
}
