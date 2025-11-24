import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate deterministic seed from partyId, theme, and difficulty
function generateSeed(partyId: string, theme: string, difficulty: number): number {
  const combined = `${partyId}-${theme}-${difficulty}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const { theme, difficulty, dungeonId } = await req.json();
    
    if (!theme || !difficulty || !dungeonId) {
      throw new Error("Missing required parameters: theme, difficulty, or dungeonId");
    }

    console.log('Generate dungeon background request:', { theme, difficulty, dungeonId });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if dungeon already has an AI background
    const { data: existingDungeon, error: fetchError } = await supabaseAdmin
      .from('dungeons')
      .select('ai_background_url')
      .eq('id', dungeonId)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching dungeon:', fetchError);
      throw fetchError;
    }

    // Return existing background if available
    if (existingDungeon?.ai_background_url) {
      console.log('Returning existing background:', existingDungeon.ai_background_url);
      return new Response(
        JSON.stringify({ imageUrl: existingDungeon.ai_background_url }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate new background using Banana Nano
    console.log('Generating new background with Banana Nano...');
    
    const BANANA_API_KEY = Deno.env.get('BANANA_API_KEY');
    if (!BANANA_API_KEY) {
      throw new Error('BANANA_API_KEY not configured');
    }

    // Generate deterministic seed
    const seed = generateSeed(dungeonId, theme, difficulty);
    
    // Create theme-appropriate prompt
    const themeText = theme.replace(/_/g, ' ');
    const prompt = `isometric pixel art dungeon room, ${themeText} theme, habbo hotel style, game screenshot, empty center, 45 degree angle, crisp pixel art, no UI text`;
    
    console.log('Calling Banana Nano with:', { prompt, seed, width: 768, height: 512 });

    // Call Banana Nano API using Lovable AI gateway with image generation model
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Banana Nano API error:', aiResponse.status, errorText);
      throw new Error(`AI generation failed: ${aiResponse.status} ${errorText}`);
    }

    const aiData = await aiResponse.json();
    console.log('AI response received');

    // Extract image URL from response
    const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!imageUrl) {
      console.error('No image URL in response:', JSON.stringify(aiData));
      throw new Error('No image URL in AI response');
    }

    console.log('Generated image, storing in database...');

    // Store the image URL in the database
    const { error: updateError } = await supabaseAdmin
      .from('dungeons')
      .update({ ai_background_url: imageUrl })
      .eq('id', dungeonId);

    if (updateError) {
      console.error('Error updating dungeon with background:', updateError);
      // Still return the image even if storage fails
    }

    console.log('Background generation complete');

    return new Response(
      JSON.stringify({ imageUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in generate-dungeon-background:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
