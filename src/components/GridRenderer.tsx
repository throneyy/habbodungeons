// components/GridRenderer.tsx - Optimized large grid renderer

import React, { useMemo } from 'react';
import { DungeonGrid, GridPosition, getTileAt } from '@/lib/gridSystem';
import { gridToScreen, calculateZIndex, ISO_TILE_WIDTH, ISO_TILE_HEIGHT } from '@/lib/isometricUtils';

interface GridRendererProps {
  grid: DungeonGrid;
  offsetX?: number;
  offsetY?: number;
  highlightedTiles?: GridPosition[];
  onTileClick?: (pos: GridPosition) => void;
  showGridLines?: boolean;
}

export const GridRenderer: React.FC<GridRendererProps> = ({
  grid,
  offsetX = 0,
  offsetY = 0,
  highlightedTiles = [],
  onTileClick,
  showGridLines = true,
}) => {
  const tileElements = useMemo(() => {
    const elements: JSX.Element[] = [];
    
    // Render only a subset for performance (can add culling later)
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const tile = getTileAt(grid, { x, y });
        if (!tile) continue;
        
        const screenPos = gridToScreen(tile.position);
        const finalX = screenPos.x + offsetX;
        const finalY = screenPos.y + offsetY;
        const zIndex = calculateZIndex(tile.position);
        
        const isHighlighted = highlightedTiles.some(
          (h) => h.x === tile.position.x && h.y === tile.position.y
        );
        
        let bgColor = 'bg-slate-800/10';
        if (tile.variant === 'ice') bgColor = 'bg-cyan-500/5';
        if (tile.variant === 'stone') bgColor = 'bg-slate-700/10';
        if (tile.variant === 'crystal') bgColor = 'bg-blue-400/15';
        if (tile.variant === 'chasm') bgColor = 'bg-black/30';
        if (!tile.walkable) bgColor = 'bg-red-900/20';
        
        if (isHighlighted) {
          bgColor = 'bg-cyan-400/40';
        }
        
        const borderClass = showGridLines ? 'border border-slate-600/20' : '';
        
        elements.push(
          <div
            key={tile.id}
            className={`absolute ${bgColor} ${borderClass} cursor-pointer transition-all hover:bg-cyan-300/30`}
            style={{
              left: `${finalX}px`,
              top: `${finalY}px`,
              width: `${ISO_TILE_WIDTH}px`,
              height: `${ISO_TILE_HEIGHT}px`,
              zIndex,
              transform: 'rotateX(60deg) rotateZ(45deg)',
              transformOrigin: 'center',
            }}
            onClick={() => onTileClick?.(tile.position)}
          />
        );
      }
    }
    
    return elements;
  }, [grid, offsetX, offsetY, highlightedTiles, showGridLines, onTileClick]);
  
  return <>{tileElements}</>;
};
