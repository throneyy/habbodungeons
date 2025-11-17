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

    console.log(`Fetching Habbo Origins profile for username: ${username}`);

    // Fetch from Habbo Origins API
    const response = await fetch(`https://origins.habbo.com/api/public/users?name=${encodeURIComponent(username)}`);
    
    console.log(`Habbo API response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Habbo Origins API error response: ${errorText}`);
      
      if (response.status === 404) {
        throw new Error("Habbo Origins user not found");
      }
      throw new Error(`Habbo Origins API returned status ${response.status}`);
    }

    const data = await response.json();
    console.log(`Habbo Origins API response data:`, data);

    if (!data || !data.name) {
      throw new Error("Invalid response from Habbo Origins API");
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