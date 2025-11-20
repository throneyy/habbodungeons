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
    const { dungeonId, serverName, maxPlayers = 6, difficulty = 'Normal', isSystemServer = false } = await req.json();

    // Use service role for system servers, otherwise require user authentication
    let supabaseClient;
    let userId;

    if (isSystemServer) {
      console.log("Creating system server:", serverName);
      supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      // Use a system user ID for system servers
      userId = '00000000-0000-0000-0000-000000000000';
    } else {
      const authHeader = req.headers.get('Authorization')!;
      supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      userId = user.id;
      console.log("Creating server for user:", userId, "dungeon:", dungeonId || "global pool");
    }

    // Only verify dungeon if dungeonId is provided
    if (dungeonId) {
      const { data: dungeon, error: dungeonError } = await supabaseClient
        .from('dungeons')
        .select('id')
        .eq('id', dungeonId)
        .maybeSingle();

      if (!dungeon) {
        throw new Error("Dungeon not found");
      }
    }

    // Only delete existing servers if this is not a system server
    if (!isSystemServer && dungeonId) {
      const { data: oldServers } = await supabaseClient
        .from('servers')
        .select('id')
        .eq('host_user_id', userId)
        .eq('dungeon_id', dungeonId);
      
      if (oldServers && oldServers.length > 0) {
        console.log("Deleting old servers for user:", userId);
        await supabaseClient
          .from('servers')
          .delete()
          .in('id', oldServers.map(s => s.id));
      }
    }

    // Create new server (dungeon_id can be null for global pool)
    const { data: server, error: serverError } = await supabaseClient
      .from('servers')
      .insert({
        host_user_id: userId,
        server_name: serverName,
        dungeon_id: dungeonId || null,
        max_players: maxPlayers,
        difficulty: difficulty,
        is_active: true,
      })
      .select()
      .single();

    // Handle duplicate key error gracefully for system servers
    if (serverError) {
      // If it's a duplicate key error (unique constraint violation) for system servers, fetch the existing server
      if (isSystemServer && serverError.code === '23505') {
        console.log(`Server ${serverName} already exists, fetching existing server`);
        const { data: existingServer, error: fetchError } = await supabaseClient
          .from('servers')
          .select()
          .eq('server_name', serverName)
          .eq('difficulty', difficulty)
          .is('dungeon_id', null)
          .eq('is_active', true)
          .single();

        if (fetchError) throw fetchError;
        
        console.log("Using existing server:", existingServer.id);
        return new Response(
          JSON.stringify({ 
            serverId: existingServer.id,
            serverName: existingServer.server_name
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw serverError;
    }

    // Only add host as player if this is not a system server
    if (!isSystemServer) {
      const { error: playerError } = await supabaseClient
        .from('server_players')
        .insert({
          server_id: server.id,
          user_id: userId,
        });

      if (playerError) throw playerError;
    }

    console.log("Server created successfully:", server.id);

    return new Response(
      JSON.stringify({ 
        serverId: server.id,
        serverName: server.server_name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating server:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});