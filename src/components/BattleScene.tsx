// Components/BattleScene.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { BattleState, Combatant, GridPosition, BattlePhase } from '../lib/Utils/types';
import { findReachableTiles, getManhattanDistance } from '../lib/Utils/grid';
import { BattleStage } from './BattleStage';
import { EnemyPanel } from './UI/EnemyPanel';
import { TurnPanel } from './UI/TurnPanel';
import { PlayerPanel } from './UI/PlayerPanel';

interface BattleSceneProps {
  initialBattleState: BattleState;
}

export const BattleScene: React.FC<BattleSceneProps> = ({ initialBattleState }) => {
  const [battleState, setBattleState] = useState<BattleState>(initialBattleState);
  const [reachableTiles, setReachableTiles] = useState<GridPosition[]>([]);
  const [selectedTile, setSelectedTile] = useState<GridPosition | null>(null);

  // Get current combatant
  const currentCombatant = useMemo(() => {
    const currentId = battleState.turnOrder[battleState.currentTurnIndex];
    return battleState.allCombatants.find(c => c.id === currentId) || null;
  }, [battleState.turnOrder, battleState.currentTurnIndex, battleState.allCombatants]);

  // Split combatants into players and enemies
  const players = useMemo(
    () => battleState.allCombatants.filter(c => battleState.partyIds.includes(c.id)),
    [battleState.allCombatants, battleState.partyIds]
  );

  const enemies = useMemo(
    () => battleState.allCombatants.filter(c => battleState.enemyIds.includes(c.id)),
    [battleState.allCombatants, battleState.enemyIds]
  );

  // Handle action selection
  const handleAction = (action: 'move' | 'attack' | 'skill' | 'defend' | 'item') => {
    if (!currentCombatant) return;

    if (action === 'move') {
      // Show reachable tiles
      const occupied = battleState.allCombatants
        .filter(c => c.id !== currentCombatant.id)
        .map(c => c.position);
      
      const tiles = findReachableTiles(
        currentCombatant.position,
        currentCombatant.moveRange,
        battleState.gridCols,
        battleState.gridRows,
        occupied
      );
      
      setReachableTiles(tiles);
      setBattleState(prev => ({ ...prev, phase: 'selectingTile', selectedAction: 'move' }));
    } else if (action === 'attack') {
      setBattleState(prev => ({ ...prev, phase: 'selectingTile', selectedAction: 'attack' }));
    } else if (action === 'defend') {
      // Execute defend action
      setBattleState(prev => ({
        ...prev,
        allCombatants: prev.allCombatants.map(c =>
          c.id === currentCombatant.id ? { ...c, isDefending: true } : c
        ),
      }));
      endTurn();
    }
  };

  // Handle tile click
  const handleTileClick = (pos: GridPosition) => {
    if (battleState.phase !== 'selectingTile' || !currentCombatant) return;

    if (battleState.selectedAction === 'move') {
      // Check if tile is reachable
      const isReachable = reachableTiles.some(t => t.x === pos.x && t.y === pos.y);
      if (isReachable) {
        // Move combatant
        setBattleState(prev => ({
          ...prev,
          allCombatants: prev.allCombatants.map(c =>
            c.id === currentCombatant.id ? { ...c, position: pos } : c
          ),
          phase: 'idle',
          selectedAction: null,
        }));
        setReachableTiles([]);
        endTurn();
      }
    } else if (battleState.selectedAction === 'attack') {
      // Check if there's an enemy at this position
      const target = battleState.allCombatants.find(
        c => c.position.x === pos.x && c.position.y === pos.y && c.type !== currentCombatant.type
      );
      
      if (target) {
        const distance = getManhattanDistance(currentCombatant.position, target.position);
        if (distance <= 1) {
          // Execute attack
          executeAttack(currentCombatant, target);
        }
      }
    }
  };

  // Execute attack
  const executeAttack = (attacker: Combatant, target: Combatant) => {
    const damage = Math.max(1, attacker.atk - target.def);
    
    setBattleState(prev => ({
      ...prev,
      allCombatants: prev.allCombatants.map(c =>
        c.id === target.id ? { ...c, hp: Math.max(0, c.hp - damage) } : c
      ),
      phase: 'resolving',
      selectedAction: null,
    }));

    setReachableTiles([]);
    
    setTimeout(() => {
      checkBattleEnd();
      endTurn();
    }, 1000);
  };

  // End turn
  const endTurn = () => {
    setBattleState(prev => {
      const nextIndex = (prev.currentTurnIndex + 1) % prev.turnOrder.length;
      return {
        ...prev,
        currentTurnIndex: nextIndex,
        phase: 'selectingAction',
        allCombatants: prev.allCombatants.map(c => ({ ...c, isDefending: false })),
      };
    });
  };

  // Check if battle has ended
  const checkBattleEnd = () => {
    const allPlayersDead = players.every(p => p.hp <= 0);
    const allEnemiesDead = enemies.every(e => e.hp <= 0);

    if (allPlayersDead || allEnemiesDead) {
      setBattleState(prev => ({ ...prev, phase: 'finished' }));
    }
  };

  // Auto-play enemy turns
  useEffect(() => {
    if (currentCombatant?.type === 'enemy' && battleState.phase === 'selectingAction') {
      // Simple AI: attack nearest player
      setTimeout(() => {
        const nearestPlayer = players.reduce((nearest, player) => {
          const dist = getManhattanDistance(currentCombatant.position, player.position);
          const nearestDist = nearest
            ? getManhattanDistance(currentCombatant.position, nearest.position)
            : Infinity;
          return dist < nearestDist ? player : nearest;
        }, null as Combatant | null);

        if (nearestPlayer) {
          const distance = getManhattanDistance(currentCombatant.position, nearestPlayer.position);
          if (distance <= 1) {
            executeAttack(currentCombatant, nearestPlayer);
          } else {
            endTurn();
          }
        } else {
          endTurn();
        }
      }, 1000);
    }
  }, [currentCombatant, battleState.phase]);

  return (
    <div className="min-h-screen bg-slate-900 p-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-4 text-center">
          Tactical Battle System
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Left Panel - Players */}
          <div className="lg:col-span-1">
            <PlayerPanel
              players={players}
              currentCombatantId={currentCombatant?.id || null}
              onAction={handleAction}
              canAct={currentCombatant?.type === 'player' && battleState.phase === 'selectingAction'}
            />
          </div>

          {/* Center - Battle Stage */}
          <div className="lg:col-span-2 space-y-4">
            <TurnPanel
              currentCombatant={currentCombatant}
              phase={battleState.phase}
              turnOrder={battleState.turnOrder}
              allCombatants={battleState.allCombatants}
            />
            
            <BattleStage
              gridCols={battleState.gridCols}
              gridRows={battleState.gridRows}
              combatants={battleState.allCombatants}
              reachableTiles={reachableTiles}
              onTileClick={handleTileClick}
              highlightedTile={selectedTile}
            />
          </div>

          {/* Right Panel - Enemies */}
          <div className="lg:col-span-1">
            <EnemyPanel enemies={enemies} />
          </div>
        </div>

        {/* Battle End */}
        {battleState.phase === 'finished' && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center">
            <div className="bg-slate-800 border-4 border-slate-700 rounded-lg p-8 text-center">
              <h2 className="text-3xl font-bold text-white mb-4">
                {enemies.every(e => e.hp <= 0) ? 'Victory!' : 'Defeat...'}
              </h2>
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold"
              >
                Restart Battle
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
