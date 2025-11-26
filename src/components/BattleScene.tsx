// Components/BattleScene.tsx

import React, { useReducer, useEffect, useMemo, useState } from 'react';
import { BattleState, Combatant } from '../lib/Utils/types';
import { EnemyPanel } from './UI/EnemyPanel';
import { TurnPanel } from './UI/TurnPanel';
import { PlayerPanel } from './UI/PlayerPanel';
import { BattleStage } from './BattleStage';
import { getManhattanDistance } from '../lib/Utils/grid';
import { BattleTutorial } from './BattleTutorial';
import { Button } from './ui/button';
import { HelpCircle } from 'lucide-react';

interface BattleSceneProps {
  initialBattleState: BattleState;
  backgroundUrl?: string;
  isGridEditorActive?: boolean;
  showGridOverlay?: boolean;
  enabledCells?: Array<{ x: number; y: number }>;
  onEnabledCellsChange?: (cells: Array<{ x: number; y: number }>) => void;
}

function battleReducer(state: BattleState, action: any): BattleState {
  const currentCombatant = state.allCombatants.find(c => c.id === state.turnOrder[state.currentTurnIndex]);

  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase };

    case 'START_ACTION':
      if (!currentCombatant || currentCombatant.type !== 'player' || state.phase !== 'selectingAction') return state;
      
      if (action.action === 'move' || action.action === 'attack' || action.action === 'skill') {
        return { 
          ...state, 
          phase: 'selectingTile', 
          selectedAction: action.action, 
          selectedSkillId: action.skillId || null 
        };
      }
      return state;

    case 'RESOLVE_ACTION':
      if (!currentCombatant || state.phase === 'animating') return state;
      
      let nextState = { ...state };
      let updatedCombatants = nextState.allCombatants.map(c => {
        if (c.id === currentCombatant.id) {
          return { ...c, isDefending: false };
        }
        return c;
      });
      
      const currentActor = updatedCombatants.find(c => c.id === currentCombatant.id)!;

      if (action.actionType === 'move') {
        currentActor.position = action.targetPos;
      } else if (action.actionType === 'defend') {
        currentActor.isDefending = true;
      } else if (action.actionType === 'attack' || action.actionType === 'skill') {
        const target = updatedCombatants.find(c => c.id === action.targetId);
        if (target) {
          let damage = currentActor.atk - target.def;
          if (target.isDefending) damage = Math.max(1, Math.floor(damage / 2));
          damage = Math.max(1, damage);
          target.hp -= damage;
          console.log(`${currentActor.name} deals ${damage} damage to ${target.name}!`);
        }
      }
      
      nextState.allCombatants = updatedCombatants;

      let nextIndex = (nextState.currentTurnIndex + 1) % nextState.turnOrder.length;
      let nextActor = nextState.allCombatants.find(c => c.id === nextState.turnOrder[nextIndex]);

      while (nextActor && nextActor.hp <= 0) {
        nextIndex = (nextIndex + 1) % nextState.turnOrder.length;
        nextActor = nextState.allCombatants.find(c => c.id === nextState.turnOrder[nextIndex]);
        if (nextIndex === state.currentTurnIndex) break;
      }

      const aliveEnemies = nextState.allCombatants.filter(c => c.type === 'enemy' && c.hp > 0).length;
      const alivePlayers = nextState.allCombatants.filter(c => c.type === 'player' && c.hp > 0).length;

      if (aliveEnemies === 0 || alivePlayers === 0) {
        return { ...nextState, phase: 'finished', selectedAction: null, selectedSkillId: null };
      }

      return {
        ...nextState,
        currentTurnIndex: nextIndex,
        phase: 'selectingAction',
        selectedAction: null,
        selectedSkillId: null,
      };

    default:
      return state;
  }
}

