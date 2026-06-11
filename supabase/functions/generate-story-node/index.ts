import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GENERATION_LOCK_TIMEOUT_MS = 45000;
const GENERATION_POLL_INTERVAL_MS = 1000;

const isGenerationMarker = (node: any) => node?.generating === true;

const isRealStoryNodeForRoom = (node: any, roomIndex: number) => {
  return !!node &&
    node.generating !== true &&
    typeof node.storyText === "string" &&
    node.storyText.trim().length > 0 &&
    Array.isArray(node.choices) &&
    node.choices.length > 0 &&
    (node.roomIndex === undefined || node.roomIndex === roomIndex);
};

const isStaleGenerationMarker = (node: any) => {
  const timestamp = typeof node?.timestamp === "number" ? node.timestamp : 0;
  return !timestamp || Date.now() - timestamp > GENERATION_LOCK_TIMEOUT_MS;
};

const getMarkerStoryText = (node: any) => {
  return typeof node?.storyText === "string" && node.storyText.trim().length > 0
    ? node.storyText.trim()
    : null;
};

const isInFlightGenerationMarker = (node: any) => {
  return isGenerationMarker(node) && node.status === "generating" && !isStaleGenerationMarker(node);
};

const normalizeChoices = (choices: any[]) => {
  const fallbackPrefix = crypto.randomUUID();

  return choices
    .filter((choice) => choice && typeof choice.label === "string" && choice.label.trim().length > 0)
    .slice(0, 4)
    .map((choice, index) => {
      const diceRequired = choice.diceRequired === true;
      return {
        id: typeof choice.id === "string" && choice.id.trim().length > 0
          ? choice.id.trim()
          : `${fallbackPrefix}-${index + 1}`,
        label: choice.label.trim().replace(/—/g, "--"),
        diceRequired,
        ...(diceRequired && typeof choice.diceDC === "number" ? { diceDC: choice.diceDC } : {}),
        ...(diceRequired && typeof choice.skillType === "string" ? { skillType: choice.skillType } : {}),
      };
    });
};

