import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extractJSON(text: string): string {
  // Remove markdown code blocks if present
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  return text.trim();
}

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

    console.log("Starting dungeon for server:", serverId);

    // Get server info
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .select('id, difficulty, dungeon_id')
      .eq('id', serverId)
      .single();

    if (serverError || !server) {
      throw new Error("Server not found");
    }

    // Check if server already has a dungeon
    if (server.dungeon_id) {
      return new Response(
        JSON.stringify({ dungeonId: server.dungeon_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate a new dungeon using the shared generate-dungeon function
    const npcIds = [
      "warrior",
      "merchant",
      "scholar",
      "maiden",
      "guard",
      "mage",
      "knight",
    ];

    const npcId = npcIds[Math.floor(Math.random() * npcIds.length)];
    // Generate dungeons with 7-10 encounters for better pacing
    const encounters = 7 + Math.floor(Math.random() * 4); // Random between 7-10
    const difficulty = server.difficulty || 'Normal';

    console.log("Generating dungeon with NPC quest giver:", npcId);

    const { data: dungeonResult, error: dungeonError } = await supabase
      .functions
      .invoke('generate-dungeon', {
        body: {
          npcId,
          encounters,
          difficulty,
        },
      });

    if (dungeonError) {
      console.error('Failed to generate dungeon via generate-dungeon:', dungeonError);
      throw new Error(dungeonError.message || 'Failed to generate dungeon');
    }

    const dungeonId = (dungeonResult as any)?.dungeonId;
    if (!dungeonId) {
      console.error('generate-dungeon response missing dungeonId:', dungeonResult);
      throw new Error('Invalid response from generate-dungeon');
    }

    console.log('Dungeon created via generate-dungeon:', dungeonId);

    // Link dungeon to server using service role to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { error: updateError } = await supabaseAdmin
      .from('servers')
      .update({ dungeon_id: dungeonId })
      .eq('id', serverId);

    if (updateError) {
      console.error('Failed to link server to dungeon:', updateError);
      throw updateError;
    }

    console.log('Server linked to dungeon successfully');

    // Now initialize the battle state for the server
    console.log('Initializing battle state for server dungeon...');
    const initBattleResponse = await supabaseAdmin.functions.invoke('start-dungeon-battle', {
      body: {
        dungeonId,
        difficulty,
      },
      headers: {
        Authorization: authHeader,
      },
    });

    if (initBattleResponse.error) {
      console.error('Failed to initialize battle state:', initBattleResponse.error);
      throw new Error('Failed to initialize battle state');
    }

    console.log('Battle state initialized successfully');

    return new Response(
      JSON.stringify({ dungeonId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error starting server dungeon:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
