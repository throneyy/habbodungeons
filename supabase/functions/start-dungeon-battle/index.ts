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
    const { dungeonId, difficulty } = await req.json();
    const authHeader = req.headers.get('Authorization')!;
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Get dungeon data
    const { data: dungeon, error: dungeonError } = await supabase
      .from('dungeons')
      .select('*')
      .eq('id', dungeonId)
      .single();

    if (dungeonError) throw dungeonError;

    // Apply difficulty multiplier to enemy stats
    const difficultyMultiplier = difficulty === "Hardcore" ? 1.5 : 1.0;
    const dungeonJson = dungeon.dungeon_json;
    const modifiedRooms = dungeonJson.rooms.map((room: any) => {
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

    // Update dungeon difficulty
    await supabase
      .from('dungeons')
      .update({ difficulty })
      .eq('id', dungeonId);

    // Create or update battle state
    const firstEnemy = modifiedRooms[0].enemy;
    const initialEnemyState = firstEnemy ? {
      ...firstEnemy,
      current_hp: firstEnemy.hp,
      max_hp: firstEnemy.hp,
      status_effects: [],
      mode: "story",
    } : null;

    // Check if battle state exists
    const { data: existingBattle } = await supabase
      .from('battle_states')
      .select('id')
      .eq('user_id', user.id)
      .eq('dungeon_id', dungeonId)
      .single();

    if (existingBattle) {
      // Update existing battle state
      await supabase
        .from('battle_states')
        .update({
          current_room_index: 0,
          current_enemy_state: initialEnemyState,
          battle_log: [dungeonJson.introText, modifiedRooms[0].description],
          is_active: true,
        })
        .eq('id', existingBattle.id);
    } else {
      // Create new battle state
      await supabase.from('battle_states').insert({
        user_id: user.id,
        dungeon_id: dungeonId,
        current_room_index: 0,
        current_enemy_state: initialEnemyState,
        battle_log: [dungeonJson.introText, modifiedRooms[0].description],
      });
    }

    // Store modified dungeon JSON temporarily in battle state for this session
    const modifiedDungeonJson = { ...dungeonJson, rooms: modifiedRooms };
    await supabase
      .from('dungeons')
      .update({ dungeon_json: modifiedDungeonJson })
      .eq('id', dungeonId);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error starting battle:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
