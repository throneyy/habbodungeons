import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/AppLayout";
import { Swords, Users, Skull, Shield } from "lucide-react";
import frostkeepBanner from "@/assets/the-shattered-frostkeep.gif";

interface DungeonInfo {
  name: string;
  difficulty: string;
  theme: string;
  dungeon_json: any;
}

const DungeonLobby = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dungeon, setDungeon] = useState<DungeonInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState<"Normal" | "Hardcore">("Normal");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (id && id !== "new") {
      loadDungeon();
    }
  }, [id]);

  const loadDungeon = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("dungeons")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      setDungeon(data);
      if (data.difficulty === "Normal" || data.difficulty === "Hardcore") {
        setSelectedDifficulty(data.difficulty);
      }
    } catch (error: any) {
      toast({
        title: "Failed to load dungeon",
        description: error.message,
        variant: "destructive",
      });
      navigate("/dashboard");
    }
    setLoading(false);
  };

  const handleStartBattle = async () => {
    if (id === "new") {
      // Generate new dungeon
      setGenerating(true);
      try {
        const { data, error } = await supabase.functions.invoke("generate-dungeon", {
          body: {
            difficulty: selectedDifficulty,
            theme: "Ice",
            encounters: 3,
          },
        });

        if (error) throw error;

        toast({ title: "Quest generated!" });
        navigate(`/battle/${data.dungeonId}`);
      } catch (error: any) {
        toast({
          title: "Failed to generate quest",
          description: error.message,
          variant: "destructive",
        });
        setGenerating(false);
      }
    } else {
      navigate(`/battle/${id}`);
    }
  };

  if (loading || generating) {
    return (
      <AppLayout hideBanner>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-2xl font-bold">{generating ? "Generating quest..." : "Loading..."}</p>
        </div>
      </AppLayout>
    );
  }

  const isNewDungeon = id === "new";

  return (
    <AppLayout hideBanner>
      {/* Universe Banner - Full width, no container */}
      <div className="w-full flex justify-center mb-6 -mt-8">
        <img 
          src={frostkeepBanner} 
          alt="The Shattered Frostkeep" 
          className="pixel-icon"
        />
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Universe Introduction */}
        <HabboPanel title="The Shattered Frostkeep">
          <div className="space-y-4">
            <div className="text-lg leading-relaxed">
              <p className="mb-4">
                Beneath the frozen hotel lies the <span className="font-bold text-primary">Shattered Frostkeep</span>, an ancient dungeon of ice, forgotten loot, and monsters drawn to the cold.
              </p>
              <p className="mb-4">
                Endless glacial corridors twist through abandoned fortresses carved from solid ice. The walls glisten with crystalline frost, and the air itself cuts like a blade against exposed skin.
              </p>
              <p className="text-muted-foreground italic">
                Winter&apos;s grip has claimed this realm. Only the bravest dare venture into these frozen depths.
              </p>
            </div>

            {!isNewDungeon && dungeon && (
              <div className="mt-6 pt-6 border-t-2 border-habbo-dark">
                <h3 className="text-xl font-black mb-2">Your Quest: {dungeon.name}</h3>
                {dungeon.dungeon_json?.questObjective && (
                  <p className="text-lg mb-4 text-foreground font-semibold">
                    {dungeon.dungeon_json.questObjective}
                  </p>
                )}
                <div className="flex gap-4 text-sm">
                  <span className="px-3 py-1 bg-primary/20 border-2 border-primary rounded font-bold">
                    {dungeon.difficulty}
                  </span>
                </div>
              </div>
            )}
          </div>
        </HabboPanel>

        {/* Difficulty Selection for New Dungeons */}
        {isNewDungeon && (
          <HabboPanel title="Choose Your Challenge">
            <div className="grid md:grid-cols-2 gap-4">
              <button
                onClick={() => setSelectedDifficulty("Normal")}
                className={`p-6 rounded-lg border-4 transition-all ${
                  selectedDifficulty === "Normal"
                    ? "border-primary bg-primary/20"
                    : "border-habbo-dark bg-muted/50 hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-center gap-3 mb-3">
                  <Shield className="w-8 h-8 text-primary" />
                  <h3 className="text-2xl font-black">Normal</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Balanced difficulty for adventurers. Enemies have standard stats and fair rewards.
                </p>
              </button>

              <button
                onClick={() => setSelectedDifficulty("Hardcore")}
                className={`p-6 rounded-lg border-4 transition-all ${
                  selectedDifficulty === "Hardcore"
                    ? "border-destructive bg-destructive/20"
                    : "border-habbo-dark bg-muted/50 hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-center gap-3 mb-3">
                  <Skull className="w-8 h-8 text-destructive" />
                  <h3 className="text-2xl font-black">Hardcore</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Brutal challenge for veterans. Stronger enemies with greater rewards.
                </p>
              </button>
            </div>
          </HabboPanel>
        )}

        {/* Party & Actions Panel */}
        <HabboPanel title="Prepare Your Party">
          <div className="space-y-6">
            {/* Party System */}
            <div className="p-6 bg-muted/50 border-2 border-habbo-dark rounded-lg">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5" />
                <h4 className="font-bold text-lg">Party Members</h4>
              </div>
              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-3 p-3 bg-background border-2 border-habbo-dark rounded">
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center font-bold text-primary-foreground">
                    1
                  </div>
                  <div>
                    <p className="font-bold">You (Party Leader)</p>
                    <p className="text-sm text-muted-foreground">Ready</p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground italic">
                Multiplayer party invites coming soon! For now, venture forth solo.
              </p>
            </div>

            {/* Start Battle */}
            <div className="flex flex-col gap-4">
              <Button
                onClick={handleStartBattle}
                className="w-full font-bold text-lg py-6 border-4 border-habbo-dark"
                size="lg"
              >
                <Swords className="w-6 h-6 mr-2" />
                Enter the Dungeon
              </Button>
              <Button
                onClick={() => navigate("/dashboard")}
                variant="outline"
                className="w-full font-bold border-2 border-habbo-dark"
              >
                Return to Dashboard
              </Button>
            </div>
          </div>
        </HabboPanel>
      </div>
    </AppLayout>
  );
};

export default DungeonLobby;
