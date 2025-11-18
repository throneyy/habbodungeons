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
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { inviteCode } = await req.json();

    console.log("User attempting to join party:", user.id, "code:", inviteCode);

    // Leave any existing parties first (except the one we're trying to join)
    const { data: existingMemberships } = await supabase
      .from('party_members')
      .select('id, party_id')
      .eq('user_id', user.id);

    console.log("Found existing party memberships:", existingMemberships?.length || 0);

    // Find party by invite code
    const { data: party, error: partyError } = await supabase
      .from('parties')
      .select('*, party_members(*)')
      .eq('invite_code', inviteCode.toUpperCase())
      .single();

    if (partyError || !party) {
      throw new Error("Party not found. Check your invite code.");
    }

    // Check if already a member
    const isMember = party.party_members.some((m: any) => m.user_id === user.id);
    if (isMember) {
      console.log("User already in party");
      
      // Clean up other party memberships
      if (existingMemberships && existingMemberships.length > 0) {
        const otherMemberships = existingMemberships.filter(m => m.party_id !== party.id);
        if (otherMemberships.length > 0) {
          console.log("Removing", otherMemberships.length, "old party memberships");
          await supabase
            .from('party_members')
            .delete()
            .in('id', otherMemberships.map(m => m.id));
        }
      }
      
      return new Response(
        JSON.stringify({ party, message: "You're already in this party!" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if party is full
    if (party.party_members.length >= party.max_members) {
      throw new Error("Party is full!");
    }

    // Leave other parties before joining this one
    if (existingMemberships && existingMemberships.length > 0) {
      console.log("Leaving", existingMemberships.length, "old parties");
      await supabase
        .from('party_members')
        .delete()
        .in('id', existingMemberships.map(m => m.id));
    }

    // Add user to party
    const { error: joinError } = await supabase
      .from('party_members')
      .insert({
        party_id: party.id,
        user_id: user.id,
      });

    if (joinError) throw joinError;

    console.log("User joined party successfully");

    // Reload party with dungeon_id
    const { data: updatedParty } = await supabase
      .from('parties')
      .select('*, party_members(*)')
      .eq('id', party.id)
      .single();

    // Check if there's an active battle for this party
    const { data: activeBattle } = await supabase
      .from('battle_states')
      .select('id')
      .eq('party_id', party.id)
      .eq('is_active', true)
      .maybeSingle();

    console.log("Active battle check:", { partyId: party.id, activeBattle: !!activeBattle });

    return new Response(
      JSON.stringify({ 
        party: updatedParty,
        dungeonId: updatedParty?.dungeon_id,
        activeBattle: !!activeBattle,
        message: "Successfully joined party!" 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error joining party:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
