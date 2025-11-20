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
    const { username, habboUsername } = await req.json();
    
    if (!username || !habboUsername) {
      throw new Error("Username and Habbo username are required");
    }
    
    console.log("Password reset requested for:", username, "with Habbo username:", habboUsername);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build email-style username for exact match
    const emailUsername = username.toLowerCase().includes("@")
      ? username.toLowerCase()
      : `${username.toLowerCase()}@habbo-dungeons.local`;

    // Find the user profile (exact match to prevent enumeration)
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, habbo_username')
      .eq('username', emailUsername)
      .maybeSingle();

    // Always return success to prevent username enumeration
    if (!profile) {
      // Generate dummy code for non-existent users (prevents timing attacks)
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let dummyCode = '';
      for (let i = 0; i < 6; i++) {
        dummyCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'If your account exists, a verification code has been generated',
          verificationCode: dummyCode
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate a 6 uppercase letter verification code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let verificationCode = '';
    for (let i = 0; i < 6; i++) {
      verificationCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    console.log("Generated verification code:", verificationCode, "for Habbo user:", habboUsername);

    return new Response(
      JSON.stringify({
        success: true,
        verificationCode,
        habboUsername: habboUsername,
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
