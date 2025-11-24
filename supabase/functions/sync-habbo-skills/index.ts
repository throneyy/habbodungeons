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

// Helper function to parse skill level from API response
function parseSkillLevel(skillsData: any, skillType: string): number {
  if (Array.isArray(skillsData)) {
    const skill = skillsData.find((s: any) => 
      s.name?.toLowerCase() === skillType || 
      s.skillType?.toLowerCase() === skillType ||
      s.type?.toLowerCase() === skillType
    );
    return skill?.level || skill?.skillLevel || 0;
  } else if (skillsData.skills) {
    const skill = skillsData.skills.find((s: any) => 
      s.name?.toLowerCase() === skillType || 
      s.skillType?.toLowerCase() === skillType ||
      s.type?.toLowerCase() === skillType
    );
    return skill?.level || skill?.skillLevel || 0;
  } else if (skillsData[skillType]) {
    return skillsData[skillType].level || skillsData[skillType].skillLevel || 0;
  }
  return 0;
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

    if (profileError || !profile?.habbo_username) {
      throw new Error('No Habbo account linked');
    }

    const habboUsername = profile.habbo_username;
    const habboOriginsId = profile.habbo_origins_id;
    
    console.log('Syncing skills for:', habboUsername, 'Origins ID:', habboOriginsId);

    let fishingLevel = 0;
    let gardeningLevel = 0;

    // If we have the Origins ID, use it to fetch skills
    if (habboOriginsId) {
      try {
        // Try bouncerPlayerId format first (without the "gp-" prefix if present)
        let playerId = habboOriginsId;
        if (playerId.startsWith('gp-')) {
          playerId = playerId.substring(3); // Remove "gp-" prefix
        }
        
        console.log(`Trying skills API with player ID: ${playerId}`);
        
        const skillsResponse = await fetch(
          `https://origins.habbo.com/api/public/skills/${encodeURIComponent(playerId)}`
        );
        
        if (!skillsResponse.ok) {
          console.error(`Habbo Origins API returned status ${skillsResponse.status}`);
          
          // If failed, try with the original ID format
          if (habboOriginsId !== playerId) {
            console.log(`Retrying with full ID: ${habboOriginsId}`);
            const retryResponse = await fetch(
              `https://origins.habbo.com/api/public/skills/${encodeURIComponent(habboOriginsId)}`
            );
            
            if (!retryResponse.ok) {
              throw new Error(`Habbo API returned status ${retryResponse.status}`);
            }
            
            const skillsData = await retryResponse.json();
            console.log('Skills data from Habbo Origins (retry):', skillsData);
            
            // Parse skills from retry
            fishingLevel = parseSkillLevel(skillsData, 'fishing');
            gardeningLevel = parseSkillLevel(skillsData, 'gardening');
          } else {
            throw new Error(`Habbo API returned status ${skillsResponse.status}`);
          }
        } else {
          const skillsData = await skillsResponse.json();
          console.log('Skills data from Habbo Origins:', skillsData);

          // Parse fishing and gardening levels
          fishingLevel = parseSkillLevel(skillsData, 'fishing');
          gardeningLevel = parseSkillLevel(skillsData, 'gardening');
        }

        console.log('Parsed levels - Fishing:', fishingLevel, 'Gardening:', gardeningLevel);
      } catch (error: any) {
        console.error('Failed to fetch skills from Habbo Origins:', error);
        // Don't throw - fall back to 0 levels
        console.warn('Using default levels (0) due to API error');
      }
    } else {
      console.warn('No Habbo Origins ID stored. Please re-link your Habbo account to enable skill sync.');
      console.log('Using default levels (0) until Origins ID is captured');
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