export const BattleScene: React.FC<BattleSceneProps> = ({ 
  initialBattleState, 
  backgroundUrl,
  isGridEditorActive = false,
  showGridOverlay = true,
  enabledCells = [],
  onEnabledCellsChange,
}) => {
  const [state, dispatch] = useReducer(battleReducer, initialBattleState);
  const [showTutorial, setShowTutorial] = useState(false);
  
  const currentCombatant = useMemo(() => 
    state.allCombatants.find(c => c.id === state.turnOrder[state.currentTurnIndex])
  , [state.turnOrder, state.currentTurnIndex, state.allCombatants]);

  const enemyCombatants = useMemo(() => 
    state.allCombatants.filter(c => c.type === 'enemy' && c.hp > 0)
  , [state.allCombatants]);

  const playerCombatants = useMemo(() => 
    state.allCombatants.filter(c => c.type === 'player' && c.hp > 0)
  , [state.allCombatants]);

  useEffect(() => {
    if (state.phase === 'selectingAction' && currentCombatant && currentCombatant.type === 'enemy') {
      dispatch({ type: 'SET_PHASE', phase: 'resolving' });
      
      setTimeout(() => {
        const target = state.allCombatants.find(c => c.type === 'player' && c.hp > 0);
        
        if (target) {
          const distance = getManhattanDistance(currentCombatant.position, target.position);
          
          if (distance <= 1) {
            console.log(`${currentCombatant.name} attacks ${target.name}!`);
            dispatch({ type: 'RESOLVE_ACTION', actionType: 'attack', targetId: target.id });
          } else {
            const dx = Math.sign(target.position.x - currentCombatant.position.x);
            const dy = Math.sign(target.position.y - currentCombatant.position.y);
            const newPos = { x: currentCombatant.position.x + dx, y: currentCombatant.position.y + dy };
            
            console.log(`${currentCombatant.name} moves to x:${newPos.x}, y:${newPos.y}`);
            dispatch({ type: 'RESOLVE_ACTION', actionType: 'move', targetPos: newPos });
          }
        }
      }, 1000);
    }
  }, [state.phase, currentCombatant, state.allCombatants]);

  if (!currentCombatant) {
    return <div className="p-4">Loading battle...</div>;
  }

  return (
    <div className="flex flex-col h-full w-full relative">
      {/* Tutorial Overlay */}
      {showTutorial && <BattleTutorial onClose={() => setShowTutorial(false)} />}
      
      {/* Help Button */}
      <Button
        onClick={() => setShowTutorial(true)}
        variant="outline"
        size="sm"
        className="absolute top-4 right-4 z-20 flex items-center gap-2"
      >
        <HelpCircle className="w-4 h-4" />
        How to Play
      </Button>
      
      <BattleStage 
        state={state} 
        dispatch={dispatch} 
        backgroundUrl={backgroundUrl}
        isGridEditorActive={isGridEditorActive}
        showGridOverlay={showGridOverlay}
        enabledCells={enabledCells}
        onGridCellClick={(x, y) => {
          if (onEnabledCellsChange) {
            const isCellEnabled = enabledCells.some(cell => cell.x === x && cell.y === y);
            if (isCellEnabled) {
              onEnabledCellsChange(enabledCells.filter(cell => !(cell.x === x && cell.y === y)));
            } else {
              onEnabledCellsChange([...enabledCells, { x, y }]);
            }
          }
        }}
      />
      
      {state.phase === 'selectingAction' && currentCombatant.type === 'player' && (
        <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 z-20 bg-cyan-900/90 border-2 border-cyan-500 rounded-lg px-6 py-3">
          <p className="text-white font-bold text-center">
            💡 It's {currentCombatant.name}'s turn! Choose an action below ⬇️
          </p>
        </div>
      )}
      
      {state.phase === 'selectingTile' && state.selectedAction === 'move' && (
        <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 z-20 bg-blue-900/90 border-2 border-blue-500 rounded-lg px-6 py-3">
          <p className="text-white font-bold text-center">
            👣 Click a highlighted BLUE tile to move there
          </p>
        </div>
      )}
      
      {state.phase === 'selectingTile' && state.selectedAction === 'attack' && (
        <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 z-20 bg-red-900/90 border-2 border-red-500 rounded-lg px-6 py-3">
          <p className="text-white font-bold text-center">
            ⚔️ Click a highlighted RED enemy to attack them!
          </p>
        </div>
      )}
      
      <div className="flex w-full min-h-[120px] border-t-4 border-slate-700">
        <div className="flex-1">
          <EnemyPanel enemies={enemyCombatants} />
        </div>
        <div className="flex-1 border-l-2 border-r-2 border-slate-700">
          <TurnPanel
            currentCombatant={currentCombatant}
            phase={state.phase}
            turnOrder={state.turnOrder}
            allCombatants={state.allCombatants}
          />
        </div>
        <div className="flex-1">
          <PlayerPanel
            players={playerCombatants}
            currentCombatantId={currentCombatant.id}
            onAction={(action) => {
              if (action === 'defend') {
                dispatch({ type: 'RESOLVE_ACTION', actionType: 'defend' });
              } else {
                dispatch({ type: 'START_ACTION', action });
              }
            }}
            canAct={currentCombatant.type === 'player' && state.phase === 'selectingAction'}
          />
        </div>
      </div>

      {state.phase === 'finished' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-800 border-4 border-slate-700 rounded-lg p-8 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              {enemyCombatants.length === 0 ? 'Victory!' : 'Defeat...'}
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
  );
};
