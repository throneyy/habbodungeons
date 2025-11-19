import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

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
  },
  {
    name: "Goblin Trio",
    description: "Three mischievous goblins working together in chaotic harmony",
    sprite: "goblin-trio.png",
    baseHp: 55,
    baseAtk: 12,
    baseDef: 6,
    baseSpd: 8
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

// NPC Data for quest generation
const NPC_DATA: Record<string, any> = {
  warrior: {
    name: "Bjorn the Brave",
    personality: "A gruff but honorable warrior who values strength and courage. He speaks directly and has little patience for cowardice.",
    questTheme: "Combat-focused dungeons with challenging enemy encounters and boss battles",
    questTypes: ["Defeat powerful enemies", "Clear monster nests", "Hunt legendary beasts"]
  },
  merchant: {
    name: "Goldwyn the Prosperous",
    personality: "A shrewd merchant with an eye for profit. Friendly but always calculating value. Loves treasure and rare items.",
    questTheme: "Treasure hunting and loot-focused dungeons with valuable rewards",
    questTypes: ["Recover lost treasures", "Find rare artifacts", "Explore abandoned vaults"]
  },
  scholar: {
    name: "Aldric the Wise",
    personality: "A learned scholar fascinated by ancient history and forgotten lore. Speaks in a measured, thoughtful manner.",
    questTheme: "Exploration and mystery-focused dungeons with puzzles and lore",
    questTypes: ["Investigate ancient ruins", "Uncover forgotten knowledge", "Solve ancient mysteries"]
  },
  maiden: {
    name: "Elara the Kind",
    personality: "A compassionate healer who cares deeply for others. Gentle and encouraging, but determined to help those in need.",
    questTheme: "Rescue and protection-focused dungeons with civilians to save",
    questTypes: ["Rescue captured villagers", "Protect the innocent", "Cleanse corrupted lands"]
  },
  guard: {
    name: "Captain Roderick",
    personality: "A disciplined military officer who values order and justice. Professional and strategic in approach.",
    questTheme: "Strategic combat dungeons with tactical challenges and defense scenarios",
    questTypes: ["Defend strategic locations", "Eliminate bandit camps", "Secure dangerous areas"]
  },
  mage: {
    name: "Mystara the Arcane",
    personality: "A powerful mage obsessed with magical phenomena. Eccentric and intense, speaks of magic with reverence.",
    questTheme: "Magic-focused dungeons with elemental challenges and arcane mysteries",
    questTypes: ["Investigate magical anomalies", "Contain wild magic", "Recover mystical artifacts"]
  },
  knight: {
    name: "Sir Gareth the Just",
    personality: "A noble paladin devoted to righteousness and honor. Speaks with conviction and expects moral conduct.",
    questTheme: "Holy crusade dungeons fighting darkness and undead threats",
    questTypes: ["Purge undead corruption", "Reclaim holy sites", "Vanquish dark forces"]
  }
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
    const { npcId, encounters, difficulty } = await req.json();
    const authHeader = req.headers.get('Authorization')!;
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Get NPC data
    const npc = NPC_DATA[npcId];
    if (!npc) throw new Error("Invalid NPC selected");

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
            content: `You are ${npc.name}. ${npc.personality}

Generate a ${difficulty} difficulty dungeon quest with ${encounters} rooms for a level ${playerLevel} adventurer.

Quest Type: ${npc.questTheme}
Possible objectives: ${npc.questTypes.join(', ')}

Create:
- An epic dungeon name that fits your quest type and the ${difficulty} challenge
- A clear quest objective (what the player must accomplish)
- A brief intro (2-3 sentences) spoken by you as ${npc.name}, addressing the adventurer
- Brief descriptions for ${encounters} rooms (2 sentences each)

First room should be exploration/story. Last room is the BOSS room. Make it dramatic and match the ${difficulty} difficulty level and your quest theme.`
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

    // Add enemies and events from static pool
    const rooms = dungeonStructure.rooms.map((room: any, index: number) => {
      // First room has no enemy (exploration)
      if (index === 0) {
        return {
          ...room,
          enemy: null,
          roomType: 'story'
        };
      }
      
      // Last room gets the boss
      if (index === dungeonStructure.rooms.length - 1) {
        const bossEnemy = getRandomEnemy(playerLevel, true);
        return {
          ...room,
          enemy: bossEnemy,
          roomType: 'boss'
        };
      }
      
      // For middle rooms, roll for room type
      const roll = Math.random();
      
      // 10% chance for treasure chest
      if (roll < 0.10) {
        return {
          ...room,
          enemy: null,
          roomType: 'treasure',
          treasureDescription: 'A frost-covered chest sits in the corner, its contents unknown...'
        };
      }
      
      // 10% chance for stat boost event
      if (roll < 0.20) {
        const statEvents = [
          { stat: 'hp', description: 'A warm magical aura fills the room, healing your wounds!', amount: 20 },
          { stat: 'mp', description: 'Ancient runes glow softly, restoring your magical energy!', amount: 15 },
          { stat: 'atk', description: 'You find a warrior\'s shrine. Your attacks feel stronger! (+1 ATK)', amount: 1 },
          { stat: 'def', description: 'Mystical ice armor forms around you. Your defense improves! (+1 DEF)', amount: 1 }
        ];
        const event = statEvents[Math.floor(Math.random() * statEvents.length)];
        return {
          ...room,
          enemy: null,
          roomType: 'event',
          eventType: event.stat,
          eventAmount: event.amount,
          eventDescription: event.description
        };
      }
      
      // 40% chance for regular battle (0.20-0.60)
      if (roll < 0.60) {
        const enemy = getRandomEnemy(playerLevel, false);
        return {
          ...room,
          enemy,
          roomType: 'battle'
        };
      }
      
      // 40% remaining for story/exploration (0.60-1.00)
      return {
        ...room,
        enemy: null,
        roomType: 'story'
      };
    });

    const dungeonJson = {
      ...dungeonStructure,
      rooms
    };

    // Save dungeon with difficulty setting and NPC info
    const { data: dungeon, error } = await supabase
      .from('dungeons')
      .insert({
        owner_user_id: user.id,
        name: dungeonJson.dungeonName,
        theme: npcId, // Store NPC ID as theme
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