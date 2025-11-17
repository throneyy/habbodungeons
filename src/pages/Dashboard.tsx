import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { StatBar } from "@/components/StatBar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Link } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";

interface Profile {
  username: string;
  habbo_username: string | null;
  habbo_profile_json: any;
}

interface PlayerStats {
  level: number;
  current_hp: number;
  max_hp: number;
  current_mp: number;
  max_mp: number;
  atk: number;
  def: number;
  spd: number;
}

interface InventoryItem {
  id: string;
  item_name: string;
  quantity: number;
  item_type: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadData();
    
    // Start lobby music
    if (audioRef.current) {
      audioRef.current.volume = 0.3;
      audioRef.current.play().catch(error => {
        console.log("Audio autoplay prevented:", error);
      });
    }

    // Stop music on unmount
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const [profileRes, statsRes, inventoryRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("player_stats").select("*").eq("user_id", user.id).single(),
        supabase.from("inventory").select("*").eq("user_id", user.id),
      ]);

      if (profileRes.data) setProfile(profileRes.data);
      if (statsRes.data) setStats(statsRes.data);
      if (inventoryRes.data) setInventory(inventoryRes.data);
    } catch (error: any) {
      toast({
        title: "Failed to load data",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const handleStartDungeon = () => {
    // Stop lobby music before navigating
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    navigate("/dungeon-lobby/new");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-2xl font-bold">Loading...</p>
      </div>
    );
  }

  return (
    <AppLayout>
      {/* Hidden audio element for lobby music */}
      <audio ref={audioRef} loop>
        <source src="/audio/lobby-music.mp3" type="audio/mpeg" />
      </audio>
      
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-4xl font-black text-primary">Player Dashboard</h1>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="font-bold border-4 border-habbo-dark"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        {/* Player Identity */}
        <HabboPanel title="Player Identity">
          <div className="flex flex-col md:flex-row gap-6 items-center">
            {profile?.habbo_username && profile.habbo_profile_json && (
              <div className="border-4 border-habbo-dark rounded-lg overflow-hidden bg-card">
                <img
                  src={`https://www.habbo.com/habbo-imaging/avatarimage?figure=${profile.habbo_profile_json.figureString}&direction=2&head_direction=3&action=wav&gesture=sml&size=l`}
                  alt={profile.habbo_username}
                  className="pixel-icon"
                  style={{ width: 'auto', height: 'auto', maxWidth: '150px' }}
                />
              </div>
            )}
            <div className="space-y-2 flex-1">
              <div>
                <p className="text-sm text-muted-foreground">Habbo Dungeons Username</p>
                <p className="text-xl font-bold">{profile?.username.split('@')[0]}</p>
              </div>
              {profile?.habbo_username ? (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">Habbo Name</p>
                    <p className="text-xl font-bold">{profile.habbo_username}</p>
                  </div>
                  {profile.habbo_profile_json?.motto && (
                    <div>
                      <p className="text-sm text-muted-foreground">Motto</p>
                      <p className="italic">{profile.habbo_profile_json.motto}</p>
                    </div>
                  )}
                </>
              ) : (
                <Button
                  onClick={() => navigate("/link-habbo")}
                  className="font-bold border-4 border-habbo-dark"
                >
                  <Link className="w-4 h-4 mr-2" />
                  Link Habbo Account
                </Button>
              )}
            </div>
          </div>
        </HabboPanel>

        {/* Player Stats */}
        {profile?.habbo_username && stats && (
          <HabboPanel title="Player Stats">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="text-center p-4 bg-primary rounded-lg border-4 border-habbo-dark">
                  <p className="text-sm font-bold text-primary-foreground">Level</p>
                  <p className="text-4xl font-black text-primary-foreground">{stats.level}</p>
                </div>
                <StatBar label="HP" current={stats.current_hp} max={stats.max_hp} color="hp" />
                <StatBar label="MP" current={stats.current_mp} max={stats.max_mp} color="mp" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-accent rounded-lg border-4 border-habbo-dark">
                  <p className="text-sm font-bold">ATK</p>
                  <p className="text-3xl font-black">{stats.atk}</p>
                </div>
                <div className="text-center p-4 bg-secondary rounded-lg border-4 border-habbo-dark">
                  <p className="text-sm font-bold">DEF</p>
                  <p className="text-3xl font-black">{stats.def}</p>
                </div>
                <div className="text-center p-4 bg-primary rounded-lg border-4 border-habbo-dark">
                  <p className="text-sm font-bold text-primary-foreground">SPD</p>
                  <p className="text-3xl font-black text-primary-foreground">{stats.spd}</p>
                </div>
              </div>
            </div>
          </HabboPanel>
        )}

        {/* Inventory */}
        {profile?.habbo_username && (
        <HabboPanel title="Inventory">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {inventory.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-muted rounded-lg border-4 border-habbo-dark text-center"
              >
                <p className="font-bold">{item.item_name}</p>
                <p className="text-sm text-muted-foreground">x{item.quantity}</p>
                <p className="text-xs text-muted-foreground capitalize">{item.item_type}</p>
              </div>
            ))}
          </div>
        </HabboPanel>
        )}

        {/* Actions */}
        {profile?.habbo_username && (
        <div className="flex gap-4">
          <Button
            size="lg"
            onClick={handleStartDungeon}
            disabled={loading}
            className="flex-1 font-bold border-4 border-habbo-dark text-lg py-6"
          >
            {loading ? "Generating Quest..." : "Start Dungeon"}
          </Button>
        </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Dashboard;