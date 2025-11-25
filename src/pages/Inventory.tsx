import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/AppLayout";
import { Sword, Trash2, Check, Gift, Pill } from "lucide-react";
import medievalHouse from "@/assets/medieval-house.png";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getItemImage, getItemDescription } from "@/lib/itemAssets";
import { StatBar } from "@/components/StatBar";

interface InventoryItem {
  id: string;
  item_name: string;
  quantity: number;
  item_type: string;
  is_equipped: boolean;
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

const Inventory = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const [inventoryRes, statsRes] = await Promise.all([
        supabase
          .from("inventory")
          .select("*")
          .eq("user_id", user.id)
          .order("item_type")
          .order("item_name"),
        supabase
          .from("player_stats")
          .select("*")
          .eq("user_id", user.id)
          .single(),
      ]);

      if (inventoryRes.error) throw inventoryRes.error;
      setInventory(inventoryRes.data || []);
      
      if (statsRes.data) setStats(statsRes.data);
    } catch (error: any) {
      toast({
        title: "Failed to load inventory",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const equipWeapon = async (item: InventoryItem) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Unequip all weapons first
      await supabase
        .from("inventory")
        .update({ is_equipped: false })
        .eq("user_id", user.id)
        .eq("item_type", "weapon");

      // Equip the selected weapon
      const { error } = await supabase
        .from("inventory")
        .update({ is_equipped: true })
        .eq("id", item.id);

      if (error) throw error;

      // Update player_stats to reference this weapon
      await supabase
        .from("player_stats")
        .update({ equipped_weapon_id: item.id })
        .eq("user_id", user.id);

      toast({
        title: "Weapon equipped!",
        description: `${item.item_name} is now equipped.`,
      });

      loadInventory();
    } catch (error: any) {
      toast({
        title: "Failed to equip weapon",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const unequipWeapon = async (item: InventoryItem) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("inventory")
        .update({ is_equipped: false })
        .eq("id", item.id);

      if (error) throw error;

      // Clear equipped weapon reference
      await supabase
        .from("player_stats")
        .update({ equipped_weapon_id: null })
        .eq("user_id", user.id);

      toast({
        title: "Weapon unequipped",
        description: `${item.item_name} has been unequipped.`,
      });

      loadInventory();
    } catch (error: any) {
      toast({
        title: "Failed to unequip weapon",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteItem = async () => {
    if (!itemToDelete) return;

    try {
      const { error } = await supabase
        .from("inventory")
        .delete()
        .eq("id", itemToDelete.id);

      if (error) throw error;

      toast({
        title: "Item deleted",
        description: `${itemToDelete.item_name} has been removed from your inventory.`,
      });

      setItemToDelete(null);
      loadInventory();
    } catch (error: any) {
      toast({
        title: "Failed to delete item",
        description: error.message,
        variant: "destructive",
      });
    }
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
        await loadInventory();
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
    return name.includes("potion") || 
           name.includes("ether") || 
           name.includes("elixer") || 
           name.includes("elixir") ||
           name.includes("herb") ||
           name.includes("pint") ||
           name.includes("sweetcakes") ||
           name.includes("cured meat") ||
           name.includes("potatoes");
  };

  const weaponItems = inventory.filter(i => i.item_type === "weapon");
  const consumableItems = inventory.filter(i => i.item_type === "consumable");
  const otherItems = inventory.filter(i => i.item_type !== "weapon" && i.item_type !== "consumable");

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p className="text-lg">Loading inventory...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <HabboPanel className="relative overflow-hidden">
          {/* Background Image with Transparency */}
          <div 
            className="absolute inset-0 opacity-15 bg-center bg-no-repeat pointer-events-none"
            style={{ backgroundImage: `url(${medievalHouse})`, backgroundSize: '140%' }}
          />
          
          {/* Content */}
          <div className="relative z-10 flex items-center justify-between">
            <h1 className="text-3xl font-bold text-foreground">Inventory</h1>
            <div className="flex gap-2">
              <Button onClick={() => navigate("/loot-box")} variant="default">
                <Gift className="mr-2 h-4 w-4" />
                Open Chests
              </Button>
              <Button onClick={() => navigate("/dashboard")} variant="outline">
                Back to Dashboard
              </Button>
            </div>
          </div>
        </HabboPanel>

        {/* Player Stats */}
        {stats && (
          <HabboPanel title="Player Stats">
            <div className="grid md:grid-cols-2 gap-4">
              <StatBar
                label="HP"
                current={stats.current_hp}
                max={stats.max_hp}
                color="hp"
              />
              <StatBar
                label="MP"
                current={stats.current_mp}
                max={stats.max_mp}
                color="mp"
              />
            </div>
          </HabboPanel>
        )}

        {/* Weapons */}
        <HabboPanel title="Weapons">
          {weaponItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No weapons in inventory</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {weaponItems.map((item) => (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <div
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all hover:scale-105 ${
                        item.is_equipped ? "border-primary bg-primary/10" : "border-habbo-dark bg-muted"
                      }`}
                    >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {getItemImage(item.item_name) ? (
                              <img src={getItemImage(item.item_name)} alt={item.item_name} className="h-8 pixelated" style={{ width: 'auto' }} />
                            ) : (
                              <Sword className="w-5 h-5" />
                            )}
                            <div>
                              <p className="font-bold">{item.item_name}</p>
                              <p className="text-xs text-muted-foreground">Weapon</p>
                            </div>
                          </div>
                          {item.is_equipped && (
                            <div className="flex items-center gap-1 text-xs text-primary">
                              <Check className="w-4 h-4" />
                              Equipped
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground italic mb-3">
                          {getItemDescription(item.item_name)}
                        </p>
                        <div className="flex gap-2">
                          {item.is_equipped ? (
                            <Button
                              onClick={() => unequipWeapon(item)}
                              variant="outline"
                              size="sm"
                              className="flex-1"
                            >
                              Unequip
                            </Button>
                          ) : (
                            <Button
                              onClick={() => equipWeapon(item)}
                              variant="default"
                              size="sm"
                              className="flex-1"
                            >
                              Equip
                            </Button>
                          )}
                          <Button
                            onClick={() => setItemToDelete(item)}
                            variant="destructive"
                            size="sm"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </TooltipTrigger>
                    {getItemImage(item.item_name) && (
                      <TooltipContent side="top" className="bg-background border-2 border-border p-2">
                        <img 
                          src={getItemImage(item.item_name)} 
                          alt={item.item_name} 
                          className="h-24 pixelated mx-auto" 
                          style={{ width: 'auto' }}
                        />
                        <p className="text-center mt-2 font-bold">{item.item_name}</p>
                        <p className="text-center text-xs text-muted-foreground mt-1">
                          {getItemDescription(item.item_name)}
                        </p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                ))}
              </div>
            )}
          </HabboPanel>

        {/* Consumables */}
        <HabboPanel title="Consumables">
          {consumableItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No consumables in inventory</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {consumableItems.map((item) => (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <div
                      className="p-4 rounded-lg border-2 border-habbo-dark bg-muted cursor-pointer transition-all hover:scale-105"
                    >
                        <div className="flex items-start gap-3 mb-3">
                          {getItemImage(item.item_name) && (
                            <img src={getItemImage(item.item_name)} alt={item.item_name} className="h-8 pixelated" style={{ width: 'auto' }} />
                          )}
                          <div>
                            <p className="font-bold">{item.item_name}</p>
                            <p className="text-xs text-muted-foreground">x{item.quantity}</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground italic mb-3">
                          {getItemDescription(item.item_name)}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => useConsumable(item.id, item.item_name)}
                            variant="default"
                            size="sm"
                            className="flex-1"
                          >
                            <Pill className="w-4 h-4 mr-2" />
                            Use
                          </Button>
                          <Button
                            onClick={() => setItemToDelete(item)}
                            variant="destructive"
                            size="sm"
                            className="flex-1"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </TooltipTrigger>
                    {getItemImage(item.item_name) && (
                      <TooltipContent side="top" className="bg-background border-2 border-border p-2">
                        <img 
                          src={getItemImage(item.item_name)} 
                          alt={item.item_name} 
                          className="h-24 pixelated mx-auto" 
                          style={{ width: 'auto' }}
                        />
                        <p className="text-center mt-2 font-bold">{item.item_name}</p>
                        <p className="text-center text-xs text-muted-foreground mt-1">
                          {getItemDescription(item.item_name)}
                        </p>
                        <p className="text-center text-sm text-muted-foreground">x{item.quantity}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                ))}
              </div>
            )}
          </HabboPanel>

        {/* Other Items */}
        {otherItems.length > 0 && (
          <HabboPanel title="Other Items">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {otherItems.map((item) => (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <div
                      className="p-4 rounded-lg border-2 border-habbo-dark bg-muted cursor-pointer transition-all hover:scale-105"
                    >
                        <div className="flex items-start gap-3 mb-3">
                          {getItemImage(item.item_name) && (
                            <img src={getItemImage(item.item_name)} alt={item.item_name} className="h-8 pixelated" style={{ width: 'auto' }} />
                          )}
                          <div>
                            <p className="font-bold">{item.item_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.item_type} {item.quantity > 1 && `x${item.quantity}`}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground italic mb-3">
                          {getItemDescription(item.item_name)}
                        </p>
                        <Button
                          onClick={() => setItemToDelete(item)}
                          variant="destructive"
                          size="sm"
                          className="w-full"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {getItemImage(item.item_name) && (
                      <TooltipContent side="top" className="bg-background border-2 border-border p-2">
                        <img 
                          src={getItemImage(item.item_name)} 
                          alt={item.item_name} 
                          className="h-24 pixelated mx-auto" 
                          style={{ width: 'auto' }}
                        />
                        <p className="text-center mt-2 font-bold">{item.item_name}</p>
                        <p className="text-center text-xs text-muted-foreground mt-1">
                          {getItemDescription(item.item_name)}
                        </p>
                        <p className="text-center text-sm text-muted-foreground">
                          {item.item_type} {item.quantity > 1 && `x${item.quantity}`}
                        </p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                ))}
              </div>
            </HabboPanel>
          )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!itemToDelete} onOpenChange={() => setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {itemToDelete?.item_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteItem}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Inventory;
