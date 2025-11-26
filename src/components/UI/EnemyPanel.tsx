// Components/UI/EnemyPanel.tsx

import React from 'react';
import { Combatant } from '../../lib/Utils/types';

interface EnemyPanelProps {
  enemies: Combatant[];
}

export const EnemyPanel: React.FC<EnemyPanelProps> = ({ enemies }) => {
  return (
    <div className="bg-slate-800 border-2 border-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-bold text-red-400 mb-3">Enemies</h3>
      
      <div className="space-y-2">
        {enemies.map((enemy) => (
          <div
            key={enemy.id}
            className="bg-slate-900 rounded p-2 border border-slate-700"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-white">{enemy.name}</span>
              <span className="text-xs text-gray-400">
                Lvl {Math.floor(enemy.maxHp / 10)}
              </span>
            </div>
            
            {/* HP Bar */}
            <div className="mb-2">
              <div className="flex justify-between text-xs text-gray-300 mb-1">
                <span>HP</span>
                <span>{enemy.hp}/{enemy.maxHp}</span>
              </div>
              <div className="bg-gray-700 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-red-500 h-full transition-all"
                  style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }}
                />
              </div>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-slate-800 rounded px-2 py-1 text-center">
                <div className="text-gray-400">ATK</div>
                <div className="text-white font-bold">{enemy.atk}</div>
              </div>
              <div className="bg-slate-800 rounded px-2 py-1 text-center">
                <div className="text-gray-400">DEF</div>
                <div className="text-white font-bold">{enemy.def}</div>
              </div>
              <div className="bg-slate-800 rounded px-2 py-1 text-center">
                <div className="text-gray-400">SPD</div>
                <div className="text-white font-bold">{enemy.spd}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
