import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { battleId, action, dice } = await req.json();
    const authHeader = req.headers.get('Authorization')!;
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Get battle and player stats
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

    // Call AI for combat resolution
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
            content: `You are a JRPG combat engine. Calculate turn outcomes based on stats and dice rolls. Output JSON with: {playerDamageDealt, playerDamageTaken, enemyAction, playerNewHp, enemyNewHp, narration: string[], victory: boolean, defeat: boolean}. Use dice sum for attack variance. Keep narration exciting but brief (2-3 lines).`
          },
          {
            role: 'user',
            content: JSON.stringify({
              action,
              dice,
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
    const result = JSON.parse(aiData.choices[0].message.content);

    // Update player stats
    await supabase
      .from('player_stats')
      .update({ current_hp: result.playerNewHp })
      .eq('user_id', user.id);

    // Update battle state
    const updatedEnemy = {
      ...battle.current_enemy_state,
      current_hp: result.enemyNewHp,
    };

    const updatedLog = [...(battle.battle_log || []), ...result.narration];

    await supabase
      .from('battle_states')
      .update({
        current_enemy_state: updatedEnemy,
        battle_log: updatedLog,
        is_active: !result.victory && !result.defeat,
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
      },
      room_description: "Combat continues...",
      battle_log: updatedLog,
    };

    return new Response(
      JSON.stringify({
        battleData,
        victory: result.victory,
        defeat: result.defeat,
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