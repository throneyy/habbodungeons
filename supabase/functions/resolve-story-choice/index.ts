import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Enemy sprite mapping based on name patterns
const ENEMY_SPRITE_MAP: Record<string, string> = {
  "skeleton": "skeleton.png",
  "ice tiger": "ice-tiger.gif",
  "tiger": "ice-tiger.gif",
  "ice elemental": "ice-elemental.png",
  "elemental": "ice-elemental.png",
  "ice guardian": "ice-guardian.png",
  "guardian": "ice-guardian.png",
  "frost wolf": "frost-wolf.png",
  "wolf": "frost-wolf.png",
  "glacial imp": "glacial-imp.png",
  "imp": "glacial-imp.png",
  "frozen goblin": "frozen-goblin.png",
  "goblin": "frozen-goblin.png",
  "frost mutant": "frost-mutant.png",
  "mutant": "frost-mutant.png",
  "frost wraith": "frost-wraith.png",
  "wraith": "frost-wraith.png",
  "frost undead": "frost-undead.gif",
  "undead": "frost-undead.gif",
  "frostbite spider": "frostbite-spider.webp",
  "spider": "frostbite-spider.webp",
  "ghoul": "frost-undead.gif",
  "ancient": "skeleton.png",
  "warrior": "skeleton.png",
  "shade": "frost-wraith.png",
};

// Function to find matching sprite based on enemy name
function findEnemySprite(enemyName: string): string {
  if (!enemyName) return "skeleton.png";
  
  const nameLower = enemyName.toLowerCase();
  
  // Try exact match first
  if (ENEMY_SPRITE_MAP[nameLower]) {
    return ENEMY_SPRITE_MAP[nameLower];
  }
  
  // Try partial matches
  for (const [key, sprite] of Object.entries(ENEMY_SPRITE_MAP)) {
    if (nameLower.includes(key) || key.includes(nameLower)) {
      return sprite;
    }
  }
  
  // Default fallback
  return "skeleton.png";
}

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

    // Get the current room's enemy info for context
    const dungeon = battleState.dungeons.dungeon_json as any;
    const currentRoomIndex = battleState.current_room_index;
    
    let enemyContext = "";
    // If we're in story mode, the current room is what we're exploring
    const currentRoom = dungeon.rooms[currentRoomIndex];
    if (currentRoom && currentRoom.enemy) {
      enemyContext = `\n\n🔥 CRITICAL: If triggersBattle=true, you MUST write: "the ${currentRoom.enemy.name}" or "a ${currentRoom.enemy.name}" or "${currentRoom.enemy.name}" in your consequenceText. The enemy name is: "${currentRoom.enemy.name}" (${currentRoom.enemy.description}). DO NOT write vague phrases like "drawing attention" or "something emerges" - USE THE EXACT ENEMY NAME!`;
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
- **MANDATORY**: When triggersBattle is true, your consequenceText MUST include the exact enemy name provided in the context. Never write "drawing unwanted attention" or "something emerges" - always name the specific enemy!
- Choices that seem aggressive should often trigger battles
- Choices that seem cautious should be safer but might still have risks
- Mix rewards and penalties to keep things interesting
- Stay in character as dungeon master
- Output ONLY valid JSON, no markdown

Output format:
{
  "consequenceText": "Brief narration of what happens. If triggersBattle=true, MUST mention the enemy name! Example: 'An Ice Elemental materializes before you!'",
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

    // Prepare update object
    const updateData: any = {
      battle_log: battleLog,
      current_room_index: newRoomIndex,
    };

    // Set up enemy if battle is triggered
    if (outcome.triggersBattle) {
      // Battle the enemy from the current room (the one AI was told about)
      const battleRoom = dungeonData.rooms[newRoomIndex];
      
      if (battleRoom && battleRoom.enemy) {
        // Set up the enemy for battle from the CURRENT room
        const enemy = battleRoom.enemy;
        
        updateData.current_enemy_state = {
          name: enemy.name,
          description: enemy.description,
          sprite: enemy.sprite || findEnemySprite(enemy.name),
          hp: enemy.hp,
          current_hp: enemy.hp,
          max_hp: enemy.hp,
          atk: enemy.atk,
          def: enemy.def,
          spd: enemy.spd,
          status_effects: [],
          mode: "battle",
        };
      } else {
        // No enemy in current room - this shouldn't happen, but handle gracefully
        updateData.current_enemy_state = {
          name: "Ice Shade",
          description: "A mysterious creature emerges from the shadows!",
          sprite: "skeleton.png",
          hp: 30,
          current_hp: 30,
          max_hp: 30,
          atk: 8,
          def: 5,
          spd: 12,
          status_effects: [],
          mode: "battle",
        };
      }
    }

    // Single atomic update
    await supabaseClient
      .from("battle_states")
      .update(updateData)
      .eq("id", battleState.id);

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
