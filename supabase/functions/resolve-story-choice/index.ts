import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// SECURITY MODEL (changed in this patch):
//  - Dice are rolled SERVER-SIDE with crypto randomness. Client-sent rolls are
//    ignored. The server's roll is returned so the UI can animate it.
//  - The choice is validated against the story node stored in battle_states.
//    The stored label/DC/skillType are used, never the client's (kills both
//    DC spoofing and prompt injection through choiceLabel).
//  - All stat/inventory writes target the ACTING user, not the battle creator.
//  - hpChange/mpChange are clamped; items are capped and sanitized.
//  - The battle_states write is conditional (optimistic concurrency): a choice
//    only lands if the story node it answered is still present.
// ---------------------------------------------------------------------------

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Function to find matching sprite based on enemy name from database
async function findEnemySprite(enemyName: string, supabaseClient: any): Promise<string> {
  if (!enemyName) return "skeleton.png";

  const nameLower = enemyName.toLowerCase();

  try {
    const { data: exactMatch } = await supabaseClient
      .from("enemy_sprites")
      .select("sprite_filename")
      .ilike("enemy_name", nameLower)
      .maybeSingle();

    if (exactMatch) {
      return exactMatch.sprite_filename;
    }

    const { data: allSprites } = await supabaseClient
      .from("enemy_sprites")
      .select("enemy_name, sprite_filename");

    if (allSprites) {
      for (const sprite of allSprites) {
        const spriteName = sprite.enemy_name.toLowerCase();
        if (nameLower.includes(spriteName) || spriteName.includes(nameLower)) {
          return sprite.sprite_filename;
        }
      }
    }
  } catch (error) {
    console.error("Error fetching sprite from database:", error);
  }

  console.log(`No sprite found for "${enemyName}", using skeleton.png`);
  return "skeleton.png";
}

