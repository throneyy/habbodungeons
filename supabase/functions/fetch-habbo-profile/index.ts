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

    // Fetch from bobba.me API which includes skill levels
    const response = await fetch(`https://api.bobba.me/habboGET?username=${encodeURIComponent(username)}`);
    
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

    if (!data || !data.mainDetails || !data.mainDetails.name) {
      throw new Error("Invalid response from Habbo API");
    }

    return new Response(
      JSON.stringify({
        profile: {
          name: data.mainDetails.name,
          figureString: data.mainDetails.figureString,
          motto: data.mainDetails.motto || "",
          uniqueId: data.uniqueIds?.uniqueId || null,
          bouncerPlayerId: data.uniqueIds?.bouncerPlayerId || null,
          fishingLevel: data.mainDetails.fishingLevel || 0,
          gardeningLevel: data.mainDetails.gardeningLevel || 0,
        },
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