import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/AppLayout";
import { NPCS, NPC } from "@/lib/npcData";
import { cn } from "@/lib/utils";
import { Sparkles, User, Play } from "lucide-react";

interface FeaturedDungeon {
  id: string;
  name: string;
  theme: string;
  difficulty: string;
  times_played: number;
  created_at: string;
}

const CreateDungeon = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  // Custom generation state
  const [difficulty, setDifficulty] = useState("Normal");
  const [selectedNPC, setSelectedNPC] = useState<NPC | null>(null);
  const [encounters, setEncounters] = useState(10);

  // Featured dungeons state
  const [featuredDungeons, setFeaturedDungeons] = useState<FeaturedDungeon[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(false);
  const [selectedFeatured, setSelectedFeatured] = useState<string | null>(null);

  useEffect(() => {
    loadFeaturedDungeons();
  }, []);

  const loadFeaturedDungeons = async () => {
    setLoadingFeatured(true);
    try {
      const { data, error } = await supabase
        .from("dungeons")
        .select("id, name, theme, difficulty, times_played, created_at")
        .eq("is_featured", true)
        .order("times_played", { ascending: true })
        .limit(12);

      if (error) throw error;
      setFeaturedDungeons(data || []);
    } catch (error) {
      console.error("Error loading featured dungeons:", error);
    } finally {
      setLoadingFeatured(false);
    }
  };

  const handleGenerateCustom = async () => {
    if (!selectedNPC) {
      toast({
        title: "Please select a quest giver",
        description: "Choose an NPC to receive a quest from",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-dungeon", {
        body: {
          difficulty,
          npcId: selectedNPC.id,
          encounters,
        },
      });

      if (error) {
        // Check if it's an AI credits error
        if (error.message?.includes("402") || error.message?.includes("credits")) {
          toast({
            title: "AI Generation Unavailable",
            description: "Custom dungeon generation is temporarily unavailable. Try selecting a featured dungeon instead!",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      toast({ title: "Quest received from " + selectedNPC.name + "!" });
      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Failed to generate quest",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const handlePlayFeatured = async () => {
    if (!selectedFeatured) {
      toast({
        title: "Please select a dungeon",
        description: "Choose a featured dungeon to play",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Get current times_played and increment
      const { data: dungeonData } = await supabase
        .from("dungeons")
        .select("times_played")
        .eq("id", selectedFeatured)
        .single();

      if (dungeonData) {
        await supabase
          .from("dungeons")
          .update({ times_played: dungeonData.times_played + 1 })
          .eq("id", selectedFeatured);
      }

      // Start the dungeon battle
      const { data, error } = await supabase.functions.invoke("start-dungeon-battle", {
        body: { dungeonId: selectedFeatured },
      });

      if (error) throw error;

      toast({ title: "Dungeon started!" });
      navigate(`/battle/${data.battleId}`);
    } catch (error: any) {
      toast({
        title: "Failed to start dungeon",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Easy": return "bg-green-500/20 text-green-500 border-green-500";
      case "Normal": return "bg-blue-500/20 text-blue-500 border-blue-500";
      case "Hard": return "bg-orange-500/20 text-orange-500 border-orange-500";
      case "Brutal": return "bg-red-500/20 text-red-500 border-red-500";
      default: return "bg-muted text-muted-foreground border-muted";
    }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <HabboPanel title="Quest Board">
          <Tabs defaultValue="featured" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="featured" className="gap-2">
                <Sparkles className="w-4 h-4" />
                Featured Dungeons
              </TabsTrigger>
              <TabsTrigger value="custom" className="gap-2">
                <User className="w-4 h-4" />
                Custom Quest
              </TabsTrigger>
            </TabsList>

            <TabsContent value="featured" className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold">Pre-Generated Dungeons</h3>
                    <p className="text-sm text-muted-foreground">Jump right into the action! No waiting, no AI costs.</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadFeaturedDungeons}
                    disabled={loadingFeatured}
                  >
                    Refresh
                  </Button>
                </div>

                {loadingFeatured ? (
                  <div className="text-center py-8 text-muted-foreground">Loading dungeons...</div>
                ) : featuredDungeons.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No featured dungeons available yet. Check back later!
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {featuredDungeons.map((dungeon) => (
                      <button
                        key={dungeon.id}
                        onClick={() => setSelectedFeatured(dungeon.id)}
                        className={cn(
                          "p-4 rounded-lg border-4 transition-all hover:scale-105 text-left",
                          selectedFeatured === dungeon.id
                            ? "border-primary bg-primary/20 shadow-lg"
                            : "border-habbo-dark bg-card hover:border-primary/50"
                        )}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-bold text-sm line-clamp-2">{dungeon.theme}</h4>
                            <Badge className={cn("text-xs border", getDifficultyColor(dungeon.difficulty))}>
                              {dungeon.difficulty}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Play className="w-3 h-3" />
                            <span>{dungeon.times_played} plays</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <Button
                  onClick={handlePlayFeatured}
                  disabled={loading || !selectedFeatured}
                  size="lg"
                  className="w-full font-bold border-4 border-habbo-dark text-lg py-6"
                >
                  {loading ? "Starting Dungeon..." : "Play Selected Dungeon"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="custom" className="space-y-6">
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-lg font-bold">Choose a Quest Giver</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {NPCS.map((npc) => (
                      <button
                        key={npc.id}
                        onClick={() => setSelectedNPC(npc)}
                        className={cn(
                          "flex flex-col items-center p-4 rounded-lg border-4 transition-all hover:scale-105",
                          selectedNPC?.id === npc.id
                            ? "border-primary bg-primary/20 shadow-lg"
                            : "border-habbo-dark bg-card hover:border-primary/50"
                        )}
                      >
                        <img 
                          src={npc.sprite} 
                          alt={npc.name} 
                          className="h-16 pixel-icon mb-2"
                        />
                        <p className="font-bold text-sm text-center">{npc.name}</p>
                        <p className="text-xs text-muted-foreground text-center">{npc.title}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedNPC && (
                  <div className="p-4 bg-primary/10 border-2 border-primary rounded-lg space-y-2">
                    <div className="flex items-start gap-3">
                      <img 
                        src={selectedNPC.sprite} 
                        alt={selectedNPC.name} 
                        className="h-12 pixel-icon"
                      />
                      <div className="flex-1">
                        <p className="font-bold text-lg">{selectedNPC.name}</p>
                        <p className="text-sm text-muted-foreground italic">"{selectedNPC.greeting}"</p>
                      </div>
                    </div>
                    <div className="text-sm space-y-1">
                      <p><span className="font-bold text-primary">Quest Type:</span> {selectedNPC.questTheme}</p>
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="difficulty">Difficulty</Label>
                    <Select value={difficulty} onValueChange={setDifficulty}>
                      <SelectTrigger className="border-2 border-habbo-dark">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Easy">Easy</SelectItem>
                        <SelectItem value="Normal">Normal</SelectItem>
                        <SelectItem value="Hard">Hard</SelectItem>
                        <SelectItem value="Brutal">Brutal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="encounters">Number of Encounters</Label>
                    <Select 
                      value={encounters.toString()} 
                      onValueChange={(val) => setEncounters(parseInt(val))}
                    >
                      <SelectTrigger className="border-2 border-habbo-dark">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 encounters (Short)</SelectItem>
                        <SelectItem value="10">10 encounters (Normal)</SelectItem>
                        <SelectItem value="13">13 encounters (Long)</SelectItem>
                        <SelectItem value="15">15 encounters (Epic)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="p-3 bg-yellow-500/10 border border-yellow-500/50 rounded-lg">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">
                    <strong>Note:</strong> Custom generation uses AI and may be temporarily unavailable if credits are low. Try featured dungeons for instant play!
                  </p>
                </div>

                <Button
                  onClick={handleGenerateCustom}
                  disabled={loading || !selectedNPC}
                  size="lg"
                  className="w-full font-bold border-4 border-habbo-dark text-lg py-6"
                >
                  {loading ? "Receiving Quest..." : "Generate Custom Quest"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="w-full font-bold border-4 border-habbo-dark mt-6"
          >
            Back to Dashboard
          </Button>
        </HabboPanel>
      </div>
    </AppLayout>
  );
};

export default CreateDungeon;
