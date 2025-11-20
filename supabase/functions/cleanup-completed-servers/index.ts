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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log("🧹 Starting comprehensive server cleanup...");

    // Step 1: Get all active servers
    const { data: allServers } = await supabaseAdmin
      .from('servers')
      .select(`
        id,
        server_name,
        difficulty,
        dungeon_id,
        created_at,
        host_user_id,
        server_players(count)
      `)
      .eq('is_active', true);

    if (!allServers) {
      return new Response(
        JSON.stringify({ message: "No servers found" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let deletedCount = 0;
    let resetCount = 0;
    const systemUserId = '00000000-0000-0000-0000-000000000000';

    // Step 2: Delete old user-created servers (non-system servers)
    const userServers = allServers.filter(s => s.host_user_id !== systemUserId);
    if (userServers.length > 0) {
      console.log(`🗑️ Deleting ${userServers.length} old user-created servers`);
      const { error: deleteUserError } = await supabaseAdmin
        .from('servers')
        .delete()
        .in('id', userServers.map(s => s.id));
      
      if (!deleteUserError) {
        deletedCount += userServers.length;
      }
    }

    // Step 3: Group system servers by name
    const systemServers = allServers.filter(s => s.host_user_id === systemUserId);
    const serverGroups = new Map<string, typeof systemServers>();
    
    for (const server of systemServers) {
      const existing = serverGroups.get(server.server_name) || [];
      existing.push(server);
      serverGroups.set(server.server_name, existing);
    }

    // Step 4: For each server name, keep only the oldest one and delete duplicates
    // BUT: Only delete duplicates that have no players
    for (const [serverName, servers] of serverGroups.entries()) {
      if (servers.length > 1) {
        // Sort by created_at to find oldest
        servers.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const keepServer = servers[0];
        const duplicates = servers.slice(1);
        
        // Only delete duplicates that have no players
        const emptyDuplicates = duplicates.filter(s => {
          const playerCount = s.server_players[0]?.count || 0;
          return playerCount === 0;
        });
        
        if (emptyDuplicates.length > 0) {
          console.log(`🔄 Found ${emptyDuplicates.length} empty duplicate(s) of "${serverName}", keeping oldest`);
          
          const { error: deleteDupError } = await supabaseAdmin
            .from('servers')
            .delete()
            .in('id', emptyDuplicates.map(s => s.id));
          
          if (!deleteDupError) {
            deletedCount += emptyDuplicates.length;
          }
        }
        
        // Log if there are duplicates with players (don't delete them)
        const populatedDuplicates = duplicates.filter(s => {
          const playerCount = s.server_players[0]?.count || 0;
          return playerCount > 0;
        });
        
        if (populatedDuplicates.length > 0) {
          console.log(`⚠️ Keeping ${populatedDuplicates.length} duplicate(s) of "${serverName}" with active players`);
        }
      }
    }

    // Step 5: Reset servers that have completed dungeons (no players, no active battle)
    const { data: serversWithDungeons } = await supabaseAdmin
      .from('servers')
      .select(`
        id,
        dungeon_id,
        server_name,
        server_players(count)
      `)
      .eq('host_user_id', systemUserId)
      .eq('is_active', true)
      .not('dungeon_id', 'is', null);

    for (const server of serversWithDungeons || []) {
      const playerCount = server.server_players[0]?.count || 0;
      
      if (playerCount > 0) continue;

      // Check for active battle
      const { data: activeBattle } = await supabaseAdmin
        .from('battle_states')
        .select('id')
        .eq('dungeon_id', server.dungeon_id)
        .eq('server_id', server.id)
        .eq('is_active', true)
        .maybeSingle();

      if (!activeBattle) {
        const { error: resetError } = await supabaseAdmin
          .from('servers')
          .update({ dungeon_id: null })
          .eq('id', server.id);

        if (!resetError) {
          console.log(`♻️ Reset server: ${server.server_name}`);
          resetCount++;
        }
      }
    }

    console.log(`✅ Cleanup complete: ${deletedCount} deleted, ${resetCount} reset`);

    return new Response(
      JSON.stringify({ 
        message: `Cleanup complete: ${deletedCount} deleted, ${resetCount} reset`,
        deleted: deletedCount,
        reset: resetCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error cleaning servers:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
