// components/GridRenderer.tsx - Optimized large grid renderer

import React, { useMemo, useState } from 'react';
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
  const [hoveredTile, setHoveredTile] = useState<GridPosition | null>(null);
  
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
        
        const isHovered = hoveredTile?.x === tile.position.x && hoveredTile?.y === tile.position.y;
        
        // Walkability-based coloring: RED = walkable, BLUE = blocked
        let tileColor: string;
        if (isHighlighted) {
          tileColor = 'rgba(0, 255, 255, 0.4)'; // Cyan for highlighted
        } else if (tile.walkable) {
          tileColor = isHovered ? 'rgba(255, 77, 77, 0.6)' : 'rgba(255, 77, 77, 0.15)'; // RED
        } else {
          tileColor = isHovered ? 'rgba(0, 68, 255, 0.35)' : 'rgba(0, 68, 255, 0.15)'; // BLUE
        }
        
        const borderClass = showGridLines ? 'border border-slate-600/20' : '';
        
        elements.push(
          <div
            key={tile.id}
            className={`absolute ${borderClass} cursor-pointer transition-colors`}
            style={{
              left: `${finalX}px`,
              top: `${finalY}px`,
              width: `${ISO_TILE_WIDTH}px`,
              height: `${ISO_TILE_HEIGHT}px`,
              zIndex,
              backgroundColor: tileColor,
            }}
            onClick={() => onTileClick?.(tile.position)}
            onMouseEnter={() => setHoveredTile(tile.position)}
            onMouseLeave={() => setHoveredTile(null)}
          />
        );
      }
    }
    
    return elements;
  }, [grid, offsetX, offsetY, highlightedTiles, showGridLines, onTileClick, hoveredTile]);
  
  return <>{tileElements}</>;
};
