import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to strip markdown code blocks from JSON
function extractJSON(text: string): string {
  // Remove markdown code blocks if present
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  return text.trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { theme, encounters } = await req.json();
    const authHeader = req.headers.get('Authorization')!;
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Get player stats
    const { data: stats } = await supabase
      .from('player_stats')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Call AI to generate dungeon
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a JRPG dungeon generator for The Shattered Frostkeep universe in Habbo roleplay. Generate a ${theme} themed dungeon with ${encounters} encounters. Player level: ${stats?.level || 1}. 
            
CRITICAL: The first room MUST be story/exploration focused, NOT immediate combat. Players should encounter choices, exploration, or story elements before fighting.

Generate a UNIQUE and compelling quest name that drives the story forward. The quest name should be epic and specific (e.g., "The Frozen Crown Heist", "Curse of the Ice Wraith", "Rescue in the Glacial Depths").

Generate a clear QUEST OBJECTIVE that tells players exactly what they need to do. Examples: "Rescue the trapped merchant from the ice prison", "Retrieve the legendary Frostblade from the vault", "Defeat the Ice Wraith that haunts the frozen halls", "Find and return the stolen Winter Gem".

IMPORTANT JSON RULES:
- Output ONLY valid JSON (no markdown, no code blocks, no extra text)
- Keep all text descriptions concise (under 80 words each)
- Replace any line breaks in descriptions with spaces
- Use simple, straightforward text without special formatting

Required format:
{
  "dungeonName": "quest name here",
  "questObjective": "clear objective here",
  "introText": "brief hook text",
  "rooms": [
    {
      "roomIndex": 0,
      "description": "room description",
      "enemy": {
        "name": "enemy name",
        "description": "brief description",
        "hp": 50,
        "atk": 12,
        "def": 8,
        "spd": 10
      }
    }
  ]
}

Generate balanced base stats for enemies appropriate for player level ${stats?.level || 1}.`
          },
          {
            role: 'user',
            content: `Generate a unique quest for The Shattered Frostkeep`
          }
        ],
      }),
    });

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices[0].message.content;
    console.log("Raw AI response (first 200 chars):", rawContent.substring(0, 200));
    console.log("Raw AI response (last 200 chars):", rawContent.substring(Math.max(0, rawContent.length - 200)));
    
    const cleanedContent = extractJSON(rawContent);
    console.log("Extracted JSON length:", cleanedContent.length);
    
    let dungeonJson;
    try {
      dungeonJson = JSON.parse(cleanedContent);
    } catch (parseError: any) {
      console.error("JSON parse error:", parseError.message);
      console.error("Content around error position:", cleanedContent.substring(Math.max(0, parseError.position - 100), parseError.position + 100));
      throw new Error(`Failed to parse AI response: ${parseError.message}`);
    }

    // Save dungeon with base stats (no difficulty applied yet)
    const { data: dungeon, error } = await supabase
      .from('dungeons')
      .insert({
        owner_user_id: user.id,
        name: dungeonJson.dungeonName,
        theme,
        difficulty: 'Normal', // Default, will be applied when starting
        dungeon_json: dungeonJson,
      })
      .select()
      .single();

    if (error) throw error;

    // Don't create battle state yet - wait for difficulty selection
    return new Response(
      JSON.stringify({ dungeonId: dungeon.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating dungeon:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});