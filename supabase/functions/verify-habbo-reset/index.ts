import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { habboUsername, verificationCode } = await req.json();
    
    if (!habboUsername || !verificationCode) {
      throw new Error("Habbo username and verification code are required");
    }
    
    console.log("Verifying Habbo account:", habboUsername, "with code:", verificationCode);

    // Fetch the Habbo profile to check motto
    const habboResponse = await fetch(`https://www.habbo.com/api/public/users?name=${habboUsername}`);
    
    if (!habboResponse.ok) {
      throw new Error("Failed to fetch Habbo profile. Please check the username.");
    }

    const habboData = await habboResponse.json();
    console.log("Habbo motto:", habboData.motto);

    // Check if verification code is in the motto
    const verified = habboData.motto && habboData.motto.includes(verificationCode);

    return new Response(
      JSON.stringify({
        verified,
        motto: habboData.motto,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error("Error in verify-habbo-reset:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
