import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

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

    // Rate limiting check for story generation
    const { data: rateLimit } = await supabaseClient
      .from('rate_limits')
      .select('*')
      .eq('user_id', user.id)
      .eq('action_type', 'story_generation')
      .maybeSingle();

    const now = Date.now();
    if (rateLimit) {
      const timeSince = now - new Date(rateLimit.last_action_at).getTime();
      if (timeSince < 1000) { // 1 second - prevents double-clicks but allows smooth gameplay
        throw new Error('Please wait a moment between story choices');
      }
    }

    // Update rate limit
    await supabaseClient.from('rate_limits').upsert({
      user_id: user.id,
      action_type: 'story_generation',
      last_action_at: new Date().toISOString(),
    });

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
    if (battleState.current_story_node) {
      console.log("Returning existing story node for room", battleState.current_room_index);
      return new Response(JSON.stringify({ storyNode: battleState.current_story_node }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RACE CONDITION PREVENTION: Set a temporary marker to claim this generation
    // Use admin client for atomic update to bypass RLS
    const tempMarker = { generating: true, timestamp: Date.now() };
    const { data: updateCheck, error: claimError } = await supabaseAdmin
      .from("battle_states")
      .update({ current_story_node: tempMarker })
      .eq("id", battleState.id)
      .is("current_story_node", null)
      .select()
      .maybeSingle();
    
    // If update failed or returned null, another request already claimed it
    if (claimError || !updateCheck) {
      console.log("Another request is already generating story, fetching result...");
      // Wait a bit and fetch the generated story
      await new Promise(resolve => setTimeout(resolve, 2000));
      const { data: refetchedState } = await clientToUse
        .from("battle_states")
        .select("current_story_node")
        .eq("id", battleState.id)
        .single();
      
      if (refetchedState?.current_story_node && refetchedState.current_story_node.generating !== true) {
        console.log("Returning story generated by concurrent request");
        return new Response(JSON.stringify({ storyNode: refetchedState.current_story_node }), {
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
      recentEvents: (battleState.battle_log || []).slice(-3),
    };

    console.log("Generating story node with context:", context);

    // Get quest context from dungeon JSON
    const dungeonJson = battleState.dungeons.dungeon_json as any;
    const currentRoom = dungeonJson.rooms?.[context.roomIndex];
    const questObjective = dungeonJson.questObjective || "Complete the dungeon";
    const roomDescription = currentRoom?.description || "You enter a mysterious chamber.";

    const aiPrompt = `You are a JRPG dungeon master for "The Shattered Frostkeep", creating exciting story encounters in a frozen dungeon.

Party stats: ${JSON.stringify(partyStats)}
Dungeon: ${battleState.dungeons.name} (${battleState.dungeons.difficulty})
Theme: ${battleState.dungeons.theme}
Current room: ${context.roomIndex + 1}/${dungeonJson.rooms?.length || 10}
Room type: ${currentRoom.room_type}
Room description: ${roomDescription}
${currentRoom.enemy ? `\n**CRITICAL: This room contains the enemy "${currentRoom.enemy.name}": ${currentRoom.enemy.description}**\nYou MUST incorporate this EXACT enemy into your story if creating an encounter that could lead to combat. Do NOT invent different enemies.` : ''}
${lastChoice ? `\nLast player action: ${lastChoice}` : ''}
${context.recentEvents && context.recentEvents.length > 0 ? `\n## RECENT NARRATIVE EVENTS (YOU MUST CONTINUE FROM HERE):
${context.recentEvents.filter((e: any) => e?.message && typeof e.message === 'string').map((e: any, idx: number) => `${idx + 1}. ${e.message}`).join('\n')}

⚠️ MANDATORY: Your storyText MUST pick up EXACTLY where the last event left off. If the last event describes "you're now in a darker section with knee-deep water", your story MUST begin in that SAME darker section with that SAME knee-deep water. DO NOT jump to a completely different location (like "a narrow ledge") unless the player explicitly chose to move there!` : ''}

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
1. CRITICAL NARRATIVE CONTINUITY: 
   - If lastChoice exists, you MUST begin your storyText by directly continuing from that action's consequence
   - Reference what the player just did and where they are NOW as a result
   - DO NOT describe a completely new location unless the last choice explicitly moved them
   - Build upon the previous scene rather than starting fresh
   - Example: If they just "pushed through waterlogged debris into a darker section", your story should start in that darker section, not a completely different ledge

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
- storyText: string (100-200 words describing what's happening NOW, directly building from the last action)
- choices: array of 2-4 choice objects, each with id, label, diceRequired boolean, and if dice: diceDC number and skillType string
- itemsGained: array (usually empty)

IMPORTANT: The storyText should feel like a continuation of the last event, not a new disconnected scene. Reference what just happened when appropriate.

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
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log("AI response:", aiData);

    let storyContent = aiData.choices[0]?.message?.content || "";
    
    // Remove markdown code fences and any explanatory text
    storyContent = storyContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    // Try to extract JSON if it's wrapped in text
    const jsonMatch = storyContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      storyContent = jsonMatch[0];
    }

    let storyNode;
    try {
      storyNode = JSON.parse(storyContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", storyContent);
      const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
      throw new Error(`Invalid AI response format: ${errorMsg}`);
    }

    // Store story node in battle state to prevent regeneration
    let updateQuery = supabaseClient
      .from("battle_states")
      .update({ current_story_node: storyNode })
      .eq("dungeon_id", battleId);
    
    if (serverId) {
      updateQuery = updateQuery.eq("server_id", serverId);
    } else {
      updateQuery = updateQuery.eq("user_id", user.id);
    }
    
    const { error: updateError } = await updateQuery;

    if (updateError) {
      console.error("Failed to update story node:", updateError);
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
