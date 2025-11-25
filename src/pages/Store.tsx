import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Coins, ShoppingCart } from "lucide-react";
import { STORE_ITEMS, getCategoryItems, type StoreItem } from "@/lib/storeItems";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function Store() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [goldCoins, setGoldCoins] = useState(0);
  const [silver, setSilver] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    loadCurrency();
  }, []);

  const loadCurrency = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: inventory } = await supabase
        .from("inventory")
        .select("*")
        .eq("user_id", user.id)
        .in("item_name", ["Gold Coins", "Silver"]);

      const gold = inventory?.find(i => i.item_name === "Gold Coins");
      const silverItem = inventory?.find(i => i.item_name === "Silver");

      setGoldCoins(gold?.quantity || 0);
      setSilver(silverItem?.quantity || 0);
      setLoading(false);
    } catch (error) {
      console.error("Error loading currency:", error);
      setLoading(false);
    }
  };

  const purchaseItem = async (item: StoreItem, currencyType: 'gold' | 'silver') => {
    setPurchasing(item.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const price = currencyType === 'gold' ? item.goldPrice : item.silverPrice;
      const currencyName = currencyType === 'gold' ? 'Gold Coins' : 'Silver';
      const currentAmount = currencyType === 'gold' ? goldCoins : silver;

      if (currentAmount < price) {
        toast({
          title: "Insufficient Funds",
          description: `You need ${price} ${currencyName} to purchase ${item.name}.`,
          variant: "destructive"
        });
        setPurchasing(null);
        return;
      }

      const { data, error } = await supabase.functions.invoke('purchase-item', {
        body: {
          itemName: item.name,
          currencyType: currencyName,
          price: price,
          itemType: item.itemType
        }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Purchase Successful!",
        description: `You bought ${item.name} for ${price} ${currencyName}.`
      });

      await loadCurrency();
    } catch (error: any) {
      console.error("Purchase error:", error);
      toast({
        title: "Purchase Failed",
        description: error.message || "Failed to complete purchase",
        variant: "destructive"
      });
    } finally {
      setPurchasing(null);
    }
  };

  const canAfford = (item: StoreItem, currencyType: 'gold' | 'silver') => {
    const price = currencyType === 'gold' ? item.goldPrice : item.silverPrice;
    const amount = currencyType === 'gold' ? goldCoins : silver;
    return amount >= price;
  };

  const renderItemCard = (item: StoreItem) => {
    const isPurchasing = purchasing === item.id;

    return (
      <Tooltip key={item.id}>
        <TooltipTrigger asChild>
          <div className="bg-card border-4 border-habbo-dark rounded-lg p-4 hover:scale-105 transition-transform">
            <div className="flex flex-col items-center gap-2">
              <img 
                src={`/src/assets/${item.sprite}`}
                alt={item.name}
                className="w-16 h-16 pixel-icon"
                onError={(e) => {
                  e.currentTarget.src = '/src/assets/mystical-icon.png';
                }}
              />
              <h4 className="font-bold text-sm text-center">{item.name}</h4>
              <p className="text-xs text-muted-foreground text-center">{item.description}</p>
              
              <div className="flex flex-col gap-1 w-full mt-2">
                <Button
                  size="sm"
                  variant={canAfford(item, 'gold') ? 'default' : 'outline'}
                  disabled={!canAfford(item, 'gold') || isPurchasing}
                  onClick={() => purchaseItem(item, 'gold')}
                  className="w-full text-xs"
                >
                  <Coins className="w-3 h-3 mr-1" />
                  {item.goldPrice} Gold
                </Button>
                <Button
                  size="sm"
                  variant={canAfford(item, 'silver') ? 'secondary' : 'outline'}
                  disabled={!canAfford(item, 'silver') || isPurchasing}
                  onClick={() => purchaseItem(item, 'silver')}
                  className="w-full text-xs"
                >
                  <Coins className="w-3 h-3 mr-1" />
                  {item.silverPrice} Silver
                </Button>
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col items-center gap-2">
            <img 
              src={`/src/assets/${item.sprite}`}
              alt={item.name}
              className="w-24 h-24 pixel-icon"
              onError={(e) => {
                e.currentTarget.src = '/src/assets/mystical-icon.png';
              }}
            />
            <p className="font-bold">{item.name}</p>
            <p className="text-sm">{item.description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p>Loading store...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <HabboPanel title="🏪 The Frostkeep Merchant" className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <img src="/src/assets/gold-coins.png" alt="Gold" className="w-8 h-8 pixel-icon" />
                <span className="text-2xl font-bold">{goldCoins}</span>
                <span className="text-sm text-muted-foreground">Gold</span>
              </div>
              <div className="flex items-center gap-2">
                <img src="/src/assets/gold-coins.png" alt="Silver" className="w-8 h-8 pixel-icon opacity-70" />
                <span className="text-2xl font-bold">{silver}</span>
                <span className="text-sm text-muted-foreground">Silver</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => navigate("/inventory")}>
                View Inventory
              </Button>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>
                Back to Dashboard
              </Button>
            </div>
          </div>
        </HabboPanel>

        <HabboPanel title="⚗️ Consumables" className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {getCategoryItems('consumable').map(renderItemCard)}
          </div>
        </HabboPanel>

        <HabboPanel title="⚔️ Weapons" className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {getCategoryItems('weapon').map(renderItemCard)}
          </div>
        </HabboPanel>

        <HabboPanel title="🔨 Materials" className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {getCategoryItems('material').map(renderItemCard)}
          </div>
        </HabboPanel>
      </div>
    </AppLayout>
  );
}
