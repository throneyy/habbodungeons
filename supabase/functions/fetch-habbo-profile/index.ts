import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, verificationCode } = await req.json();

    if (!username) {
      throw new Error("Username is required");
    }

    console.log(`Fetching Habbo profile for username: ${username}`);
    if (verificationCode) {
      console.log(`Verification code provided: ${verificationCode}`);
    }

    // Try bobba.me API first (includes skill levels)
    let response = await fetch(`https://api.bobba.me/habboGET?username=${encodeURIComponent(username)}`);
    let usedBobbaApi = false;
    
    if (response.ok) {
      usedBobbaApi = true;
    } else {
      console.warn(`Bobba API failed with status ${response.status}, falling back to Habbo Origins API`);
      // Fallback to Habbo Origins API
      response = await fetch(`https://origins.habbo.com/api/public/users?name=${encodeURIComponent(username)}`);
    }
    
    console.log(`Habbo API response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Habbo API error response: ${errorText}`);
      
      if (response.status === 404) {
        throw new Error("Habbo user not found");
      }
      throw new Error(`Habbo API returned status ${response.status}`);
    }

    const data = await response.json();
    console.log(`Habbo API response data:`, data);

    let profileData;
    
    if (usedBobbaApi) {
      // Bobba.me API format
      if (!data || !data.mainDetails || !data.mainDetails.name) {
        throw new Error("Invalid response from Bobba API");
      }
      
      profileData = {
        name: data.mainDetails.name,
        figureString: data.mainDetails.figureString,
        motto: data.mainDetails.motto || "",
        uniqueId: data.uniqueIds?.uniqueId || null,
        bouncerPlayerId: data.uniqueIds?.bouncerPlayerId || null,
        fishingLevel: data.mainDetails.fishingLevel || 0,
        gardeningLevel: data.mainDetails.gardeningLevel || 0,
      };
    } else {
      // Habbo Origins API format
      if (!data || !data.name) {
        throw new Error("Invalid response from Habbo Origins API");
      }
      
      profileData = {
        name: data.name,
        figureString: data.figureString,
        motto: data.motto || "",
        uniqueId: data.uniqueId || null,
        bouncerPlayerId: data.bouncerPlayerId || null,
        fishingLevel: 0, // Origins API doesn't include levels in user endpoint
        gardeningLevel: 0,
      };
    }

    return new Response(
      JSON.stringify({
        profile: profileData,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error fetching Habbo Origins profile:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});