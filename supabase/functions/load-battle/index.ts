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

    console.log('=== LOAD BATTLE DEBUG ===');
    console.log('Loading battle for user:', user.id, 'dungeonId:', battleId);

    // Check if user is in a party for this dungeon
    const { data: partyMember } = await supabase
      .from('party_members')
      .select('party_id, parties!inner(dungeon_id)')
      .eq('user_id', user.id)
      .eq('parties.dungeon_id', battleId)
      .maybeSingle();

    const partyId = partyMember?.party_id || null;
    console.log('User party status:', { partyId, hasParty: !!partyId, partyMember });

    // Get battle state - filter by party if in party, otherwise by user
    let battleQuery = supabase
      .from('battle_states')
      .select('*, dungeons(*)')
      .eq('dungeon_id', battleId)
      .eq('is_active', true);

    if (partyId) {
      console.log('Querying for PARTY battle with party_id:', partyId);
      battleQuery = battleQuery.eq('party_id', partyId);
    } else {
      console.log('Querying for SOLO battle');
      battleQuery = battleQuery.eq('user_id', user.id).is('party_id', null);
    }

    const { data: battle, error: battleError } = await battleQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log('Battle query result:', { 
      found: !!battle, 
      battleId: battle?.id,
      battlePartyId: battle?.party_id,
      battleUserId: battle?.user_id,
      battleError 
    });

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

    // Validate dungeon data structure
    if (!battle.dungeons) {
      throw new Error('Dungeon data not found for battle');
    }
    
    const dungeonData = battle.dungeons.dungeon_json;
    if (!dungeonData || !dungeonData.rooms) {
      throw new Error('Invalid dungeon structure - missing rooms data');
    }
    
    // Cap room index to available rooms
    const maxRoomIndex = dungeonData.rooms.length - 1;
    const actualRoomIndex = Math.min(battle.current_room_index, maxRoomIndex);
    
    const currentRoom = dungeonData.rooms[actualRoomIndex];
    if (!currentRoom) {
      throw new Error(`Room ${actualRoomIndex} not found in dungeon with ${dungeonData.rooms.length} rooms`);
    }

    // Determine mode: check if enemy is defeated or if we're in story mode
    const enemyState = battle.current_enemy_state;
    // If enemy has no HP or is named "None"/"Unknown", force story mode
    const hasValidEnemy = enemyState.current_hp > 0 && enemyState.name !== "None" && enemyState.name !== "Unknown";
    const mode = hasValidEnemy ? (enemyState.mode || "battle") : "story";

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
      room_description: currentRoom.description || '',
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