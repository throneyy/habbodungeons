import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

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

    console.log("Checking for servers to clean up...");

    // Find servers that have dungeons but no active battles and no players
    const { data: serversToClean } = await supabaseAdmin
      .from('servers')
      .select(`
        id,
        dungeon_id,
        server_players(count)
      `)
      .not('dungeon_id', 'is', null);

    if (!serversToClean) {
      return new Response(
        JSON.stringify({ message: "No servers found" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let cleanedCount = 0;

    for (const server of serversToClean) {
      const playerCount = server.server_players[0]?.count || 0;
      
      // Skip if server has players
      if (playerCount > 0) {
        continue;
      }

      // Check if there's an active battle for this dungeon
      const { data: activeBattle } = await supabaseAdmin
        .from('battle_states')
        .select('id')
        .eq('dungeon_id', server.dungeon_id)
        .eq('server_id', server.id)
        .eq('is_active', true)
        .maybeSingle();

      // If no active battle and no players, reset the server
      if (!activeBattle) {
        const { error: updateError } = await supabaseAdmin
          .from('servers')
          .update({ dungeon_id: null })
          .eq('id', server.id);

        if (!updateError) {
          console.log(`✅ Cleaned server ${server.id}`);
          cleanedCount++;
        }
      }
    }

    console.log(`🧹 Cleaned ${cleanedCount} servers`);

    return new Response(
      JSON.stringify({ 
        message: `Cleaned ${cleanedCount} servers`,
        cleaned: cleanedCount 
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
