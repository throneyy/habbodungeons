import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Static enemy pool with sprites
const ENEMY_POOL = [
  {
    name: "Skeleton Warrior",
    description: "An undead warrior wielding a rusted blade",
    sprite: "skeleton.png",
    baseHp: 40,
    baseAtk: 8,
    baseDef: 5,
    baseSpd: 6
  },
  {
    name: "Ice Tiger",
    description: "A fierce feline predator with frost-covered fangs",
    sprite: "ice-tiger.gif",
    baseHp: 45,
    baseAtk: 10,
    baseDef: 6,
    baseSpd: 9
  },
  {
    name: "Ice Elemental",
    description: "A crystalline being of pure frozen magic",
    sprite: "ice-elemental.png",
    baseHp: 35,
    baseAtk: 12,
    baseDef: 4,
    baseSpd: 7
  },
  {
    name: "Ice Guardian",
    description: "A heavily armored sentinel of the frozen halls",
    sprite: "ice-guardian.png",
    baseHp: 100,
    baseAtk: 9,
    baseDef: 12,
    baseSpd: 4
  },
  {
    name: "Frost Wolf",
    description: "A savage wolf corrupted by dark ice magic",
    sprite: "frost-wolf.png",
    baseHp: 42,
    baseAtk: 11,
    baseDef: 5,
    baseSpd: 10
  },
  {
    name: "Glacial Imp",
    description: "A mischievous creature made of ice and malice",
    sprite: "glacial-imp.png",
    baseHp: 30,
    baseAtk: 9,
    baseDef: 4,
    baseSpd: 8
  },
  {
    name: "Frozen Goblin",
    description: "A goblin trapped in eternal frost, still hungry for battle",
    sprite: "frozen-goblin.png",
    baseHp: 38,
    baseAtk: 7,
    baseDef: 6,
    baseSpd: 7
  },
  {
    name: "Frost Mutant",
    description: "A grotesque amalgamation of frozen flesh and ice",
    sprite: "frost-mutant.png",
    baseHp: 50,
    baseAtk: 10,
    baseDef: 8,
    baseSpd: 5
  },
  {
    name: "Frost Undead",
    description: "A cursed spirit trapped in eternal frost, seeking warmth from the living",
    sprite: "frost-undead.gif",
    baseHp: 44,
    baseAtk: 9,
    baseDef: 6,
    baseSpd: 6
  },
  {
    name: "Frostbite Spider",
    description: "A venomous arachnid whose bite inflicts icy necrosis",
    sprite: "frostbite-spider.webp",
    baseHp: 36,
    baseAtk: 10,
    baseDef: 4,
    baseSpd: 11
  }
];

const BOSS_ENEMY = {
  name: "Frost Wraith",
  description: "The ancient guardian of the Frostkeep, a powerful spirit of eternal winter",
  sprite: "frost-wraith.png",
  baseHp: 200,
  baseAtk: 15,
  baseDef: 10,
  baseSpd: 8
};

const FIRE_DRAKE = {
  name: "Fire Drake",
  description: "A legendary dragon wreathed in flames, one of the most fearsome creatures in existence",
  sprite: "fire-drake.png",
  baseHp: 1000,
  baseAtk: 25,
  baseDef: 20,
  baseSpd: 12
};

// Helper function to get random enemy
function getRandomEnemy(playerLevel: number, isBoss: boolean = false) {
  // 5% chance to encounter Fire Drake (only for regular enemies, not bosses)
  if (!isBoss && Math.random() < 0.05) {
    console.log('🐉 RARE ENCOUNTER: Fire Drake spawned!');
    return {
      ...FIRE_DRAKE,
      hp: FIRE_DRAKE.baseHp,
      atk: FIRE_DRAKE.baseAtk + Math.floor(playerLevel * 2),
      def: FIRE_DRAKE.baseDef + Math.floor(playerLevel * 1.5),
      spd: FIRE_DRAKE.baseSpd + Math.floor(playerLevel * 1)
    };
  }
  
  if (isBoss) {
    return {
      ...BOSS_ENEMY,
      hp: BOSS_ENEMY.baseHp + (playerLevel * 5),
      atk: BOSS_ENEMY.baseAtk + Math.floor(playerLevel * 1.5),
      def: BOSS_ENEMY.baseDef + Math.floor(playerLevel * 1.2),
      spd: BOSS_ENEMY.baseSpd + Math.floor(playerLevel * 0.8)
    };
  }
  
  const enemy = ENEMY_POOL[Math.floor(Math.random() * ENEMY_POOL.length)];
  return {
    ...enemy,
    hp: enemy.baseHp + (playerLevel * 3),
    atk: enemy.baseAtk + Math.floor(playerLevel * 1.2),
    def: enemy.baseDef + playerLevel,
    spd: enemy.baseSpd + Math.floor(playerLevel * 0.5)
  };
}

// Helper function to strip markdown code blocks from JSON
function extractJSON(text: string): string {
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
    const { theme, encounters, difficulty } = await req.json();
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

    const playerLevel = stats?.level || 1;

    // Call AI to generate dungeon story and structure (but not enemies)
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
            content: `You are a JRPG dungeon generator for The Shattered Frostkeep. Generate unique ice-themed dungeon quests with compelling narratives. Keep all descriptions brief and atmospheric.

CRITICAL: You MUST write EVERYTHING in English only. Do not use Arabic, Chinese, Japanese, or any other language. All dungeon names, descriptions, and text must be in English.`
          },
          {
            role: 'user',
            content: `Generate a ${theme} ${difficulty} difficulty dungeon story with ${encounters} rooms for level ${playerLevel} player. 
            
            Create:
            - An epic dungeon name that hints at the ${difficulty} challenge and ${theme} theme
            - A clear quest objective
            - A brief intro (2-3 sentences)
            - Brief descriptions for ${encounters} rooms (2 sentences each)
            
            First room should be exploration/story. Last room is the BOSS room. Make it dramatic and match the ${difficulty} difficulty level.`
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
    
    const dungeonStructure = JSON.parse(toolCall.function.arguments);
    console.log("Parsed dungeon:", dungeonStructure.dungeonName);

    // Add enemies from static pool
    const rooms = dungeonStructure.rooms.map((room: any, index: number) => {
      // First room has no enemy (exploration)
      if (index === 0) {
        return {
          ...room,
          enemy: null
        };
      }
      
      // Last room gets the boss
      const isBoss = index === dungeonStructure.rooms.length - 1;
      const enemy = getRandomEnemy(playerLevel, isBoss);
      
      return {
        ...room,
        enemy
      };
    });

    const dungeonJson = {
      ...dungeonStructure,
      rooms
    };

    // Save dungeon with difficulty setting
    const { data: dungeon, error } = await supabase
      .from('dungeons')
      .insert({
        owner_user_id: user.id,
        name: dungeonJson.dungeonName,
        theme,
        difficulty: difficulty || 'Normal',
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