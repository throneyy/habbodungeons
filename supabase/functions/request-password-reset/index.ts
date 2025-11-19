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
    const { username } = await req.json();
    console.log("Password reset requested for:", username);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find the user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, habbo_username')
      .eq('username', username)
      .single();

    if (profileError || !profile) {
      throw new Error("User not found");
    }

    if (!profile.habbo_username) {
      throw new Error("No Habbo account linked. Please link your Habbo account first.");
    }

    // Generate a 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    console.log("Generated verification code:", verificationCode, "for Habbo user:", profile.habbo_username);

    return new Response(
      JSON.stringify({
        success: true,
        verificationCode,
        habboUsername: profile.habbo_username,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error("Error in request-password-reset:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
