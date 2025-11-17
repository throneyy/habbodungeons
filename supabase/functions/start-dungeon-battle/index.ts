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

    console.log('Starting battle for dungeon:', dungeonId, 'with difficulty:', difficulty);

    // Check if user is in a party for this dungeon
    const { data: partyMember } = await supabase
      .from('party_members')
      .select('party_id, parties!inner(dungeon_id, leader_id)')
      .eq('user_id', user.id)
      .eq('parties.dungeon_id', dungeonId)
      .maybeSingle();

    const partyId = partyMember?.party_id || null;
    const isLeader = (partyMember?.parties as any)?.leader_id === user.id;
    console.log('User party status:', { partyId, hasParty: !!partyId, isLeader });

    // If in a party but not the leader, reject the request
    if (partyId && !isLeader) {
      console.error('User is not party leader');
      throw new Error("Only the party leader can start the battle");
    }

    // Get dungeon data
    const { data: dungeon, error: dungeonError } = await supabase
      .from('dungeons')
      .select('*')
      .eq('id', dungeonId)
      .single();

    if (dungeonError) {
      console.error('Dungeon error:', dungeonError);
      throw dungeonError;
    }

    console.log('Dungeon loaded:', dungeon.id, dungeon.name);

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

    // Create initial enemy state - use placeholder if first room has no enemy
    const firstEnemy = modifiedRooms[0].enemy;
    const initialEnemyState = firstEnemy ? {
      ...firstEnemy,
      current_hp: firstEnemy.hp,
      max_hp: firstEnemy.hp,
      status_effects: [],
      mode: "story",
    } : {
      name: "Unknown",
      description: "Exploring the dungeon...",
      hp: 1,
      current_hp: 1,
      max_hp: 1,
      atk: 0,
      def: 0,
      spd: 0,
      status_effects: [],
      mode: "story",
    };

    console.log('Initial enemy state:', initialEnemyState);

    // Check if battle state exists (for party or solo)
    let existingBattleQuery = supabase
      .from('battle_states')
      .select('id')
      .eq('dungeon_id', dungeonId);
    
    // If in a party, check for party battle; otherwise check for solo battle
    if (partyId) {
      existingBattleQuery = existingBattleQuery.eq('party_id', partyId);
    } else {
      existingBattleQuery = existingBattleQuery.eq('user_id', user.id).is('party_id', null);
    }
    
    const { data: existingBattle, error: checkError } = await existingBattleQuery.maybeSingle();

    console.log('Existing battle check:', { existingBattle, checkError, partyId });

    if (existingBattle) {
      console.log('Updating existing battle state:', existingBattle.id);
      // Update existing battle state
      const { error: updateError } = await supabase
        .from('battle_states')
        .update({
          current_room_index: 0,
          current_enemy_state: initialEnemyState,
          battle_log: [dungeonJson.introText, modifiedRooms[0].description],
          is_active: true,
        })
        .eq('id', existingBattle.id);
      
      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }
    } else {
      console.log('Creating new battle state with partyId:', partyId);
      // Create new battle state
      const { error: insertError } = await supabase.from('battle_states').insert({
        user_id: user.id,
        dungeon_id: dungeonId,
        party_id: partyId,
        current_room_index: 0,
        current_enemy_state: initialEnemyState,
        battle_log: [dungeonJson.introText, modifiedRooms[0].description],
        is_active: true,
      });
      
      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }
    }

    // Store modified dungeon JSON with difficulty-adjusted stats
    const modifiedDungeonJson = { ...dungeonJson, rooms: modifiedRooms };
    const { error: updateDungeonError } = await supabase
      .from('dungeons')
      .update({ 
        dungeon_json: modifiedDungeonJson,
        difficulty: difficulty 
      })
      .eq('id', dungeonId);

    if (updateDungeonError) {
      console.error('Dungeon update error:', updateDungeonError);
      throw updateDungeonError;
    }

    console.log('Battle started successfully');

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
