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
    const { difficulty, theme, encounters } = await req.json();
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
            content: `You are a master JRPG quest designer for The Shattered Frostkeep universe in Habbo roleplay. Generate a ${difficulty} difficulty, ${theme} themed dungeon with ${encounters} encounters. Player level: ${stats?.level || 1}. 
            
CRITICAL REQUIREMENTS:
1. The first room MUST be story/exploration focused, NOT immediate combat. Players should encounter atmospheric descriptions, environmental storytelling, or narrative choices before fighting.

2. Generate an EPIC and IMMERSIVE quest name that hints at the adventure (e.g., "The Frozen Crown Heist", "Curse of the Wraithbound Blade", "Rescue from the Crystal Tomb").

3. Create a SPECIFIC and COMPELLING quest objective that tells players exactly what they must accomplish:
   - RESCUE missions: "Save the frost mage trapped in the ice prison before hypothermia claims them"
   - RETRIEVAL missions: "Recover the legendary Frostblade hidden in the vault beneath the frozen throne"
   - BOSS HUNT missions: "Slay the Ice Wraith that devours travelers in the glacial halls"
   - TREASURE missions: "Find and return the stolen Winter Gem from the frost dragon's hoard"
   - EXPLORATION missions: "Discover the source of the unnatural cold spreading through the keep"
   
4. Make the introText VIVID and ATMOSPHERIC - set the scene with sensory details about the ice, cold, danger, and what awaits.

5. Each room description should be IMMERSIVE with specific details about ice formations, frozen corpses, treasure glints, eerie sounds, and environmental hazards.

Output ONLY valid JSON (no markdown) with: 
- dungeonName (epic quest name)
- questObjective (specific compelling goal)
- introText (atmospheric hook with danger and promise)
- rooms array: [{roomIndex, description (vivid immersive scene), enemy: {name, description, hp, atk, def, spd}}]

Scale enemy stats based on difficulty (Hardcore = +50% HP, +25% damage) and player level. First room enemy can be null for story mode.`
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

    // Save dungeon
    const { data: dungeon, error } = await supabase
      .from('dungeons')
      .insert({
        owner_user_id: user.id,
        name: dungeonJson.dungeonName,
        theme,
        difficulty,
        dungeon_json: dungeonJson,
      })
      .select()
      .single();

    if (error) throw error;

    // Create initial battle state in story mode
    const firstRoom = dungeonJson.rooms[0];
    const firstEnemy = firstRoom.enemy;
    
    // Create placeholder enemy state for story mode if no enemy exists
    const enemyState = firstEnemy ? {
      ...firstEnemy,
      current_hp: firstEnemy.hp,
      max_hp: firstEnemy.hp,
      status_effects: [],
      mode: "story",
    } : {
      name: "Story Mode",
      description: "Exploring the dungeon",
      hp: 1,
      current_hp: 1,
      max_hp: 1,
      atk: 0,
      def: 0,
      spd: 0,
      status_effects: [],
      mode: "story",
    };

    await supabase.from('battle_states').insert({
      user_id: user.id,
      dungeon_id: dungeon.id,
      current_room_index: 0,
      current_enemy_state: enemyState,
      battle_log: [dungeonJson.introText, firstRoom.description],
    });

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