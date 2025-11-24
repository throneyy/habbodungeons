import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Skill definitions (duplicated from frontend for backend use)
interface SkillDefinition {
  id: string;
  requiredFishingLevel?: number;
  requiredGardeningLevel?: number;
}

const SKILL_DEFINITIONS: SkillDefinition[] = [
  { id: "hooked_strike", requiredFishingLevel: 10 },
  { id: "net_toss", requiredFishingLevel: 30 },
  { id: "anglers_instinct", requiredFishingLevel: 40 },
  { id: "foam_barrier", requiredFishingLevel: 55 },
  { id: "tidal_guard", requiredFishingLevel: 70 },
  { id: "undertow", requiredFishingLevel: 85 },
  { id: "leviathan_lure", requiredFishingLevel: 99 },
  { id: "depths_bounty", requiredFishingLevel: 100 },
  { id: "herbal_salve", requiredGardeningLevel: 10 },
  { id: "spore_burst", requiredGardeningLevel: 30 },
  { id: "sapling_shield", requiredGardeningLevel: 40 },
  { id: "verdant_pulse", requiredGardeningLevel: 55 },
  { id: "evergreen_ward", requiredGardeningLevel: 70 },
  { id: "rot_bloom", requiredGardeningLevel: 85 },
  { id: "thorn_barrage", requiredGardeningLevel: 99 },
  { id: "bloom_of_life", requiredGardeningLevel: 100 }
];

function getUnlockedSkills(fishingLevel: number, gardeningLevel: number): string[] {
  return SKILL_DEFINITIONS
    .filter(skill => {
      const meetsFishing = skill.requiredFishingLevel == null || fishingLevel >= skill.requiredFishingLevel;
      const meetsGardening = skill.requiredGardeningLevel == null || gardeningLevel >= skill.requiredGardeningLevel;
      return meetsFishing && meetsGardening;
    })
    .map(skill => skill.id);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization')!;
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log('Syncing skills for user:', user.id);

    // Get user's profile to fetch habbo_username
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('habbo_username')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.habbo_username) {
      throw new Error('No Habbo account linked');
    }

    const habboUsername = profile.habbo_username;
    console.log('Fetching skills for Habbo user:', habboUsername);

    // Fetch skills from Habbo Origins API
    let fishingLevel = 0;
    let gardeningLevel = 0;

    try {
      const skillsResponse = await fetch(
        `https://origins.habbo.com/api/public/skills/${encodeURIComponent(habboUsername)}`
      );
      
      if (!skillsResponse.ok) {
        throw new Error(`Habbo API returned status ${skillsResponse.status}`);
      }

      const skillsData = await skillsResponse.json();
      console.log('Skills data from Habbo Origins:', skillsData);

      // Parse fishing and gardening levels from the response
      // The structure may vary - adjust based on actual API response
      if (skillsData.skills) {
        const fishingSkill = skillsData.skills.find((s: any) => 
          s.name?.toLowerCase() === 'fishing' || s.type?.toLowerCase() === 'fishing'
        );
        const gardeningSkill = skillsData.skills.find((s: any) => 
          s.name?.toLowerCase() === 'gardening' || s.type?.toLowerCase() === 'gardening'
        );

        fishingLevel = fishingSkill?.level || 0;
        gardeningLevel = gardeningSkill?.level || 0;
      } else {
        // If the response structure is different, try direct properties
        fishingLevel = skillsData.fishing?.level || skillsData.fishingLevel || 0;
        gardeningLevel = skillsData.gardening?.level || skillsData.gardeningLevel || 0;
      }

      console.log('Parsed levels - Fishing:', fishingLevel, 'Gardening:', gardeningLevel);
    } catch (error: any) {
      console.error('Failed to fetch skills from Habbo Origins:', error);
      throw new Error(`Could not fetch skills from Habbo Origins: ${error.message || 'Unknown error'}`);
    }

    // Calculate unlocked skills
    const unlockedSkills = getUnlockedSkills(fishingLevel, gardeningLevel);

    // Update user profile
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        fishing_level: fishingLevel,
        gardening_level: gardeningLevel,
        last_habbo_skill_sync: new Date().toISOString(),
        unlocked_skills: unlockedSkills
      })
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    console.log('Skills synced successfully:', unlockedSkills.length, 'skills unlocked');

    return new Response(
      JSON.stringify({
        success: true,
        fishingLevel,
        gardeningLevel,
        unlockedSkills,
        profile: updatedProfile
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error syncing skills:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
