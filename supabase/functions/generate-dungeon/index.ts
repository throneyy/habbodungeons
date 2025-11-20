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
    sprite: "undead-habbo.png",
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
  },
  {
    name: "Frost Werewolf",
    description: "A cursed beast with ice-matted fur and razor-sharp claws",
    sprite: "werewolf.png",
    baseHp: 52,
    baseAtk: 13,
    baseDef: 7,
    baseSpd: 11
  },
  {
    name: "Frost Brute",
    description: "A massive blue-skinned brute empowered by ancient frost magic",
    sprite: "frost-brute.png",
    baseHp: 58,
    baseAtk: 14,
    baseDef: 9,
    baseSpd: 6
  },
  {
    name: "Void Stalker",
    description: "A creature from the dark void between worlds that drains life energy",
    sprite: "void-stalker.png",
    baseHp: 48,
    baseAtk: 12,
    baseDef: 6,
    baseSpd: 10
  },
  {
    name: "Swamp Lurker",
    description: "A vicious green-skinned troll that regenerates quickly",
    sprite: "swamp-lurker.png",
    baseHp: 54,
    baseAtk: 11,
    baseDef: 8,
    baseSpd: 7
  },
  {
    name: "Infernal Hound",
    description: "A demonic beast wreathed in dark flames",
    sprite: "infernal-hound.png",
    baseHp: 50,
    baseAtk: 13,
    baseDef: 7,
    baseSpd: 12
  },
  {
    name: "Corrupted Guard",
    description: "Once a noble guard, now twisted by dark magic",
    sprite: "corrupted-guard.png",
    baseHp: 56,
    baseAtk: 12,
    baseDef: 10,
    baseSpd: 8
  },
  {
    name: "Giant Rat",
    description: "A massive rodent corrupted by the dungeon's dark magic",
    sprite: "giant-rat.png",
    baseHp: 35,
    baseAtk: 8,
    baseDef: 5,
    baseSpd: 9
  },
  {
    name: "Spirit Owl",
    description: "A ghostly predator that hunts in eternal silence",
    sprite: "spirit-owl.png",
    baseHp: 38,
    baseAtk: 11,
    baseDef: 4,
    baseSpd: 12
  },
  {
    name: "Flaming Phantom",
    description: "A vengeful spirit wreathed in cold fire and hatred",
    sprite: "flaming-phantom.png",
    baseHp: 46,
    baseAtk: 14,
    baseDef: 5,
    baseSpd: 8
  },
  {
    name: "Ice Shade",
    description: "A crystalline wraith that phases through solid ice",
    sprite: "ice-shade.png",
    baseHp: 40,
    baseAtk: 12,
    baseDef: 6,
    baseSpd: 10
  }
];

const BOSS_POOL = [
  {
    name: "Frost Wraith",
    description: "The ancient guardian of the Frostkeep, a powerful spirit of eternal winter",
    sprite: "frost-wraith.png",
    baseHp: 200,
    baseAtk: 15,
    baseDef: 10,
    baseSpd: 8
  },
  {
    name: "Ice Knight Commander",
    description: "An elite warrior clad in frozen armor, wielding a blade of eternal ice",
    sprite: "ice-knight-boss.png",
    baseHp: 220,
    baseAtk: 18,
    baseDef: 14,
    baseSpd: 7
  },
  {
    name: "Blood Dragon",
    description: "A massive wyrm with scales as hard as iron, breathing crimson flames",
    sprite: "blood-dragon-boss.gif",
    baseHp: 250,
    baseAtk: 20,
    baseDef: 12,
    baseSpd: 9
  },
  {
    name: "Fire Drake",
    description: "A legendary dragon wreathed in flames, one of the most fearsome creatures in existence",
    sprite: "fire-drake.png",
    baseHp: 300,
    baseAtk: 25,
    baseDef: 18,
    baseSpd: 11
  },
  {
    name: "Iced Stone Dragon",
    description: "An ancient trickster dragon combining ice and stone elemental magic, tests adventurers with riddles",
    sprite: "iced-stone-dragon.png",
    baseHp: 320,
    baseAtk: 24,
    baseDef: 22,
    baseSpd: 8
  },
  {
    name: "Mystic Shaman",
    description: "A powerful elemental shaman channeling primal forces of fire and ice, summoning ancestral spirits",
    sprite: "mystic-shaman-boss.png",
    baseHp: 280,
    baseAtk: 22,
    baseDef: 16,
    baseSpd: 10
  }
];

