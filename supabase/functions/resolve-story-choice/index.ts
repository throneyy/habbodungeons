import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Function to find matching sprite based on enemy name from database
async function findEnemySprite(enemyName: string, supabaseClient: any): Promise<string> {
  if (!enemyName) return "skeleton.png";
  
  const nameLower = enemyName.toLowerCase();
  
  // Try to fetch from database
  try {
    // Try exact match first
    const { data: exactMatch } = await supabaseClient
      .from("enemy_sprites")
      .select("sprite_filename")
      .ilike("enemy_name", nameLower)
      .maybeSingle();
    
    if (exactMatch) {
      console.log(`Found exact sprite match for "${enemyName}": ${exactMatch.sprite_filename}`);
      return exactMatch.sprite_filename;
    }
    
    // Try partial match
    const { data: allSprites } = await supabaseClient
      .from("enemy_sprites")
      .select("enemy_name, sprite_filename");
    
    if (allSprites) {
      for (const sprite of allSprites) {
        const spriteName = sprite.enemy_name.toLowerCase();
        if (nameLower.includes(spriteName) || spriteName.includes(nameLower)) {
          console.log(`Found partial sprite match for "${enemyName}": ${sprite.sprite_filename}`);
          return sprite.sprite_filename;
        }
      }
    }
  } catch (error) {
    console.error("Error fetching sprite from database:", error);
  }
  
  // Default fallback
  console.log(`No sprite found for "${enemyName}", using skeleton.png`);
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

    const { battleId, choiceId, choiceLabel, storyText, diceRoll, diceDC, skillType } = await req.json();

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

    // Calculate dice check result if applicable
    let diceCheckResult = null;
    if (diceRoll && diceDC) {
      const diceTotal = diceRoll.reduce((sum: number, die: number) => sum + die, 0);
      const success = diceTotal >= diceDC;
      const margin = diceTotal - diceDC;
      diceCheckResult = {
        success,
        total: diceTotal,
        dc: diceDC,
        margin,
        skillType: skillType || "check"
      };
      console.log("Dice check result:", diceCheckResult);
    }

    const aiPrompt = `Resolve: ${choiceLabel}
Dungeon: ${battleState.dungeons.name}
${diceCheckResult ? `\nDICE: ${diceCheckResult.total} vs DC ${diceCheckResult.dc} = ${diceCheckResult.success ? 'SUCCESS' : 'FAIL'} (${diceCheckResult.margin >= 0 ? '+' : ''}${diceCheckResult.margin})` : ''}${enemyContext}

Return JSON: {narrativeText: "what happens", hpChange: 0, mpChange: 0, shouldStartBattle: false, shouldAdvanceRoom: true, itemsGained: [], enemyModifier: null}
${diceCheckResult ? `\nSuccess = advantage. Failure = setback/combat.` : ''}`;

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
            role: "user",
            content: aiPrompt
          }
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
    // Support both old field names (narrativeText, shouldStartBattle) and new ones (consequenceText, triggersBattle)
    const sanitizedOutcome = {
      consequenceText: typeof outcome.consequenceText === 'string' 
        ? outcome.consequenceText 
        : typeof outcome.narrativeText === 'string'
        ? outcome.narrativeText
        : (outcome.consequenceText?.message || "Something happens..."),
      hpChange: typeof outcome.hpChange === 'number' ? outcome.hpChange : 0,
      mpChange: typeof outcome.mpChange === 'number' ? outcome.mpChange : 0,
      itemsGained: Array.isArray(outcome.itemsGained) ? outcome.itemsGained : [],
      triggersBattle: outcome.triggersBattle === true || outcome.shouldStartBattle === true,
      progressRoom: outcome.progressRoom === true || outcome.shouldAdvanceRoom === true,
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
        // Validate item has required properties
        if (!item || !item.name || typeof item.name !== 'string') {
          console.error('Invalid item in itemsGained:', item);
          continue; // Skip invalid items
        }
        
        const itemName = item.name.trim();
        const itemQuantity = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1;
        const itemType = typeof item.type === 'string' ? item.type : 'material';
        
        console.log(`📦 Adding item: ${itemName} x${itemQuantity} (${itemType})`);
        
        const { data: existingItem } = await supabaseClient
          .from("inventory")
          .select("*")
          .eq("user_id", battleState.user_id)
          .eq("item_name", itemName)
          .maybeSingle();

        if (existingItem) {
          await supabaseClient
            .from("inventory")
            .update({ quantity: existingItem.quantity + itemQuantity })
            .eq("id", existingItem.id);
        } else {
          await supabaseClient
            .from("inventory")
            .insert({
              user_id: battleState.user_id,
              item_name: itemName,
              quantity: itemQuantity,
              item_type: itemType,
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
    
    // Add dice roll result if applicable
    if (diceCheckResult && diceRoll) {
      const diceValues = diceRoll.join(',');
      const resultText = diceCheckResult.success ? 'SUCCEEDING' : 'FAILING';
      const resultMessage = `${playerName} attempted a dice check. They rolled ${diceValues} ${resultText} their attempted dice check (DC ${diceCheckResult.dc})`;
      
      cleanedBattleLog.push({
        user_id: user.id,
        message: resultMessage,
        type: diceCheckResult.success ? 'dice_success' : 'dice_failure'
      });
    }
    
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

    // Clear story node after any story choice so a fresh node is generated next time
    updateData.current_story_node = null;
    console.log("Clearing story node after story choice");

    // Set up enemy if battle is triggered
    if (sanitizedOutcome.triggersBattle) {
      // Battle the enemy from the current room (the one AI was told about)
      const battleRoom = dungeonData.rooms[newRoomIndex];
      
      if (battleRoom && battleRoom.enemy) {
        // Set up the enemy for battle from the CURRENT room
        const enemy = battleRoom.enemy;
        const enemySprite = enemy.sprite || await findEnemySprite(enemy.name, supabaseClient);
        
        updateData.current_enemy_state = {
          name: enemy.name,
          description: enemy.description,
          sprite: enemySprite,
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
          sprite: "ice-shade.png",
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
