import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// JRPG-style consumable definitions
const CONSUMABLES: Record<string, {
  type: 'hp' | 'mp' | 'both',
  hpPercent?: number,
  mpPercent?: number,
  hpFixed?: number,
  mpFixed?: number,
  description: string
}> = {
  // HP Restoration
  "herb": { type: 'hp', hpPercent: 15, description: "Restores 15% HP" },
  "potion": { type: 'hp', hpPercent: 30, description: "Restores 30% HP" },
  "hi-potion": { type: 'hp', hpPercent: 50, description: "Restores 50% HP" },
  "mega potion": { type: 'hp', hpPercent: 100, description: "Fully restores HP" },
  "x-potion": { type: 'hp', hpPercent: 100, description: "Fully restores HP" },
  
  // MP Restoration
  "ether": { type: 'mp', mpPercent: 25, description: "Restores 25% MP" },
  "hi-ether": { type: 'mp', mpPercent: 50, description: "Restores 50% MP" },
  "mega ether": { type: 'mp', mpPercent: 100, description: "Fully restores MP" },
  
  // Full Restoration (very rare)
  "elixer": { type: 'both', hpPercent: 100, mpPercent: 100, description: "Fully restores HP and MP" },
  "elixir": { type: 'both', hpPercent: 100, mpPercent: 100, description: "Fully restores HP and MP" },
  
  // Food items - small fixed amounts
  "frothy pint": { type: 'hp', hpFixed: 20, description: "Restores 20 HP" },
  "sweetcakes": { type: 'both', hpFixed: 30, mpFixed: 10, description: "Restores 30 HP and 10 MP" },
  "cured meat": { type: 'hp', hpFixed: 40, description: "Restores 40 HP" },
  "sack of potatoes": { type: 'hp', hpFixed: 25, description: "Restores 25 HP" },
};

// Find matching consumable definition
function getConsumableEffect(itemName: string) {
  const nameLower = itemName.toLowerCase();
  
  // Try exact match first
  if (CONSUMABLES[nameLower]) {
    return CONSUMABLES[nameLower];
  }
  
  // Try partial match
  for (const [key, effect] of Object.entries(CONSUMABLES)) {
    if (nameLower.includes(key) || key.includes(nameLower)) {
      return effect;
    }
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error("Not authenticated");
    }

    const { itemId } = await req.json();

    if (!itemId) {
      throw new Error("Item ID is required");
    }

    console.log(`🧪 User ${user.id} attempting to use consumable ${itemId}`);

    // Get the inventory item
    const { data: inventoryItem, error: inventoryError } = await supabaseClient
      .from("inventory")
      .select("*")
      .eq("id", itemId)
      .eq("user_id", user.id)
      .single();

    if (inventoryError || !inventoryItem) {
      throw new Error("Item not found in inventory");
    }

    if (inventoryItem.quantity <= 0) {
      throw new Error("No items remaining");
    }

    // Get current player stats
    const { data: stats, error: statsError } = await supabaseClient
      .from("player_stats")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (statsError || !stats) {
      throw new Error("Player stats not found");
    }

    // Find consumable effect
    const effect = getConsumableEffect(inventoryItem.item_name);
    
    if (!effect) {
      throw new Error(`${inventoryItem.item_name} is not a consumable`);
    }

    console.log(`📋 Consumable effect found:`, effect);

    // Calculate HP restoration
    let newHp = stats.current_hp;
    let hpRestored = 0;
    
    if (effect.type === 'hp' || effect.type === 'both') {
      if (effect.hpPercent !== undefined) {
        // Percentage-based restoration
        const restoreAmount = Math.floor(stats.max_hp * (effect.hpPercent / 100));
        hpRestored = Math.min(restoreAmount, stats.max_hp - stats.current_hp);
        newHp = Math.min(stats.current_hp + restoreAmount, stats.max_hp);
      } else if (effect.hpFixed !== undefined) {
        // Fixed restoration
        hpRestored = Math.min(effect.hpFixed, stats.max_hp - stats.current_hp);
        newHp = Math.min(stats.current_hp + effect.hpFixed, stats.max_hp);
      }
    }

    // Calculate MP restoration
    let newMp = stats.current_mp;
    let mpRestored = 0;
    
    if (effect.type === 'mp' || effect.type === 'both') {
      if (effect.mpPercent !== undefined) {
        // Percentage-based restoration
        const restoreAmount = Math.floor(stats.max_mp * (effect.mpPercent / 100));
        mpRestored = Math.min(restoreAmount, stats.max_mp - stats.current_mp);
        newMp = Math.min(stats.current_mp + restoreAmount, stats.max_mp);
      } else if (effect.mpFixed !== undefined) {
        // Fixed restoration
        mpRestored = Math.min(effect.mpFixed, stats.max_mp - stats.current_mp);
        newMp = Math.min(stats.current_mp + effect.mpFixed, stats.max_mp);
      }
    }

    // Build effect message
    let effectMessage = "";
    if (hpRestored > 0 && mpRestored > 0) {
      effectMessage = `Restored ${hpRestored} HP and ${mpRestored} MP`;
    } else if (hpRestored > 0) {
      effectMessage = `Restored ${hpRestored} HP`;
    } else if (mpRestored > 0) {
      effectMessage = `Restored ${mpRestored} MP`;
    } else {
      effectMessage = "Already at maximum!";
    }

    console.log(`💊 ${inventoryItem.item_name} used: HP ${stats.current_hp} → ${newHp}, MP ${stats.current_mp} → ${newMp}`);

    // Update player stats
    const { error: updateStatsError } = await supabaseClient
      .from("player_stats")
      .update({
        current_hp: newHp,
        current_mp: newMp,
      })
      .eq("user_id", user.id);

    if (updateStatsError) {
      throw updateStatsError;
    }

    // Decrease item quantity or delete if 0
    if (inventoryItem.quantity === 1) {
      const { error: deleteError } = await supabaseClient
        .from("inventory")
        .delete()
        .eq("id", itemId);

      if (deleteError) {
        throw deleteError;
      }
      console.log(`🗑️ Item ${inventoryItem.item_name} removed from inventory`);
    } else {
      const { error: updateError } = await supabaseClient
        .from("inventory")
        .update({ quantity: inventoryItem.quantity - 1 })
        .eq("id", itemId);

      if (updateError) {
        throw updateError;
      }
      console.log(`📦 Item ${inventoryItem.item_name} quantity decreased to ${inventoryItem.quantity - 1}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: effectMessage,
        stats: {
          current_hp: newHp,
          max_hp: stats.max_hp,
          current_mp: newMp,
          max_mp: stats.max_mp,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error using consumable:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
