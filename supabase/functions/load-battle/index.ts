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

    // Get battle state (works for both solo and party battles)
    const { data: battle, error: battleError } = await supabase
      .from('battle_states')
      .select('*, dungeons(*)')
      .eq('dungeon_id', battleId)
      .eq('is_active', true)
      .or(`user_id.eq.${user.id},party_id.in.(select party_id from party_members where user_id = '${user.id}')`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log('Battle query result:', { battle, battleError, battleId, userId: user.id });

    if (!battle) {
      throw new Error(`Battle not found for dungeon ${battleId}. Make sure to select a difficulty first.`);
    }

    // Get player stats - if party battle, get all members; otherwise just current user
    let players = [];
    
    if (battle.party_id) {
      // Get all party members' stats
      const { data: partyMembers } = await supabase
        .from('party_members')
        .select('user_id')
        .eq('party_id', battle.party_id);
      
      const userIds = partyMembers?.map(m => m.user_id) || [];
      
      const { data: allStats } = await supabase
        .from('player_stats')
        .select('*')
        .in('user_id', userIds);
      
      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);
      
      players = (allStats || []).map(stats => {
        const profile = allProfiles?.find(p => p.id === stats.user_id);
        return {
          userId: stats.user_id,
          username: profile?.habbo_username || profile?.username || 'Unknown',
          level: stats.level,
          current_hp: stats.current_hp,
          max_hp: stats.max_hp,
          current_mp: stats.current_mp,
          max_mp: stats.max_mp,
          atk: stats.atk,
          def: stats.def,
          spd: stats.spd,
          status_effects: stats.status_effects || [],
          current_xp: stats.current_xp || 0,
          xp_to_next_level: stats.xp_to_next_level || 100,
        };
      });
    } else {
      // Solo battle - just get current user stats
      const { data: stats } = await supabase
        .from('player_stats')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      players = [{
        userId: user.id,
        username: profile?.habbo_username || profile?.username || 'You',
        level: stats.level,
        current_hp: stats.current_hp,
        max_hp: stats.max_hp,
        current_mp: stats.current_mp,
        max_mp: stats.max_mp,
        atk: stats.atk,
        def: stats.def,
        spd: stats.spd,
        status_effects: stats.status_effects || [],
        current_xp: stats.current_xp || 0,
        xp_to_next_level: stats.xp_to_next_level || 100,
      }];
    }

    const dungeonData = battle.dungeons.dungeon_json;
    const currentRoom = dungeonData.rooms[battle.current_room_index];

    // Determine mode: check if enemy is defeated or if we're in story mode
    const enemyState = battle.current_enemy_state;
    const mode = enemyState.mode || (enemyState.current_hp > 0 ? "battle" : "story");

    // Ensure battle_log is in the correct format
    let battleLog = battle.battle_log || [];
    // Convert old string format to new object format if needed
    if (battleLog.length > 0 && typeof battleLog[0] === 'string') {
      battleLog = battleLog.map((msg: any) => ({ user_id: user.id, message: msg }));
    }

    const battleData = {
      enemy: enemyState,
      players: players, // Array of all players (party or solo)
      player: players[0], // Keep for backwards compatibility
      room_description: currentRoom.description,
      battle_log: battleLog,
      mode: mode,
      isPartyBattle: !!battle.party_id,
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