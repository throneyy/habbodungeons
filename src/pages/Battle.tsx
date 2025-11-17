import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { StatBar } from "@/components/StatBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Swords, Shield, Sparkles, Package, Users } from "lucide-react";
import dungeonBg from "@/assets/dungeon-bg.png";
import frostkeepBanner from "@/assets/the-shattered-frostkeep.gif";

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
  mode?: "story" | "battle";
}

interface Profile {
  username: string;
  habbo_username: string | null;
  habbo_profile_json: any;
}

interface StoryNode {
  storyText: string;
  choices: Array<{ id: string; label: string }>;
}

const Battle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [battleData, setBattleData] = useState<BattleData | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [dice, setDice] = useState<number[]>([1, 1, 1, 1, 1]);
  const [loading, setLoading] = useState(false);
  const [showCombatPanels, setShowCombatPanels] = useState(false);
  
  // Story mode states
  const [storyNode, setStoryNode] = useState<StoryNode | null>(null);
  const [storyLoading, setStoryLoading] = useState(false);

  useEffect(() => {
    loadBattle();
    loadProfile();
  }, [id]);

  const loadBattle = async () => {
    if (!id) {
      console.error("Cannot load battle: battleId is undefined");
      navigate("/dashboard");
      return;
    }
    
    try {
      console.log("Loading battle for battleId:", id);
      const { data, error } = await supabase.functions.invoke("load-battle", {
        body: { battleId: id },
      });

      if (error) throw error;
      if (data.battleData) {
        setBattleData(data.battleData);
        
        // If in story mode, load story node
        if (data.battleData.mode === "story") {
          loadStoryNode();
        } else {
          // Trigger combat panel animation for battle mode
          setTimeout(() => setShowCombatPanels(true), 100);
        }
      }
    } catch (error: any) {
      toast({
        title: "Failed to load battle",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error: any) {
      console.error("Failed to load profile:", error);
    }
  };

  const loadStoryNode = async () => {
    if (!id) {
      console.error("Cannot load story node: battleId is undefined");
      return;
    }
    
    setStoryLoading(true);
    try {
      console.log("Loading story node for battleId:", id);
      
      // Ensure we have a valid session before making the call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error("No active session");
        toast({
          title: "Session expired",
          description: "Please log in again",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }
      
      const { data, error } = await supabase.functions.invoke("generate-story-node", {
        body: { battleId: id },
      });

      if (error) throw error;
      if (data.storyNode) {
        setStoryNode(data.storyNode);
      }
    } catch (error: any) {
      console.error("Story node error:", error);
      toast({
        title: "Failed to load story",
        description: error.message,
        variant: "destructive",
      });
    }
    setStoryLoading(false);
  };

  const handleStoryChoice = async (choiceId: string) => {
    if (!storyNode) return;

    const choice = storyNode.choices.find((c) => c.id === choiceId);
    if (!choice) return;

    setStoryLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-story-choice", {
        body: {
          battleId: id,
          choiceId: choice.id,
          choiceLabel: choice.label,
          storyText: storyNode.storyText,
        },
      });

      if (error) throw error;

      // Show consequence toast
      if (data.outcome) {
        toast({
          title: data.outcome.triggersBattle ? "Battle!" : "The path unfolds",
          description: data.outcome.consequenceText,
        });
      }

      // Reload battle to get updated state
      await loadBattle();
    } catch (error: any) {
      toast({
        title: "Failed to resolve choice",
        description: error.message,
        variant: "destructive",
      });
    }
    setStoryLoading(false);
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
          // After victory, reload to switch to story mode
          setTimeout(() => {
            loadBattle();
          }, 2000);
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
        <p className="text-2xl font-bold">Loading...</p>
      </div>
    );
  }

  // Render story mode
  if (battleData.mode === "story") {
    const partyMembers = [
      {
        userId: "player",
        username: profile?.habbo_username || profile?.username.split("@")[0] || "Player",
        habboAvatar: profile?.habbo_username && profile.habbo_profile_json
          ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${profile.habbo_profile_json.figureString}&direction=2&head_direction=3&action=wav&gesture=sml&size=m`
          : undefined,
        level: battleData.player.level,
        currentHp: battleData.player.current_hp,
        maxHp: battleData.player.max_hp,
        currentMp: battleData.player.current_mp,
        maxMp: battleData.player.max_mp,
        statusEffects: battleData.player.status_effects,
      },
    ];

    return (
      <div className="min-h-screen bg-background relative">
        <div 
          className="fixed inset-0 opacity-20 bg-center bg-cover"
          style={{ backgroundImage: `url(${dungeonBg})` }}
        />
        
        <div className="relative z-10 p-8">
          <div className="max-w-7xl mx-auto space-y-6">
          {/* Frostkeep Banner */}
          <div className="flex justify-center mb-6">
            <img 
              src={frostkeepBanner} 
              alt="The Shattered Frostkeep" 
              className="pixel-icon"
              style={{ width: "auto", height: "auto" }}
            />
          </div>

            {/* Battle Log - Main Focus */}
            <HabboPanel title="Chronicle of Events">
              <div className="h-96 overflow-y-auto space-y-2 p-4 bg-muted rounded border-2 border-habbo-dark">
                {battleData.battle_log.length > 0 ? (
                  battleData.battle_log.map((log, i) => (
                    <p key={i} className="text-sm animate-fade-in">
                      <span className="text-primary font-bold">›</span> {log}
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Your journey begins...
                  </p>
                )}
              </div>
            </HabboPanel>

            {/* Story Panel Below Log */}
            <div className="grid md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <HabboPanel title="The Story Unfolds">
                  <div className="space-y-6">
                    {/* Story Text */}
                    <div className="p-6 bg-muted/50 border-2 border-habbo-dark rounded-lg min-h-[200px]">
                      {storyLoading && !storyNode ? (
                        <div className="flex items-center justify-center h-40">
                          <p className="text-lg italic animate-pulse">
                            The dungeon master consults the ancient tomes...
                          </p>
                        </div>
                      ) : storyNode ? (
                        <p className="text-lg leading-relaxed whitespace-pre-wrap">
                          {storyNode.storyText}
                        </p>
                      ) : (
                        <p className="text-lg italic text-muted-foreground">
                          Awaiting your next decision...
                        </p>
                      )}
                    </div>

                    {/* Choices */}
                    {storyNode && storyNode.choices.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-xl font-black mb-4">What will you do?</h3>
                        <div className="space-y-3">
                          {storyNode.choices.map((choice) => (
                            <Button
                              key={choice.id}
                              onClick={() => handleStoryChoice(choice.id)}
                              disabled={storyLoading}
                              variant="outline"
                              className="w-full text-left justify-start h-auto py-4 px-6 font-bold border-4 border-habbo-dark text-base hover-scale"
                            >
                              <span className="mr-3 text-2xl">›</span>
                              {choice.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {storyLoading && (
                      <div className="text-center py-4">
                        <p className="text-lg font-bold animate-pulse">
                          Resolving your choice...
                        </p>
                      </div>
                    )}
                  </div>
                </HabboPanel>
              </div>

              {/* Party Panel */}
              <div className="md:col-span-1">
                <HabboPanel title="Your Party">
                  <div className="space-y-4">
                    {partyMembers.map((member) => (
                      <div
                        key={member.userId}
                        className="p-4 bg-muted rounded-lg border-2 border-habbo-dark space-y-3"
                      >
                        {/* Avatar */}
                        {member.habboAvatar && (
                          <div className="flex justify-center">
                            <div className="border-2 border-habbo-dark rounded overflow-hidden bg-card">
                              <img
                                src={member.habboAvatar}
                                alt={member.username}
                                className="pixel-icon"
                                style={{ width: "auto", height: "auto", maxWidth: "80px" }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Name & Level */}
                        <div className="text-center">
                          <p className="font-bold">{member.username}</p>
                          <p className="text-xs text-muted-foreground">Level {member.level}</p>
                        </div>

                        {/* Stats */}
                        <StatBar
                          label="HP"
                          current={member.currentHp}
                          max={member.maxHp}
                          color="hp"
                        />
                        <StatBar
                          label="MP"
                          current={member.currentMp}
                          max={member.maxMp}
                          color="mp"
                        />

                        {/* Status Effects */}
                        {member.statusEffects.length > 0 && (
                          <div className="text-xs space-y-1">
                            <p className="font-bold">Effects:</p>
                            {member.statusEffects.map((effect, i) => (
                              <p key={i} className="text-accent">
                                {effect}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </HabboPanel>
              </div>
            </div>

            <Button
              onClick={() => navigate("/dashboard")}
              variant="outline"
              className="font-bold border-4 border-habbo-dark"
            >
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render battle mode
  return (
    <div className="min-h-screen bg-background relative">
      <div 
        className="fixed inset-0 opacity-20 bg-center bg-cover"
        style={{ backgroundImage: `url(${dungeonBg})` }}
      />
      
      <div className="relative z-10 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Frostkeep Banner */}
          <div className="flex justify-center mb-6">
            <img 
              src={frostkeepBanner} 
              alt="The Shattered Frostkeep" 
              className="pixel-icon"
              style={{ width: "auto", height: "auto" }}
            />
          </div>

          {/* Battle Log - Main Focus */}
          <HabboPanel title="Battle Log">
            <div className="h-96 overflow-y-auto space-y-2 p-4 bg-muted rounded border-2 border-habbo-dark">
              {battleData.battle_log.length > 0 ? (
                battleData.battle_log.map((log, i) => (
                  <p key={i} className="text-sm animate-fade-in">{log}</p>
                ))
              ) : (
                <p className="text-sm text-muted-foreground italic">Battle begins...</p>
              )}
            </div>
          </HabboPanel>

          {/* Combat Panels - Slide in from top */}
          <div className={`grid md:grid-cols-3 gap-6 transition-all duration-500 ${
            showCombatPanels ? "translate-y-0 opacity-100" : "-translate-y-8 opacity-0"
          }`}>
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
              {/* Player Habbo Avatar */}
              {profile?.habbo_username && profile.habbo_profile_json && (
                <div className="flex justify-center">
                  <div className="border-4 border-habbo-dark rounded-lg overflow-hidden bg-card">
                    <img
                      src={`https://www.habbo.com/habbo-imaging/avatarimage?figure=${profile.habbo_profile_json.figureString}&direction=2&head_direction=3&action=wav&gesture=sml&size=m`}
                      alt={profile.habbo_username}
                      className="pixel-icon"
                      style={{ width: 'auto', height: 'auto', maxWidth: '100px' }}
                    />
                  </div>
                </div>
              )}
              <div className="text-center">
                <p className="text-xs text-muted-foreground">
                  {profile?.habbo_username || profile?.username.split('@')[0] || "Player"}
                </p>
              </div>
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

        {/* Party Members Section */}
        <HabboPanel title="Party Members">
          <div className="flex items-center justify-center p-8">
            <div className="text-center space-y-2">
              <Users className="w-12 h-12 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Solo adventurer - Party system coming soon!
              </p>
            </div>
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
    </div>
  );
};

export default Battle;