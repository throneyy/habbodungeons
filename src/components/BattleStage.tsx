// Components/BattleStage.tsx

import React, { useMemo } from 'react';
import { GridPosition, Combatant } from '../lib/Utils/types';
import { toIsometricScreenPos } from '../lib/Utils/grid';
import { HabboAvatarSprite } from './HabboAvatarSprite';
import { DirectionName } from '../lib/Utils/habbo';

interface BattleStageProps {
  gridCols: number;
  gridRows: number;
  combatants: Combatant[];
  reachableTiles?: GridPosition[];
  onTileClick?: (pos: GridPosition) => void;
  highlightedTile?: GridPosition | null;
}

export const BattleStage: React.FC<BattleStageProps> = ({
  gridCols,
  gridRows,
  combatants,
  reachableTiles = [],
  onTileClick,
  highlightedTile,
}) => {
  // Generate all grid tiles
  const gridTiles = useMemo(() => {
    const tiles: Array<{ pos: GridPosition; screenPos: { x: number; y: number } }> = [];
    
    for (let y = 0; y < gridRows; y++) {
      for (let x = 0; x < gridCols; x++) {
        const pos = { x, y };
        const screenPos = toIsometricScreenPos(pos, gridCols, gridRows);
        tiles.push({ pos, screenPos });
      }
    }
    
    return tiles;
  }, [gridCols, gridRows]);

  // Check if a tile is reachable
  const isTileReachable = (pos: GridPosition) => {
    return reachableTiles.some(t => t.x === pos.x && t.y === pos.y);
  };

  // Check if a tile is highlighted
  const isTileHighlighted = (pos: GridPosition) => {
    return highlightedTile && highlightedTile.x === pos.x && highlightedTile.y === pos.y;
  };

  return (
    <div className="relative w-full h-[600px] bg-gradient-to-b from-slate-800 to-slate-900 overflow-hidden rounded-lg border-4 border-slate-700">
      {/* Grid tiles */}
      {gridTiles.map(({ pos, screenPos }) => {
        const isReachable = isTileReachable(pos);
        const isHighlighted = isTileHighlighted(pos);
        
        return (
          <div
            key={`${pos.x}-${pos.y}`}
            className={`absolute cursor-pointer transition-all ${
              isReachable ? 'bg-blue-500/30 hover:bg-blue-400/40' : ''
            } ${isHighlighted ? 'bg-yellow-400/50' : ''}`}
            style={{
              left: `${screenPos.x}px`,
              top: `${screenPos.y}px`,
              width: '64px',
              height: '32px',
              transform: 'translate(-50%, -50%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
            }}
            onClick={() => onTileClick?.(pos)}
          />
        );
      })}

      {/* Combatants */}
      {combatants.map((combatant) => {
        const screenPos = toIsometricScreenPos(combatant.position, gridCols, gridRows);
        
        return (
          <div
            key={combatant.id}
            className="absolute"
            style={{
              left: `${screenPos.x}px`,
              top: `${screenPos.y}px`,
              zIndex: combatant.position.y * 10 + combatant.position.x,
            }}
          >
            {combatant.figureString ? (
              <HabboAvatarSprite
                figureString={combatant.figureString}
                direction={'down' as DirectionName}
                isWalking={false}
              />
            ) : (
              // Fallback for enemies without Habbo avatars
              <div className="absolute transform -translate-x-1/2 -translate-y-full">
                <div className="w-12 h-12 bg-red-600 rounded-full border-2 border-red-800 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">
                    {combatant.name.substring(0, 2).toUpperCase()}
                  </span>
                </div>
              </div>
            )}
            
            {/* HP Bar */}
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-8 w-16">
              <div className="bg-black/70 rounded px-1 py-0.5 text-center">
                <div className="text-white text-xs font-bold mb-0.5">
                  {combatant.name}
                </div>
                <div className="bg-gray-700 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      combatant.type === 'player' ? 'bg-green-500' : 'bg-red-500'
                    }`}
                    style={{
                      width: `${(combatant.hp / combatant.maxHp) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
