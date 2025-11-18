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
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { dungeonId, serverName, maxPlayers = 6, difficulty = 'Normal', isSystemServer = false } = await req.json();

    console.log("Creating server for user:", user.id, "dungeon:", dungeonId || "global pool");

    // Only verify dungeon if dungeonId is provided
    if (dungeonId) {
      const { data: dungeon, error: dungeonError } = await supabase
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
      const { data: oldServers } = await supabase
        .from('servers')
        .select('id')
        .eq('host_user_id', user.id)
        .eq('dungeon_id', dungeonId);
      
      if (oldServers && oldServers.length > 0) {
        console.log("Deleting old servers for user:", user.id);
        await supabase
          .from('servers')
          .delete()
          .in('id', oldServers.map(s => s.id));
      }
    }

    // Create new server (dungeon_id can be null for global pool)
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .insert({
        host_user_id: user.id,
        server_name: serverName,
        dungeon_id: dungeonId || null,
        max_players: maxPlayers,
        difficulty: difficulty,
        is_active: true,
      })
      .select()
      .single();

    if (serverError) throw serverError;

    // Only add host as player if this is not a system server
    if (!isSystemServer) {
      const { error: playerError } = await supabase
        .from('server_players')
        .insert({
          server_id: server.id,
          user_id: user.id,
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