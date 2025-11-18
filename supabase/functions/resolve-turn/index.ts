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

    // Get battle, player stats, and equipped weapon
    const [battleRes, statsRes] = await Promise.all([
      supabase
        .from('battle_states')
        .select('*')
        .eq('dungeon_id', battleId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('player_stats')
        .select('*')
        .eq('user_id', user.id)
        .single(),
    ]);

    const battle = battleRes.data;
    const stats = statsRes.data;

    if (!battle || !stats) throw new Error("Battle or stats not found");

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

When the player attacks with a weapon, ALWAYS mention the weapon name in the narration by wrapping it like this: [WEAPON:weapon_name]

Factor in equipped weapon for damage calculation. Output ONLY valid JSON (no markdown formatting) with: 
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

Use dice sum for attack variance. Keep narration exciting but brief. Always include enemy counterattack in narration unless enemy is defeated.`
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

    // Handle victory - award XP and check for level up
    let xpGained = 0;
    let leveledUp = false;
    let newLevel = stats.level;
    let xpMessages: string[] = [];

    if (result.victory) {
      // Calculate XP based on enemy level relative to player level (traditional JRPG formula)
      const enemyLevel = battle.current_enemy_state.level || 1;
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
        // Soft defeat: Restore 50% HP and MP, player respawns at town
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
      } else {
        // Just update HP if not defeated
        await supabase
          .from('player_stats')
          .update({ current_hp: result.playerNewHp })
          .eq('user_id', user.id);
      }
    }

    // Update battle state
    const updatedEnemy = {
      ...battle.current_enemy_state,
      current_hp: result.enemyNewHp,
      mode: result.victory ? "story" : "battle", // Switch to story mode after victory
    };

    // Get user profile for dice roll log
    const { data: profile } = await supabase
      .from('profiles')
      .select('habbo_username, username')
      .eq('id', user.id)
      .single();

    const diceSum = dice.reduce((sum: number, d: number) => sum + d, 0);
    const diceRollMessage = `${profile?.habbo_username || profile?.username || 'You'} rolled ${dice.join(' + ')} = ${diceSum} for ${action}!`;

    const updatedLog = [
      ...(battle.battle_log || []),
      { user_id: user.id, message: diceRollMessage, type: 'dice_roll' },
      ...result.narration.map((msg: string) => ({ user_id: user.id, message: msg })),
      ...xpMessages.map((msg: string) => ({ user_id: user.id, message: msg }))
    ];

    await supabase
      .from('battle_states')
      .update({
        current_enemy_state: updatedEnemy,
        battle_log: updatedLog,
        is_active: !result.defeat, // Only end on defeat, not victory
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
        defeat: result.defeat,
        playerDamageDealt: result.playerDamageDealt,
        enemyDamageDealt: result.playerDamageTaken,
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