import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enemy sprite mapping based on name patterns
const ENEMY_SPRITE_MAP: Record<string, string> = {
  "skeleton": "skeleton.png",
  "ice tiger": "ice-tiger.gif",
  "tiger": "ice-tiger.gif",
  "ice elemental": "ice-elemental.png",
  "elemental": "ice-elemental.png",
  "ice guardian": "ice-guardian.png",
  "guardian": "ice-guardian.png",
  "frost wolf": "frost-wolf.png",
  "wolf": "frost-wolf.png",
  "glacial imp": "glacial-imp.png",
  "imp": "glacial-imp.png",
  "frozen goblin": "frozen-goblin.png",
  "goblin": "frozen-goblin.png",
  "frost mutant": "frost-mutant.png",
  "mutant": "frost-mutant.png",
  "frost wraith": "frost-wraith.png",
  "wraith": "frost-wraith.png",
  "frost undead": "frost-undead.gif",
  "undead": "frost-undead.gif",
  "frostbite spider": "frostbite-spider.webp",
  "spider": "frostbite-spider.webp",
  "ghoul": "frost-undead.gif",
  "ancient": "skeleton.png",
  "warrior": "skeleton.png",
  "fire drake": "fire-drake.png",
  "drake": "fire-drake.png",
  "dragon": "fire-drake.png",
  "rat": "giant-rat.png",
  "giant rat": "giant-rat.png",
  "rat swarm": "giant-rat.png",
};

// Function to find matching sprite based on enemy name
function findEnemySprite(enemyName: string): string {
  if (!enemyName) return "skeleton.png";
  
  const nameLower = enemyName.toLowerCase();
  
  // Try exact match first
  if (ENEMY_SPRITE_MAP[nameLower]) {
    return ENEMY_SPRITE_MAP[nameLower];
  }
  
  // Try partial matches
  for (const [key, sprite] of Object.entries(ENEMY_SPRITE_MAP)) {
    if (nameLower.includes(key) || key.includes(nameLower)) {
      return sprite;
    }
  }
  
  // Default fallback
  return "skeleton.png";
}

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

    // Admin client bypasses RLS for shared battle state writes
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    console.log('Starting battle for dungeon:', dungeonId, 'with difficulty:', difficulty);

    // Check if user is in a server for this dungeon
    const { data: serverMemberships } = await supabase
      .from('server_players')
      .select('server_id, servers!inner(host_user_id, dungeon_id)')
      .eq('user_id', user.id)
      .eq('servers.dungeon_id', dungeonId)
      .eq('servers.is_active', true);

    console.log('User server memberships:', serverMemberships);

    let serverId = null;
    let isHost = false;

    if (serverMemberships && serverMemberships.length > 0) {
      const membership = serverMemberships[0];
      serverId = membership.server_id;
      const serverData: any = membership.servers;
      isHost = (Array.isArray(serverData) ? serverData[0]?.host_user_id : serverData?.host_user_id) === user.id;
    }

    console.log('User server status:', { serverId, hasServer: !!serverId, isHost });

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

    // Apply difficulty multiplier to enemy stats AND add sprite mapping
    const difficultyMultiplier = difficulty === "Hardcore" ? 1.5 : 1.0;
    const dungeonJson = dungeon.dungeon_json;
    const modifiedRooms = dungeonJson.rooms.map((room: any) => {
      if (room.enemy) {
        const sprite = findEnemySprite(room.enemy.name);
        return {
          ...room,
          enemy: {
            ...room.enemy,
            sprite: sprite,
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
      sprite: firstEnemy.sprite || findEnemySprite(firstEnemy.name),
      current_hp: firstEnemy.hp,
      max_hp: firstEnemy.hp,
      status_effects: [],
      mode: "story",
    } : {
      name: "Unknown",
      description: "Exploring the dungeon...",
      sprite: "skeleton.png",
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

    // Check if battle state exists (for server or solo)
    let existingBattleQuery = supabaseAdmin
      .from('battle_states')
      .select('id')
      .eq('dungeon_id', dungeonId);
    
    // If in a server, check for server battle; otherwise check for solo battle
    if (serverId) {
      existingBattleQuery = existingBattleQuery.eq('server_id', serverId);
    } else {
      existingBattleQuery = existingBattleQuery.eq('user_id', user.id).is('server_id', null);
    }
    
    const { data: existingBattle, error: checkError } = await existingBattleQuery.maybeSingle();

    console.log('Existing battle check:', { existingBattle, checkError, serverId });

    if (existingBattle) {
      console.log('Updating existing battle state:', existingBattle.id);
      // Update existing battle state
      const { error: updateError } = await supabaseAdmin
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
      console.log('Creating new battle state with serverId:', serverId);
      // Create new battle state
      const { error: insertError } = await supabaseAdmin.from('battle_states').insert({
        user_id: user.id,
        dungeon_id: dungeonId,
        server_id: serverId,
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
    const { error: updateDungeonError } = await supabaseAdmin
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

    // Server battles use ONE shared battle state that all players reference
    console.log('Server battle created - all players will share the same battle state');

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
