// Components/UI/PlayerPanel.tsx

import React from 'react';
import { Combatant } from '../../lib/Utils/types';

interface PlayerPanelProps {
  players: Combatant[];
  currentCombatantId: string | null;
  onAction?: (action: 'move' | 'attack' | 'skill' | 'defend' | 'item') => void;
  canAct: boolean;
}

export const PlayerPanel: React.FC<PlayerPanelProps> = ({
  players,
  currentCombatantId,
  onAction,
  canAct,
}) => {
  return (
    <div className="bg-slate-800 border-2 border-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-bold text-green-400 mb-3">Party</h3>
      
      <div className="space-y-3">
        {players.map((player) => {
          const isCurrentTurn = player.id === currentCombatantId;
          
          return (
            <div
              key={player.id}
              className={`rounded-lg p-3 ${
                isCurrentTurn
                  ? 'bg-green-900/30 border-2 border-green-500'
                  : 'bg-slate-900 border border-slate-700'
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-white">{player.name}</span>
                {isCurrentTurn && (
                  <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">
                    YOUR TURN
                  </span>
                )}
              </div>
              
              {/* HP Bar */}
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-300 mb-1">
                  <span>HP</span>
                  <span>{player.hp}/{player.maxHp}</span>
                </div>
                <div className="bg-gray-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-green-500 h-full transition-all"
                    style={{ width: `${(player.hp / player.maxHp) * 100}%` }}
                  />
                </div>
              </div>
              
              {/* MP Bar */}
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-300 mb-1">
                  <span>MP</span>
                  <span>{player.mp}/{player.maxMp}</span>
                </div>
                <div className="bg-gray-700 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-500 h-full transition-all"
                    style={{ width: `${(player.mp / player.maxMp) * 100}%` }}
                  />
                </div>
              </div>
              
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                <div className="bg-slate-800 rounded px-2 py-1 text-center">
                  <div className="text-gray-400">ATK</div>
                  <div className="text-white font-bold">{player.atk}</div>
                </div>
                <div className="bg-slate-800 rounded px-2 py-1 text-center">
                  <div className="text-gray-400">DEF</div>
                  <div className="text-white font-bold">{player.def}</div>
                </div>
                <div className="bg-slate-800 rounded px-2 py-1 text-center">
                  <div className="text-gray-400">SPD</div>
                  <div className="text-white font-bold">{player.spd}</div>
                </div>
              </div>
              
              {/* Action Buttons */}
              {isCurrentTurn && canAct && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    onClick={() => onAction?.('move')}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded transition-colors"
                  >
                    Move
                  </button>
                  <button
                    onClick={() => onAction?.('attack')}
                    className="bg-red-600 hover:bg-red-700 text-white text-sm py-2 rounded transition-colors"
                  >
                    Attack
                  </button>
                  <button
                    onClick={() => onAction?.('skill')}
                    className="bg-purple-600 hover:bg-purple-700 text-white text-sm py-2 rounded transition-colors"
                  >
                    Skill
                  </button>
                  <button
                    onClick={() => onAction?.('defend')}
                    className="bg-green-600 hover:bg-green-700 text-white text-sm py-2 rounded transition-colors"
                  >
                    Defend
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
