import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { StatBar } from "@/components/StatBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Swords, Shield, Sparkles, Package } from "lucide-react";

interface BattleData {
  enemy: {
    name: string;
    description: string;
    current_hp: number;
    max_hp: number;
    atk: number;
    def: number;
    spd: number;
    status_effects: string[];
  };
  player: {
    level: number;
    current_hp: number;
    max_hp: number;
    current_mp: number;
    max_mp: number;
    atk: number;
    def: number;
    spd: number;
    status_effects: string[];
  };
  room_description: string;
  battle_log: string[];
}

const Battle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [battleData, setBattleData] = useState<BattleData | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [dice, setDice] = useState<number[]>([1, 1, 1, 1, 1]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBattle();
  }, [id]);

  const loadBattle = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("load-battle", {
        body: { battleId: id },
      });

      if (error) throw error;
      if (data.battleData) setBattleData(data.battleData);
    } catch (error: any) {
      toast({
        title: "Failed to load battle",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleResolveTurn = async () => {
    if (!selectedAction) {
      toast({ title: "Please select an action", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-turn", {
        body: {
          battleId: id,
          action: selectedAction,
          dice,
        },
      });

      if (error) throw error;
      
      if (data.battleData) {
        setBattleData(data.battleData);
        setSelectedAction("");
        
        if (data.victory) {
          toast({ title: "Victory!", description: "You defeated the enemy!" });
        } else if (data.defeat) {
          toast({ title: "Defeat", description: "You were defeated...", variant: "destructive" });
        }
      }
    } catch (error: any) {
      toast({
        title: "Failed to resolve turn",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  if (!battleData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-2xl font-bold">Loading battle...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="grid md:grid-cols-3 gap-6">
          {/* Enemy Panel */}
          <HabboPanel title="Enemy" className="md:col-span-1">
            <div className="space-y-4">
              <h3 className="text-2xl font-black text-destructive">{battleData.enemy.name}</h3>
              <p className="text-sm text-muted-foreground">{battleData.enemy.description}</p>
              <StatBar
                label="HP"
                current={battleData.enemy.current_hp}
                max={battleData.enemy.max_hp}
                color="hp"
              />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-xs font-bold">ATK</p>
                  <p className="font-bold">{battleData.enemy.atk}</p>
                </div>
                <div className="p-2 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-xs font-bold">DEF</p>
                  <p className="font-bold">{battleData.enemy.def}</p>
                </div>
                <div className="p-2 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-xs font-bold">SPD</p>
                  <p className="font-bold">{battleData.enemy.spd}</p>
                </div>
              </div>
              {battleData.enemy.status_effects.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-bold">Status Effects:</p>
                  {battleData.enemy.status_effects.map((effect, i) => (
                    <p key={i} className="text-sm text-accent">{effect}</p>
                  ))}
                </div>
              )}
            </div>
          </HabboPanel>

          {/* Action Panel */}
          <HabboPanel title="Current Turn" className="md:col-span-1">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{battleData.room_description}</p>
              
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={selectedAction === "attack" ? "default" : "outline"}
                  onClick={() => setSelectedAction("attack")}
                  className="font-bold border-4 border-habbo-dark"
                >
                  <Swords className="w-4 h-4 mr-2" />
                  Attack
                </Button>
                <Button
                  variant={selectedAction === "skill" ? "default" : "outline"}
                  onClick={() => setSelectedAction("skill")}
                  className="font-bold border-4 border-habbo-dark"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Skill
                </Button>
                <Button
                  variant={selectedAction === "defend" ? "default" : "outline"}
                  onClick={() => setSelectedAction("defend")}
                  className="font-bold border-4 border-habbo-dark"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Defend
                </Button>
                <Button
                  variant={selectedAction === "item" ? "default" : "outline"}
                  onClick={() => setSelectedAction("item")}
                  className="font-bold border-4 border-habbo-dark"
                >
                  <Package className="w-4 h-4 mr-2" />
                  Item
                </Button>
              </div>

              <div className="space-y-2">
                <p className="font-bold text-sm">Enter your Holodice results from Habbo:</p>
                <div className="grid grid-cols-5 gap-2">
                  {dice.map((val, i) => (
                    <Input
                      key={i}
                      type="number"
                      min="1"
                      max="6"
                      value={val}
                      onChange={(e) => {
                        const newDice = [...dice];
                        newDice[i] = Math.max(1, Math.min(6, parseInt(e.target.value) || 1));
                        setDice(newDice);
                      }}
                      className="text-center font-bold border-2 border-habbo-dark"
                    />
                  ))}
                </div>
              </div>

              <Button
                onClick={handleResolveTurn}
                disabled={loading || !selectedAction}
                size="lg"
                className="w-full font-bold border-4 border-habbo-dark text-lg py-6"
              >
                {loading ? "Resolving..." : "Resolve Turn"}
              </Button>
            </div>
          </HabboPanel>

          {/* Player Panel */}
          <HabboPanel title="You" className="md:col-span-1">
            <div className="space-y-4">
              <div className="text-center p-2 bg-primary rounded border-4 border-habbo-dark">
                <p className="text-sm font-bold text-primary-foreground">Level {battleData.player.level}</p>
              </div>
              <StatBar
                label="HP"
                current={battleData.player.current_hp}
                max={battleData.player.max_hp}
                color="hp"
              />
              <StatBar
                label="MP"
                current={battleData.player.current_mp}
                max={battleData.player.max_mp}
                color="mp"
              />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-xs font-bold">ATK</p>
                  <p className="font-bold">{battleData.player.atk}</p>
                </div>
                <div className="p-2 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-xs font-bold">DEF</p>
                  <p className="font-bold">{battleData.player.def}</p>
                </div>
                <div className="p-2 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-xs font-bold">SPD</p>
                  <p className="font-bold">{battleData.player.spd}</p>
                </div>
              </div>
              {battleData.player.status_effects.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-bold">Status Effects:</p>
                  {battleData.player.status_effects.map((effect, i) => (
                    <p key={i} className="text-sm text-accent">{effect}</p>
                  ))}
                </div>
              )}
            </div>
          </HabboPanel>
        </div>

        {/* Battle Log */}
        <HabboPanel title="Battle Log">
          <div className="h-64 overflow-y-auto space-y-2 p-4 bg-muted rounded border-2 border-habbo-dark">
            {battleData.battle_log.map((log, i) => (
              <p key={i} className="text-sm">{log}</p>
            ))}
          </div>
        </HabboPanel>

        <Button
          variant="outline"
          onClick={() => navigate("/dashboard")}
          className="font-bold border-4 border-habbo-dark"
        >
          Return to Dashboard
        </Button>
      </div>
    </div>
  );
};

export default Battle;