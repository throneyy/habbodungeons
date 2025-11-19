import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Determine consumable effect
    let newHp = stats.current_hp;
    let newMp = stats.current_mp;
    let effectMessage = "";

    const itemName = inventoryItem.item_name.toLowerCase();

    if (itemName.includes("potion")) {
      // Restore 50 HP, capped at max_hp
      const hpRestored = Math.min(50, stats.max_hp - stats.current_hp);
      newHp = Math.min(stats.current_hp + 50, stats.max_hp);
      effectMessage = `Restored ${hpRestored} HP`;
      console.log(`💊 Potion used: ${stats.current_hp} → ${newHp} HP`);
    } else if (itemName.includes("ether") || itemName.includes("elixer")) {
      // Restore 30 MP, capped at max_mp
      const mpRestored = Math.min(30, stats.max_mp - stats.current_mp);
      newMp = Math.min(stats.current_mp + 30, stats.max_mp);
      effectMessage = `Restored ${mpRestored} MP`;
      console.log(`🔮 Ether used: ${stats.current_mp} → ${newMp} MP`);
    } else {
      throw new Error("Item is not a consumable");
    }

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
