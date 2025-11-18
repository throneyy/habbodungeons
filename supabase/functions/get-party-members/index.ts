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

    const { partyId } = await req.json();

    // Validate party ID
    if (!partyId) {
      return new Response(
        JSON.stringify({ error: "Party ID is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Fetching party members for party:", partyId);

    // Get party with all members
    const { data: party, error: partyError } = await supabase
      .from('parties')
      .select('*, party_members(user_id)')
      .eq('id', partyId)
      .maybeSingle();

    if (partyError) throw partyError;
    if (!party) throw new Error("Party not found or access denied");

    // Get all member profiles with stats
    const userIds = party.party_members.map((m: any) => m.user_id);
    
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .in('id', userIds);

    if (profilesError) throw profilesError;

    const { data: stats, error: statsError } = await supabase
      .from('player_stats')
      .select('*')
      .in('user_id', userIds);

    if (statsError) throw statsError;

    // Combine profile and stats data
    const members = profiles.map((profile: any) => {
      const playerStats = stats.find((s: any) => s.user_id === profile.id);
      const habboData = profile.habbo_profile_json;
      
      return {
        userId: profile.id,
        username: profile.habbo_username || profile.username,
        habboAvatar: habboData?.figureString 
          ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${habboData.figureString}&size=m&direction=2&head_direction=3`
          : null,
        level: playerStats?.level || 1,
        currentHp: playerStats?.current_hp || 100,
        maxHp: playerStats?.max_hp || 100,
        currentMp: playerStats?.current_mp || 50,
        maxMp: playerStats?.max_mp || 50,
        statusEffects: playerStats?.status_effects || [],
      };
    });

    console.log("Fetched", members.length, "party members");

    return new Response(
      JSON.stringify({ 
        party,
        members 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching party members:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
