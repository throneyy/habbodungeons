import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

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
    const { battleId, action, dice, itemName } = await req.json();
    const authHeader = req.headers.get('Authorization')!;
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    console.log(`Resolving turn for user: ${user.id}, action: ${action}, itemName: ${itemName || 'none'}`);

    // Check if user is in a server for this dungeon
    const { data: serverMember } = await supabase
      .from('server_players')
      .select('server_id, servers!inner(dungeon_id)')
      .eq('user_id', user.id)
      .eq('servers.dungeon_id', battleId)
      .maybeSingle();

    const serverId = serverMember?.server_id || null;
    console.log('User server status:', { serverId, hasServer: !!serverId });

    // Get battle state - check server battles first
    let battleRes;
    if (serverId) {
      // Server battle - query by server_id
      console.log('Looking for server battle with server_id:', serverId);
      battleRes = await supabase
        .from('battle_states')
        .select('*')
        .eq('dungeon_id', battleId)
        .eq('server_id', serverId)
        .eq('is_active', true)
        .maybeSingle();
    } else {
      // Solo battle - query by user_id
      console.log('Looking for solo battle with user_id:', user.id);
      battleRes = await supabase
        .from('battle_states')
        .select('*')
        .eq('dungeon_id', battleId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    }

    // Get player stats
    const statsRes = await supabase
      .from('player_stats')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const battle = battleRes.data;
    const stats = statsRes.data;

    if (!battle || !stats) {
      console.error('Battle or stats not found:', { battle: !!battle, stats: !!stats, serverId, userId: user.id });
      throw new Error("Battle or stats not found");
    }

    // For party/server battles, check if it's the player's turn
    const isPartyBattle = !!battle.party_id || !!battle.server_id;
    const deadPlayers = (battle.dead_players || []) as string[];
    
    // Check if current player is already dead
    if (isPartyBattle && deadPlayers.includes(user.id)) {
      return new Response(
        JSON.stringify({ error: "You are dead. Waiting for party members to continue..." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    if (isPartyBattle) {
      if (battle.current_turn_user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: "Not your turn" }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

    // Fetch equipped weapon
    const { data: equippedWeapon } = await supabase
      .from('inventory')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_equipped', true)
      .eq('item_type', 'weapon')
      .maybeSingle();

    console.log(`Equipped weapon: ${equippedWeapon?.item_name || 'none'}`);

    // Call AI for combat resolution with equipped weapon info
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
            content: `You are a JRPG combat engine. Calculate BOTH player and enemy actions in the same turn.
            
CRITICAL: The enemy ALWAYS counterattacks after the player acts (unless the enemy is defeated). 

DAMAGE FORMULA (USE THIS EXACTLY):
- Player damage = (playerATK + weaponBonus) × (diceSum / 3) - (enemyDEF / 4)
- Enemy damage = enemyATK × 1.2 - (playerDEF / 4)
- Minimum damage is always 1
- weaponBonus: Basic weapons = 5, Powerful weapons = 10, No weapon = 0

When the player attacks with a weapon, ALWAYS mention the weapon name in the narration by wrapping it like this: [WEAPON:weapon_name]

Output ONLY valid JSON (no markdown formatting) with: 
{
  playerDamageDealt: number,
  playerDamageTaken: number,
  enemyAction: string (describe what enemy did),
  playerNewHp: number,
  enemyNewHp: number,
  narration: string[] (2-4 lines describing both player action AND enemy counterattack, with weapon name wrapped as [WEAPON:name]),
  victory: boolean,
  defeat: boolean
}

Example narration with weapon: "You strike with your [WEAPON:Rusty Sword], dealing 15 damage!"

Keep narration exciting but brief. Always include enemy counterattack in narration unless enemy is defeated.`
          },
          {
            role: 'user',
            content: JSON.stringify({
              action,
              dice,
              equippedWeapon: equippedWeapon ? {
                name: equippedWeapon.item_name,
                type: equippedWeapon.item_type
              } : null,
              playerStats: {
                hp: stats.current_hp,
                mp: stats.current_mp,
                atk: stats.atk,
                def: stats.def,
                spd: stats.spd,
              },
              enemyStats: battle.current_enemy_state,
            })
          }
        ],
      }),
    });

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices[0].message.content;
    const cleanedContent = extractJSON(rawContent);
    const result = JSON.parse(cleanedContent);

    // If action was using an item, decrement it from inventory
    if (action === 'item' && itemName) {
      const { data: inventoryItem, error: inventoryError } = await supabase
        .from('inventory')
        .select('*')
        .eq('user_id', user.id)
        .eq('item_name', itemName)
        .maybeSingle();

      if (inventoryItem) {
        if (inventoryItem.quantity > 1) {
          // Decrement quantity
          await supabase
            .from('inventory')
            .update({ quantity: inventoryItem.quantity - 1 })
            .eq('id', inventoryItem.id);
          console.log(`Decremented ${itemName} quantity to ${inventoryItem.quantity - 1}`);
        } else {
          // Remove item if quantity is 1
          await supabase
            .from('inventory')
            .delete()
            .eq('id', inventoryItem.id);
          console.log(`Removed ${itemName} from inventory`);
        }
      } else {
        console.warn(`Item ${itemName} not found in user's inventory`);
      }
    }

    // Handle victory - award XP, loot, and check for level up
    let xpGained = 0;
    let leveledUp = false;
    let newLevel = stats.level;
    let xpMessages: string[] = [];
    let lootItems: Array<{ item_name: string; quantity: number; item_type: string }> = [];
    
    // Track dead players for party battles
    let updatedDeadPlayers = [...deadPlayers];
    let isEntirePartyDead = false;

    if (result.victory) {
      // Generate loot drops
      const enemyLevel = battle.current_enemy_state.level || 1;
      const lootTableBasic = [
        { name: 'Gold', type: 'currency', weight: 40 },
        { name: 'Silver', type: 'currency', weight: 30 },
        { name: 'Potion', type: 'consumable', weight: 20 },
        { name: 'Ether', type: 'consumable', weight: 15 },
        { name: 'Herb', type: 'consumable', weight: 15 },
        { name: 'Crystal Shards', type: 'material', weight: 10 },
        { name: 'Runestones', type: 'material', weight: 8 },
        { name: 'Scroll', type: 'consumable', weight: 7 },
        { name: 'Ancient Scroll', type: 'consumable', weight: 5 },
        { name: 'Tome', type: 'consumable', weight: 3 },
      ];

      // Number of loot drops increases with enemy level
      const numDrops = Math.min(1 + Math.floor(enemyLevel / 3), 4);
      
      for (let i = 0; i < numDrops; i++) {
        const totalWeight = lootTableBasic.reduce((sum, item) => sum + item.weight, 0);
        const random = Math.random() * totalWeight;
        let currentWeight = 0;
        
        for (const lootEntry of lootTableBasic) {
          currentWeight += lootEntry.weight;
          if (random <= currentWeight) {
            // Determine quantity based on item type
            let quantity = 1;
            if (lootEntry.type === 'currency') {
              quantity = Math.floor(10 + (enemyLevel * 5) + (Math.random() * 20));
            } else if (lootEntry.type === 'material') {
              quantity = Math.floor(1 + Math.random() * 3);
            }
            
            lootItems.push({
              item_name: lootEntry.name,
              quantity,
              item_type: lootEntry.type,
            });
            break;
          }
        }
      }

      // Add loot to player inventory
      for (const loot of lootItems) {
        // Check if item already exists in inventory
        const { data: existingItem } = await supabase
          .from('inventory')
          .select('*')
          .eq('user_id', user.id)
          .eq('item_name', loot.item_name)
          .maybeSingle();

        if (existingItem) {
          // Update quantity
          await supabase
            .from('inventory')
            .update({ quantity: existingItem.quantity + loot.quantity })
            .eq('id', existingItem.id);
        } else {
          // Insert new item
          await supabase
            .from('inventory')
            .insert({
              user_id: user.id,
              item_name: loot.item_name,
              item_type: loot.item_type,
              quantity: loot.quantity,
            });
        }
      }
      // Calculate XP based on enemy level relative to player level (traditional JRPG formula)
      const levelDiff = enemyLevel - stats.level;
      const baseXP = Math.floor(enemyLevel * enemyLevel * 8); // Base formula: level^2 * 8
      const diffMultiplier = Math.max(0.5, 1 + (levelDiff * 0.1)); // Bonus for higher level enemies
      xpGained = Math.floor(baseXP * diffMultiplier);
      
      const newXp = stats.current_xp + xpGained;
      const xpNeeded = stats.xp_to_next_level;
      
      xpMessages.push(`Gained ${xpGained} experience points.`);
      
      if (newXp >= xpNeeded) {
        // Level up!
        leveledUp = true;
        newLevel = stats.level + 1;
        const remainingXp = newXp - xpNeeded;
        // Traditional JRPG exponential curve: level^3 * 10
        const newXpNeeded = Math.floor(Math.pow(newLevel, 3) * 10);
        
        // Stat increases on level up (traditional JRPG growth)
        const hpIncrease = Math.floor(8 + (newLevel * 0.5)); // Scales with level
        const mpIncrease = Math.floor(4 + (newLevel * 0.3));
        const atkIncrease = Math.floor(1 + (newLevel % 3 === 0 ? 1 : 0)); // Extra point every 3 levels
        const defIncrease = Math.floor(1 + (newLevel % 3 === 0 ? 1 : 0));
        const spdIncrease = Math.floor(1 + (newLevel % 4 === 0 ? 1 : 0)); // Extra point every 4 levels
        
        await supabase
          .from('player_stats')
          .update({
            level: newLevel,
            current_xp: remainingXp,
            xp_to_next_level: newXpNeeded,
            max_hp: stats.max_hp + hpIncrease,
            current_hp: stats.max_hp + hpIncrease, // Full heal on level up
            max_mp: stats.max_mp + mpIncrease,
            current_mp: stats.max_mp + mpIncrease, // Full MP restore
            atk: stats.atk + atkIncrease,
            def: stats.def + defIncrease,
            spd: stats.spd + spdIncrease,
          })
          .eq('user_id', user.id);
        
        xpMessages.push(`Level up! ${stats.level} -> ${newLevel}`);
        xpMessages.push(`Max HP increased by ${hpIncrease}.`);
        xpMessages.push(`Max MP increased by ${mpIncrease}.`);
        if (atkIncrease > 0) xpMessages.push(`Attack increased by ${atkIncrease}.`);
        if (defIncrease > 0) xpMessages.push(`Defense increased by ${defIncrease}.`);
        if (spdIncrease > 0) xpMessages.push(`Speed increased by ${spdIncrease}.`);
        xpMessages.push(`HP and MP fully restored.`);
      } else {
        // Just update XP, no level up
        await supabase
          .from('player_stats')
          .update({
            current_xp: newXp,
            current_hp: result.playerNewHp,
          })
          .eq('user_id', user.id);
        
        xpMessages.push(`${newXp} / ${xpNeeded} EXP to next level.`);
      }
    } else {
      // No victory - check for defeat and handle respawn
      if (result.defeat) {
        if (isPartyBattle) {
          // In party battles, mark player as dead but keep HP at 0
          if (!updatedDeadPlayers.includes(user.id)) {
            updatedDeadPlayers.push(user.id);
          }
          
          await supabase
            .from('player_stats')
            .update({ current_hp: 0 })
            .eq('user_id', user.id);
          
          xpMessages.push(`You have been defeated!`);
          xpMessages.push(`Waiting for party members to continue...`);
          
          // Check if entire party is dead
          const turnOrder = battle.turn_order as string[];
          isEntirePartyDead = turnOrder.every(playerId => updatedDeadPlayers.includes(playerId));
          
          if (isEntirePartyDead) {
            xpMessages.push(`The entire party has been wiped out!`);
            // Restore all players to 50% HP/MP
            const supabaseAdmin = createClient(
              Deno.env.get('SUPABASE_URL') ?? '',
              Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            );
            
            for (const playerId of turnOrder) {
              const { data: playerStats } = await supabaseAdmin
                .from('player_stats')
                .select('max_hp, max_mp')
                .eq('user_id', playerId)
                .single();
              
              if (playerStats) {
                await supabaseAdmin
                  .from('player_stats')
                  .update({
                    current_hp: Math.floor(playerStats.max_hp * 0.5),
                    current_mp: Math.floor(playerStats.max_mp * 0.5),
                  })
                  .eq('user_id', playerId);
              }
            }
            
            // Clear dead players list since everyone is being revived
            updatedDeadPlayers = [];
          }
        } else {
          // Solo battle - restore to 50% HP/MP and end battle
          const respawnHp = Math.floor(stats.max_hp * 0.5);
          const respawnMp = Math.floor(stats.max_mp * 0.5);
          
          await supabase
            .from('player_stats')
            .update({ 
              current_hp: respawnHp,
              current_mp: respawnMp 
            })
            .eq('user_id', user.id);
          
          xpMessages.push(`You were defeated and retreated to town...`);
          xpMessages.push(`HP and MP restored to 50%.`);
        }
      } else {
        // Just update HP if not defeated
        await supabase
          .from('player_stats')
          .update({ current_hp: result.playerNewHp })
          .eq('user_id', user.id);
      }
    }

    // Get dungeon info to check for room progression
    const { data: dungeon } = await supabase
      .from('dungeons')
      .select('dungeon_json')
      .eq('id', battleId)
      .single();

    const dungeonData = dungeon?.dungeon_json as any;
    const totalRooms = dungeonData?.rooms?.length || 0;
    let newRoomIndex = battle.current_room_index;

    // Update battle state - handle room progression on victory
    let updatedEnemy = {
      ...battle.current_enemy_state,
      current_hp: result.enemyNewHp,
      mode: result.victory ? "story" : "battle", // Switch to story mode after victory
    };

    // If victory, revive dead party members with 5 HP and check room progression
    if (result.victory) {
      // Revive dead party members with 5 HP
      if (isPartyBattle && updatedDeadPlayers.length > 0) {
        for (const deadPlayerId of updatedDeadPlayers) {
          await supabase
            .from('player_stats')
            .update({ current_hp: 5 })
            .eq('user_id', deadPlayerId);
        }
        updatedDeadPlayers = []; // Clear dead players list
        xpMessages.push(`Fallen party members have been revived with 5 HP!`);
      }
      
      newRoomIndex = battle.current_room_index + 1;
      console.log(`Victory! Room progression: ${battle.current_room_index} -> ${newRoomIndex} (totalRooms: ${totalRooms})`);
      
      if (newRoomIndex < totalRooms) {
        // Load next room's enemy
        console.log(`Loading next room ${newRoomIndex}`);
        const nextRoom = dungeonData.rooms[newRoomIndex];
        updatedEnemy = {
          ...nextRoom.enemy,
          current_hp: nextRoom.enemy.hp,
          max_hp: nextRoom.enemy.hp,
          mode: "story",
          status_effects: [],
        };
      } else {
        // Quest complete - mark battle as inactive
        console.log(`Quest complete! Final room reached. Battle will be marked inactive.`);
        newRoomIndex = totalRooms - 1; // Stay at last valid room index
      }
    }

    // Get user profile for dice roll log
    const { data: profile } = await supabase
      .from('profiles')
      .select('habbo_username, username')
      .eq('id', user.id)
      .single();

    const diceSum = dice.reduce((sum: number, d: number) => sum + d, 0);
    const diceRollMessage = `${profile?.habbo_username || profile?.username || 'You'} rolled ${dice.join(' + ')} = ${diceSum} for ${action}!`;

    // Format loot messages with items in brackets
    const lootMessages: string[] = [];
    if (result.victory && lootItems.length > 0) {
      for (const loot of lootItems) {
        lootMessages.push(`Received ${loot.quantity}x [${loot.item_name}]`);
      }
    }

    const updatedLog = [
      ...(battle.battle_log || []),
      { user_id: user.id, message: diceRollMessage, type: 'dice_roll' },
      ...result.narration.map((msg: string) => ({ user_id: user.id, message: msg })),
      ...xpMessages.map((msg: string) => ({ user_id: user.id, message: msg })),
      ...lootMessages.map((msg: string) => ({ user_id: user.id, message: msg }))
    ];

    // Calculate next turn for party/server battles
    let nextTurnUserId = battle.current_turn_user_id;
    if (isPartyBattle && battle.turn_order && !isEntirePartyDead) {
      const turnOrder = battle.turn_order as string[];
      const alivePlayers = turnOrder.filter(id => !updatedDeadPlayers.includes(id));
      
      if (result.victory && newRoomIndex < totalRooms) {
        // Reset to first alive player for new room
        nextTurnUserId = alivePlayers[0] || turnOrder[0];
        console.log(`Victory! Resetting turn to first alive player: ${nextTurnUserId}`);
      } else if (!result.victory && alivePlayers.length > 0) {
        // Normal turn rotation during combat - skip dead players
        const currentIndex = alivePlayers.indexOf(user.id);
        const nextIndex = (currentIndex + 1) % alivePlayers.length;
        nextTurnUserId = alivePlayers[nextIndex];
        console.log(`Advancing turn from ${user.id} to ${nextTurnUserId} (skipping dead players)`);
      }
    }

    await supabase
      .from('battle_states')
      .update({
        current_enemy_state: updatedEnemy,
        battle_log: updatedLog,
        current_room_index: newRoomIndex,
        current_turn_user_id: nextTurnUserId,
        dead_players: updatedDeadPlayers,
        is_active: !(isPartyBattle ? isEntirePartyDead : result.defeat) && newRoomIndex < totalRooms, // Mark inactive if entire party defeated or quest complete
      })
      .eq('id', battle.id);

    // Reload battle data
    const { data: updatedStats } = await supabase
      .from('player_stats')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const battleData = {
      enemy: updatedEnemy,
      player: {
        level: updatedStats.level,
        current_hp: updatedStats.current_hp,
        max_hp: updatedStats.max_hp,
        current_mp: updatedStats.current_mp,
        max_mp: updatedStats.max_mp,
        atk: updatedStats.atk,
        def: updatedStats.def,
        spd: updatedStats.spd,
        status_effects: updatedStats.status_effects || [],
        current_xp: updatedStats.current_xp || 0,
        xp_to_next_level: updatedStats.xp_to_next_level || 100,
      },
      room_description: "Combat continues...",
      battle_log: updatedLog,
      mode: updatedEnemy.mode || "battle",
    };

    return new Response(
      JSON.stringify({
        battleData,
        victory: result.victory,
        defeat: isPartyBattle ? isEntirePartyDead : result.defeat, // Only send defeat if entire party is dead
        playerDied: result.defeat, // Indicate if THIS player died
        playerDamageDealt: result.playerDamageDealt,
        enemyDamageDealt: result.playerDamageTaken,
        lootItems: result.victory ? lootItems : [],
        xpGained: result.victory ? xpGained : 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error resolving turn:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});