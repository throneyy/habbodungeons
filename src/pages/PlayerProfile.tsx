import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { HabboPanel } from "@/components/HabboPanel";
import { StatBar } from "@/components/StatBar";
import { toast } from "sonner";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface PlayerData {
  username: string;
  habbo_username: string;
  level: number;
  max_hp: number;
  current_hp: number;
  max_mp: number;
  current_mp: number;
  atk: number;
  def: number;
  spd: number;
  figureString?: string;
}

export default function PlayerProfile() {
  const { habboUsername } = useParams<{ habboUsername: string }>();
  const navigate = useNavigate();
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlayer();
  }, [habboUsername]);

  const loadPlayer = async () => {
    if (!habboUsername) {
      toast.error("No player specified");
      navigate("/");
      return;
    }

    try {
      setLoading(true);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("username, habbo_username, habbo_profile_json")
        .ilike("habbo_username", habboUsername)
        .single();

      if (profileError) throw profileError;

      if (!profileData) {
        toast.error("Player not found");
        navigate("/");
        return;
      }

      const { data: statsData, error: statsError } = await supabase
        .from("player_stats")
        .select("level, max_hp, current_hp, max_mp, current_mp, atk, def, spd")
        .eq("user_id", (await supabase
          .from("profiles")
          .select("id")
          .ilike("habbo_username", habboUsername)
          .single()).data?.id)
        .single();

      if (statsError) throw statsError;

      const habboProfile = profileData.habbo_profile_json as { figureString?: string } | null;
      
      setPlayer({
        username: profileData.username,
        habbo_username: profileData.habbo_username || "",
        figureString: habboProfile?.figureString,
        ...statsData,
      });
    } catch (error: any) {
      console.error("Error loading player:", error);
      toast.error("Failed to load player profile");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-2xl font-bold text-foreground">Loading player...</div>
        </div>
      </AppLayout>
    );
  }

  if (!player) {
    return null;
  }

  const avatarUrl = player.figureString
    ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${player.figureString}&size=l&direction=2&head_direction=3`
    : undefined;

  return (
    <AppLayout>
      <div className="container py-8 mx-auto space-y-6">
        <Button
          variant="outline"
          onClick={() => navigate("/")}
          className="border-2 border-habbo-dark"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Search
        </Button>

        <HabboPanel className="bg-gradient-to-br from-primary/20 to-secondary/20">
          <div className="flex flex-col items-center gap-6 md:flex-row">
            <Avatar className="w-32 h-32 border-4 border-habbo-dark">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={player.habbo_username} />}
              <AvatarFallback className="text-4xl">{player.habbo_username[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <h1 className="text-4xl font-bold text-foreground">{player.habbo_username}</h1>
              <p className="text-xl text-muted-foreground">@{player.username}</p>
              <div className="text-2xl font-bold text-primary">Level {player.level}</div>
            </div>
          </div>
        </HabboPanel>

        <HabboPanel className="bg-gradient-to-br from-secondary/10 to-accent/10">
          <h2 className="mb-6 text-2xl font-bold text-foreground">Player Stats</h2>
          <div className="space-y-4">
            <StatBar
              label="HP"
              current={player.current_hp}
              max={player.max_hp}
              color="hp"
            />
            <StatBar
              label="MP"
              current={player.current_mp}
              max={player.max_mp}
              color="mp"
            />
            <div className="grid grid-cols-3 gap-4 pt-4">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">ATK</div>
                <div className="text-3xl font-bold text-red-500">{player.atk}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">DEF</div>
                <div className="text-3xl font-bold text-blue-500">{player.def}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">SPD</div>
                <div className="text-3xl font-bold text-green-500">{player.spd}</div>
              </div>
            </div>
          </div>
        </HabboPanel>
      </div>
    </AppLayout>
  );
}
