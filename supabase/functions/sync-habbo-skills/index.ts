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

    // Get user's profile to fetch habbo info
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('habbo_username, habbo_origins_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Profile not found');
    }

    if (!profile.habbo_username) {
      throw new Error('No Habbo username linked. Please link your Habbo account first.');
    }

    const habboUsername = profile.habbo_username;
    
    console.log(`Syncing skills for ${habboUsername}`);

    // Step 1: Fetch uniqueId from Habbo Origins API
    console.log(`Fetching uniqueId for ${habboUsername}...`);
    const userResponse = await fetch(
      `https://origins.habbo.com/api/public/users?name=${encodeURIComponent(habboUsername)}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!userResponse.ok) {
      throw new Error(`Failed to fetch user data from Habbo Origins. Status: ${userResponse.status}`);
    }

    const userData = await userResponse.json();
    console.log('User data response:', JSON.stringify(userData));

    const uniqueId = userData.uniqueId;
    if (!uniqueId) {
      throw new Error('No uniqueId found in Habbo Origins response');
    }

    console.log(`Found uniqueId: ${uniqueId}`);

    // Update profile with uniqueId for future use
    await supabase
      .from('profiles')
      .update({ habbo_origins_id: uniqueId })
      .eq('id', user.id);

    // Step 2: Fetch skills array from Habbo Origins API
    console.log(`Fetching skills for uniqueId: ${uniqueId}...`);
    const skillsResponse = await fetch(
      `https://origins.habbo.com/api/public/skills/${encodeURIComponent(uniqueId)}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!skillsResponse.ok) {
      throw new Error(`Failed to fetch skills from Habbo Origins. Status: ${skillsResponse.status}`);
    }

    const skillsArray = await skillsResponse.json();
    console.log('Skills array response:', JSON.stringify(skillsArray));

    // Parse fishing and gardening from the skills array
    let fishingLevel = 0;
    let fishingXp = 0;
    let gardeningLevel = 0;
    let gardeningXp = 0;

    if (Array.isArray(skillsArray)) {
      const fishingSkill = skillsArray.find((s: any) => s.skill === 'fishing');
      const gardeningSkill = skillsArray.find((s: any) => s.skill === 'gardening');

      if (fishingSkill) {
        fishingLevel = fishingSkill.level || 0;
        fishingXp = fishingSkill.xp || 0;
      }

      if (gardeningSkill) {
        gardeningLevel = gardeningSkill.level || 0;
        gardeningXp = gardeningSkill.xp || 0;
      }
    }

    console.log(`Parsed levels - Fishing: Lv${fishingLevel} (${fishingXp} XP), Gardening: Lv${gardeningLevel} (${gardeningXp} XP)`);

    // Calculate unlocked skills
    const unlockedSkills = getUnlockedSkills(fishingLevel, gardeningLevel);

    // Update user profile
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({
        fishing_level: fishingLevel,
        fishing_xp: fishingXp,
        gardening_level: gardeningLevel,
        gardening_xp: gardeningXp,
        last_habbo_skill_sync: new Date().toISOString(),
        unlocked_skills: unlockedSkills
      })
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    console.log(`Skills synced successfully: ${unlockedSkills.length} skills unlocked`);

    return new Response(
      JSON.stringify({
        success: true,
        fishingLevel,
        fishingXp,
        gardeningLevel,
        gardeningXp,
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