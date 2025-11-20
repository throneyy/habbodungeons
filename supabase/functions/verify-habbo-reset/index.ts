import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

    // Initialize Supabase client for rate limiting
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check rate limiting
    const { data: attempt } = await supabase
      .from('verification_attempts')
      .select('*')
      .eq('username', habboUsername)
      .maybeSingle();

    if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
      const minutesLeft = Math.ceil(
        (new Date(attempt.locked_until).getTime() - Date.now()) / 60000
      );
      throw new Error(`Too many attempts. Try again in ${minutesLeft} minutes.`);
    }

    if (attempt && attempt.attempts >= 5) {
      // Lock for 15 minutes
      await supabase.from('verification_attempts').upsert({
        username: habboUsername,
        attempts: attempt.attempts + 1,
        locked_until: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      });
      throw new Error('Too many attempts. Try again in 15 minutes.');
    }

    // Fetch the Habbo Origins profile to check motto
    const habboResponse = await fetch(`https://origins.habbo.com/api/public/users?name=${encodeURIComponent(habboUsername)}`);
    
    if (!habboResponse.ok) {
      throw new Error("Failed to fetch Habbo Origins profile. Please check the username.");
    }

    const habboData = await habboResponse.json();
    console.log("Habbo Origins motto:", habboData.motto);

    // Check if verification code is in the motto
    const verified = habboData.motto && habboData.motto.includes(verificationCode);

    // Update attempts tracking
    if (!verified) {
      await supabase.from('verification_attempts').upsert({
        username: habboUsername,
        attempts: (attempt?.attempts || 0) + 1,
        updated_at: new Date().toISOString()
      });
    } else {
      // Clear attempts on success
      if (attempt) {
        await supabase.from('verification_attempts').delete()
          .eq('username', habboUsername);
      }
    }

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
