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
import bookcaseImage from "@/assets/medieval-bookcase.gif";
import fantasyVillageImage from "@/assets/fantasy-village-square.png";
import frostkeepMerchantTitle from "@/assets/frostkeep-merchant-title.gif";
import { getDailyBooks, getMaterialImage, type DailyBook } from "@/lib/dailyBooks";
import { Sparkles } from "lucide-react";
import { getNPCById } from "@/lib/npcData";

export default function Store() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [goldCoins, setGoldCoins] = useState(0);
  const [silver, setSilver] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Record<string, number>>({});
  const [dailyBooks] = useState<DailyBook[]>(() => getDailyBooks());

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
        .eq("user_id", user.id);

      const gold = inventory?.find(i => i.item_name === "Gold Coins");
      const silverItem = inventory?.find(i => i.item_name === "Silver");

      setGoldCoins(gold?.quantity || 0);
      setSilver(silverItem?.quantity || 0);

      // Load material quantities
      const materialQuantities: Record<string, number> = {};
      const materialNames = ['Runestones', 'Pouch of Frost-Kissed Dust', 'Stick Pile', 'Crystal Shards', 'Cloth Squares', 'Herbs'];
      materialNames.forEach(name => {
        const item = inventory?.find(i => i.item_name === name);
        materialQuantities[name] = item?.quantity || 0;
      });
      setMaterials(materialQuantities);

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
              <div className="flex items-center justify-center h-20">
                <img 
                  src={`/src/assets/${item.sprite}`}
                  alt={item.name}
                  className="pixel-icon max-h-20"
                  style={{ width: 'auto', height: 'auto' }}
                  onError={(e) => {
                    e.currentTarget.src = '/src/assets/mystical-icon.png';
                  }}
                />
              </div>
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
              className="pixel-icon"
              style={{ width: 'auto', height: 'auto', maxHeight: '150px' }}
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

  const canAffordBook = (book: DailyBook): boolean => {
    return book.materialCosts.every(cost => 
      (materials[cost.itemName] || 0) >= cost.quantity
    );
  };

  const tradeForBook = async (book: DailyBook) => {
    setPurchasing(book.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      if (!canAffordBook(book)) {
        toast({
          title: "Insufficient Materials",
          description: `You don't have enough materials to trade for ${book.name}.`,
          variant: "destructive"
        });
        setPurchasing(null);
        return;
      }

      // Deduct materials and add book to inventory
      for (const cost of book.materialCosts) {
        const { error: deductError } = await supabase
          .from("inventory")
          .update({ 
            quantity: materials[cost.itemName] - cost.quantity 
          })
          .eq("user_id", user.id)
          .eq("item_name", cost.itemName);

        if (deductError) throw deductError;
      }

      // Add book to inventory
      const { data: existingBook } = await supabase
        .from("inventory")
        .select("*")
        .eq("user_id", user.id)
        .eq("item_name", book.name)
        .single();

      if (existingBook) {
        await supabase
          .from("inventory")
          .update({ quantity: existingBook.quantity + 1 })
          .eq("id", existingBook.id);
      } else {
        await supabase
          .from("inventory")
          .insert({
            user_id: user.id,
            item_name: book.name,
            item_type: 'book',
            quantity: 1
          });
      }

      toast({
        title: "Trade Successful!",
        description: `You obtained ${book.name}! This book is account-bound and cannot be traded.`
      });

      await loadCurrency();
    } catch (error: any) {
      console.error("Trade error:", error);
      toast({
        title: "Trade Failed",
        description: error.message || "Failed to complete trade",
        variant: "destructive"
      });
    } finally {
      setPurchasing(null);
    }
  };

  const renderBookCard = (book: DailyBook) => {
    const isPurchasing = purchasing === book.id;
    const affordable = canAffordBook(book);

    return (
      <div key={book.id} className="bg-card border-4 border-primary rounded-lg p-4 hover:scale-105 transition-transform">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center h-32">
            <img 
              src={book.sprite}
              alt={book.name}
              className="pixel-icon"
              style={{ width: 'auto', height: 'auto', maxHeight: '128px' }}
            />
          </div>
          <h4 className="font-bold text-sm text-center text-primary">{book.name}</h4>
          <p className="text-xs text-muted-foreground text-center">{book.description}</p>
          
          <div className="w-full border-t border-border pt-2 mt-2">
            <p className="text-xs font-bold text-center mb-2">Required Materials:</p>
            <div className="flex flex-col gap-1">
              {book.materialCosts.map(cost => {
                const owned = materials[cost.itemName] || 0;
                const hasEnough = owned >= cost.quantity;
                return (
                  <div key={cost.itemName} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <img 
                        src={getMaterialImage(cost.itemName)} 
                        alt={cost.itemName}
                        className="w-4 h-4 pixel-icon"
                      />
                      <span className={hasEnough ? "text-foreground" : "text-destructive"}>
                        {cost.itemName}
                      </span>
                    </div>
                    <span className={hasEnough ? "text-foreground" : "text-destructive"}>
                      {owned}/{cost.quantity}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <Button
            size="sm"
            variant={affordable ? 'default' : 'outline'}
            disabled={!affordable || isPurchasing}
            onClick={() => tradeForBook(book)}
            className="w-full mt-2"
          >
            <Sparkles className="w-3 h-3 mr-1" />
            Trade for Book
          </Button>
          <p className="text-[10px] text-muted-foreground text-center italic">
            Account-Bound (Not Tradable)
          </p>
        </div>
      </div>
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

  const merchantNPC = getNPCById("merchant");

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <HabboPanel className="mb-6 relative overflow-hidden">
          <div 
            className="absolute inset-0 opacity-15 bg-center bg-no-repeat pointer-events-none"
            style={{ backgroundImage: `url(${fantasyVillageImage})`, backgroundSize: '140%' }}
          />
          <div className="relative z-10 mb-6">
            <img 
              src={frostkeepMerchantTitle} 
              alt="The Frostkeep Merchant" 
              className="pixel-icon"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
          <div className="flex flex-col lg:flex-row gap-6 items-start relative z-10">
            {/* Left Side - Bookcase */}
            <div className="flex-shrink-0">
              <img 
                src={bookcaseImage} 
                alt="Merchant's Bookcase" 
                className="pixel-icon"
                style={{ width: 'auto', height: 'auto', maxWidth: '280px' }}
              />
            </div>

            {/* Center/Right Side - Dynamic Content */}
            <div className="flex-1 flex flex-col gap-6">
              {/* Merchant NPC & Dialogue */}
              <div className="flex flex-col md:flex-row items-center gap-4 bg-primary/5 border-2 border-primary/20 rounded-lg p-4">
                <div className="flex-shrink-0">
                  <img 
                    src={merchantNPC?.sprite} 
                    alt={merchantNPC?.name}
                    className="pixel-icon"
                    style={{ width: 'auto', height: 'auto', maxHeight: '120px' }}
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-primary mb-1">{merchantNPC?.name}</h3>
                  <p className="text-xs text-muted-foreground mb-2">{merchantNPC?.title}</p>
                  <div className="bg-card border-2 border-border rounded-lg p-3 relative">
                    <div className="absolute -left-2 top-3 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-r-8 border-r-border"></div>
                    <p className="text-sm italic">"{merchantNPC?.greeting}"</p>
                  </div>
                </div>
              </div>

              {/* Currency Display */}
              <div className="flex items-center justify-center gap-8 bg-background/50 border-2 border-border rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <img src="/src/assets/gold-coins.png" alt="Gold" className="pixel-icon" />
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold leading-none">{goldCoins}</span>
                    <span className="text-xs text-muted-foreground">Gold</span>
                  </div>
                </div>
                <div className="h-12 w-px bg-border"></div>
                <div className="flex items-center gap-2">
                  <img src="/src/assets/metal-ingot.png" alt="Silver" className="pixel-icon" />
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold leading-none">{silver}</span>
                    <span className="text-xs text-muted-foreground">Silver</span>
                  </div>
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="flex gap-2 justify-center">
                <Button variant="secondary" onClick={() => navigate("/inventory")}>
                  View Inventory
                </Button>
                <Button variant="outline" onClick={() => navigate("/dashboard")}>
                  Back to Dashboard
                </Button>
              </div>
            </div>
          </div>
        </HabboPanel>

        <HabboPanel title="Consumables" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {getCategoryItems('consumable').map(renderItemCard)}
          </div>
        </HabboPanel>

        <HabboPanel title="Weapons" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {getCategoryItems('weapon').map(renderItemCard)}
          </div>
        </HabboPanel>

        <HabboPanel title="Materials" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {getCategoryItems('material').map(renderItemCard)}
          </div>
        </HabboPanel>

        <HabboPanel title="Daily Exclusive Books" className="mb-6">
          <div className="mb-4 p-3 bg-primary/10 border border-primary rounded-lg">
            <p className="text-sm text-center text-foreground">
              <Sparkles className="inline w-4 h-4 mr-1" />
              These mystical summoning books rotate daily! Trade materials to obtain them.
            </p>
            <p className="text-xs text-center text-muted-foreground mt-1">
              Books are account-bound and grant the ability to summon allied creatures in battle.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dailyBooks.map(renderBookCard)}
          </div>
        </HabboPanel>
      </div>
    </AppLayout>
  );
}
