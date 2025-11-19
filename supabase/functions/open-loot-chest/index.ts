import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Loot tables for different chest tiers
const LOOT_TABLES = {
  "Everyday Supply Chest": {
    common: [
      { name: "Potion", type: "consumable", minQty: 2, maxQty: 5 },
      { name: "Ether", type: "consumable", minQty: 1, maxQty: 3 },
      { name: "Gold Coins", type: "currency", minQty: 10, maxQty: 50 },
      { name: "Runestones", type: "material", minQty: 3, maxQty: 8 },
      { name: "Stick Pile", type: "material", minQty: 5, maxQty: 10 },
      { name: "Cloth Squares", type: "material", minQty: 3, maxQty: 7 },
    ],
    uncommon: [
      { name: "Crystal Shards", type: "material", minQty: 2, maxQty: 5 },
      { name: "Metal Ingot", type: "material", minQty: 1, maxQty: 3 },
      { name: "Herb", type: "consumable", minQty: 2, maxQty: 4 },
      { name: "Scroll", type: "consumable", minQty: 1, maxQty: 2 },
    ],
    rare: [
      { name: "Fighters Sword", type: "weapon", minQty: 1, maxQty: 1 },
      { name: "Mage Staff", type: "weapon", minQty: 1, maxQty: 1 },
      { name: "Bow & Arrow", type: "weapon", minQty: 1, maxQty: 1 },
    ],
  },
  "Rare Treasure Chest": {
    uncommon: [
      { name: "Gold Coins", type: "currency", minQty: 50, maxQty: 150 },
      { name: "Crystal Shards", type: "material", minQty: 5, maxQty: 10 },
      { name: "Metal Ingot", type: "material", minQty: 3, maxQty: 8 },
      { name: "Ancient Scroll", type: "consumable", minQty: 1, maxQty: 3 },
    ],
    rare: [
      { name: "Fighters Sword", type: "weapon", minQty: 1, maxQty: 1 },
      { name: "Mage Staff", type: "weapon", minQty: 1, maxQty: 1 },
      { name: "Warriors Sword", type: "weapon", minQty: 1, maxQty: 1 },
      { name: "Powerful Mage Staff", type: "weapon", minQty: 1, maxQty: 1 },
    ],
    epic: [
      { name: "Warriors Sword", type: "weapon", minQty: 1, maxQty: 1 },
      { name: "Powerful Mage Staff", type: "weapon", minQty: 1, maxQty: 1 },
      { name: "Crystals", type: "material", minQty: 5, maxQty: 15 },
    ],
    legendary: [
      { name: "Gold Coins", type: "currency", minQty: 200, maxQty: 500 },
      { name: "Rare Treasure Chest", type: "consumable", minQty: 1, maxQty: 1 },
    ],
  },
};

const RARITY_CHANCES = {
  "Everyday Supply Chest": {
    common: 60,
    uncommon: 30,
    rare: 10,
  },
  "Rare Treasure Chest": {
    uncommon: 40,
    rare: 35,
    epic: 20,
    legendary: 5,
  },
};

function selectRarity(chestName: string): string {
  const chances = RARITY_CHANCES[chestName as keyof typeof RARITY_CHANCES];
  const roll = Math.random() * 100;
  let cumulative = 0;

  for (const [rarity, chance] of Object.entries(chances)) {
    cumulative += chance;
    if (roll <= cumulative) {
      return rarity;
    }
  }

  return Object.keys(chances)[0];
}

function generateLoot(chestName: string, count: number = 3) {
  const lootTable = LOOT_TABLES[chestName as keyof typeof LOOT_TABLES];
  if (!lootTable) {
    throw new Error(`Unknown chest type: ${chestName}`);
  }

  const rewards = [];

  for (let i = 0; i < count; i++) {
    const rarity = selectRarity(chestName);
    const pool = lootTable[rarity as keyof typeof lootTable];
    
    if (!pool || pool.length === 0) continue;

    const item = pool[Math.floor(Math.random() * pool.length)];
    const quantity = Math.floor(Math.random() * (item.maxQty - item.minQty + 1)) + item.minQty;

    rewards.push({
      item_name: item.name,
      quantity,
      item_type: item.type,
      rarity: rarity.charAt(0).toUpperCase() + rarity.slice(1),
    });
  }

  return rewards;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error("Authentication required");
    }

    const { chestName } = await req.json();
    console.log(`User ${user.id} opening chest: ${chestName}`);

    // Check if user has the chest
    const { data: chestItem, error: chestError } = await supabaseClient
      .from("inventory")
      .select("*")
      .eq("user_id", user.id)
      .eq("item_name", chestName)
      .gt("quantity", 0)
      .single();

    if (chestError || !chestItem) {
      throw new Error("You don't have this chest");
    }

    // Generate loot
    const lootCount = chestName === "Rare Treasure Chest" ? 5 : 3;
    const rewards = generateLoot(chestName, lootCount);

    console.log(`Generated rewards:`, rewards);

    // Remove chest from inventory
    if (chestItem.quantity === 1) {
      await supabaseClient
        .from("inventory")
        .delete()
        .eq("id", chestItem.id);
    } else {
      await supabaseClient
        .from("inventory")
        .update({ quantity: chestItem.quantity - 1 })
        .eq("id", chestItem.id);
    }

    // Add rewards to inventory
    for (const reward of rewards) {
      const { data: existingItem, error: checkError } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("user_id", user.id)
        .eq("item_name", reward.item_name)
        .maybeSingle();

      if (existingItem) {
        await supabaseClient
          .from("inventory")
          .update({ quantity: existingItem.quantity + reward.quantity })
          .eq("id", existingItem.id);
      } else {
        await supabaseClient
          .from("inventory")
          .insert({
            user_id: user.id,
            item_name: reward.item_name,
            quantity: reward.quantity,
            item_type: reward.item_type,
          });
      }
    }

    console.log(`Successfully opened chest for user ${user.id}`);

    return new Response(
      JSON.stringify({ success: true, rewards }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error("Error opening chest:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
