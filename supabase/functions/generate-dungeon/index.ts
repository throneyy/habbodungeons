import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dungeonName, difficulty, theme, encounters } = await req.json();
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
            content: `You are a JRPG dungeon generator for Habbo roleplay. Generate a ${difficulty} difficulty, ${theme} themed dungeon with ${encounters} encounters. Player level: ${stats?.level || 1}. Output JSON with: dungeonName, introText, rooms array with [{roomIndex, description, enemy: {name, description, hp, atk, def, spd}}]. Scale enemy stats based on difficulty and player level.`
          },
          {
            role: 'user',
            content: `Generate dungeon: ${dungeonName}`
          }
        ],
      }),
    });

    const aiData = await aiResponse.json();
    const dungeonJson = JSON.parse(aiData.choices[0].message.content);

    // Save dungeon
    const { data: dungeon, error } = await supabase
      .from('dungeons')
      .insert({
        owner_user_id: user.id,
        name: dungeonName,
        theme,
        difficulty,
        dungeon_json: dungeonJson,
      })
      .select()
      .single();

    if (error) throw error;

    // Create initial battle state
    const firstEnemy = dungeonJson.rooms[0].enemy;
    await supabase.from('battle_states').insert({
      user_id: user.id,
      dungeon_id: dungeon.id,
      current_room_index: 0,
      current_enemy_state: {
        ...firstEnemy,
        current_hp: firstEnemy.hp,
        max_hp: firstEnemy.hp,
        status_effects: [],
      },
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