// Boss-specific loot tables
export const BOSS_LOOT: Record<string, Array<{name: string, quantity: number, type: string}>> = {
  "Ice Knight Commander": [
    { name: "Spiked Chest Armour", quantity: 1, type: "armor" },
    { name: "Horned Helmet", quantity: 1, type: "armor" },
    { name: "Iron Leg Armour", quantity: 1, type: "armor" }
  ],
  "Blood Dragon": [
    { name: "Iron Chest Armour", quantity: 1, type: "armor" },
    { name: "Iron Helmet", quantity: 1, type: "armor" },
    { name: "Iron Sabatons", quantity: 1, type: "armor" }
  ],
  "Iced Stone Dragon": [
    { name: "Powerful Mage Staff", quantity: 1, type: "weapon" },
    { name: "Crystals", quantity: 3, type: "material" },
    { name: "Runestones", quantity: 5, type: "material" },
    { name: "Gold Coins", quantity: 500, type: "currency" }
  ],
  "Mystic Shaman": [
    { name: "Mage Staff", quantity: 1, type: "weapon" },
    { name: "Elixir", quantity: 2, type: "consumable" },
    { name: "Crystals", quantity: 2, type: "material" },
    { name: "Scroll", quantity: 3, type: "material" },
    { name: "Gold Coins", quantity: 400, type: "currency" }
  ]
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
    name: "Bjorn the Bard",
    title: "Traveling Minstrel",
    personality: "A charismatic bard who weaves tales through song and lute. He's jovial and dramatic, believing every quest deserves an epic ballad.",
    questTheme: "Story-rich dungeons with memorable encounters and dramatic moments worth singing about",
    questTypes: ["Uncover legendary tales", "Meet interesting characters", "Create memorable stories"]
  },
  merchant: {
    name: "Goldwyn the Prosperous",
    title: "Master Trader",
    personality: "A shrewd merchant with an eye for profit. Friendly but always calculating value. Loves treasure and rare items.",
    questTheme: "Treasure hunting and loot-focused dungeons with valuable rewards",
    questTypes: ["Recover lost treasures", "Find rare artifacts", "Explore abandoned vaults"]
  },
  scholar: {
    name: "Aldric the Wise",
    title: "Ancient Historian",
    personality: "A learned scholar fascinated by ancient history and forgotten lore. Speaks in a measured, thoughtful manner.",
    questTheme: "Exploration and mystery-focused dungeons with puzzles and lore",
    questTypes: ["Investigate ancient ruins", "Uncover forgotten knowledge", "Solve ancient mysteries"]
  },
  maiden: {
    name: "Elara the Kind",
    title: "Village Healer",
    personality: "A compassionate healer who cares deeply for others. Gentle and encouraging, but determined to help those in need.",
    questTheme: "Rescue and protection-focused dungeons with civilians to save",
    questTypes: ["Rescue captured villagers", "Protect the innocent", "Cleanse corrupted lands"]
  },
  guard: {
    name: "Captain Roderick",
    title: "City Guard Captain",
    personality: "A disciplined military officer who values order and justice. Professional and strategic in approach.",
    questTheme: "Strategic combat dungeons with tactical challenges and defense scenarios",
    questTypes: ["Defend strategic locations", "Eliminate bandit camps", "Secure dangerous areas"]
  },
  mage: {
    name: "Mystara the Arcane",
    title: "Archmage",
    personality: "A powerful mage obsessed with magical phenomena. Eccentric and intense, speaks of magic with reverence.",
    questTheme: "Magic-focused dungeons with elemental challenges and arcane mysteries",
    questTypes: ["Investigate magical anomalies", "Contain wild magic", "Recover mystical artifacts"]
  },
  knight: {
    name: "Sir Gareth the Just",
    title: "Paladin Commander",
    personality: "A noble paladin devoted to righteousness and honor. Speaks with conviction and expects moral conduct.",
    questTheme: "Holy crusade dungeons fighting darkness and undead threats",
    questTypes: ["Purge undead corruption", "Reclaim holy sites", "Vanquish dark forces"]
  }
};

