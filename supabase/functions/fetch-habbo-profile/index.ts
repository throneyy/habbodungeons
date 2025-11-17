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
    const { username } = await req.json();

    if (!username) {
      throw new Error("Username is required");
    }

    // Fetch from Habbo API
    const response = await fetch(`https://www.habbo.com/api/public/users?name=${encodeURIComponent(username)}`);
    
    if (!response.ok) {
      throw new Error("Failed to fetch Habbo profile");
    }

    const data = await response.json();

    if (!data || !data.name) {
      throw new Error("Habbo user not found");
    }

    return new Response(
      JSON.stringify({
        profile: {
          name: data.name,
          figureString: data.figureString,
          motto: data.motto || "",
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error fetching Habbo profile:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});