import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/AppLayout";
import { Swords, Users } from "lucide-react";
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDungeon();
  }, [id]);

  const loadDungeon = async () => {
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

  const handleStartBattle = async (difficulty: "Normal" | "Hardcore") => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("start-dungeon-battle", {
        body: {
          dungeonId: id,
          difficulty,
        },
      });

      if (error) throw error;

      // Wait a moment for the battle state to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      toast({ title: `${difficulty} mode started!` });
      navigate(`/battle/${id}`);
    } catch (error: any) {
      toast({
        title: "Failed to start battle",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout hideBanner>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-2xl font-bold">Loading dungeon...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout hideBanner>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Universe Banner */}
        <img 
          src={frostkeepBanner} 
          alt="The Shattered Frostkeep" 
          className="pixel-icon border-4 border-habbo-dark rounded-lg mx-auto"
        />

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

            {dungeon && (
              <div className="mt-6 pt-6 border-t-2 border-habbo-dark">
                <h3 className="text-xl font-black mb-2">Your Quest: {dungeon.name}</h3>
                {dungeon.dungeon_json?.questObjective && (
                  <p className="text-lg mb-4 text-foreground font-semibold">
                    {dungeon.dungeon_json.questObjective}
                  </p>
                )}
                <div className="mt-6 space-y-4">
                  <p className="font-bold text-sm text-muted-foreground">Choose Your Difficulty:</p>
                  <div className="flex gap-4">
                    <Button
                      onClick={() => handleStartBattle("Normal")}
                      disabled={loading}
                      className="font-bold border-2 border-primary bg-primary/20 hover:bg-primary/30"
                    >
                      Normal
                    </Button>
                    <Button
                      onClick={() => handleStartBattle("Hardcore")}
                      disabled={loading}
                      className="font-bold border-2 border-destructive bg-destructive/20 hover:bg-destructive/30"
                    >
                      Hardcore
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </HabboPanel>

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
