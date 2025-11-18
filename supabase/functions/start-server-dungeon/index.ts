import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extractJSON(text: string): string {
  // Remove markdown code blocks if present
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  return text.trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { serverId } = await req.json();

    console.log("Starting dungeon for server:", serverId);

    // Get server info
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .select('id, difficulty, dungeon_id')
      .eq('id', serverId)
      .single();

    if (serverError || !server) {
      throw new Error("Server not found");
    }

    // Check if server already has a dungeon
    if (server.dungeon_id) {
      return new Response(
        JSON.stringify({ dungeonId: server.dungeon_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate a new dungeon
    const theme = "Classic";
    const encounters = 3;
    const difficulty = server.difficulty;

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    console.log("Generating dungeon with AI...");

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a dungeon master creating exciting adventure content. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: `Generate a ${difficulty} difficulty dungeon with ${encounters} encounters themed as "${theme}".

Return ONLY valid JSON in this exact format:
{
  "name": "Epic dungeon name",
  "introText": "Story introduction (2-3 sentences)",
  "questObjective": "What players need to do",
  "rooms": [
    {
      "description": "Room description",
      "enemy": {
        "name": "Enemy name",
        "hp": ${difficulty === 'Hardcore' ? 150 : 100},
        "atk": ${difficulty === 'Hardcore' ? 25 : 15},
        "def": ${difficulty === 'Hardcore' ? 15 : 10},
        "spd": ${difficulty === 'Hardcore' ? 15 : 10}
      },
      "reward": {"gold": ${difficulty === 'Hardcore' ? 150 : 100}, "xp": ${difficulty === 'Hardcore' ? 100 : 50}}
    }
  ]
}`
          }
        ]
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI generation failed:", errorText);
      throw new Error("Failed to generate dungeon content");
    }

    const aiData = await aiResponse.json();
    console.log("AI response received:", JSON.stringify(aiData));

    let dungeonContent;
    try {
      const content = aiData.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("No content in AI response");
      }
      const cleanedContent = extractJSON(content);
      dungeonContent = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      throw new Error("Invalid dungeon content format");
    }

    // Create dungeon record
    const { data: dungeon, error: dungeonError } = await supabase
      .from('dungeons')
      .insert({
        name: dungeonContent.name,
        difficulty: difficulty,
        theme: theme,
        owner_user_id: user.id,
        dungeon_json: dungeonContent,
      })
      .select()
      .single();

    if (dungeonError) throw dungeonError;

    console.log("Dungeon created:", dungeon.id);

    // Link dungeon to server using service role to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { error: updateError } = await supabaseAdmin
      .from('servers')
      .update({ dungeon_id: dungeon.id })
      .eq('id', serverId);

    if (updateError) {
      console.error("Failed to link server to dungeon:", updateError);
      throw updateError;
    }

    console.log("Server linked to dungeon successfully");

    return new Response(
      JSON.stringify({ dungeonId: dungeon.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error starting server dungeon:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
