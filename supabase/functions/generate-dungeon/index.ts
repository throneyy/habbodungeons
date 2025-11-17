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
            content: `You are a JRPG dungeon generator for The Shattered Frostkeep universe in Habbo roleplay. Generate a ${theme} themed dungeon with ${encounters} encounters. Player level: ${stats?.level || 1}. 
            
CRITICAL: The first room MUST be story/exploration focused, NOT immediate combat. Players should encounter choices, exploration, or story elements before fighting.

Generate a UNIQUE and compelling quest name that drives the story forward. The quest name should be epic and specific (e.g., "The Frozen Crown Heist", "Curse of the Ice Wraith", "Rescue in the Glacial Depths").

Generate a clear QUEST OBJECTIVE that tells players exactly what they need to do. Examples: "Rescue the trapped merchant from the ice prison", "Retrieve the legendary Frostblade from the vault", "Defeat the Ice Wraith that haunts the frozen halls", "Find and return the stolen Winter Gem".

Output ONLY valid JSON (no markdown formatting) with: dungeonName (unique quest name), questObjective (clear goal to complete), introText (engaging quest hook), rooms array with [{roomIndex, description (vivid and immersive), enemy: {name, description, hp, atk, def, spd}}]. 

IMPORTANT: The quest story, name, and objective should be the SAME regardless of difficulty. Enemy base stats should be balanced for player level ${stats?.level || 1}. The difficulty level (${difficulty}) will be applied as a multiplier AFTER generation.`
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

    // Apply difficulty multiplier to enemy stats
    const difficultyMultiplier = difficulty === "Hardcore" ? 1.5 : 1.0;
    dungeonJson.rooms = dungeonJson.rooms.map((room: any) => {
      if (room.enemy) {
        return {
          ...room,
          enemy: {
            ...room.enemy,
            hp: Math.floor(room.enemy.hp * difficultyMultiplier),
            atk: Math.floor(room.enemy.atk * difficultyMultiplier),
            def: Math.floor(room.enemy.def * difficultyMultiplier),
          }
        };
      }
      return room;
    });

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
    const firstEnemy = dungeonJson.rooms[0].enemy;
    const initialEnemyState = firstEnemy ? {
      ...firstEnemy,
      current_hp: firstEnemy.hp,
      max_hp: firstEnemy.hp,
      status_effects: [],
      mode: "story",
    } : null;

    await supabase.from('battle_states').insert({
      user_id: user.id,
      dungeon_id: dungeon.id,
      current_room_index: 0,
      current_enemy_state: initialEnemyState,
      battle_log: [dungeonJson.introText, dungeonJson.rooms[0].description],
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