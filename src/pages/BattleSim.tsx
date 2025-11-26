import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { BattleScene } from "@/components/BattleScene";
import { BattleState, Combatant } from "@/lib/Utils/types";
import { useNavigate } from "react-router-dom";
import { BattleSimControls } from "@/components/BattleSimControls";
import { GridEditor } from "@/components/GridEditor";
import { supabase } from "@/integrations/supabase/client";

const BattleSim = () => {
  const navigate = useNavigate();
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | undefined>(undefined);
  const [enabledCells, setEnabledCells] = useState<Array<{ x: number; y: number }>>([]);
  const [isGridEditorActive, setIsGridEditorActive] = useState(false);
  const [showGridOverlay, setShowGridOverlay] = useState(true);

  // Load grid configuration when background changes
  useEffect(() => {
    if (backgroundUrl) {
      loadGridConfiguration(backgroundUrl);
    }
  }, [backgroundUrl]);

  const loadGridConfiguration = async (bgUrl: string) => {
    try {
      const { data, error } = await supabase
        .from('grid_configurations')
        .select('enabled_cells, grid_cols, grid_rows')
        .eq('background_url', bgUrl)
        .maybeSingle();

      if (!error && data) {
        setEnabledCells(data.enabled_cells as Array<{ x: number; y: number }>);
      } else {
        // Default: all cells enabled
        const allCells: Array<{ x: number; y: number }> = [];
        for (let y = 0; y < 6; y++) {
          for (let x = 0; x < 8; x++) {
            allCells.push({ x, y });
          }
        }
        setEnabledCells(allCells);
      }
    } catch (error) {
      console.error('Error loading grid configuration:', error);
    }
  };

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

    // Load a dungeon background image from the database (fallback to default if none found)
    (async () => {
      const { data, error } = await supabase
        .from("dungeons")
        .select("ai_background_url")
        .eq("is_featured", true)
        .not("ai_background_url", "is", null)
        .limit(1);

      if (!error && data && data.length > 0 && data[0].ai_background_url) {
        setBackgroundUrl(data[0].ai_background_url as string);
      } else {
        setBackgroundUrl(undefined);
      }
    })();
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
        
        <GridEditor
          gridCols={8}
          gridRows={6}
          backgroundUrl={backgroundUrl}
          enabledCells={enabledCells}
          onEnabledCellsChange={setEnabledCells}
        />
        
        <div className="flex gap-2 mt-3">
          <Button
            onClick={() => setIsGridEditorActive(!isGridEditorActive)}
            variant={isGridEditorActive ? 'default' : 'outline'}
            size="sm"
          >
            {isGridEditorActive ? 'Exit Grid Editor' : 'Open Grid Editor'}
          </Button>
          <Button
            onClick={() => setShowGridOverlay(!showGridOverlay)}
            variant="outline"
            size="sm"
          >
            {showGridOverlay ? 'Hide Grid Overlay' : 'Show Grid Overlay'}
          </Button>
        </div>
      </div>
      
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-6xl">
          {battleState ? (
            <BattleScene 
              initialBattleState={battleState} 
              backgroundUrl={backgroundUrl}
              isGridEditorActive={isGridEditorActive}
              showGridOverlay={showGridOverlay}
              enabledCells={enabledCells}
              onEnabledCellsChange={setEnabledCells}
            />
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