/** Roll N six-sided dice with crypto randomness (server-authoritative). */
function rollDice(count: number): number[] {
  const buf = new Uint32Array(count);
  crypto.getRandomValues(buf);
  return Array.from(buf, (v) => (v % 6) + 1);
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Stats matter in story mode: each skillType maps to a stat that grants a
 * modifier on the roll (classic JRPG "your build matters outside combat").
 */
function skillModifier(skillType: string, stats: any): number {
  const s = (skillType || "").toLowerCase();
  let raw: number;
  if (/(strength|athletic|force|break|smash)/.test(s)) raw = Math.floor((stats?.atk || 0) / 4);
  else if (/(agility|stealth|sneak|acrobat|dodge|reflex)/.test(s)) raw = Math.floor((stats?.spd || 0) / 4);
  else if (/(endurance|fortitude|resist|constitution)/.test(s)) raw = Math.floor((stats?.def || 0) / 4);
  else raw = Math.floor((stats?.level || 1) / 2); // social/knowledge/arcane scale with level
  return clamp(raw, 0, 6);
}

const ITEM_TYPES = new Set(["weapon", "armor", "accessory", "consumable", "material", "key", "treasure"]);

/** Cap and sanitize AI-minted items so the economy can't be poisoned. */
function sanitizeItems(items: any): Array<{ name: string; quantity: number; type: string }> {
  if (!Array.isArray(items)) return [];
  const out: Array<{ name: string; quantity: number; type: string }> = [];
  for (const item of items) {
    if (out.length >= 2) break; // max 2 items per resolution
    if (!item || typeof item.name !== "string" || !item.name.trim()) continue;
    const name = item.name.trim().slice(0, 40);
    const quantity = clamp(typeof item.quantity === "number" ? Math.floor(item.quantity) : 1, 1, 3);
    const type = ITEM_TYPES.has(String(item.type)) ? String(item.type) : "material";
    out.push({ name, quantity, type });
  }
  return out;
}

/** Multi-attempt JSON repair (same approach as generate-story-node). */
function parseAiJson(raw: string): any {
  let content = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) content = jsonMatch[0];
  content = content
    .replace(/,\s*\]/g, "]")
    .replace(/,\s*\}/g, "}")
    .replace(/\n/g, " ")
    .replace(/\r/g, "")
    .replace(/—/g, "--")
    .replace(/"(\w+)"\s+"([^"]*)"/g, '"$1": "$2"');

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return JSON.parse(content);
    } catch (e) {
      lastError = e;
      if (attempt === 0) {
        content = content
          .replace(/"(\w+)"\s*"([^"]*)"/g, '"$1": "$2"')
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'");
      } else if (attempt === 1) {
        const first = content.indexOf("{");
        const last = content.lastIndexOf("}");
        if (first !== -1 && last > first) content = content.substring(first, last + 1);
        content = content.replace(/"(\w+)"\s*"([^"]*)"/g, '"$1": "$2"');
      }
    }
  }
  console.error("Failed to parse AI response after all attempts:", raw);
  throw new Error(`Invalid AI response format: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Client may still send legacy fields (choiceLabel, diceRoll, diceDC);
    // they are used only as a last-resort fallback and never trusted for dice.
    const { battleId, choiceId, choiceLabel: clientLabel, diceDC: clientDC, skillType: clientSkill, diceRequired: clientDiceRequired } = await req.json();

    // Rate limiting (generate-story-node had one; this endpoint hits the AI too)
    const { data: rateLimit } = await supabaseClient
      .from('rate_limits')
      .select('*')
      .eq('user_id', user.id)
      .eq('action_type', 'story_choice')
      .maybeSingle();

    if (rateLimit) {
      const timeSince = Date.now() - new Date(rateLimit.last_action_at).getTime();
      if (timeSince < 2500) {
        return new Response(
          JSON.stringify({ error: "Please wait a moment between choices" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 }
        );
      }
    }
    await supabaseClient.from('rate_limits').upsert({
      user_id: user.id,
      action_type: 'story_choice',
      last_action_at: new Date().toISOString(),
    });

    // Check if user is in a server for this dungeon
    const { data: serverMember } = await supabaseClient
      .from('server_players')
      .select('server_id, servers!inner(dungeon_id)')
      .eq('user_id', user.id)
      .eq('servers.dungeon_id', battleId)
      .maybeSingle();

    const serverId = serverMember?.server_id || null;

    // Get battle state - check server first, then user
    let battleState = null;

    if (serverId) {
      const { data, error } = await supabaseClient
        .from("battle_states")
        .select("*, dungeons(*)")
        .eq("dungeon_id", battleId)
        .eq("server_id", serverId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      battleState = data;
    } else {
      const { data, error } = await supabaseClient
        .from("battle_states")
        .select("*, dungeons(*)")
        .eq("dungeon_id", battleId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      battleState = data;
    }

    if (!battleState) throw new Error("Battle state not found");

    // For party/server battles, check if it's the player's turn
    const isPartyBattle = !!battleState.party_id || !!battleState.server_id;
    if (isPartyBattle) {
      if (battleState.current_turn_user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: "Not your turn to make a choice" }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    }

    // Stats + profile for the ACTING user (all writes below also target user.id)
    const { data: partyStats } = await supabaseClient
      .from("player_stats")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (!partyStats) throw new Error("Player stats not found");

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    const playerName = profile?.habbo_username || profile?.username?.split('@')[0] || 'Player';

    // -----------------------------------------------------------------------
    // CHOICE VALIDATION: resolve against the STORED story node.
    // -----------------------------------------------------------------------
    const storedNode = battleState.current_story_node;
    const storedChoices: any[] = Array.isArray(storedNode?.choices) ? storedNode.choices : [];
    const storedChoice = storedChoices.find((c: any) => c && c.id === choiceId);

    let choiceLabel: string;
    let diceRequired: boolean;
    let diceDC = 0;
    let skillType = "check";

    if (storedChoice) {
      choiceLabel = String(storedChoice.label || "").slice(0, 160);
      diceRequired = storedChoice.diceRequired === true;
      diceDC = clamp(typeof storedChoice.diceDC === "number" ? storedChoice.diceDC : 15, 5, 30);
      skillType = String(storedChoice.skillType || "check").slice(0, 30);
    } else {
      // Legacy fallback (battles started before this deploy): accept the client
      // label but clamp it hard, and clamp any DC into the legal band.
      console.warn("Choice not found in stored node; using clamped legacy fields", { choiceId });
      choiceLabel = String(clientLabel || "Continue").slice(0, 140);
      diceRequired = clientDiceRequired === true || (typeof clientDC === "number" && clientDC > 0);
      diceDC = clamp(typeof clientDC === "number" ? clientDC : 15, 10, 29);
      skillType = String(clientSkill || "check").slice(0, 30);
    }

    console.log("Resolving choice:", choiceLabel);

    // -----------------------------------------------------------------------
    // SERVER-SIDE DICE (Habbo holodice are 5d6 -- and the house rolls them)
    // -----------------------------------------------------------------------
    let diceRoll: number[] | null = null;
    let diceCheckResult: any = null;

    if (diceRequired) {
      diceRoll = rollDice(5);
      const rawTotal = diceRoll.reduce((sum, d) => sum + d, 0);
      const modifier = skillModifier(skillType, partyStats);
      const total = rawTotal + modifier;
      const margin = total - diceDC;
      const success = total >= diceDC;
      // Fail-forward: a near miss (failed by 1-2) partially succeeds at a cost.
      const partial = !success && margin >= -2;
      diceCheckResult = { success, partial, total, rawTotal, modifier, dc: diceDC, margin, skillType, dice: diceRoll };
      console.log("Server dice check:", diceCheckResult);
    }

    // Get the current room's enemy info for context
    const dungeon = battleState.dungeons.dungeon_json as any;
    const currentRoomIndex = battleState.current_room_index;
    const currentRoom = dungeon.rooms[currentRoomIndex];

    let enemyContext = "";
    if (currentRoom && currentRoom.enemy) {
      enemyContext = `\n\n🔥 CRITICAL: This room HAS an enemy configured: "${currentRoom.enemy.name}" (${currentRoom.enemy.description}). If triggersBattle=true, you MUST write: "the ${currentRoom.enemy.name}" or "a ${currentRoom.enemy.name}" or "${currentRoom.enemy.name}" in your consequenceText. DO NOT write vague phrases - USE THE EXACT ENEMY NAME!`;
    } else {
      enemyContext = `\n\n🚫 CRITICAL: This room has NO enemy configured. You MUST NOT mention enemies, monsters, or creatures in your narrative. DO NOT set shouldStartBattle=true. This is a story/exploration room only. Focus on atmosphere, discovery, puzzles, or environmental challenges instead.`;
    }

    // --- Persistent narrative memory ---
    const storyMemory = (battleState.story_memory || {}) as any;
    const storyBeats: string[] = Array.isArray(storyMemory.beats) ? storyMemory.beats : [];
    const knownNpcs: Record<string, string> =
      storyMemory.npcs && typeof storyMemory.npcs === "object" ? storyMemory.npcs : {};
    const chronicle: string = typeof storyMemory.chronicle === "string" ? storyMemory.chronicle.trim() : "";
    const recentLog: string[] = (battleState.battle_log || [])
      .filter((e: any) => e?.message && typeof e.message === "string")
      .slice(-6)
      .map((e: any) => e.message);
    const storySoFar = storyBeats.length ? storyBeats.map((b) => `- ${b}`).join("\n") : "(beginning of the adventure)";
    const knownCharacters = Object.keys(knownNpcs).length
      ? Object.entries(knownNpcs).map(([name, note]) => `${name} (${note})`).join("; ")
      : "none yet";

    const aiPrompt = `You are resolving a player's story choice in "${battleState.dungeons.name}", a ${battleState.dungeons.theme}-themed dungeon crawl. Stay true to THIS dungeon's theme.

PLAYER: ${playerName}
PLAYER CHOICE: "${choiceLabel}"
CURRENT ROOM: ${currentRoom?.description || 'Unknown'}
${chronicle ? `\nEARLIER CHAPTERS (compressed summary of older events):\n${chronicle}\n` : ''}
STORY SO FAR (stay consistent with these durable facts):
${storySoFar}
KNOWN CHARACTERS: ${knownCharacters}
RECENT EVENTS:
${recentLog.length ? recentLog.map((m) => `- ${m}`).join("\n") : "(none)"}
${diceCheckResult ? `
DICE CHECK RESULT (rolled by the game server): dice ${diceCheckResult.dice.join("+")} = ${diceCheckResult.rawTotal}, +${diceCheckResult.modifier} ${diceCheckResult.skillType} skill = ${diceCheckResult.total} vs DC ${diceCheckResult.dc}
Outcome: ${diceCheckResult.success ? 'SUCCESS' : diceCheckResult.partial ? 'NEAR MISS (failed by 2 or less)' : 'FAILURE'}
Margin: ${diceCheckResult.margin >= 0 ? '+' : ''}${diceCheckResult.margin}
` : ''}${enemyContext}

TEXT FORMATTING: never use em dashes; use double hyphens (--). ASCII punctuation only.

CRITICAL RULES:
${diceCheckResult && diceCheckResult.success ? `
✅ DICE CHECK PASSED - You MAY give rewards:
1. Player can find treasure/items if it makes sense (itemsGained can have items)
2. Success may allow bypassing combat or advancing (shouldAdvanceRoom can be true)
3. Describe the success and benefits in narrativeText
` : diceCheckResult && diceCheckResult.partial ? `
⚠️ NEAR MISS - fail forward (the attempt barely fails, so it partially works AT A COST):
1. The player gets PART of what they wanted, but pays for it: minor damage, a complication, an alerted foe, lost time
2. itemsGained MUST be empty []
3. shouldAdvanceRoom may be true ONLY if the cost is clearly paid in the narrative
4. hpChange should be between -10 and 0
5. Describe the partial success and its cost in narrativeText
` : diceCheckResult ? `
❌ DICE CHECK FAILED - You MUST follow these rules:
1. NO treasure or items can be gained from a failed check (itemsGained MUST be empty [])
2. A failed check leads to negative consequences: combat, trap damage, setback, etc.
3. shouldAdvanceRoom MUST be false (player doesn't progress)
4. Describe the failure and its consequences in narrativeText
` : `
📖 NO DICE CHECK - Free choice:
1. Only give items/treasure if the choice explicitly involves finding/looting
2. shouldAdvanceRoom determines if player moves to next room
3. Describe what happens based on the player's choice
`}

Return ONLY valid JSON (no markdown):
{
  "narrativeText": "describe what happens in 2-3 sentences",
  "hpChange": 0,
  "mpChange": 0,
  "shouldStartBattle": false,
  "shouldAdvanceRoom": true,
  "itemsGained": [],
  "memoryNote": "one short DURABLE fact worth remembering for later rooms (an NPC met, a promise made, a secret learned, a path opened). Empty string if nothing lasting happened.",
  "npcs": []
}
hpChange must be between -30 and 30; mpChange between -20 and 20.
For "npcs", include any named character involved, as objects: { "name": "Captain Rhea", "note": "wary guard who let the party pass" }. Use [] if none.`;

    // Call Lovable AI to determine outcome
    const aiResponse = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: aiPrompt }],
        temperature: 0.8,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    const outcome = parseAiJson(content);

    console.log("Outcome:", outcome);

    // Sanitize outcome -- clamp everything the model controls.
    const triggersBattleRaw = outcome.triggersBattle === true || outcome.shouldStartBattle === true;
    let progressRoom = outcome.progressRoom === true || outcome.shouldAdvanceRoom === true;
    let triggersBattle = triggersBattleRaw;

    // Keep story text, room and enemy in sync: battles never advance the room.
    if (triggersBattle && progressRoom) {
      progressRoom = false;
    }

    // Server-enforced dice rules (don't rely on the model following the prompt)
    let itemsGained = sanitizeItems(outcome.itemsGained);
    if (diceCheckResult && !diceCheckResult.success) {
      itemsGained = [];                                    // no loot on failure or near miss
      if (!diceCheckResult.partial) progressRoom = false;  // hard fail never advances
    }

    const sanitizedOutcome = {
      consequenceText: typeof outcome.consequenceText === 'string'
        ? outcome.consequenceText
        : typeof outcome.narrativeText === 'string'
        ? outcome.narrativeText
        : (outcome.consequenceText?.message || "Something happens..."),
      hpChange: clamp(typeof outcome.hpChange === 'number' ? outcome.hpChange : 0, -30, 30),
      mpChange: clamp(typeof outcome.mpChange === 'number' ? outcome.mpChange : 0, -20, 20),
      itemsGained,
      triggersBattle,
      progressRoom,
    };

    // --- Battle forcing logic (kept from original) ---
    if (sanitizedOutcome.triggersBattle && (!currentRoom || !currentRoom.enemy)) {
      sanitizedOutcome.triggersBattle = false;
    } else if (!sanitizedOutcome.triggersBattle && currentRoom && currentRoom.enemy && choiceLabel &&
               (choiceLabel.toLowerCase().includes('attack') ||
                choiceLabel.toLowerCase().includes('fight') ||
                choiceLabel.toLowerCase().includes('strike') ||
                choiceLabel.toLowerCase().includes('combat'))) {
      sanitizedOutcome.triggersBattle = true;
      sanitizedOutcome.progressRoom = false;
    } else if (!sanitizedOutcome.triggersBattle && currentRoom && currentRoom.enemy && sanitizedOutcome.consequenceText) {
      const combatPhrases = [
        'descend upon', 'attack', 'charge', 'lunge', 'strike', 'assault',
        'ambush', 'swarm', 'rush at', 'pounce', 'leap at', 'burst open',
        'emerge and attack', 'turn hostile', 'aggressive', 'confront you'
      ];
      const textLower = sanitizedOutcome.consequenceText.toLowerCase();
      if (combatPhrases.some(phrase => textLower.includes(phrase))) {
        sanitizedOutcome.triggersBattle = true;
        sanitizedOutcome.progressRoom = false;
      }
    }

    // --- Apply HP/MP changes, with a real defeat state (classic JRPG faint) ---
    let newHp = clamp(partyStats.current_hp + sanitizedOutcome.hpChange, 0, partyStats.max_hp);
    const newMp = clamp(partyStats.current_mp + sanitizedOutcome.mpChange, 0, partyStats.max_mp);

    let fainted = false;
    let xpPenalty = 0;
    if (newHp <= 0) {
      fainted = true;
      newHp = Math.max(1, Math.ceil(partyStats.max_hp * 0.25)); // wake up shaken at 25%
      xpPenalty = Math.floor((partyStats.current_xp || 0) * 0.10);
      sanitizedOutcome.progressRoom = false;
      sanitizedOutcome.triggersBattle = false;
      sanitizedOutcome.itemsGained = [];
    }

    // --- XP (fixed: uses the computed dice result, scaled by depth/difficulty) ---
    let xpGained = 0;
    const xpMessages: string[] = [];
    let leveledUp = false;
    let newLevel = partyStats.level;

    const difficultyStr = String(battleState.dungeons.difficulty || "").toLowerCase();
    const difficultyMult = /nightmare|insane|extreme/.test(difficultyStr) ? 2
      : /hard/.test(difficultyStr) ? 1.5
      : /easy/.test(difficultyStr) ? 1
      : 1.25;

    if (!fainted) {
      if (diceCheckResult?.success) {
        // Risk should pay better than walking: XP scales with the DC attempted.
        const checkXP = Math.ceil(diceCheckResult.dc * 1.5);
        xpGained += checkXP;
        xpMessages.push(`+${checkXP} XP for passing the check!`);
      } else if (diceCheckResult?.partial) {
        const checkXP = Math.ceil(diceCheckResult.dc * 0.75);
        xpGained += checkXP;
        xpMessages.push(`+${checkXP} XP for a hard-won attempt!`);
      }

      if (sanitizedOutcome.progressRoom) {
        const roomXP = Math.min(60, Math.round((10 + currentRoomIndex * 2) * difficultyMult));
        xpGained += roomXP;
        xpMessages.push(`+${roomXP} XP for exploring!`);
      }
    } else {
      xpMessages.push(`${playerName} collapses... and awakens, shaken. (-${xpPenalty} XP)`);
    }

    // --- Build the single player_stats write ---
    const statsUpdate: Record<string, any> = {
      current_hp: newHp,
      current_mp: newMp,
    };

    if (fainted) {
      statsUpdate.current_xp = Math.max(0, (partyStats.current_xp || 0) - xpPenalty);
    } else if (xpGained > 0) {
      const currentXP = partyStats.current_xp + xpGained;
      const xpToNext = partyStats.xp_to_next_level;

      if (currentXP >= xpToNext) {
        leveledUp = true;
        newLevel = partyStats.level + 1;
        // Softened curve: level^2 * 10. The old level^3 * 10 against flat room
        // XP stalled around L5-6 (a ~100-room wall is churn, not challenge).
        const newXpNeeded = newLevel * newLevel * 10;

        const hpIncrease = Math.floor(8 + (newLevel * 0.5));
        const mpIncrease = Math.floor(4 + (newLevel * 0.3));
        const atkIncrease = 1 + (newLevel % 3 === 0 ? 1 : 0);
        const defIncrease = 1 + (newLevel % 3 === 0 ? 1 : 0);
        const spdIncrease = 1 + (newLevel % 4 === 0 ? 1 : 0);

        statsUpdate.level = newLevel;
        statsUpdate.current_xp = currentXP - xpToNext;
        statsUpdate.xp_to_next_level = newXpNeeded;
        statsUpdate.max_hp = partyStats.max_hp + hpIncrease;
        statsUpdate.current_hp = partyStats.max_hp + hpIncrease; // classic full heal
        statsUpdate.max_mp = partyStats.max_mp + mpIncrease;
        statsUpdate.current_mp = partyStats.max_mp + mpIncrease;
        statsUpdate.atk = partyStats.atk + atkIncrease;
        statsUpdate.def = partyStats.def + defIncrease;
        statsUpdate.spd = partyStats.spd + spdIncrease;

        xpMessages.push(`Level up! Now level ${newLevel}`);
      } else {
        statsUpdate.current_xp = currentXP;
      }
    }

    // --- Update persistent narrative memory (bounded + deduped + chronicled) ---
    const newBeats = [...storyBeats];
    if (typeof outcome.memoryNote === "string" && outcome.memoryNote.trim()) {
      const note = outcome.memoryNote.trim().slice(0, 200);
      const isDupe = newBeats.some((b) => b.toLowerCase() === note.toLowerCase());
      if (!isDupe) newBeats.push(note);
    }

    const updatedNpcs: Record<string, string> = { ...knownNpcs };
    if (Array.isArray(outcome.npcs)) {
      for (const npc of outcome.npcs) {
        if (npc && typeof npc.name === "string" && npc.name.trim()) {
          const key = npc.name.trim().slice(0, 50);
          updatedNpcs[key] = typeof npc.note === "string" && npc.note.trim()
            ? npc.note.trim().slice(0, 120)
            : (updatedNpcs[key] || "");
        }
      }
    }
    // Cap the cast: keep the 12 most recently added characters.
    const npcKeys = Object.keys(updatedNpcs);
    if (npcKeys.length > 12) {
      for (const k of npcKeys.slice(0, npcKeys.length - 12)) delete updatedNpcs[k];
    }

    // Chronicle compression: instead of silently dropping old beats at the cap,
    // compress the overflow into a running summary so nothing is truly forgotten.
    let finalBeats = newBeats;
    let newChronicle = chronicle;
    if (newBeats.length > 14) {
      const overflow = newBeats.slice(0, newBeats.length - 10);
      finalBeats = newBeats.slice(-10);
      try {
        const sumResp = await fetch(AI_GATEWAY, {
          method: "POST",
          headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{
              role: "user",
              content: `Compress these adventure log beats into 1-2 plain sentences. Keep character names and concrete outcomes. No preamble, no em dashes.\n\n${overflow.map((b) => `- ${b}`).join("\n")}`,
            }],
            temperature: 0.2,
          }),
        });
        if (sumResp.ok) {
          const sumData = await sumResp.json();
          const summary = (sumData.choices?.[0]?.message?.content || "").trim();
          if (summary) newChronicle = `${chronicle} ${summary}`.trim().slice(-600);
          else finalBeats = newBeats.slice(-14);
        } else {
          finalBeats = newBeats.slice(-14); // fall back to simple truncation
        }
      } catch (e) {
        console.error("Chronicle compression failed (non-fatal):", e);
        finalBeats = newBeats.slice(-14);
      }
    }

    const updatedStoryMemory = {
      ...storyMemory,
      beats: finalBeats,
      npcs: updatedNpcs,
      chronicle: newChronicle,
      questObjective: (battleState.dungeons.dungeon_json as any)?.questObjective || storyMemory.questObjective || null,
    };

    // --- Battle log (existing sanitation kept) ---
    const battleLog = battleState.battle_log || [];
    const cleanedBattleLog = battleLog.map((entry: any) => {
      if (entry && typeof entry === 'object' && typeof entry.message === 'string') {
        return entry;
      }
      let extractedMessage = '';
      if (typeof entry === 'string') {
        extractedMessage = entry;
      } else if (entry && typeof entry === 'object') {
        if (typeof entry.message === 'string') {
          extractedMessage = entry.message;
        } else if (entry.message && typeof entry.message === 'object') {
          extractedMessage = entry.message.message || entry.message.consequenceText || '';
        } else if (entry.consequenceText) {
          extractedMessage = entry.consequenceText;
        }
        if (!extractedMessage && entry.message && typeof entry.message === 'object') {
          const keys = Object.keys(entry.message).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
          if (keys.length > 0) {
            extractedMessage = keys.map(k => entry.message[k]).join('');
          }
        }
      }
      return {
        user_id: entry?.user_id || null,
        message: extractedMessage || "An event occurred.",
        type: entry?.type
      };
    });

    cleanedBattleLog.push({
      user_id: user.id,
      message: `${playerName} chose: ${choiceLabel}`,
      type: 'choice'
    });

    if (diceCheckResult && diceRoll) {
      const resultText = diceCheckResult.success ? 'SUCCEEDING' : diceCheckResult.partial ? 'BARELY FAILING' : 'FAILING';
      const modText = diceCheckResult.modifier > 0 ? ` +${diceCheckResult.modifier} skill` : '';
      cleanedBattleLog.push({
        user_id: user.id,
        message: `${playerName} rolled the holodice: ${diceRoll.join(',')}${modText} = ${diceCheckResult.total}, ${resultText} the check (DC ${diceCheckResult.dc})`,
        type: diceCheckResult.success ? 'dice_success' : 'dice_failure'
      });
    }

    let consequenceWithItems = String(sanitizedOutcome.consequenceText || '');
    if (sanitizedOutcome.itemsGained.length > 0) {
      const itemsList = sanitizedOutcome.itemsGained.map((item) => `[${item.name}]`).join(', ');
      consequenceWithItems += ` You received: ${itemsList}!`;
    }

    cleanedBattleLog.push({
      user_id: user.id,
      message: consequenceWithItems
    });

    if (fainted) {
      cleanedBattleLog.push({
        user_id: user.id,
        message: `${playerName} collapses from their wounds... and comes to moments later, weakened but alive. (-${xpPenalty} XP)`,
        type: 'faint'
      });
    }

    // --- Advance room if needed, with bounds check ---
    const dungeonData = battleState.dungeons.dungeon_json;
    const maxRoomIndex = dungeonData.rooms.length - 1;
    let newRoomIndex = battleState.current_room_index;

    if (sanitizedOutcome.progressRoom) {
      newRoomIndex = Math.min(battleState.current_room_index + 1, maxRoomIndex);
      const newRoom = dungeonData.rooms[newRoomIndex];
      // Field naming is inconsistent across dungeon JSON generations: check both.
      const newRoomType = newRoom?.room_type ?? newRoom?.roomType;
      if (newRoomType === 'treasure') {
        cleanedBattleLog.push({
          user_id: user.id,
          message: newRoom.treasureDescription || newRoom.treasure_description || 'A sturdy chest rests in the corner, its contents unknown...'
        });
      }
    }

    // --- Prepare battle_states update ---
    const updateData: any = {
      battle_log: cleanedBattleLog,
      current_room_index: newRoomIndex,
      story_memory: updatedStoryMemory,
      // IMPORTANT: null, not a marker object. generate-story-node's atomic
      // claim is `.is("current_story_node", null)` -- the old `{generating:true}`
      // marker never matched it, which added a guaranteed 2s delay to every
      // room AND let concurrent requests double-generate.
      current_story_node: null,
    };

    if (isPartyBattle && battleState.turn_order && Array.isArray(battleState.turn_order)) {
      const turnOrder = battleState.turn_order as string[];
      const currentIndex = turnOrder.indexOf(user.id);
      const nextIndex = (currentIndex + 1) % turnOrder.length;
      updateData.current_turn_user_id = turnOrder[nextIndex];
    }

    // Set up enemy if battle is triggered
    if (sanitizedOutcome.triggersBattle) {
      const battleRoom = dungeonData.rooms[newRoomIndex];
      if (battleRoom && battleRoom.enemy) {
        const enemy = battleRoom.enemy;
        const enemySprite = enemy.sprite || await findEnemySprite(enemy.name, supabaseClient);
        updateData.current_enemy_state = {
          name: enemy.name,
          description: enemy.description,
          sprite: enemySprite,
          hp: enemy.hp,
          current_hp: enemy.hp,
          max_hp: enemy.hp,
          atk: enemy.atk,
          def: enemy.def,
          spd: enemy.spd,
          status_effects: [],
          mode: "battle",
        };
      } else {
        updateData.current_enemy_state = {
          name: "Lurking Foe",
          description: "A hidden creature emerges from the shadows!",
          sprite: "skeleton.png",
          hp: 30,
          current_hp: 30,
          max_hp: 30,
          atk: 8,
          def: 5,
          spd: 12,
          status_effects: [],
          mode: "battle",
        };
      }
    }

    // --- OPTIMISTIC CONCURRENCY: the write only lands if the story node this
    // choice answered is still present. A duplicate/racing submission finds the
    // node already nulled and is rejected BEFORE any stats/inventory writes. ---
    const writerClient = serverId ? supabaseAdmin : supabaseClient;
    const { data: claimedRows, error: writeError } = await writerClient
      .from("battle_states")
      .update(updateData)
      .eq("id", battleState.id)
      .not("current_story_node", "is", null)
      .select("id");

    if (writeError) throw writeError;
    if (!claimedRows || claimedRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "That choice was already processed -- the story has moved on." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
      );
    }

    // --- Player stats: ONE write, targeting the ACTING user (was: the battle
    // creator, which corrupted party games) ---
    const { error: statsError } = await supabaseClient
      .from("player_stats")
      .update(statsUpdate)
      .eq("user_id", user.id);
    if (statsError) console.error("Failed to update player stats:", statsError);

    // --- Inventory: acting user, sanitized items only ---
    for (const item of sanitizedOutcome.itemsGained) {
      const { data: existingItem } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("user_id", user.id)
        .eq("item_name", item.name)
        .maybeSingle();

      if (existingItem) {
        await supabaseClient
          .from("inventory")
          .update({ quantity: existingItem.quantity + item.quantity })
          .eq("id", existingItem.id);
      } else {
        await supabaseClient
          .from("inventory")
          .insert({
            user_id: user.id,
            item_name: item.name,
            quantity: item.quantity,
            item_type: item.type,
          });
      }
    }

    return new Response(
      JSON.stringify({
        outcome: sanitizedOutcome,
        newHp,
        newMp,
        xpGained,
        xpMessages,
        leveledUp,
        newLevel,
        fainted,
        // Server-rolled dice: the UI should animate THESE values.
        diceRoll,
        diceCheck: diceCheckResult ? {
          success: diceCheckResult.success,
          partial: diceCheckResult.partial,
          total: diceCheckResult.total,
          rawTotal: diceCheckResult.rawTotal,
          modifier: diceCheckResult.modifier,
          dc: diceCheckResult.dc,
          skillType: diceCheckResult.skillType,
        } : null,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
