// Components/GameRoot.tsx

import React from 'react';
import { BattleScene } from './BattleScene';
import { BattleState, Combatant } from '../lib/Utils/types';

export const GameRoot: React.FC = () => {
  // Sample battle state for demonstration
  const createInitialBattleState = (): BattleState => {
    // Create party members
    const player1: Combatant = {
      id: 'player-1',
      name: 'Hero',
      type: 'player',
      hp: 100,
      maxHp: 100,
      mp: 50,
      maxMp: 50,
      atk: 15,
      def: 10,
      spd: 12,
      figureString: 'hr-100-61.hd-180-1.ch-210-66.lg-270-110.sh-290-62',
      position: { x: 1, y: 3 },
      moveRange: 3,
      skills: [],
      isDefending: false,
    };

    const player2: Combatant = {
      id: 'player-2',
      name: 'Mage',
      type: 'player',
      hp: 80,
      maxHp: 80,
      mp: 80,
      maxMp: 80,
      atk: 20,
      def: 5,
      spd: 10,
      figureString: 'hr-100-61.hd-180-1.ch-210-66.lg-270-82.sh-290-62',
      position: { x: 2, y: 4 },
      moveRange: 2,
      skills: [],
      isDefending: false,
    };

    // Create enemies
    const enemy1: Combatant = {
      id: 'enemy-1',
      name: 'Goblin',
      type: 'enemy',
      hp: 60,
      maxHp: 60,
      mp: 0,
      maxMp: 0,
      atk: 12,
      def: 8,
      spd: 11,
      position: { x: 6, y: 2 },
      moveRange: 2,
      skills: [],
      isDefending: false,
    };

    const enemy2: Combatant = {
      id: 'enemy-2',
      name: 'Orc',
      type: 'enemy',
      hp: 90,
      maxHp: 90,
      mp: 0,
      maxMp: 0,
      atk: 18,
      def: 12,
      spd: 8,
      position: { x: 7, y: 3 },
      moveRange: 2,
      skills: [],
      isDefending: false,
    };

    const allCombatants = [player1, player2, enemy1, enemy2];
    
    // Sort by speed for turn order
    const turnOrder = [...allCombatants]
      .sort((a, b) => b.spd - a.spd)
      .map(c => c.id);

    return {
      gridCols: 10,
      gridRows: 8,
      allCombatants,
      partyIds: ['player-1', 'player-2'],
      enemyIds: ['enemy-1', 'enemy-2'],
      turnOrder,
      currentTurnIndex: 0,
      phase: 'selectingAction',
      selectedAction: null,
      selectedSkillId: null,
    };
  };

  const initialBattleState = createInitialBattleState();

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-slate-200">
      <div className="w-4/5 h-4/5 border-4 border-slate-900 shadow-2xl">
        <BattleScene initialBattleState={initialBattleState} />
      </div>
    </div>
  );
};
