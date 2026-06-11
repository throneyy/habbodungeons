// components/GridRenderer.tsx - Optimized large grid renderer
//
// FIXED (previous patch): tiles are clip-path diamonds centered on their iso
// points, so highlights line up under the avatars' feet.
// FIXED (this patch): the pointer cursor + hover effect only appear on tiles
// that are actually actionable (highlighted/reachable, or in editor mode) —
// every tile used to advertise clickability even when clicking did nothing.

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

// Diamond shape (top, right, bottom, left).
const DIAMOND_CLIP = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';

export const GridRenderer: React.FC<GridRendererProps> = ({
  grid,
  offsetX = 0,
  offsetY = 0,
  highlightedTiles = [],
  onTileClick,
  showGridLines = true,
}) => {
  const highlightSet = useMemo(
    () => new Set(highlightedTiles.map((h) => `${h.x},${h.y}`)),
    [highlightedTiles]
  );

  const tileElements = useMemo(() => {
    const elements: JSX.Element[] = [];
    // Slightly shrink diamonds to leave a thin gap = grid lines.
    const scale = showGridLines ? 0.9 : 0.97;
    const w = ISO_TILE_WIDTH * scale;
    const h = ISO_TILE_HEIGHT * scale;

    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const tile = getTileAt(grid, { x, y });
        if (!tile) continue;

        const screenPos = gridToScreen(tile.position);
        const finalX = screenPos.x + offsetX;
        const finalY = screenPos.y + offsetY;
        const zIndex = calculateZIndex(tile.position);
        const isHighlighted = highlightSet.has(`${x},${y}`);
        // Only advertise clickability where a click does something: reachable
        // tiles during the move phase, or any tile in the grid editor.
        const isActionable = isHighlighted || showGridLines;

        let bgColor = 'rgba(148, 163, 184, 0.10)';   // default slate
        if (tile.variant === 'ice') bgColor = 'rgba(6, 182, 212, 0.08)';
        if (tile.variant === 'stone') bgColor = 'rgba(71, 85, 105, 0.14)';
        if (tile.variant === 'crystal') bgColor = 'rgba(59, 130, 246, 0.18)';
        if (tile.variant === 'chasm') bgColor = 'rgba(0, 0, 0, 0.35)';
        if (!tile.walkable) bgColor = 'rgba(127, 29, 29, 0.25)';
        if (isHighlighted) bgColor = 'rgba(34, 211, 238, 0.55)';

        elements.push(
          <div
            key={tile.id}
            className={`absolute transition-colors ${isActionable ? 'cursor-pointer hover:brightness-125' : ''}`}
            style={{
              left: `${finalX}px`,
              top: `${finalY}px`,
              width: `${w}px`,
              height: `${h}px`,
              // Center the diamond on the isometric point (avatars stand here).
              transform: 'translate(-50%, -50%)',
              clipPath: DIAMOND_CLIP,
              background: bgColor,
              boxShadow: isHighlighted ? 'inset 0 0 0 1px rgba(34,211,238,0.9)' : 'none',
              zIndex,
            }}
            onClick={() => onTileClick?.(tile.position)}
          />
        );
      }
    }

    return elements;
  }, [grid, offsetX, offsetY, highlightSet, showGridLines, onTileClick]);

  return <>{tileElements}</>;
};
