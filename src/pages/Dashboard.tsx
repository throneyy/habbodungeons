import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { StatBar } from "@/components/StatBar";
import { getItemImage } from "@/lib/itemAssets";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Link, Users, Gift, RefreshCw } from "lucide-react";
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
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
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

  const refreshAvatar = async () => {
    if (!profile?.habbo_username) return;
    
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-habbo-profile", {
        body: { username: profile.habbo_username },
      });

      if (error) throw error;

      if (data.profile) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            habbo_profile_json: data.profile,
          })
          .eq("id", user.id);

        if (updateError) throw updateError;

        setProfile({
          ...profile,
          habbo_profile_json: data.profile,
        });

        toast({ 
          title: "Avatar refreshed!", 
          description: "Your Habbo Origins outfit has been updated." 
        });
      }
    } catch (error: any) {
      toast({
        title: "Failed to refresh avatar",
        description: error.message,
        variant: "destructive",
      });
    }
    setRefreshing(false);
  };

  const useConsumable = async (itemId: string, itemName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("use-consumable", {
        body: { itemId },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: `${itemName} used!`,
          description: data.message,
        });

        // Refresh data to show updated stats and inventory
        await loadData();
      }
    } catch (error: any) {
      toast({
        title: "Failed to use item",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const isConsumable = (itemName: string): boolean => {
    const name = itemName.toLowerCase();
    return name.includes("potion") || name.includes("ether") || name.includes("elixer");
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
                    <p className="text-sm text-muted-foreground">Habbo Origins Name</p>
                    <p className="text-xl font-bold">{profile.habbo_username}</p>
                  </div>
                  {profile.habbo_profile_json?.motto && (
                    <div>
                      <p className="text-sm text-muted-foreground">Motto</p>
                      <p className="italic">{profile.habbo_profile_json.motto}</p>
                    </div>
                  )}
                  <Button
                    onClick={refreshAvatar}
                    disabled={refreshing}
                    variant="outline"
                    size="sm"
                    className="font-bold border-2 border-habbo-dark"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh Avatar
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => navigate("/link-habbo")}
                  className="font-bold border-4 border-habbo-dark"
                >
                  <Link className="w-4 h-4 mr-2" />
                  Link Habbo Origins Account
                </Button>
              )}
            </div>
            
            {profile?.habbo_username && (
              <div className="flex flex-col gap-3">
                <Button
                  onClick={() => navigate("/dungeon-list")}
                  className="font-bold border-4 border-habbo-dark whitespace-nowrap"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Browse Servers
                </Button>
                <Button
                  onClick={() => navigate("/loot-box")}
                  variant="secondary"
                  className="font-bold border-4 border-habbo-dark whitespace-nowrap"
                >
                  <Gift className="w-4 h-4 mr-2" />
                  Open Chests
                </Button>
              </div>
            )}
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
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => navigate("/inventory")} variant="outline" size="sm">
                Manage Inventory
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {inventory.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="p-4 bg-muted rounded-lg border-4 border-habbo-dark text-center space-y-2"
                >
                  {getItemImage(item.item_name) && (
                    <img 
                      src={getItemImage(item.item_name)} 
                      alt={item.item_name} 
                      className="h-12 pixelated mx-auto" 
                      style={{ width: 'auto' }}
                    />
                  )}
                  <p className="font-bold">{item.item_name}</p>
                  <p className="text-sm text-muted-foreground">x{item.quantity}</p>
                  <p className="text-xs text-muted-foreground capitalize">{item.item_type}</p>
                  {isConsumable(item.item_name) && (
                    <Button
                      onClick={() => useConsumable(item.id, item.item_name)}
                      size="sm"
                      className="w-full font-bold border-2 border-habbo-dark"
                    >
                      Use
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {inventory.length > 8 && (
              <p className="text-xs text-muted-foreground text-center">
                Showing 8 of {inventory.length} items
              </p>
            )}
          </div>
        </HabboPanel>
        )}


        {/* Server Browser */}
        {profile?.habbo_username && (
          <div className="grid md:grid-cols-2 gap-4">
            <HabboPanel title="Join Adventure">
              <div className="space-y-4">
                <p className="text-center text-muted-foreground">
                  Browse available servers and team up with other players for epic dungeon runs
                </p>
                <div className="flex justify-center">
                  <Button
                    size="lg"
                    onClick={() => navigate("/dungeon-list")}
                    className="font-bold border-4 border-habbo-dark text-lg py-6 px-8"
                  >
                    Browse Servers
                  </Button>
                </div>
              </div>
            </HabboPanel>
            
            <HabboPanel title="Treasure Chests">
              <div className="space-y-4">
                <p className="text-center text-muted-foreground">
                  Open treasure chests to receive random loot and powerful items!
                </p>
                <div className="flex justify-center">
                  <Button
                    size="lg"
                    onClick={() => navigate("/loot-box")}
                    className="font-bold border-4 border-habbo-dark text-lg py-6 px-8"
                  >
                    Open Chests
                  </Button>
                </div>
              </div>
            </HabboPanel>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Dashboard;