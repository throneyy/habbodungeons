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
    const { battleId } = await req.json();
    const authHeader = req.headers.get('Authorization')!;
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Get battle state
    const { data: battle } = await supabase
      .from('battle_states')
      .select('*, dungeons(*)')
      .eq('dungeon_id', battleId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!battle) throw new Error("Battle not found");

    // Get player stats
    const { data: stats } = await supabase
      .from('player_stats')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const dungeonData = battle.dungeons.dungeon_json;
    const currentRoom = dungeonData.rooms[battle.current_room_index];

    // Determine mode: check if enemy is defeated or if we're in story mode
    const enemyState = battle.current_enemy_state;
    const mode = enemyState.mode || (enemyState.current_hp > 0 ? "battle" : "story");

    const battleData = {
      enemy: enemyState,
      player: {
        level: stats.level,
        current_hp: stats.current_hp,
        max_hp: stats.max_hp,
        current_mp: stats.current_mp,
        max_mp: stats.max_mp,
        atk: stats.atk,
        def: stats.def,
        spd: stats.spd,
        status_effects: stats.status_effects || [],
      },
      room_description: currentRoom.description,
      battle_log: battle.battle_log || [],
      mode: mode,
    };

    return new Response(
      JSON.stringify({ battleData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error loading battle:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});