import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

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
  "goblin trio": "goblin-trio.png",
  "trio": "goblin-trio.png",
  "frost mutant": "frost-mutant.png",
  "mutant": "frost-mutant.png",
  "frost wraith": "frost-wraith.png",
  "wraith": "frost-wraith.png",
  "frost undead": "undead-habbo.png",
  "undead": "undead-habbo.png",
  "frostbite spider": "frostbite-spider.webp",
  "spider": "frostbite-spider.webp",
  "giant rat": "giant-rat.png",
  "rat": "giant-rat.png",
  "sewer rat": "giant-rat.png",
  "ghoul": "undead-habbo.png",
  "ancient": "skeleton.png",
  "warrior": "skeleton.png",
  "shade": "ice-shade.png",
  "ice shade": "ice-shade.png",
  "ice knight": "ice-knight-boss.png",
  "knight commander": "ice-knight-boss.png",
  "ice knight commander": "ice-knight-boss.png",
  "blood dragon": "blood-dragon-boss.gif",
  "dragon": "blood-dragon-boss.gif",
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

    // Check if user is in a server for this dungeon
    const { data: serverMember } = await supabaseClient
      .from('server_players')
      .select('server_id, servers!inner(dungeon_id)')
      .eq('user_id', user.id)
      .eq('servers.dungeon_id', battleId)
      .maybeSingle();

    const serverId = serverMember?.server_id || null;
    console.log('User server status:', { serverId, hasServer: !!serverId });

    // Get battle state - check server first, then user
    let battleState = null;
    
    if (serverId) {
      console.log('Looking for server battle:', serverId);
      const { data, error } = await supabaseClient
        .from("battle_states")
        .select("*, dungeons(*)")
        .eq("dungeon_id", battleId)
        .eq("server_id", serverId)
        .eq("is_active", true)
        .maybeSingle();
      
      if (error) throw error;
      battleState = data;
    } else {
      console.log('Looking for solo battle');
      const { data, error } = await supabaseClient
        .from("battle_states")
        .select("*, dungeons(*)")
        .eq("dungeon_id", battleId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      battleState = data;
    }

    if (!battleState) throw new Error("Battle state not found");

    // For party/server battles, check if it's the player's turn
    const isPartyBattle = !!battleState.party_id || !!battleState.server_id;
    if (isPartyBattle) {
      if (battleState.current_turn_user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: "Not your turn to make a choice" }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

    // Get party stats and profile for battle log
    const { data: partyStats } = await supabaseClient
      .from("player_stats")
      .select("*")
      .eq("user_id", user.id)
      .single();

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    const playerName = profile?.habbo_username || profile?.username?.split('@')[0] || 'Player';

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
- **ANALYZE THE CHOICE TEXT CAREFULLY**: The outcome should directly reflect the tone and nature of what the player chose:
  * If the choice describes something chaotic, reckless, or wild → Make the outcome chaotic with high risk/reward
  * If the choice describes something careful, cautious, or defensive → Make the outcome safer and more predictable
  * If the choice describes something neutral or investigative → Make the outcome balanced and fair
  * If the choice involves aggression or combat → Very likely to trigger battles
  * If the choice involves stealth or avoidance → Less likely to trigger battles but might have other consequences
- Don't just use percentages - let the actual wording of the choice guide your response
- Stay in character as dungeon master
- Output ONLY valid JSON, no markdown

CRITICAL RULE - Room Progression:
- Set progressRoom=true in 70% of choices (most choices should advance the story)
- Only set progressRoom=false for: resting in place, careful searching of current area, or explicitly staying put
- ANY forward movement → progressRoom=true
- Combat choices → progressRoom=true + triggersBattle=true
- Exploration → progressRoom=true
- "Continue/proceed/move/advance" → ALWAYS progressRoom=true

CRITICAL RULE - Item Rewards:
- **ITEMS ARE RARE!** Only give itemsGained for SIGNIFICANT achievements:
  * Defeating enemies (done automatically, don't add here)
  * Solving complex puzzles
  * Finding hidden treasure caches (not just walking around)
  * Making exceptional choices with clear risk
- **NEVER** give items for: simply exploring, walking into rooms, basic movement, or routine choices
- 90% of choices should have itemsGained: [] (empty array)
- Walking into a room = NO ITEMS
- Looking around = NO ITEMS
- Moving forward = NO ITEMS

Output format:
{
  "consequenceText": "Brief narration of what happens. If triggersBattle=true, MUST mention the enemy name! Example: 'An Ice Elemental materializes before you!'",
  "hpChange": -10 to +20 (negative for damage, positive for healing, 0 for none),
  "mpChange": -5 to +10,
  "itemsGained": [] (ALMOST ALWAYS EMPTY - only for major discoveries),
  "triggersBattle": true/false,
  "progressRoom": true/false (whether to advance to next room - default to TRUE)
}

Example interpretations:
- "Charge ahead" → progressRoom=true, high damage, likely battle, NO ITEMS
- "Proceed cautiously" → progressRoom=true, small HP cost, explore forward, NO ITEMS
- "Search current area" → progressRoom=false, MAYBE small items if very lucky
- "Rest here" → progressRoom=false, restore HP/MP, NO ITEMS
- "Investigate and move on" → progressRoom=true, NO ITEMS unless finding secret treasure`,
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

    // Sanitize outcome to ensure all fields are proper types
    const sanitizedOutcome = {
      consequenceText: typeof outcome.consequenceText === 'string' 
        ? outcome.consequenceText 
        : (outcome.consequenceText?.message || "Something happens..."),
      hpChange: typeof outcome.hpChange === 'number' ? outcome.hpChange : 0,
      mpChange: typeof outcome.mpChange === 'number' ? outcome.mpChange : 0,
      itemsGained: Array.isArray(outcome.itemsGained) ? outcome.itemsGained : [],
      triggersBattle: outcome.triggersBattle === true,
      progressRoom: outcome.progressRoom === true,
    };

    console.log("Sanitized outcome:", sanitizedOutcome);
    console.log(`🔄 progressRoom=${sanitizedOutcome.progressRoom}, current_room=${battleState.current_room_index}, triggersBattle=${sanitizedOutcome.triggersBattle}`);

    // Apply HP/MP changes
    const newHp = Math.max(0, Math.min(
      partyStats.max_hp,
      partyStats.current_hp + sanitizedOutcome.hpChange
    ));
    const newMp = Math.max(0, Math.min(
      partyStats.max_mp,
      partyStats.current_mp + sanitizedOutcome.mpChange
    ));

    await supabaseClient
      .from("player_stats")
      .update({
        current_hp: newHp,
        current_mp: newMp,
      })
      .eq("user_id", battleState.user_id);

    // Add items if any
    if (sanitizedOutcome.itemsGained && sanitizedOutcome.itemsGained.length > 0) {
      for (const item of sanitizedOutcome.itemsGained) {
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

    // Update battle log with user_id and player name
    const battleLog = battleState.battle_log || [];
    
    // Sanitize existing battle log entries - ensure all messages are proper strings
    const cleanedBattleLog = battleLog.map((entry: any) => {
      // If entry is already clean with a string message, keep it
      if (entry && typeof entry === 'object' && typeof entry.message === 'string') {
        return entry;
      }
      
      // Extract message from various possible formats
      let extractedMessage = '';
      
      if (typeof entry === 'string') {
        extractedMessage = entry;
      } else if (entry && typeof entry === 'object') {
        if (typeof entry.message === 'string') {
          extractedMessage = entry.message;
        } else if (entry.message && typeof entry.message === 'object') {
          // Message is nested object, try to get the actual message
          extractedMessage = entry.message.message || entry.message.consequenceText || '';
        } else if (entry.consequenceText) {
          extractedMessage = entry.consequenceText;
        }
        
        // If we still don't have a message, try to reconstruct from character map
        if (!extractedMessage && entry.message && typeof entry.message === 'object') {
          // Check if it's a character-indexed object (0: 'a', 1: 'b', etc.)
          const keys = Object.keys(entry.message).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
          if (keys.length > 0) {
            extractedMessage = keys.map(k => entry.message[k]).join('');
          }
        }
      }
      
      return {
        user_id: entry?.user_id || null,
        message: extractedMessage || "An event occurred.",
        type: entry?.type
      };
    });
    
    cleanedBattleLog.push({ 
      user_id: user.id, 
      message: `${playerName} chose: ${choiceLabel}`,
      type: 'choice' 
    });
    
    // Format consequence text with items in brackets - ensure it's a string
    let consequenceWithItems = String(sanitizedOutcome.consequenceText || '');
    if (sanitizedOutcome.itemsGained && sanitizedOutcome.itemsGained.length > 0) {
      const itemsList = sanitizedOutcome.itemsGained.map((item: any) => `[${item.name}]`).join(', ');
      consequenceWithItems += ` You received: ${itemsList}!`;
    }
    
    // Ensure the message is a proper string before adding to log
    cleanedBattleLog.push({ 
      user_id: user.id, 
      message: consequenceWithItems
    });

    // Advance room if needed, but check bounds
    const dungeonData = battleState.dungeons.dungeon_json;
    const maxRoomIndex = dungeonData.rooms.length - 1;
    let newRoomIndex = battleState.current_room_index;
    
    if (sanitizedOutcome.progressRoom) {
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
      battle_log: cleanedBattleLog,
      current_room_index: newRoomIndex,
    };

    // For party battles, advance to next player's turn
    if (isPartyBattle && battleState.turn_order && Array.isArray(battleState.turn_order)) {
      const turnOrder = battleState.turn_order as string[];
      const currentIndex = turnOrder.indexOf(user.id);
      const nextIndex = (currentIndex + 1) % turnOrder.length;
      updateData.current_turn_user_id = turnOrder[nextIndex];
      console.log(`Story choice: Advancing turn from ${user.id} to ${turnOrder[nextIndex]}`);
    }

    // Clear story node if advancing to a new room (for multiplayer sync)
    if (sanitizedOutcome.progressRoom) {
      updateData.current_story_node = null;
      console.log("Clearing story node for new room");
    }

    // Set up enemy if battle is triggered
    if (sanitizedOutcome.triggersBattle) {
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

    // Single atomic update - use admin client for server battles to bypass RLS
    if (serverId) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      await supabaseAdmin
        .from("battle_states")
        .update(updateData)
        .eq("id", battleState.id);
      console.log("Updated battle state with admin client");
    } else {
      await supabaseClient
        .from("battle_states")
        .update(updateData)
        .eq("id", battleState.id);
    }

    return new Response(
      JSON.stringify({
        outcome: sanitizedOutcome,
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
