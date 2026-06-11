import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const isRealStoryNodeForRoom = (node: any, roomIndex: number) => {
  return !!node &&
    node.generating !== true &&
    typeof node.storyText === "string" &&
    node.storyText.trim().length > 0 &&
    Array.isArray(node.choices) &&
    (node.roomIndex === undefined || node.roomIndex === roomIndex);
};

const jsonResponse = (body: any, status = 200) => new Response(
  JSON.stringify(body),
  { headers: { ...corsHeaders, "Content-Type": "application/json" }, status },
);

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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
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

    const currentStoryNode = battleState.current_story_node as any;
    if (!isRealStoryNodeForRoom(currentStoryNode, battleState.current_room_index)) {
      return jsonResponse({ error: "Story choices are still being prepared. Please wait a moment." }, 409);
    }

    const serverChoice = currentStoryNode.choices.find((choice: any) => choice?.id === choiceId);
    if (!serverChoice) {
      return jsonResponse({ error: "That choice is no longer available. Please use the current story choices." }, 409);
    }

    if (storyText && storyText !== currentStoryNode.storyText) {
      return jsonResponse({ error: "Story has changed. Please use the current story choices." }, 409);
    }

    const canonicalChoiceLabel = typeof serverChoice.label === "string" ? serverChoice.label : choiceLabel;
    const canonicalDiceDC = typeof serverChoice.diceDC === "number" ? serverChoice.diceDC : diceDC;
    const canonicalSkillType = typeof serverChoice.skillType === "string" ? serverChoice.skillType : skillType;
    const canonicalDiceRequired = serverChoice.diceRequired === true;

    if (canonicalDiceRequired && (!Array.isArray(diceRoll) || typeof canonicalDiceDC !== "number")) {
      return jsonResponse({ error: "This choice requires a dice roll before it can be resolved." }, 400);
    }

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

    console.log("Resolving choice:", canonicalChoiceLabel);

    // Get the current room's enemy info for context
    const dungeon = battleState.dungeons.dungeon_json as any;
    const currentRoomIndex = battleState.current_room_index;
    
    let enemyContext = "";
    // If we're in story mode, the current room is what we're exploring
    const currentRoom = dungeon.rooms[currentRoomIndex];
    if (currentRoom && currentRoom.enemy) {
      enemyContext = `\n\n🔥 CRITICAL: This room HAS an enemy configured: "${currentRoom.enemy.name}" (${currentRoom.enemy.description}). If triggersBattle=true, you MUST write: "the ${currentRoom.enemy.name}" or "a ${currentRoom.enemy.name}" or "${currentRoom.enemy.name}" in your consequenceText. DO NOT write vague phrases - USE THE EXACT ENEMY NAME!`;
    } else {
      enemyContext = `\n\n🚫 CRITICAL: This room has NO enemy configured. You MUST NOT mention enemies, monsters, or creatures in your narrative. DO NOT set shouldStartBattle=true. This is a story/exploration room only. Focus on atmosphere, discovery, puzzles, or environmental challenges instead.`;
    }

    // Calculate dice check result if applicable
    let diceCheckResult = null;
    if (diceRoll && canonicalDiceDC) {
      const diceTotal = diceRoll.reduce((sum: number, die: number) => sum + die, 0);
      const success = diceTotal >= canonicalDiceDC;
      const margin = diceTotal - canonicalDiceDC;
      diceCheckResult = {
        success,
        total: diceTotal,
        dc: canonicalDiceDC,
        margin,
        skillType: canonicalSkillType || "check"
      };
      console.log("Dice check result:", diceCheckResult);
    }

    // --- Persistent narrative memory (so consequences stay consistent with the arc) ---
    // Previously this function got NO story history, so consequences could contradict
    // what had already happened. Now it sees the durable beats, known characters, and
    // the recent log.
    const storyMemory = (battleState.story_memory || {}) as any;
    const storyBeats: string[] = Array.isArray(storyMemory.beats) ? storyMemory.beats : [];
    const knownNpcs: Record<string, string> =
      storyMemory.npcs && typeof storyMemory.npcs === "object" ? storyMemory.npcs : {};
    const recentLog: string[] = (battleState.battle_log || [])
      .filter((e: any) => e?.message && typeof e.message === "string")
      .slice(-6)
      .map((e: any) => e.message);
    const storySoFar = storyBeats.length ? storyBeats.map((b) => `- ${b}`).join("\n") : "(beginning of the adventure)";
    const knownCharacters = Object.keys(knownNpcs).length
      ? Object.entries(knownNpcs).map(([name, note]) => `${name} (${note})`).join("; ")
      : "none yet";

    const aiPrompt = `You are resolving a player's story choice in a dungeon crawler game.

PLAYER CHOICE: "${canonicalChoiceLabel}"
DUNGEON: ${battleState.dungeons.name} (${battleState.dungeons.theme} theme)
CURRENT ROOM: ${currentRoom?.description || 'Unknown'}

STORY SO FAR (stay consistent with these durable facts):
${storySoFar}
KNOWN CHARACTERS: ${knownCharacters}
RECENT EVENTS:
${recentLog.length ? recentLog.map((m) => `- ${m}`).join("\n") : "(none)"}
${diceCheckResult ? `
DICE CHECK RESULT: ${diceCheckResult.total} vs DC ${diceCheckResult.dc} = ${diceCheckResult.success ? 'SUCCESS' : 'FAILURE'}
Margin: ${diceCheckResult.margin >= 0 ? '+' : ''}${diceCheckResult.margin}
Skill Type: ${diceCheckResult.skillType}
` : ''}${enemyContext}

CRITICAL RULES:
${diceCheckResult && !diceCheckResult.success ? `
❌ DICE CHECK FAILED - You MUST follow these rules:
1. NO treasure or items can be gained from a failed check (itemsGained MUST be empty [])
2. A failed check leads to negative consequences: combat, trap damage, setback, etc.
3. shouldAdvanceRoom MUST be false (player doesn't progress)
4. Describe the failure and its consequences in narrativeText
` : diceCheckResult && diceCheckResult.success ? `
✅ DICE CHECK PASSED - You MAY give rewards:
1. Player can find treasure/items if it makes sense (itemsGained can have items)
2. Success may allow bypassing combat or advancing (shouldAdvanceRoom can be true)
3. Describe the success and benefits in narrativeText
` : `
📖 NO DICE CHECK - Free choice:
1. Only give items/treasure if the choice explicitly involves finding/looting
2. shouldAdvanceRoom determines if player moves to next room
3. Describe what happens based on the player's choice
`}

Return ONLY valid JSON (no markdown):
{
  "narrativeText": "describe what happens in 2-3 sentences",
  "hpChange": 0,
  "mpChange": 0,
  "shouldStartBattle": false,
  "shouldAdvanceRoom": true,
  "itemsGained": [],
  "enemyModifier": null,
  "memoryNote": "one short DURABLE fact worth remembering for later rooms (an NPC met, a promise made, a secret learned, a path opened). Empty string if nothing lasting happened.",
  "npcs": []
}
For "npcs", include any named character involved, as objects: { "name": "Captain Rhea", "note": "wary guard who let the party pass" }. Omit or use [] if none.`;

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
    const triggersBattle = outcome.triggersBattle === true || outcome.shouldStartBattle === true;
    let progressRoom = outcome.progressRoom === true || outcome.shouldAdvanceRoom === true;

    // If a battle is triggered, keep the player in the current room so
    // the story text, room description and enemy all stay in sync.
    // This prevents situations where the narrative describes one room
    // but combat starts in the next room.
    if (triggersBattle && progressRoom) {
      progressRoom = false;
    }

    let sanitizedOutcome = {
      consequenceText: typeof outcome.consequenceText === 'string' 
        ? outcome.consequenceText 
        : typeof outcome.narrativeText === 'string'
        ? outcome.narrativeText
        : (outcome.consequenceText?.message || "Something happens..."),
      hpChange: typeof outcome.hpChange === 'number' ? outcome.hpChange : 0,
      mpChange: typeof outcome.mpChange === 'number' ? outcome.mpChange : 0,
      itemsGained: Array.isArray(outcome.itemsGained) ? outcome.itemsGained : [],
      triggersBattle,
      progressRoom,
    };

    // --- Update persistent narrative memory (bounded so context never overflows) ---
    const newBeats = [...storyBeats];
    if (typeof outcome.memoryNote === "string" && outcome.memoryNote.trim()) {
      newBeats.push(outcome.memoryNote.trim());
    }
    const updatedNpcs: Record<string, string> = { ...knownNpcs };
    if (Array.isArray(outcome.npcs)) {
      for (const npc of outcome.npcs) {
        if (npc && typeof npc.name === "string" && npc.name.trim()) {
          const key = npc.name.trim();
          updatedNpcs[key] = typeof npc.note === "string" && npc.note.trim()
            ? npc.note.trim()
            : (updatedNpcs[key] || "");
        }
      }
    }
    const updatedStoryMemory = {
      ...storyMemory,
      beats: newBeats.slice(-14),
      npcs: updatedNpcs,
      questObjective: (battleState.dungeons.dungeon_json as any)?.questObjective || storyMemory.questObjective || null,
    };

    // If a battle is requested, check if current room has an enemy
    // If there's an enemy in the room, always trigger the battle even if AI mentioned wrong enemy name
    // This ensures boss rooms and battle rooms actually trigger combat
    if (sanitizedOutcome.triggersBattle && (!currentRoom || !currentRoom.enemy)) {
      console.log("Story choice requested a battle, but current room has no enemy. Keeping this as a story event only.");
      sanitizedOutcome.triggersBattle = false;
    } else if (sanitizedOutcome.triggersBattle && currentRoom && currentRoom.enemy) {
      console.log(`Battle triggered! Room has enemy: ${currentRoom.enemy.name}`);
      // Ensure we're battling the actual room enemy, not what the AI might have mentioned
    } else if (!sanitizedOutcome.triggersBattle && currentRoom && currentRoom.enemy && canonicalChoiceLabel && 
               (canonicalChoiceLabel.toLowerCase().includes('attack') || 
                canonicalChoiceLabel.toLowerCase().includes('fight') ||
                canonicalChoiceLabel.toLowerCase().includes('strike') ||
                canonicalChoiceLabel.toLowerCase().includes('combat'))) {
      // If user chose to attack but AI didn't trigger battle, force it if room has enemy
      console.log(`Forcing battle because user chose combat action and room has enemy: ${currentRoom.enemy.name}`);
      sanitizedOutcome.triggersBattle = true;
      sanitizedOutcome.progressRoom = false; // Stay in current room for battle
    } else if (!sanitizedOutcome.triggersBattle && currentRoom && currentRoom.enemy && sanitizedOutcome.consequenceText) {
      // Check if the AI narrative describes combat starting even if it didn't flag it
      const combatPhrases = [
        'descend upon', 'attack', 'charge', 'lunge', 'strike', 'assault',
        'ambush', 'swarm', 'rush at', 'pounce', 'leap at', 'burst open',
        'emerge and attack', 'turn hostile', 'aggressive', 'confront you'
      ];
      const textLower = sanitizedOutcome.consequenceText.toLowerCase();
      const hasCombatNarrative = combatPhrases.some(phrase => textLower.includes(phrase));
      
      if (hasCombatNarrative) {
        console.log(`Forcing battle because AI narrative describes combat and room has enemy: ${currentRoom.enemy.name}`);
        sanitizedOutcome.triggersBattle = true;
        sanitizedOutcome.progressRoom = false; // Stay in current room for battle
      }
    }

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

    // Calculate XP gains (classic JRPG style)
    let xpGained = 0;
    let xpMessages: string[] = [];
    let leveledUp = false;
    let newLevel = partyStats.level;
    
    // Award XP for successful dice checks
    if (diceCheckResult) {
      const checkSuccess = diceCheckResult.success;
      if (checkSuccess) {
        // XP based on DC difficulty (5-20 XP)
        const checkXP = Math.floor(canonicalDiceDC / 2) + 5;
        xpGained += checkXP;
        xpMessages.push(`+${checkXP} XP for passing the check!`);
      }
    }
    
    // Award XP for room completion/progression
    if (sanitizedOutcome.progressRoom) {
      const roomXP = 15 + Math.floor(Math.random() * 10); // 15-25 XP
      xpGained += roomXP;
      xpMessages.push(`+${roomXP} XP for exploring!`);
    }

    // Check for level up if XP was gained
    if (xpGained > 0) {
      let currentXP = partyStats.current_xp + xpGained;
      let currentLevel = partyStats.level;
      let xpToNext = partyStats.xp_to_next_level;

      if (currentXP >= xpToNext) {
        leveledUp = true;
        newLevel = currentLevel + 1;
        const remainingXp = currentXP - xpToNext;
        const newXpNeeded = Math.floor(Math.pow(newLevel, 3) * 10);
        
        // Stat increases on level up
        const hpIncrease = Math.floor(8 + (newLevel * 0.5));
        const mpIncrease = Math.floor(4 + (newLevel * 0.3));
        const atkIncrease = Math.floor(1 + (newLevel % 3 === 0 ? 1 : 0));
        const defIncrease = Math.floor(1 + (newLevel % 3 === 0 ? 1 : 0));
        const spdIncrease = Math.floor(1 + (newLevel % 4 === 0 ? 1 : 0));
        
        await supabaseClient
          .from("player_stats")
          .update({
            level: newLevel,
            current_xp: remainingXp,
            xp_to_next_level: newXpNeeded,
            max_hp: partyStats.max_hp + hpIncrease,
            current_hp: partyStats.max_hp + hpIncrease, // Full heal
            max_mp: partyStats.max_mp + mpIncrease,
            current_mp: partyStats.max_mp + mpIncrease, // Full restore
            atk: partyStats.atk + atkIncrease,
            def: partyStats.def + defIncrease,
            spd: partyStats.spd + spdIncrease,
          })
          .eq("user_id", battleState.user_id);
        
        xpMessages.push(`Level up! Now level ${newLevel}`);
      } else {
        // Just update XP without level up
        await supabaseClient
          .from("player_stats")
          .update({
            current_xp: currentXP,
          })
          .eq("user_id", battleState.user_id);
      }
    }

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
      message: `${playerName} chose: ${canonicalChoiceLabel}`,
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
      // Filter out invalid items before adding to message (same validation as inventory)
      const validItems = sanitizedOutcome.itemsGained.filter((item: any) => 
        item && item.name && typeof item.name === 'string' && item.name.trim() !== ''
      );
      
      if (validItems.length > 0) {
        const itemsList = validItems.map((item: any) => `[${item.name}]`).join(', ');
        consequenceWithItems += ` You received: ${itemsList}!`;
      }
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
      
      // Don't auto-complete dungeon just for reaching last room
      // Dungeon completion is handled when the final boss is defeated in resolve-turn
      
      // If advancing to a treasure room, add it to the battle log
      const newRoom = dungeonData.rooms[newRoomIndex];
      if (newRoom?.roomType === 'treasure') {
        cleanedBattleLog.push({
          user_id: user.id,
          message: newRoom.treasureDescription || 'A frost-covered chest sits in the corner, its contents unknown...'
        });
      }
    }

    // Prepare update object
    const updateData: any = {
      battle_log: cleanedBattleLog,
      current_room_index: newRoomIndex,
      story_memory: updatedStoryMemory,
    };

    // For party battles, advance to next player's turn
    if (isPartyBattle && battleState.turn_order && Array.isArray(battleState.turn_order)) {
      const turnOrder = battleState.turn_order as string[];
      const currentIndex = turnOrder.indexOf(user.id);
      const nextIndex = (currentIndex + 1) % turnOrder.length;
      updateData.current_turn_user_id = turnOrder[nextIndex];
      console.log(`Story choice: Advancing turn from ${user.id} to ${turnOrder[nextIndex]}`);
    }

    // Set story node to generating marker to prevent race conditions
    // The actual story will be generated when the battle page loads
    updateData.current_story_node = { generating: true, timestamp: Date.now() };
    console.log("Set story node to generating marker after story choice");

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
          name: "Lurking Foe",
          description: "A hidden creature emerges from the shadows!",
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
        xpGained,
        xpMessages,
        leveledUp,
        newLevel,
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
