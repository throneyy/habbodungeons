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
            role: "system",
            content: `You are the dungeon master for The Shattered Frostkeep. Keep scenes grounded and tense. Short, sharp descriptions.

CRITICAL: Return ONLY valid JSON. No markdown, no text outside the JSON object.

Required format:
{
  "storyText": "2-4 sentences. What's happening right now. Keep it direct.",
  "choices": [
    {"id": "choice_1", "label": "What they can do (5-8 words)"},
    {"id": "choice_2", "label": "Another option (5-8 words)"},
    {"id": "choice_3", "label": "Third option (5-8 words)"},
    {"id": "choice_4", "label": "Optional fourth (5-8 words)"}
  ]
}

Story rules:
- Use the room description as your foundation
- Keep the quest objective in mind
- 40-70 words max for storyText
- Mix tactical and risky choices
- Some choices lead to combat, some to discoveries
- Make choices feel impactful, not flavor text`,
          },
          {
            role: "user",
            content: `Quest: ${questObjective}
Dungeon: ${context.dungeon.name}
Difficulty: ${context.dungeon.difficulty}
Room ${context.roomIndex + 1}: ${roomDescription}

Party status: ${context.party?.[0]?.current_hp || 100}/${context.party?.[0]?.max_hp || 100} HP
Last action: ${context.lastChoice || "Just arrived"}
Recent: ${context.recentEvents.slice(-2).join("; ") || "Adventure begins"}

Create a scene for this room. Base it on the room description. Keep the quest in mind. Return ONLY the JSON.`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log("AI response:", aiData);

    const content = aiData.choices[0].message.content;
    
    // Try to parse JSON, handling various formats
    let storyNode;
    try {
      // First, try direct parsing
      storyNode = JSON.parse(content);
    } catch (e1) {
      try {
        // Remove markdown code blocks if present
        const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
        storyNode = JSON.parse(cleanContent);
      } catch (e2) {
        try {
          // Try to extract JSON object from text
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            storyNode = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("No JSON found in response");
          }
        } catch (e3) {
          console.error("Failed to parse AI response after all attempts:", content);
          // Return a fallback generic story node instead of failing
          const dungeon = battleState.dungeons;
          storyNode = {
            storyText: `You find yourself in ${dungeon.name}. The atmosphere is thick with mystery and danger. Ancient passages stretch out before you, each promising adventure and peril in equal measure.`,
            choices: [
              { id: "explore_ahead", label: "Venture deeper into the dungeon" },
              { id: "search_area", label: "Search the immediate area" },
              { id: "rest_here", label: "Take a moment to rest" },
              { id: "be_cautious", label: "Proceed with extreme caution" }
            ]
          };
          console.log("Using fallback story node due to AI parsing failure");
        }
      }
    }

    // Validate structure
    if (!storyNode.storyText || !Array.isArray(storyNode.choices)) {
      throw new Error("Invalid story node structure");
    }

    // Store the story node in battle_states for multiplayer sync
    if (serverId) {
      // Only write the first story node for this room, then always read back
      const { error: updateError } = await supabaseAdmin
        .from("battle_states")
        .update({ current_story_node: storyNode })
        .eq("id", battleState.id)
        .is("current_story_node", null);

      if (updateError) {
        console.error("Failed to store story node:", updateError);
      } else {
        console.log("Stored story node for multiplayer sync");
      }

      // Always load the canonical story node to avoid race conditions
      const { data: refreshedBattle, error: refreshError } = await supabaseAdmin
        .from("battle_states")
        .select("current_story_node")
        .eq("id", battleState.id)
        .maybeSingle();

      if (!refreshError && refreshedBattle?.current_story_node) {
        storyNode = refreshedBattle.current_story_node;
      }
    }

    return new Response(JSON.stringify({ storyNode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
