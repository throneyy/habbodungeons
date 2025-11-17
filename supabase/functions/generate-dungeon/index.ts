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

Output ONLY valid JSON (no markdown formatting) with: dungeonName (unique quest name), questObjective (clear goal to complete), introText (engaging quest hook), rooms array with [{roomIndex, description (vivid and immersive), enemy: {name, description, hp, atk, def, spd}}]. 

Generate balanced base stats for enemies appropriate for player level ${stats?.level || 1}. These are BASE stats that will be modified by difficulty selection later.`
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
    const cleanedContent = extractJSON(rawContent);
    const dungeonJson = JSON.parse(cleanedContent);

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