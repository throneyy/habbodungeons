import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { battleId, choiceId, choiceLabel, storyText } = await req.json();

    // Get battle state by dungeon_id
    const { data: battleState, error: battleError } = await supabaseClient
      .from("battle_states")
      .select("*, dungeons(*)")
      .eq("dungeon_id", battleId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (battleError) throw battleError;

    // Get party stats
    const { data: partyStats } = await supabaseClient
      .from("player_stats")
      .select("*")
      .eq("user_id", battleState.user_id)
      .single();

    console.log("Resolving choice:", choiceLabel);

    // Get the current and next room enemy info
    const dungeon = battleState.dungeons.dungeon_json as any;
    const currentRoomIndex = battleState.current_room_index;
    const nextRoomIndex = currentRoomIndex + 1;
    
    let enemyContext = "";
    if (nextRoomIndex < dungeon.rooms.length) {
      const nextRoom = dungeon.rooms[nextRoomIndex];
      enemyContext = `\n\nIMPORTANT: If you trigger a battle, the enemy will be: "${nextRoom.enemy.name}" (${nextRoom.enemy.description}). You MUST mention this exact enemy name in your narrative if triggersBattle is true.`;
    }

    // Call Lovable AI to determine outcome
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a dungeon master resolving player choices in The Shattered Frostkeep ice dungeon. Determine the consequence of their action.

CRITICAL RULES:
- Narrate the outcome dramatically but concisely (2-3 sentences)
- If you trigger a battle, you MUST mention the exact enemy name provided in the user context
- Choices that seem aggressive should often trigger battles
- Choices that seem cautious should be safer but might still have risks
- Mix rewards and penalties to keep things interesting
- Stay in character as dungeon master
- Output ONLY valid JSON, no markdown

Output format:
{
  "consequenceText": "Brief narration of what happens (30-60 words)",
  "hpChange": -10 to +20 (negative for damage, positive for healing, 0 for none),
  "mpChange": -5 to +10,
  "itemsGained": [{"name": "item name", "quantity": 1}] or [],
  "triggersBattle": true/false,
  "progressRoom": true/false (whether to advance to next room)
}

Guidelines:
- Be fair but unpredictable
- Aggressive choices have 60-80% battle chance
- Safe choices have 10-30% battle chance
- Exploration choices sometimes give items
- Rest choices often restore HP/MP but rarely trigger battles`,
          },
          {
            role: "user",
            content: `Previous scene: ${storyText}

Player chose: "${choiceLabel}"

Dungeon: ${battleState.dungeons.name} (${battleState.dungeons.difficulty})
Current room: ${battleState.current_room_index}
Party HP: ${partyStats.current_hp}/${partyStats.max_hp}
Party MP: ${partyStats.current_mp}/${partyStats.max_mp}${enemyContext}

What happens as a result of this choice?`,
          },
        ],
        temperature: 0.8,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices[0].message.content;

    let outcome;
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
      outcome = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Invalid AI response format");
    }

    console.log("Outcome:", outcome);

    // Apply HP/MP changes
    const newHp = Math.max(0, Math.min(
      partyStats.max_hp,
      partyStats.current_hp + (outcome.hpChange || 0)
    ));
    const newMp = Math.max(0, Math.min(
      partyStats.max_mp,
      partyStats.current_mp + (outcome.mpChange || 0)
    ));

    await supabaseClient
      .from("player_stats")
      .update({
        current_hp: newHp,
        current_mp: newMp,
      })
      .eq("user_id", battleState.user_id);

    // Add items if any
    if (outcome.itemsGained && outcome.itemsGained.length > 0) {
      for (const item of outcome.itemsGained) {
        const { data: existingItem } = await supabaseClient
          .from("inventory")
          .select("*")
          .eq("user_id", battleState.user_id)
          .eq("item_name", item.name)
          .single();

        if (existingItem) {
          await supabaseClient
            .from("inventory")
            .update({ quantity: existingItem.quantity + item.quantity })
            .eq("id", existingItem.id);
        } else {
          await supabaseClient
            .from("inventory")
            .insert({
              user_id: battleState.user_id,
              item_name: item.name,
              item_type: "quest",
              quantity: item.quantity,
            });
        }
      }
    }

    // Update battle log with user_id
    const battleLog = battleState.battle_log || [];
    battleLog.push({ user_id: user.id, message: `You chose: ${choiceLabel}` });
    battleLog.push({ user_id: user.id, message: outcome.consequenceText });

    // Advance room if needed, but check bounds
    const dungeonData = battleState.dungeons.dungeon_json;
    const maxRoomIndex = dungeonData.rooms.length - 1;
    let newRoomIndex = battleState.current_room_index;
    
    if (outcome.progressRoom) {
      newRoomIndex = Math.min(battleState.current_room_index + 1, maxRoomIndex);
      
      // If we've reached the end of the dungeon
      if (newRoomIndex >= maxRoomIndex && battleState.current_room_index === maxRoomIndex) {
        battleLog.push({ 
          user_id: user.id, 
          message: "You have reached the end of this dungeon! Congratulations on surviving The Shattered Frostkeep!" 
        });
        
        // Update battle log but keep battle active so frontend can load final state
        await supabaseClient
          .from("battle_states")
          .update({
            battle_log: battleLog,
            current_room_index: newRoomIndex,
          })
          .eq("id", battleState.id);
          
        return new Response(
          JSON.stringify({
            outcome: { ...outcome, dungeonComplete: true },
            newHp,
            newMp,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    await supabaseClient
      .from("battle_states")
      .update({
        battle_log: battleLog,
        current_room_index: newRoomIndex,
      })
      .eq("id", battleState.id);

    // Update battle state to trigger battle mode
    if (outcome.triggersBattle) {
      // Get the current room's enemy
      const dungeonData = battleState.dungeons.dungeon_json;
      const currentRoom = dungeonData.rooms[newRoomIndex];
      
      if (currentRoom && currentRoom.enemy) {
        // Set up the enemy for battle
        const enemy = currentRoom.enemy;
        await supabaseClient
          .from("battle_states")
          .update({
            current_enemy_state: {
              name: enemy.name,
              description: enemy.description,
              hp: enemy.hp,
              current_hp: enemy.hp,
              max_hp: enemy.hp,
              atk: enemy.atk,
              def: enemy.def,
              spd: enemy.spd,
              status_effects: [],
              mode: "battle",
            },
          })
          .eq("id", battleState.id);
      } else {
        // No enemy in room, but triggering battle - create a generic enemy
        await supabaseClient
          .from("battle_states")
          .update({
            current_enemy_state: {
              name: "Ice Shade",
              description: "A mysterious creature emerges from the shadows!",
              hp: 30,
              current_hp: 30,
              max_hp: 30,
              atk: 8,
              def: 5,
              spd: 12,
              status_effects: [],
              mode: "battle",
            },
          })
          .eq("id", battleState.id);
      }
    }

    return new Response(
      JSON.stringify({
        outcome,
        newHp,
        newMp,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
