// Components/BattleStage.tsx

import React, { useMemo, useState, useEffect } from 'react';
import { GridPosition, Combatant, BattleState } from '../lib/Utils/types';
import { toIsometricScreenPos, findReachableTiles, reconstructPath, isSamePosition, getDistance } from '../lib/Utils/grid';
import { HabboAvatarSprite } from './HabboAvatarSprite';
import { DirectionName, TILE_WIDTH, TILE_HEIGHT } from '../lib/Utils/habbo';

interface BattleStageProps {
  state: BattleState;
  dispatch: React.Dispatch<any>;
}

type AnimatedPosition = { 
  combatantId: string; 
  pos: GridPosition; 
  isMoving: boolean; 
  direction: DirectionName;
};

const getDirectionName = (from: GridPosition, to: GridPosition): DirectionName => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (dx === 0 && dy === -1) return "up";
  if (dx === 1 && dy === 0) return "right";
  if (dx === 0 && dy === 1) return "down";
  if (dx === -1 && dy === 0) return "left";
  if (dx > 0 && dy < 0) return "up-right";
  if (dx > 0 && dy > 0) return "down-right";
  if (dx < 0 && dy > 0) return "down-left";
  if (dx < 0 && dy < 0) return "up-left";

  return "down";
};

export const BattleStage: React.FC<BattleStageProps> = ({ state, dispatch }) => {
  const { allCombatants, partyIds, gridCols, gridRows, phase } = state;
  const currentCombatant = allCombatants.find(c => c.id === state.turnOrder[state.currentTurnIndex]);
  const isPlayerTurn = currentCombatant && currentCombatant.type === 'player';

  const [animatedPositions, setAnimatedPositions] = useState<AnimatedPosition[]>(
    allCombatants.map(c => ({
      combatantId: c.id,
      pos: c.position,
      isMoving: false,
      direction: 'down' as DirectionName,
    }))
  );

  useEffect(() => {
    setAnimatedPositions(
      allCombatants.map(c => {
        const currentAnim = animatedPositions.find(a => a.combatantId === c.id);
        return {
          combatantId: c.id,
          pos: c.position,
          isMoving: false,
          direction: currentAnim?.direction || ('down' as DirectionName),
        };
      })
    );
  }, [allCombatants.length]);

  const blockingTiles = useMemo(() => 
    allCombatants.map(c => c.position).filter(p => !isSamePosition(p, currentCombatant?.position || {x:-1, y:-1}))
  , [allCombatants, currentCombatant]);

  const { reachable, paths } = useMemo(() => {
    if (state.phase !== 'selectingTile' || state.selectedAction !== 'move' || !currentCombatant) {
      return { reachable: [], paths: new Map<string, GridPosition | null>() };
    }
    return findReachableTiles(currentCombatant.position, currentCombatant.moveRange, gridCols, gridRows, blockingTiles);
  }, [state.phase, state.selectedAction, currentCombatant, gridCols, gridRows, blockingTiles]);

  const handleTileClick = (targetPos: GridPosition) => {
    if (!currentCombatant || !isPlayerTurn) return;

    if (state.phase === 'selectingTile') {
      if (state.selectedAction === 'move') {
        const isReachable = reachable.some(p => isSamePosition(p, targetPos));
        if (isReachable) {
          const path = reconstructPath(targetPos, paths);
          dispatch({ type: 'RESOLVE_ACTION', actionType: 'move', targetPos });
        }
      } else if (state.selectedAction === 'attack' || state.selectedAction === 'skill') {
        const targetCombatant = allCombatants.find(c => isSamePosition(c.position, targetPos) && c.id !== currentCombatant.id);
        const range = state.selectedAction === 'attack' ? 1 : (state.selectedSkillId ? 3 : 1);
        
        if (targetCombatant && getDistance(currentCombatant.position, targetPos) <= range) {
          dispatch({ 
            type: 'RESOLVE_ACTION', 
            actionType: state.selectedAction, 
            targetId: targetCombatant.id,
            skillId: state.selectedSkillId,
          });
        }
      }
    }
  };

  const getScreenPositionStyle = (x: number, y: number) => {
    const pixelX = (x - y) * (TILE_WIDTH / 2);
    const pixelY = (x + y) * (TILE_HEIGHT / 2);

    return {
      left: `${pixelX + TILE_WIDTH / 2}px`,
      top: `${pixelY}px`,
      zIndex: 100 + y,
    };
  };

  const renderTiles = () => {
    const tiles: JSX.Element[] = [];

    for (let y = 0; y < gridRows; y++) {
      for (let x = 0; x < gridCols; x++) {
        const pos: GridPosition = { x, y };
        const screenPos = getScreenPositionStyle(x, y);
        const isTargetable = (
          (state.selectedAction === 'move' && reachable.some(p => isSamePosition(p, pos))) ||
          (state.selectedAction === 'attack' && currentCombatant && getDistance(currentCombatant.position, pos) <= 1)
        );
        const hasEnemy = allCombatants.some(c => c.id !== currentCombatant?.id && isSamePosition(c.position, pos));
        
        tiles.push(
          <div
            key={`${x}-${y}`}
            className={`absolute cursor-pointer transition-all ${
              isTargetable ? 'bg-cyan-500/30 hover:bg-cyan-400/40' : ''
            } ${hasEnemy ? 'bg-red-500/40' : ''}`}
            style={{
              ...screenPos,
              width: `${TILE_WIDTH}px`,
              height: `${TILE_HEIGHT}px`,
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
            onClick={() => handleTileClick(pos)}
          />
        );
      }
    }
    return tiles;
  };

  return (
    <div className="relative w-full aspect-video overflow-hidden rounded-lg border-4 border-slate-700">
      {/* Dungeon Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-90"
        style={{ 
          backgroundImage: `url('/src/assets/ice-pool-isometric.webp')`,
          backgroundSize: '110%',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Dark overlay for better sprite contrast */}
      <div className="absolute inset-0 bg-black/30" />
      
      <div className="absolute left-1/2 top-1/3 transform -translate-x-1/2 z-10">
        {renderTiles()}
        
        {allCombatants.map((combatant) => {
          const animState = animatedPositions.find(a => a.combatantId === combatant.id) || { 
            pos: combatant.position, 
            isMoving: false, 
            direction: 'down' as DirectionName 
          };
          
          const screenPos = getScreenPositionStyle(animState.pos.x, animState.pos.y);

          if (combatant.type === 'enemy') {
            const spriteUrl = combatant.sprite || '/src/assets/ice-guardian.png';
            return (
              <div
                key={combatant.id}
                className="absolute transform -translate-x-1/2 -translate-y-full"
                style={screenPos}
              >
                <img
                  src={spriteUrl}
                  alt={combatant.name}
                  className="pixelated max-h-32 w-auto"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            );
          } else if (combatant.type === 'player' && combatant.figureString) {
            return (
              <div 
                key={combatant.id}
                className="absolute"
                style={screenPos}
              >
                <HabboAvatarSprite
                  figureString={combatant.figureString}
                  direction={animState.direction}
                  isWalking={animState.isMoving}
                />
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
};
