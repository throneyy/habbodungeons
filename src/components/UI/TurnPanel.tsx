// Components/UI/TurnPanel.tsx

import React from 'react';
import { Combatant, BattlePhase } from '../../lib/Utils/types';

interface TurnPanelProps {
  currentCombatant: Combatant | null;
  phase: BattlePhase;
  turnOrder: string[];
  allCombatants: Combatant[];
}

export const TurnPanel: React.FC<TurnPanelProps> = ({
  currentCombatant,
  phase,
  turnOrder,
  allCombatants,
}) => {
  const getPhaseText = () => {
    switch (phase) {
      case 'idle':
        return 'Waiting...';
      case 'selectingAction':
        return 'Select Action';
      case 'selectingTile':
        return 'Select Tile';
      case 'animating':
        return 'Animating...';
      case 'resolving':
        return 'Resolving...';
      case 'finished':
        return 'Battle Ended';
      default:
        return phase;
    }
  };

  return (
    <div className="bg-slate-800 border-2 border-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-bold text-yellow-400 mb-3">Turn Order</h3>
      
      {/* Current Turn */}
      {currentCombatant && (
        <div className="bg-gradient-to-r from-yellow-600 to-yellow-700 rounded-lg p-3 mb-3 border-2 border-yellow-500">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-yellow-100">Current Turn</div>
              <div className="text-lg font-bold text-white">
                {currentCombatant.name}
              </div>
            </div>
            <div className={`text-2xl ${currentCombatant.type === 'player' ? '👤' : '👹'}`}>
              {currentCombatant.type === 'player' ? '👤' : '👹'}
            </div>
          </div>
          
          <div className="mt-2 text-sm text-yellow-100">
            Phase: <span className="font-bold">{getPhaseText()}</span>
          </div>
        </div>
      )}
      
      {/* Turn Queue */}
      <div className="space-y-1">
        {turnOrder.slice(0, 5).map((combatantId, index) => {
          const combatant = allCombatants.find(c => c.id === combatantId);
          if (!combatant) return null;
          
          const isCurrent = currentCombatant?.id === combatantId;
          
          return (
            <div
              key={`${combatantId}-${index}`}
              className={`rounded p-2 text-sm flex justify-between items-center ${
                isCurrent
                  ? 'bg-yellow-600/30 border border-yellow-500'
                  : 'bg-slate-900 border border-slate-700'
              }`}
            >
              <span className={isCurrent ? 'text-yellow-300 font-bold' : 'text-gray-300'}>
                {index + 1}. {combatant.name}
              </span>
              <span className="text-xs text-gray-400">
                SPD: {combatant.spd}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
