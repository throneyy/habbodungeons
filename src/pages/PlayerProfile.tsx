import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { HabboPanel } from "@/components/HabboPanel";
import { StatBar } from "@/components/StatBar";
import { toast } from "sonner";
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

      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, habbo_username, habbo_profile_json, created_at")
        .ilike("habbo_username", habboUsername)
        .order("created_at", { ascending: false })
        .limit(1);

      if (profileError) throw profileError;

      const profileData = profiles?.[0];

      if (!profileData) {
        toast.error("Player not found - no one with that Habbo Origins username has linked their account yet");
        navigate("/");
        return;
      }

      const { data: statsData, error: statsError } = await supabase
        .from("player_stats")
        .select("level, max_hp, current_hp, max_mp, current_mp, atk, def, spd")
        .eq("user_id", profileData.id)
        .maybeSingle();

      if (statsError) throw statsError;

      if (!statsData) {
        toast.error("No stats found for this player");
        navigate("/");
        return;
      }

      const habboProfile = profileData.habbo_profile_json as { figureString?: string } | null;
      
      setPlayer({
        username: profileData.username,
        habbo_username: profileData.habbo_username || "",
        figureString: habboProfile?.figureString,
        level: statsData.level || 1,
        max_hp: statsData.max_hp || 100,
        current_hp: statsData.current_hp || 100,
        max_mp: statsData.max_mp || 50,
        current_mp: statsData.current_mp || 50,
        atk: statsData.atk || 10,
        def: statsData.def || 10,
        spd: statsData.spd || 10,
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
    ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${player.figureString}&size=b&direction=2&head_direction=3&action=wav&gesture=sml`
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
          <div className="flex flex-col items-center gap-8 md:flex-row">
            <div className="border-4 border-habbo-dark rounded-lg overflow-hidden bg-card p-4">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={player.habbo_username}
                  className="pixel-icon"
                  style={{ width: 'auto', height: 'auto', maxWidth: '200px' }}
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-6xl font-bold">
                  {player.habbo_username[0]}
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <h1 className="text-5xl font-bold text-foreground">{player.habbo_username}</h1>
              <p className="text-xl text-muted-foreground">Habbo Dungeons: {player.username.split('@')[0]}</p>
              <div className="inline-block px-4 py-2 bg-primary/20 border-2 border-primary rounded-lg">
                <span className="text-sm text-muted-foreground mr-2">Level</span>
                <span className="text-3xl font-bold text-primary">{player.level}</span>
              </div>
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
