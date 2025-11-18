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
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { dungeonId } = await req.json();

    console.log("Creating party for user:", user.id, "dungeon:", dungeonId);

    // Delete any existing parties where user is leader (always create fresh party)
    const { data: oldParties } = await supabase
      .from('parties')
      .select('id')
      .eq('leader_id', user.id);
    
    if (oldParties && oldParties.length > 0) {
      console.log("Deleting old parties for user:", user.id);
      // Delete old party members first
      await supabase
        .from('party_members')
        .delete()
        .in('party_id', oldParties.map(p => p.id));
      
      // Delete old parties
      await supabase
        .from('parties')
        .delete()
        .eq('leader_id', user.id);
    }

    // Generate invite code using database function
    const { data: inviteCodeData, error: codeError } = await supabase
      .rpc('generate_invite_code');

    if (codeError) throw codeError;

    // Create new party
    const { data: party, error: partyError } = await supabase
      .from('parties')
      .insert({
        leader_id: user.id,
        invite_code: inviteCodeData,
        dungeon_id: dungeonId,
        max_members: 4,
      })
      .select()
      .single();

    if (partyError) throw partyError;

    // Add leader as first member
    const { error: memberError } = await supabase
      .from('party_members')
      .insert({
        party_id: party.id,
        user_id: user.id,
      });

    if (memberError) throw memberError;

    console.log("Party created successfully:", party.id);

    return new Response(
      JSON.stringify({ 
        party,
        inviteCode: inviteCodeData 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating party:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
