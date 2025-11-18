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

    const { serverId } = await req.json();

    console.log("User joining server:", user.id, "server:", serverId);

    // Get server info
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .select('*, server_players(count)')
      .eq('id', serverId)
      .eq('is_active', true)
      .single();

    if (serverError || !server) {
      throw new Error("Server not found");
    }

    // Check if server is full
    const playerCount = server.server_players[0]?.count || 0;
    if (playerCount >= server.max_players) {
      throw new Error("Server is full");
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from('server_players')
      .select('id')
      .eq('server_id', serverId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ message: "Already in this server" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Leave any other servers
    const { data: otherMemberships } = await supabase
      .from('server_players')
      .select('id')
      .eq('user_id', user.id);

    if (otherMemberships && otherMemberships.length > 0) {
      await supabase
        .from('server_players')
        .delete()
        .in('id', otherMemberships.map(m => m.id));
    }

    // Join server
    const { error: joinError } = await supabase
      .from('server_players')
      .insert({
        server_id: serverId,
        user_id: user.id,
      });

    if (joinError) throw joinError;

    console.log("User joined server successfully");

    return new Response(
      JSON.stringify({ message: "Joined server successfully" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error joining server:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});