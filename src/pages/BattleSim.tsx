import { Button } from "@/components/ui/button";
import { BattleScene } from "@/components/BattleScene";
import { BattleState } from "@/lib/Utils/types";
import { useNavigate } from "react-router-dom";

const BattleSim = () => {
  const navigate = useNavigate();

  // Mock initial battle state for testing
  const initialBattleState: BattleState = {
    gridCols: 8,
    gridRows: 6,
    allCombatants: [
      {
        id: "player-test-1",
        name: "TestPlayer",
        type: "player",
        hp: 50,
        maxHp: 50,
        mp: 30,
        maxMp: 30,
        atk: 10,
        def: 3,
        spd: 5,
        figureString: "lg-3050-100.hr-100-31.hd-180-1.ch-210-66.sh-305-62.fa-1201.ca-1800-60",
        position: { x: 1, y: 4 },
        moveRange: 3,
        skills: [],
        isDefending: false,
      },
      {
        id: "enemy-test-1",
        name: "Ice Guardian",
        type: "enemy",
        hp: 100,
        maxHp: 100,
        mp: 0,
        maxMp: 0,
        atk: 15,
        def: 5,
        spd: 3,
        position: { x: 6, y: 1 },
        moveRange: 2,
        skills: [],
        isDefending: false,
      },
    ],
    partyIds: ["player-test-1"],
    enemyIds: ["enemy-test-1"],
    turnOrder: ["player-test-1", "enemy-test-1"],
    currentTurnIndex: 0,
    phase: "selectingAction",
    selectedAction: null,
    selectedSkillId: null,
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Battle System Test</h1>
        <Button onClick={() => navigate("/dashboard")} variant="outline">
          Back to Dashboard
        </Button>
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-6xl">
          <BattleScene initialBattleState={initialBattleState} />
        </div>
      </div>
    </div>
  );
};

export default BattleSim;
