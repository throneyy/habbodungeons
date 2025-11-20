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
    const { username, newPassword, verificationCode } = await req.json();
    
    if (!username || !newPassword || !verificationCode) {
      throw new Error("Username, password, and verification code are required");
    }
    
    const normalizedUsername = String(username).trim().toLowerCase();
    console.log("Resetting password for:", normalizedUsername);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build email-style username used in auth / profiles
    const emailUsername = normalizedUsername.includes("@")
      ? normalizedUsername
      : `${normalizedUsername}@habbo-dungeons.local`;

    // Find the user profile to get the user ID (exact email match)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, habbo_username')
      .eq('username', emailUsername)
      .maybeSingle();

    if (profileError || !profile) {
      throw new Error("User not found");
    }

    if (!profile.habbo_username) {
      throw new Error("No Habbo account linked");
    }

    // Verify the code is in the user's Habbo motto
    const habboResponse = await fetch(
      `https://origins.habbo.com/api/public/users?name=${encodeURIComponent(profile.habbo_username)}`
    );
    
    if (!habboResponse.ok) {
      throw new Error("Failed to verify Habbo account");
    }

    const habboData = await habboResponse.json();
    
    if (!habboData.motto || !habboData.motto.includes(verificationCode)) {
      throw new Error("Verification code not found in Habbo motto. Please update your motto and try again.");
    }

    // Update the user's password using admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      profile.id,
      { password: newPassword }
    );

    if (updateError) {
      throw updateError;
    }

    console.log("Password successfully reset for:", username);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error("Error in reset-password:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