const waitForGeneratedStoryNode = async (client: any, battleStateId: string, roomIndex: number) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < GENERATION_LOCK_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, GENERATION_POLL_INTERVAL_MS));

    const { data: latestState, error } = await client
      .from("battle_states")
      .select("current_story_node,current_room_index")
      .eq("id", battleStateId)
      .maybeSingle();

    if (error || !latestState || latestState.current_room_index !== roomIndex) {
      return null;
    }

    if (isRealStoryNodeForRoom(latestState.current_story_node, roomIndex)) {
      return latestState.current_story_node;
    }

    if (latestState.current_story_node?.generating === true && isStaleGenerationMarker(latestState.current_story_node)) {
      return null;
    }
  }

  return null;
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

    const { battleId, lastChoice } = await req.json();
    const authHeader = req.headers.get("Authorization")!;
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Admin client bypasses RLS so we can see all server players' stats
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Rate limiting check for story generation (lightweight throttle).
    // Room transitions legitimately fire generate-story-node back-to-back, so
    // we use a short window and skip the throttle when the previous request
    // is still in-flight (handled by the claim logic below).
    const { data: rateLimit } = await supabaseClient
      .from('rate_limits')
      .select('*')
      .eq('user_id', user.id)
      .eq('action_type', 'story_generation')
      .maybeSingle();

    const now = Date.now();
    if (rateLimit) {
      const timeSince = now - new Date(rateLimit.last_action_at).getTime();
      if (timeSince < 1500) {
        console.log(`Rate limit hit (${timeSince}ms since last) - waiting briefly`);
        await new Promise((r) => setTimeout(r, 1500 - timeSince));
      }
    }

    // Update rate limit (upsert with explicit conflict target to avoid 409s)
    await supabaseClient
      .from('rate_limits')
      .upsert(
        {
          user_id: user.id,
          action_type: 'story_generation',
          last_action_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,action_type' }
      );

    // Validate battleId
    if (!battleId || battleId === "undefined" || battleId === "null" || typeof battleId !== 'string' || battleId.length === 0) {
      console.error("Invalid battleId received:", battleId);
      throw new Error(`Invalid battleId provided: ${battleId}`);
    }

    console.log("Generating story node for battleId:", battleId, "userId:", user.id);

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
    // Use admin client for server battles to ensure we can read/write
    let battleState = null;
    const clientToUse = serverId ? supabaseAdmin : supabaseClient;
    
    if (serverId) {
      console.log('Looking for server battle:', serverId);
      const { data, error } = await clientToUse
        .from("battle_states")
        .select("*, dungeons(*)")
        .eq("dungeon_id", battleId)
        .eq("server_id", serverId)
        .eq("is_active", true)
        .maybeSingle();
      
      if (error) {
        console.error("Battle state error:", error);
        throw error;
      }
      battleState = data;
    } else {
      console.log('Looking for solo battle');
      const { data, error } = await clientToUse
        .from("battle_states")
        .select("*, dungeons(*)")
        .eq("dungeon_id", battleId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error("Battle state error:", error);
        throw error;
      }
      battleState = data;
    }
    
    if (!battleState) {
      console.error("Battle state not found for dungeonId:", battleId);
      throw new Error(`Battle state not found. Please start the dungeon first.`);
    }

    console.log("Battle state loaded:", battleState.id, "Room:", battleState.current_room_index);

    // Check if there's already a story node for this room (prevent regeneration)
    // But make sure it's a real story node, not the temporary "generating" marker
    if (isRealStoryNodeForRoom(battleState.current_story_node, battleState.current_room_index)) {
      console.log("Returning existing story node for room", battleState.current_room_index);
      return new Response(JSON.stringify({ storyNode: battleState.current_story_node }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (battleState.current_story_node && battleState.current_story_node.generating !== true) {
      console.log("Clearing stale story node from a different room before generation");
      await supabaseAdmin
        .from("battle_states")
        .update({ current_story_node: null })
        .eq("id", battleState.id)
        .eq("current_room_index", battleState.current_room_index);
      battleState.current_story_node = null;
    }

    const dungeonJsonPreview = battleState.dungeons.dungeon_json as any;
    const currentRoomPreview = dungeonJsonPreview.rooms?.[battleState.current_room_index];
    const roomDescriptionPreview = currentRoomPreview?.description || "You enter a mysterious chamber.";
    const pendingMarkerForThisRoom = isGenerationMarker(battleState.current_story_node) &&
      battleState.current_story_node.roomIndex === battleState.current_room_index &&
      battleState.current_story_node.status === "pending";
    const markerStoryText = getMarkerStoryText(battleState.current_story_node);

    // RACE CONDITION PREVENTION: Set a temporary marker to claim this generation
    // Use admin client for atomic update to bypass RLS
    if (isInFlightGenerationMarker(battleState.current_story_node)) {
      console.log("Another request is already generating story, waiting for result...");
      const generatedStoryNode = await waitForGeneratedStoryNode(clientToUse, battleState.id, battleState.current_room_index);

      if (generatedStoryNode) {
        console.log("Returning story generated by concurrent request");
        return new Response(JSON.stringify({ storyNode: generatedStoryNode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error("Story is still generating. Please wait a moment and try again.");
    }

    if (isGenerationMarker(battleState.current_story_node) && !pendingMarkerForThisRoom && isStaleGenerationMarker(battleState.current_story_node)) {
      console.log("Clearing stale story generation marker");
      await supabaseAdmin
        .from("battle_states")
        .update({ current_story_node: null })
        .eq("id", battleState.id)
        .eq("current_room_index", battleState.current_room_index);
      battleState.current_story_node = null;
    }

    const tempMarker = {
      generating: true,
      status: "generating",
      roomIndex: battleState.current_room_index,
      timestamp: Date.now(),
      storyText: markerStoryText || roomDescriptionPreview,
    };
    let claimQuery = supabaseAdmin
      .from("battle_states")
      .update({ current_story_node: tempMarker })
      .eq("id", battleState.id)
      .eq("current_room_index", battleState.current_room_index);

    claimQuery = pendingMarkerForThisRoom
      ? claimQuery
        .eq("current_story_node->>status", "pending")
        .eq("current_story_node->>roomIndex", String(battleState.current_room_index))
      : claimQuery.is("current_story_node", null);

    const { data: updateCheck, error: claimError } = await claimQuery.select().maybeSingle();
    
    // If update failed or returned null, another request already claimed it
    if (claimError || !updateCheck) {
      console.log("Another request is already generating story, fetching result...");
      const generatedStoryNode = await waitForGeneratedStoryNode(clientToUse, battleState.id, battleState.current_room_index);

      if (generatedStoryNode) {
        console.log("Returning story generated by concurrent request");
        return new Response(JSON.stringify({ storyNode: generatedStoryNode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    
    console.log("This request will generate the story node");

    // Get party member stats - if server battle, get all members; otherwise just current user
    let partyStats = [];
    
    if (battleState.server_id) {
      // Get all server members' stats using admin client (bypass RLS)
      const { data: serverPlayers } = await supabaseClient
        .from('server_players')
        .select('user_id')
        .eq('server_id', battleState.server_id);
      
      if (serverPlayers && serverPlayers.length > 0) {
        const userIds = serverPlayers.map(p => p.user_id);
        const { data } = await supabaseAdmin
          .from("player_stats")
          .select("*")
          .in("user_id", userIds);
        partyStats = data || [];
      }
    } else {
      // Solo battle - just get current user's stats
      const { data } = await supabaseClient
        .from("player_stats")
        .select("*")
        .eq("user_id", user.id);
      partyStats = data || [];
    }

    const context = {
      dungeon: {
        name: battleState.dungeons.name,
        theme: battleState.dungeons.theme,
        difficulty: battleState.dungeons.difficulty,
      },
      roomIndex: battleState.current_room_index,
      party: partyStats,
      lastChoice: lastChoice || null,
      recentEvents: (battleState.battle_log || []).slice(-6), // Increased from 3 to 6 for better context
    };

    console.log("Generating story node with context:", context);

    // Get quest context from dungeon JSON
    const dungeonJson = battleState.dungeons.dungeon_json as any;
    const currentRoom = dungeonJson.rooms?.[context.roomIndex];
    const questObjective = dungeonJson.questObjective || "Complete the dungeon";
    const roomDescription = currentRoom?.description || "You enter a mysterious chamber.";
    const visibleStoryText = markerStoryText || roomDescription;

    // --- Persistent narrative memory (durable across rooms) ---
    // This is the fix for stories "losing context": instead of only the last few
    // log lines, we carry a rolling list of durable story beats + known characters.
    const storyMemory = (battleState.story_memory || {}) as any;
    const storyBeats: string[] = Array.isArray(storyMemory.beats) ? storyMemory.beats : [];
    const knownNpcs: Record<string, string> =
      storyMemory.npcs && typeof storyMemory.npcs === "object" ? storyMemory.npcs : {};
    const storySoFar = storyBeats.length
      ? storyBeats.map((b) => `- ${b}`).join("\n")
      : "(the adventure has just begun)";
    const knownCharacters = Object.keys(knownNpcs).length
      ? Object.entries(knownNpcs).map(([name, note]) => `- ${name}: ${note}`).join("\n")
      : "(none yet)";
    
    // Extract the most recent narrative description (not choices or dice rolls)
    const narrativeEvents = (battleState.battle_log || [])
      .filter((e: any) => e?.message && typeof e.message === 'string' && e.type !== 'choice' && e.type !== 'dice_success' && e.type !== 'dice_failure')
      .slice(-3);
    
    const lastConsequence = narrativeEvents.length > 0 
      ? narrativeEvents[narrativeEvents.length - 1].message 
      : null;

    const aiPrompt = `You are a JRPG dungeon master for "${battleState.dungeons.name}", running a ${battleState.dungeons.theme} themed dungeon. Stay true to THIS dungeon\u0027s name and theme -- do not rename it or import a different setting.

Party stats: ${JSON.stringify(partyStats)}
Dungeon: ${battleState.dungeons.name} (${battleState.dungeons.difficulty})
Theme: ${battleState.dungeons.theme}
Current room: ${context.roomIndex + 1}/${dungeonJson.rooms?.length || 10}
Room type: ${currentRoom.room_type}
Room description: ${roomDescription}
Visible story text already shown to the player: ${visibleStoryText}
${currentRoom.enemy ? `\n**CRITICAL ENEMY CONSTRAINT: This room contains the enemy "${currentRoom.enemy.name}": ${currentRoom.enemy.description}**\n\n⚠️ MANDATORY RULE FOR COMBAT CHOICES:\n- If you create ANY choice that involves fighting, attacking, or combat, the choice MUST say "Fight ${currentRoom.enemy.name}" or "Attack ${currentRoom.enemy.name}"\n- NEVER write "Fight Ice Shade" or any other enemy name unless that is the EXACT enemy in this room\n- If this room has "${currentRoom.enemy.name}", ALL combat choices must reference "${currentRoom.enemy.name}"\n- Example: "Fight ${currentRoom.enemy.name}!" or "Attack the ${currentRoom.enemy.name}!"\n- DO NOT invent different enemies. Use "${currentRoom.enemy.name}" or write non-combat choices.` : ''}
${lastChoice ? `\nLast player action: ${lastChoice}` : ''}

## STORY SO FAR (durable memory -- you MUST stay consistent with these facts):
${storySoFar}

## KNOWN CHARACTERS (reuse their names and relationships; never contradict them):
${knownCharacters}

## QUEST OBJECTIVE (weave toward this): ${questObjective}

## WHAT JUST HAPPENED (THIS IS THE IMMEDIATE PRESENT):
${lastConsequence ? `"${lastConsequence}"` : `"${roomDescription}"`}

## RECENT EVENTS LEADING TO THIS MOMENT:
${context.recentEvents.filter((e: any) => e?.message && typeof e.message === 'string').map((e: any, idx: number) => `${idx + 1}. ${e.message}`).join('\n')}

⚠️ CRITICAL TEXT FORMATTING:
- NEVER use em dashes (—). Use double hyphens (--) instead.
- Use only standard ASCII punctuation that renders correctly in pixel fonts.

⚠️ CRITICAL NARRATIVE CONTINUITY RULES:
1. Keep storyText EXACTLY equal to the visible story text already shown to the player.
2. Generate choices that match that visible text and the current room.
3. DO NOT replace the visible story with a new paragraph while choices are being prepared.
4. DO NOT reintroduce the scene or restate what already happened.
5. The player is ALREADY in the moment described in "WHAT JUST HAPPENED" - don't re-describe it, continue through choices only.

## CRITICAL DICE MECHANIC INSTRUCTIONS
**DICE CHECKS ARE REQUIRED FOR:**
1. ALL social interactions (talking, calling out, persuading, intimidating, deceiving, reasoning, negotiating)
2. ALL investigation/search actions (searching for clues, hidden mechanisms, weaknesses, patterns, examining for secrets)
3. ALL physical skill attempts (breaking through barriers, forcing doors, climbing, sneaking, acrobatics)
4. ALL magical manipulation attempts (dispelling barriers, disrupting magic, arcane analysis, ritual manipulation)
5. ALL knowledge checks (identifying creatures, recalling lore, understanding ancient texts)

**DICE CHECKS ARE NOT REQUIRED FOR:**
- Simple observations ("Look around casually", "Glance at the area")
- Direct combat initiation ("Attack immediately", "Draw weapon and strike")
- Safe movements ("Continue forward cautiously", "Retreat back")
- Obvious actions with no skill ("Pick up the key", "Open the unlocked door")

**IMPORTANT:** If an action involves "search", "examine", "investigate", "look for", "find", or "discover" something non-obvious, it REQUIRES a dice check!

- Dice checks use 5 six-sided dice (Habbo holodice): totals range from 5 (all 1s) to 30 (all 6s)
- Set appropriate DC (difficulty class) based on the challenge:
  * Easy checks: DC 10-14 (e.g., intimidate weak goblin, search for obvious clues, identify common creature)
  * Medium checks: DC 15-19 (e.g., persuade suspicious guard, find hidden mechanism, dispel minor magic)
  * Hard checks: DC 20-24 (e.g., deceive powerful enemy, discover well-hidden secret, analyze complex runes)
  * Very hard checks: DC 25-29 (e.g., reason with hostile boss, uncover master-crafted trap, master-level arcane work)
- Always provide 3-5 options including both dice-required and direct action choices

## DICE CHECK CHOICE FORMAT
For choices requiring dice:
{
  "id": "unique_id",
  "label": "Try to persuade the guard [Dice Check: DC 15]",
  "diceRequired": true,
  "diceDC": 15,
  "skillType": "persuasion"  // or "intimidation", "deception", "insight", "investigation", "perception", etc.
}

For regular choices (no dice):
{
  "id": "unique_id", 
  "label": "Attack immediately",
  "diceRequired": false
}

## MANDATORY DICE CHECK EXAMPLES - THESE MUST HAVE DICE:
❌ WRONG: "Search the perimeter for hidden doors" (diceRequired: false)
✅ CORRECT: "Carefully search the perimeter for hidden doors [Dice Check: DC 16]" (diceRequired: true, diceDC: 16, skillType: "investigation")

❌ WRONG: "Look for weaknesses in the barrier" (diceRequired: false)
✅ CORRECT: "Examine the barrier for structural weaknesses [Dice Check: DC 18]" (diceRequired: true, diceDC: 18, skillType: "perception")

❌ WRONG: "Call out to the mage" (diceRequired: false)
✅ CORRECT: "Call out to demand passage [Dice Check: DC 15]" (diceRequired: true, diceDC: 15, skillType: "persuasion")

❌ WRONG: "Try to break through the ice" (diceRequired: false)
✅ CORRECT: "Force your way through the magical barrier [Dice Check: DC 22]" (diceRequired: true, diceDC: 22, skillType: "strength")

If an action contains these words, it MUST have diceRequired: true:
- "search", "look for", "find", "discover", "investigate", "examine", "inspect", "scout"
- "persuade", "convince", "reason", "negotiate", "talk", "call out", "demand"
- "intimidate", "threaten", "force", "break", "smash", "destroy"
- "sneak", "hide", "steal", "pickpocket", "avoid detection"
- "dispel", "disrupt", "manipulate", "analyze", "decipher"

## Story Structure Rules
1. CRITICAL NARRATIVE FLOW (TOP PRIORITY): 
   - Your storyText continues IMMEDIATELY from the last event in "WHAT JUST HAPPENED"
   - DO NOT restate or reintroduce - the player is already IN that moment
   - First sentence should seamlessly continue the action/atmosphere
   - Example flow: "debris falls" → "Through the settling dust, a shape emerges..."
   - NOT: "As the debris settles..." (that restates the last event)

2. Create varied, unpredictable encounters:
   - Enemy encounters (~35%): May include dialogue options before combat
   - Environmental challenges (~20%): Puzzles, traps, hazards
   - NPCs/merchants (~15%): Allies, neutral parties, potential trades
   - Discoveries (~15%): Lore, clues, mysterious artifacts
   - Rest opportunities (~10%): Safe spots, camps, healing fountains
   - Quest progression (~5%): Events directly related to achieving the quest objective

3. When creating enemy encounters with dialogue:
   - Describe the enemy's appearance, demeanor, and initial reaction
   - Include at least one dialogue option with dice requirement
   - Example: "A frost goblin blocks your path, eyeing you suspiciously..."

4. Quest objective integration:
     * "Try to reason with it [Dice Check: DC 12]" (diceRequired: true, diceDC: 12)
     * "Intimidate it with your weapon [Dice Check: DC 14]" (diceRequired: true, diceDC: 14)
     * "Attack immediately" (diceRequired: false)

3. Narrative continuity:
   - Reference previous choices when appropriate
   - Throughout the dungeon, reference the quest objective (${questObjective})
   - In the final room, the objective should be achievable (find the artifact, rescue the captive, etc.)
   - Don't make every quest just "kill the boss" - the boss may guard the objective, but the objective itself is the goal
   - Build tension toward achieving the quest goal
   - Acknowledge party members in descriptions
   - Maintain consistent tone and theme

5. Item rewards (VERY RARE, ~5% of story choices):
   - Only award items for exceptional discoveries or major victories
   - Items MUST have valid format: { "name": "Iron Helmet", "quantity": 1, "type": "armor" }
   - Never reward items for simple choices or basic exploration
   - Typical rewards: story progression, XP, HP/MP restoration, information

6. Consequences matter:
   - Failed dice checks should have meaningful (but not game-ending) consequences
   - Successful checks provide advantages: avoid combat, gain allies, learn secrets
   - Some encounters should be unavoidable to maintain challenge

## Response Format
**CRITICAL: You MUST return ONLY a valid JSON object with this structure:**
- storyText: string (100-200 words describing what happens NEXT, continuing seamlessly from the last event)
- choices: array of 2-4 choice objects, each with id, label, diceRequired boolean, and if dice: diceDC number and skillType string
- itemsGained: array (usually empty)

IMPORTANT: Your storyText should continue the action/scene from "WHAT JUST HAPPENED" - don't restart or reintroduce the scene.

Example choice with dice: {"id": "choice1", "label": "Search for clues [Dice Check: DC 16]", "diceRequired": true, "diceDC": 16, "skillType": "investigation"}
Example choice without dice: {"id": "choice2", "label": "Attack immediately", "diceRequired": false}

DO NOT include any explanatory text before or after the JSON. RETURN ONLY THE JSON OBJECT.`;

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro", // Using more capable Gemini model for better narrative continuity
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
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log("AI response:", aiData);

    // Check for API errors in the response
    const choice = aiData.choices?.[0];
    if (choice?.error) {
      const errorMsg = choice.error.message || "Unknown AI API error";
      const errorCode = choice.error.code || 500;
      console.error("AI API returned error:", choice.error);
      throw new Error(`AI API error (${errorCode}): ${errorMsg}`);
    }

    let storyContent = choice?.message?.content || "";
    if (!storyContent || storyContent.trim().length === 0) {
      throw new Error("AI API returned empty content");
    }
    
    console.log("Raw AI content:", storyContent.substring(0, 200) + "...");
    
    // Remove markdown code fences and any explanatory text
    storyContent = storyContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    // Try to extract JSON if it's wrapped in text - use greedy match to get the full object
    const jsonMatch = storyContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      storyContent = jsonMatch[0];
    }

    // Clean up common JSON formatting issues
    storyContent = storyContent
      .replace(/,\s*\]/g, ']')  // Remove trailing commas before ]
      .replace(/,\s*\}/g, '}')  // Remove trailing commas before }
      .replace(/\n/g, ' ')       // Remove newlines that might break strings
      .replace(/\r/g, '')        // Remove carriage returns
      .replace(/—/g, '--')       // Replace em dashes with double hyphens (pixel font fix)
      .replace(/"(\w+)"\s+"([^"]*)"/g, '"$1": "$2"');  // Fix missing colons: "label" "text" -> "label": "text"

    let storyNode;
    let parseAttempts = 0;
    const maxAttempts = 3;

    while (parseAttempts < maxAttempts) {
      try {
        storyNode = JSON.parse(storyContent);
        break; // Success!
      } catch (parseError) {
        parseAttempts++;
        console.error(`Parse attempt ${parseAttempts} failed:`, parseError);
        
        if (parseAttempts === maxAttempts) {
          // Final attempt failed - log full content and throw
          console.error("Failed to parse AI response after all attempts. Content:", storyContent);
          const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
          throw new Error(`Invalid AI response format: ${errorMsg}`);
        }
        
        // Try progressively more aggressive cleaning
        if (parseAttempts === 1) {
          // Attempt 2: Fix missing colons more aggressively and escaped quotes
          storyContent = storyContent
            .replace(/"(\w+)"\s*"([^"]*)"/g, '"$1": "$2"')  // Fix missing colons
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'");
        } else if (parseAttempts === 2) {
          // Attempt 3: Extract just the outermost braces more carefully and fix colons again
          const firstBrace = storyContent.indexOf('{');
          const lastBrace = storyContent.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            storyContent = storyContent.substring(firstBrace, lastBrace + 1);
          }
          storyContent = storyContent.replace(/"(\w+)"\s*"([^"]*)"/g, '"$1": "$2"');
        }
      }
    }

    // Store story node in battle state to prevent regeneration
    // Use the same client that was used to fetch the battle state (admin for servers, regular for solo)
    storyNode = {
      ...storyNode,
      roomIndex: battleState.current_room_index,
      generatedAt: new Date().toISOString(),
    };

    let updateQuery = clientToUse
      .from("battle_states")
      .update({ current_story_node: storyNode })
      .eq("id", battleState.id)
      .eq("current_room_index", battleState.current_room_index);
    
    const { error: updateError } = await updateQuery;

    if (updateError) {
      console.error("Failed to update story node:", updateError);
      throw updateError;
    }


    return new Response(JSON.stringify({ storyNode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-story-node:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
