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
      
      if (error) {
        console.error("Battle state error:", error);
        throw error;
      }
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

    // Check if there's already a story node for this room (for multiplayer sync)
    if (battleState.current_story_node && serverId) {
      console.log("Returning existing story node for room", battleState.current_room_index);
      return new Response(JSON.stringify({ storyNode: battleState.current_story_node }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
${lastChoice ? `Last choice: ${lastChoice}` : ''}

## CRITICAL DICE MECHANIC INSTRUCTIONS
When players encounter enemies, merchants, NPCs, or any situation requiring social skills (~30% of encounters):
- ALWAYS include dialogue/skill check options that require dice rolls (marked with "diceRequired": true)
- Dice checks use 5 six-sided dice (Habbo holodice): totals range from 5 (all 1s) to 30 (all 6s)
- Set appropriate DC (difficulty class) based on the challenge:
  * Easy checks: DC 10-14 (e.g., intimidate weak goblin)
  * Medium checks: DC 15-19 (e.g., persuade suspicious guard)
  * Hard checks: DC 20-24 (e.g., deceive powerful enemy)
  * Very hard checks: DC 25-29 (e.g., reason with hostile boss)
- Always provide 3-5 dialogue options: persuade, intimidate, deceive, bribe (if applicable), and attack

## DICE CHECK CHOICE FORMAT
For choices requiring dice:
{
  "id": "unique_id",
  "label": "Try to persuade the guard [Dice Check: DC 15]",
  "diceRequired": true,
  "diceDC": 15,
  "skillType": "persuasion"  // or "intimidation", "deception", "insight", etc.
}

For regular choices (no dice):
{
  "id": "unique_id", 
  "label": "Attack immediately",
  "diceRequired": false
}

## Story Structure Rules
1. Create varied, unpredictable encounters:
   - Enemy encounters (~40%): May include dialogue options before combat
   - Environmental challenges (~20%): Puzzles, traps, hazards
   - NPCs/merchants (~15%): Allies, neutral parties, potential trades
   - Discoveries (~15%): Lore, clues, mysterious artifacts
   - Rest opportunities (~10%): Safe spots, camps, healing fountains

2. When creating enemy encounters with dialogue:
   - Describe the enemy's appearance, demeanor, and initial reaction
   - Include at least one dialogue option with dice requirement
   - Example: "A frost goblin blocks your path, eyeing you suspiciously..."
     * "Try to reason with it [Dice Check: DC 12]" (diceRequired: true, diceDC: 12)
     * "Intimidate it with your weapon [Dice Check: DC 14]" (diceRequired: true, diceDC: 14)
     * "Attack immediately" (diceRequired: false)

3. Narrative continuity:
   - Reference previous choices when appropriate
   - Build tension toward the final boss
   - Acknowledge party members in descriptions
   - Maintain consistent tone and theme

4. Item rewards (VERY RARE, ~5% of story choices):
   - Only award items for exceptional discoveries or major victories
   - Items MUST have valid format: { "name": "Iron Helmet", "quantity": 1, "type": "armor" }
   - Never reward items for simple choices or basic exploration
   - Typical rewards: story progression, XP, HP/MP restoration, information

5. Consequences matter:
   - Failed dice checks should have meaningful (but not game-ending) consequences
   - Successful checks provide advantages: avoid combat, gain allies, learn secrets
   - Some encounters should be unavoidable to maintain challenge

## Response Format
Return ONLY a valid JSON object:
{
  "storyText": "Atmospheric description of current situation (100-200 words)",
  "choices": [
    {
      "id": "unique_id_1",
      "label": "Choice description [Dice Check: DC 15]",
      "diceRequired": true,
      "diceDC": 15,
      "skillType": "persuasion"
    },
    {
      "id": "unique_id_2", 
      "label": "Regular choice description",
      "diceRequired": false
    }
  ],
  "itemsGained": []  // Usually empty, only for exceptional discoveries
}

- Provide 2-4 meaningful choices
- Use vivid, concise descriptions (100-200 words)
- DO NOT include any emojis`;

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
    storyContent = storyContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const storyNode = JSON.parse(storyContent);

    // Store story node in battle state for multiplayer sync
    if (serverId) {
      const { error: updateError } = await supabaseClient
        .from("battle_states")
        .update({ current_story_node: storyNode })
        .eq("dungeon_id", battleId)
        .eq("server_id", serverId);

      if (updateError) {
        console.error("Failed to update story node:", updateError);
      }
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
