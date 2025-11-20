import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

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

    // Admin client bypasses RLS so we can load all server players' stats
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    console.log('=== LOAD BATTLE DEBUG ===');
    console.log('Loading battle for user:', user.id, 'dungeonId:', battleId);

    // Check if user is in a server for this dungeon
    const { data: serverMember } = await supabase
      .from('server_players')
      .select('server_id, servers!inner(dungeon_id)')
      .eq('user_id', user.id)
      .eq('servers.dungeon_id', battleId)
      .maybeSingle();

    const serverId = serverMember?.server_id || null;
    console.log('User server status:', { serverId, hasServer: !!serverId, serverMember });

    // Get battle state - with smart server/solo handling
    let battle = null;
    
    if (serverId) {
      console.log('User is in server:', serverId, '- checking for battles');
      
      // First try to find a server battle
      const { data: serverBattle } = await supabase
        .from('battle_states')
        .select('*, dungeons(*)')
        .eq('dungeon_id', battleId)
        .eq('server_id', serverId)
        .eq('is_active', true)
        .maybeSingle();
      
      if (serverBattle) {
        console.log('Found existing server battle:', serverBattle.id);
        battle = serverBattle;
      } else {
        // Check if there's a solo battle we can convert to server
        const { data: soloBattle } = await supabase
          .from('battle_states')
          .select('*, dungeons(*)')
          .eq('dungeon_id', battleId)
          .eq('user_id', user.id)
          .is('server_id', null)
          .eq('is_active', true)
          .maybeSingle();
        
        if (soloBattle) {
          console.log('Converting solo battle to server battle:', soloBattle.id);
          // Update the battle to be a server battle
          await supabase
            .from('battle_states')
            .update({ server_id: serverId })
            .eq('id', soloBattle.id);
          
          battle = { ...soloBattle, server_id: serverId };
        }
      }
    } else {
      console.log('Solo player - looking for solo battle (no server_id)');
      
      // First, deactivate any orphaned server battles for this user/dungeon
      // (battles where user is no longer in the server)
      await supabase
        .from('battle_states')
        .update({ is_active: false })
        .eq('dungeon_id', battleId)
        .eq('user_id', user.id)
        .not('server_id', 'is', null)
        .eq('is_active', true);
      
      console.log('Deactivated orphaned server battles');
      
      // Solo player - get their solo battle only (exclude server battles)
      const { data: userBattle } = await supabase
        .from('battle_states')
        .select('*, dungeons(*)')
        .eq('dungeon_id', battleId)
        .eq('user_id', user.id)
        .is('server_id', null)
        .eq('is_active', true)
        .maybeSingle();
      
      battle = userBattle;
    }

    console.log('Battle query result:', { 
      found: !!battle, 
      battleId: battle?.id,
      battlePartyId: battle?.party_id,
      battleUserId: battle?.user_id
    });

    if (!battle) {
      throw new Error(`Battle not found for dungeon ${battleId}. Make sure to select a difficulty first.`);
    }

    // Get player stats - if server battle, get all members; otherwise just current user
    let players = [];
    
    if (battle.server_id) {
      // Get all server members' stats for this shared battle
      const { data: serverPlayers } = await supabase
        .from('server_players')
        .select('user_id')
        .eq('server_id', battle.server_id);
      
      const userIds = serverPlayers?.map(m => m.user_id) || [];
      
      const { data: allStats } = await supabaseAdmin
        .from('player_stats')
        .select('*')
        .in('user_id', userIds);
      
      const { data: allProfiles } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .in('id', userIds);
      
      players = (allStats || []).map(stats => {
        const profile = allProfiles?.find(p => p.id === stats.user_id);
        const habboData = profile?.habbo_profile_json;
        return {
          userId: stats.user_id,
          username: profile?.habbo_username || profile?.username || 'Unknown',
          figureString: habboData?.figureString || undefined,
          habboAvatar: habboData?.figureString 
            ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${habboData.figureString}&size=s&direction=2&head_direction=3`
            : null,
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

      // Initialize turn order based on speed (highest speed goes first)
      const turnOrder = players
        .sort((a, b) => b.spd - a.spd)
        .map(p => p.userId);
      
      // Set initial turn to the fastest player if not already set
      if (!battle.current_turn_user_id && turnOrder.length > 0) {
        await supabaseAdmin
          .from('battle_states')
          .update({
            current_turn_user_id: turnOrder[0],
            turn_order: turnOrder
          })
          .eq('id', battle.id);
        
        battle.current_turn_user_id = turnOrder[0];
        battle.turn_order = turnOrder;
      }
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
      
      const habboData = profile?.habbo_profile_json;
      players = [{
        userId: user.id,
        username: profile?.habbo_username || profile?.username || 'You',
        figureString: habboData?.figureString || undefined,
        habboAvatar: habboData?.figureString 
          ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${habboData.figureString}&size=s&direction=2&head_direction=3`
          : null,
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
      console.error('Dungeon missing for battle:', { battleId: battle.id, dungeonId: battle.dungeon_id, partyId: battle.party_id });
      
      // Clean up the invalid battle state
      await supabase
        .from('battle_states')
        .update({ is_active: false })
        .eq('id', battle.id);
      
      throw new Error('DUNGEON_DELETED:This dungeon no longer exists. The party leader may have deleted it.');
    }
    
    const dungeonData = battle.dungeons.dungeon_json;
    if (!dungeonData || !dungeonData.rooms) {
      throw new Error('Invalid dungeon structure - missing rooms data');
    }
    
    // Cap room index to available rooms and auto-correct if needed
    const maxRoomIndex = dungeonData.rooms.length - 1;
    const requestedRoomIndex = battle.current_room_index;
    const actualRoomIndex = Math.min(requestedRoomIndex, maxRoomIndex);
    
    console.log(`Room index check: requested=${requestedRoomIndex}, max=${maxRoomIndex}, actual=${actualRoomIndex}, total rooms=${dungeonData.rooms.length}`);
    
    // If room index was out of bounds, correct it in database
    if (requestedRoomIndex > maxRoomIndex) {
      console.log(`Correcting out-of-bounds room index from ${requestedRoomIndex} to ${actualRoomIndex}`);
      await supabase
        .from('battle_states')
        .update({ current_room_index: actualRoomIndex })
        .eq('id', battle.id);
    }
    
    const currentRoom = dungeonData.rooms[actualRoomIndex];
    if (!currentRoom) {
      throw new Error(`Room ${actualRoomIndex} not found in dungeon with ${dungeonData.rooms.length} rooms`);
    }

    // Determine mode: check if enemy is defeated or if we're in story mode
    const enemyState = battle.current_enemy_state;
    // If enemy has no HP or is named "None"/"Unknown", force story mode
    const hasValidEnemy = enemyState.current_hp > 0 && enemyState.name !== "None" && enemyState.name !== "Unknown";
    const mode = hasValidEnemy ? (enemyState.mode || "battle") : "story";

    // Derive a simple battle_status for UI synchronization
    // "battle" = active combat, "won" = last battle was just won (enemy HP <= 0),
    // "story" = non-combat story exploration
    const battleStatus = enemyState.current_hp <= 0 ? "won" : (mode === "story" ? "story" : "battle");

    // Ensure battle_log is in the correct format
    let battleLog = battle.battle_log || [];
    // Convert old string format to new object format if needed
    if (battleLog.length > 0 && typeof battleLog[0] === 'string') {
      battleLog = battleLog.map((msg: any) => ({ user_id: user.id, message: msg }));
    }

    // Find the current user's stats in the players array
    const currentPlayer = players.find(p => p.userId === user.id) || players[0];
    
    // If no player data available (empty server), throw error
    if (!currentPlayer) {
      throw new Error('No players found in this battle. The server may be empty or battle state is invalid.');
    }
    
    const battleData = {
      enemy: enemyState,
      players: players, // Array of all players (party or solo)
      player: currentPlayer, // Current user's stats
      dungeon_name: battle.dungeons.name,
      dungeon_theme: battle.dungeons.theme,
      dungeon_difficulty: battle.dungeons.difficulty,
      quest_objective: dungeonData.questObjective || null,
      intro_text: dungeonData.introText || null,
      room_description: currentRoom.description || '',
      room_type: currentRoom.roomType || 'story',
      treasure_description: currentRoom.treasureDescription || null,
      event_type: currentRoom.eventType || null,
      event_amount: currentRoom.eventAmount || null,
      event_description: currentRoom.eventDescription || null,
      battle_log: battleLog,
      mode: mode,
      battle_status: battleStatus,
      isPartyBattle: !!(battle.server_id || battle.party_id),
      currentTurnUserId: battle.current_turn_user_id,
      turnOrder: battle.turn_order || [],
      current_story_node: battle.current_story_node || null
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