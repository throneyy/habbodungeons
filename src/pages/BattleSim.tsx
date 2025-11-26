import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BattleScene } from "@/components/BattleScene";
import { BattleState, Combatant } from "@/lib/Utils/types";
import { useNavigate } from "react-router-dom";
import { BattleSimControls } from "@/components/BattleSimControls";

const BattleSim = () => {
  const navigate = useNavigate();
  const [battleState, setBattleState] = useState<BattleState | null>(null);

  const handleStartBattle = (players: Combatant[], enemies: Combatant[]) => {
    const allCombatants = [...players, ...enemies];
    const turnOrder = allCombatants
      .sort((a, b) => b.spd - a.spd)
      .map(c => c.id);

    const initialBattleState: BattleState = {
      gridCols: 8,
      gridRows: 6,
      allCombatants,
      partyIds: players.map(p => p.id),
      enemyIds: enemies.map(e => e.id),
      turnOrder,
      currentTurnIndex: 0,
      phase: "selectingAction",
      selectedAction: null,
      selectedSkillId: null,
    };

    setBattleState(initialBattleState);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-foreground">Battle System Test</h1>
          <Button onClick={() => navigate("/dashboard")} variant="outline">
            Back to Dashboard
          </Button>
        </div>
        
        <BattleSimControls onStartBattle={handleStartBattle} />
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-6xl">
          {battleState ? (
            <BattleScene initialBattleState={battleState} />
          ) : (
            <div className="text-center text-muted-foreground p-8">
              <p className="text-xl mb-2">Configure your battle above and click "Start Battle"</p>
              <p className="text-sm">Add party members and enemies to begin testing the tactical battle system</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BattleSim;
