import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to strip markdown code blocks from JSON
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
    const { theme, encounters } = await req.json();
    const authHeader = req.headers.get('Authorization')!;
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Get player stats
    const { data: stats } = await supabase
      .from('player_stats')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Call AI to generate dungeon using structured output
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a JRPG dungeon generator for The Shattered Frostkeep. Generate unique ice-themed dungeon quests. Keep all descriptions brief and atmospheric.`
          },
          {
            role: 'user',
            content: `Generate a ${theme} dungeon with ${encounters} rooms for level ${stats?.level || 1} player. First room should be exploration/story, not combat.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_dungeon",
              description: "Create a new dungeon quest with rooms and enemies",
              parameters: {
                type: "object",
                properties: {
                  dungeonName: {
                    type: "string",
                    description: "Epic quest name (e.g. The Frozen Crown Heist)"
                  },
                  questObjective: {
                    type: "string",
                    description: "Clear goal for the player"
                  },
                  introText: {
                    type: "string",
                    description: "Brief quest hook (2-3 sentences max)"
                  },
                  rooms: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        roomIndex: { type: "number" },
                        description: {
                          type: "string",
                          description: "Brief room description (2 sentences max)"
                        },
                        enemy: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            description: { type: "string" },
                            hp: { type: "number" },
                            atk: { type: "number" },
                            def: { type: "number" },
                            spd: { type: "number" }
                          },
                          required: ["name", "description", "hp", "atk", "def", "spd"]
                        }
                      },
                      required: ["roomIndex", "description"]
                    }
                  }
                },
                required: ["dungeonName", "questObjective", "introText", "rooms"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "create_dungeon" } }
      }),
    });

    const aiData = await aiResponse.json();
    console.log("AI response:", JSON.stringify(aiData).substring(0, 300));
    
    // Extract structured output from tool call
    const toolCall = aiData.choices[0].message.tool_calls?.[0];
    if (!toolCall || !toolCall.function || !toolCall.function.arguments) {
      console.error("No tool call in response:", aiData);
      throw new Error("AI did not return structured dungeon data");
    }
    
    const dungeonJson = JSON.parse(toolCall.function.arguments);
    console.log("Parsed dungeon:", dungeonJson.dungeonName);

    // Save dungeon with base stats (no difficulty applied yet)
    const { data: dungeon, error } = await supabase
      .from('dungeons')
      .insert({
        owner_user_id: user.id,
        name: dungeonJson.dungeonName,
        theme,
        difficulty: 'Normal', // Default, will be applied when starting
        dungeon_json: dungeonJson,
      })
      .select()
      .single();

    if (error) throw error;

    // Don't create battle state yet - wait for difficulty selection
    return new Response(
      JSON.stringify({ dungeonId: dungeon.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating dungeon:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});