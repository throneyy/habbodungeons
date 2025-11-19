import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { Package, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getItemImage } from "@/lib/itemAssets";

interface InventoryItem {
  id: string;
  item_name: string;
  quantity: number;
  item_type: string;
}

interface LootReward {
  item_name: string;
  quantity: number;
  item_type: string;
  rarity: string;
}

export default function LootBox() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [chests, setChests] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [rewards, setRewards] = useState<LootReward[]>([]);
  const [showRewards, setShowRewards] = useState(false);

  useEffect(() => {
    loadChests();
  }, []);

  const loadChests = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("inventory")
        .select("*")
        .eq("user_id", user.id)
        .in("item_name", ["Everyday Supply Chest", "Rare Treasure Chest"])
        .gt("quantity", 0);

      if (error) throw error;
      setChests(data || []);
    } catch (error) {
      console.error("Error loading chests:", error);
      toast({
        title: "Error",
        description: "Failed to load chests",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openChest = async (chestName: string) => {
    setOpening(true);
    setShowRewards(false);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("open-loot-chest", {
        body: { chestName },
      });

      if (error) throw error;

      setRewards(data.rewards);
      setShowRewards(true);
      
      // Reload chests after opening
      setTimeout(() => {
        loadChests();
      }, 2000);

      toast({
        title: "Chest Opened!",
        description: `You received ${data.rewards.length} item${data.rewards.length > 1 ? 's' : ''}!`,
      });
    } catch (error: any) {
      console.error("Error opening chest:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to open chest",
        variant: "destructive",
      });
    } finally {
      setOpening(false);
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity.toLowerCase()) {
      case "legendary": return "text-yellow-400";
      case "epic": return "text-purple-400";
      case "rare": return "text-blue-400";
      case "uncommon": return "text-green-400";
      default: return "text-foreground";
    }
  };

  const getRarityGlow = (rarity: string) => {
    switch (rarity.toLowerCase()) {
      case "legendary": return "shadow-[0_0_20px_rgba(251,191,36,0.5)]";
      case "epic": return "shadow-[0_0_20px_rgba(168,85,247,0.5)]";
      case "rare": return "shadow-[0_0_20px_rgba(59,130,246,0.5)]";
      case "uncommon": return "shadow-[0_0_20px_rgba(34,197,94,0.5)]";
      default: return "";
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-black text-center mb-2">
            <Sparkles className="inline-block mr-2 h-8 w-8" />
            Chest Opening
          </h1>
          <p className="text-center text-muted-foreground">
            Open treasure chests to receive random loot and powerful items!
          </p>
        </div>

        {/* Available Chests */}
        <HabboPanel title="Your Chests">
          {chests.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-bold mb-2">No Chests Available</p>
              <p className="text-muted-foreground mb-4">
                Complete dungeons and battles to earn chests!
              </p>
              <Button onClick={() => navigate("/dungeon-list")}>
                Find Dungeons
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
              {chests.map((chest) => (
                <div
                  key={chest.id}
                  className="bg-habbo-dark border-2 border-primary rounded-lg p-6 hover:scale-105 transition-transform"
                >
                  <div className="flex flex-col items-center space-y-4">
                    <img
                      src={getItemImage(chest.item_name)}
                      alt={chest.item_name}
                      className="pixel-icon w-32 h-32 object-contain"
                    />
                    <h3 className="text-xl font-black text-center">
                      {chest.item_name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Quantity: {chest.quantity}
                    </p>
                    <Button
                      onClick={() => openChest(chest.item_name)}
                      disabled={opening}
                      size="lg"
                      className="w-full font-black"
                    >
                      {opening ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Opening...
                        </>
                      ) : (
                        <>
                          <Package className="mr-2 h-5 w-5" />
                          Open Chest
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </HabboPanel>

        {/* Rewards Display */}
        {showRewards && rewards.length > 0 && (
          <div className="mt-8 animate-fade-in">
            <HabboPanel title="🎁 Rewards Received!">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                {rewards.map((reward, index) => (
                  <div
                    key={index}
                    className={`bg-habbo-dark border-2 border-primary rounded-lg p-4 hover:scale-105 transition-all ${getRarityGlow(reward.rarity)} animate-fade-in`}
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <img
                        src={getItemImage(reward.item_name)}
                        alt={reward.item_name}
                        className="pixel-icon w-16 h-16 object-contain"
                      />
                      <p className={`text-sm font-bold text-center ${getRarityColor(reward.rarity)}`}>
                        {reward.item_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        x{reward.quantity}
                      </p>
                      <span className={`text-xs font-bold ${getRarityColor(reward.rarity)}`}>
                        {reward.rarity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </HabboPanel>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