// Helper function to get random enemy
function getRandomEnemy(playerLevel: number, isBoss: boolean = false) {
  // Rare spawns only for boss encounters
  if (isBoss) {
    const rareRoll = Math.random();
    if (rareRoll < 0.15) {  // 15% chance for Fire Drake as boss
      console.log("Rare boss spawn: Fire Drake!");
      return {
        ...FIRE_DRAKE,
        hp: FIRE_DRAKE.baseHp + (playerLevel * 8),
        maxHp: FIRE_DRAKE.baseHp + (playerLevel * 8),
        atk: FIRE_DRAKE.baseAtk + Math.floor(playerLevel * 1.2),
        def: FIRE_DRAKE.baseDef + Math.floor(playerLevel * 0.8),
        spd: FIRE_DRAKE.baseSpd + Math.floor(playerLevel * 0.5),
      };
    }
    
    const boss = BOSS_POOL[Math.floor(Math.random() * BOSS_POOL.length)];
    return {
      ...boss,
      hp: boss.baseHp + (playerLevel * 5),
      atk: boss.baseAtk + Math.floor(playerLevel * 1.5),
      def: boss.baseDef + Math.floor(playerLevel * 1.2),
      spd: boss.baseSpd + Math.floor(playerLevel * 0.8)
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

    // Rate limiting check for dungeon generation
    const { data: rateLimit } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('user_id', user.id)
      .eq('action_type', 'dungeon_generation')
      .maybeSingle();

    const now = Date.now();
    if (rateLimit) {
      const timeSince = now - new Date(rateLimit.last_action_at).getTime();
      if (timeSince < 30000) {
        throw new Error('Please wait 30 seconds between dungeon generations');
      }
    }

    // Update rate limit
    await supabase.from('rate_limits').upsert({
      user_id: user.id,
      action_type: 'dungeon_generation',
      last_action_at: new Date().toISOString(),
    });

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
            content: `You write dungeon quests for The Shattered Frostkeep. Your style is direct, gritty, and atmospheric. No flowery language, no clichés. Just raw, punchy descriptions that set the mood fast.

CRITICAL: Write EVERYTHING in English. All text must be in English.`
          },
          {
            role: 'user',
            content: `You're ${npc.name}, speaking to an adventurer. ${npc.personality}

DUNGEON REQUIREMENTS:
- MUST create EXACTLY ${encounters} rooms (NOT 3, NOT 5, EXACTLY ${encounters})
- Difficulty: ${difficulty}
- Player level: ${playerLevel}

Your specialty: ${npc.questTheme}
Your usual work: ${npc.questTypes.join(', ')}

CRITICAL: The quest objective should be specific and tied to the story, NOT just "defeat the boss" or "clear the dungeon". Examples:
- Recover the stolen artifact from the Ice Lord
- Rescue the kidnapped merchant from goblin captors
- Retrieve the ancient scroll before it's destroyed
- Seal the corrupted portal in the throne room
- Find evidence of the traitor's identity

Give me:
- A dungeon name (short and punchy, not "The Epic Quest of...")
- What needs doing (ONE specific goal tied to story events, not generic boss killing)
- Your pitch to the adventurer (1-2 sentences max. Talk like a real person would, not a fantasy novel)
- EXACTLY ${encounters} room descriptions (counting from 0 to ${encounters - 1}. Each room: 1-2 sentences. Set the scene, skip the adjectives)

Room structure:
- First room (0): atmosphere and entry
- Middle rooms (1 to ${encounters - 2}): varied encounters building toward the goal
- Last room (${encounters - 1}): where the objective is achieved (may include boss)

Make it feel dangerous, not dramatic.`
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
                    description: "Short, punchy dungeon name"
                  },
                  questObjective: {
                    type: "string",
                    description: "One clear goal"
                  },
                  introText: {
                    type: "string",
                    description: "Your pitch. 1-2 sentences. Talk natural."
                  },
                  rooms: {
                    type: "array",
                    description: `MUST contain EXACTLY ${encounters} rooms, indexed from 0 to ${encounters - 1}`,
                    minItems: encounters,
                    maxItems: encounters,
                    items: {
                      type: "object",
                      properties: {
                        roomIndex: { 
                          type: "number",
                          description: `Room index from 0 to ${encounters - 1}`
                        },
                        description: {
                          type: "string",
                          description: "Room description. 1-2 sentences. Set the scene."
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
      
      // For middle rooms, prioritize combat encounters
      const roll = Math.random();
      
      // Guarantee at least 70% combat in middle rooms
      // Only first middle room can be non-combat for pacing
      const isFirstMiddleRoom = index === 1;
      
      // 5% chance for treasure chest (only if first middle room)
      if (isFirstMiddleRoom && roll < 0.05) {
        return {
          ...room,
          enemy: null,
          roomType: 'treasure',
          treasureDescription: 'A frost-covered chest sits in the corner, its contents unknown...'
        };
      }
      
      // 10% chance for stat boost event (only if first middle room, 0.05-0.15)
      if (isFirstMiddleRoom && roll < 0.15) {
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
      
      // 15% chance for story/exploration (only if first middle room, 0.15-0.30)
      if (isFirstMiddleRoom && roll < 0.30) {
        return {
          ...room,
          enemy: null,
          roomType: 'story'
        };
      }
      
      // All other middle rooms: 100% combat
      // First middle room: 70% combat (0.30-1.00)
      const enemy = getRandomEnemy(playerLevel, false);
      return {
        ...room,
        enemy,
        roomType: 'battle'
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