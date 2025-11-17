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

    const { battleId, lastChoice } = await req.json();
    const authHeader = req.headers.get("Authorization")!;
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Validate battleId
    if (!battleId || battleId === "undefined" || battleId === "null" || typeof battleId !== 'string' || battleId.length === 0) {
      console.error("Invalid battleId received:", battleId);
      throw new Error(`Invalid battleId provided: ${battleId}`);
    }

    console.log("Generating story node for battleId:", battleId, "userId:", user.id);

    // Get battle state by dungeon_id
    const { data: battleState, error: battleError } = await supabaseClient
      .from("battle_states")
      .select("*, dungeons(*)")
      .eq("dungeon_id", battleId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (battleError) {
      console.error("Battle state error:", battleError);
      throw battleError;
    }
    
    if (!battleState) {
      console.error("Battle state not found for dungeonId:", battleId);
      throw new Error(`Battle state not found. Please start the dungeon first.`);
    }

    console.log("Battle state loaded:", battleState.id, "Room:", battleState.current_room_index);

    // Get party member stats
    const { data: partyStats } = await supabaseClient
      .from("player_stats")
      .select("*")
      .eq("user_id", battleState.user_id);

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
            content: `You are a dungeon master for The Shattered Frostkeep, a dark ice dungeon in a Habbo-themed JRPG world. Generate immersive narrative scenes with multiple choice options.

CRITICAL RULES:
- Stay in character as a dungeon master narrating events
- Keep tone atmospheric and mysterious, fitting the ice dungeon theme
- Choices should be varied: some risky, some safe, some lead to battles
- Each choice should feel meaningful and consequential
- Never break character or mention you are AI
- Output ONLY valid JSON, no markdown, no explanations

Output format:
{
  "storyText": "A short, evocative paragraph (2-4 sentences) describing the current scene. Use vivid sensory details about the ice, cold, and mysterious atmosphere.",
  "choices": [
    {"id": "choice_1", "label": "First action option"},
    {"id": "choice_2", "label": "Second action option"},
    {"id": "choice_3", "label": "Third action option"},
    {"id": "choice_4", "label": "Fourth action option (optional)"}
  ]
}

Guidelines:
- storyText should be 40-80 words
- Provide 3-4 choices
- Choices should be concise (5-10 words each)
- Mix safe/dangerous options
- Some choices hint at combat ("confront", "attack")
- Some choices hint at exploration ("investigate", "search")
- Some choices hint at rest/healing ("rest", "tend wounds")`,
          },
          {
            role: "user",
            content: `Generate the next story node for:
Dungeon: ${context.dungeon.name} (${context.dungeon.theme}, ${context.dungeon.difficulty})
Room Index: ${context.roomIndex}
Party HP Average: ${context.party?.[0]?.current_hp || 100}/${context.party?.[0]?.max_hp || 100}
Last choice: ${context.lastChoice || "None - this is the start"}
Recent events: ${context.recentEvents.join("; ") || "The adventure begins"}

Generate an atmospheric scene and 3-4 meaningful choices.`,
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
    console.log("AI response:", aiData);

    const content = aiData.choices[0].message.content;
    
    // Try to parse JSON, handling markdown code blocks
    let storyNode;
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
      storyNode = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Invalid AI response format");
    }

    // Validate structure
    if (!storyNode.storyText || !Array.isArray(storyNode.choices)) {
      throw new Error("Invalid story node structure");
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
