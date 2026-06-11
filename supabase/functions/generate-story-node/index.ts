import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// CHANGED IN THIS PATCH:
//  - Generation claim actually works now. resolve-story-choice sets the node to
//    NULL (not a marker), so the atomic `.is(null)` claim matches. Stale markers
//    (>20s) can be taken over atomically. Losing requests POLL for the winner's
//    result instead of falling through and double-generating (which doubled AI
//    cost and added a guaranteed 2s delay to every room).
//  - Encounter type is rolled SERVER-SIDE and dictated to the model (systems
//    decide, the writer dresses) -- the old percentage list was just a vibe.
//  - Final story write targets the battle row ID (was: every battle row for
//    that user+dungeon, clobbering old runs).
//  - server_players lookup uses the admin client (the comment claimed it did).
//  - Prompt: fixed broken rule numbering, removed // comments inside JSON
//    examples (a major source of unparseable responses), added chronicle
//    memory, requests strict JSON via response_format.
// ---------------------------------------------------------------------------

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const CLAIM_STALE_MS = 20000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const { battleId, lastChoice } = await req.json();
    const authHeader = req.headers.get("Authorization")!;

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Admin client bypasses RLS so we can see all server players' stats
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Validate battleId BEFORE consuming the rate-limit budget
    if (!battleId || battleId === "undefined" || battleId === "null" || typeof battleId !== 'string' || battleId.length === 0) {
      console.error("Invalid battleId received:", battleId);
      throw new Error(`Invalid battleId provided: ${battleId}`);
    }

    // Rate limiting check for story generation
    const { data: rateLimit } = await supabaseClient
      .from('rate_limits')
      .select('*')
      .eq('user_id', user.id)
      .eq('action_type', 'story_generation')
      .maybeSingle();

    const now = Date.now();
    if (rateLimit) {
      const timeSince = now - new Date(rateLimit.last_action_at).getTime();
      if (timeSince < 5000) {
        return new Response(
          JSON.stringify({ error: 'Please wait 5 seconds between story generations' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 }
        );
      }
    }

    await supabaseClient.from('rate_limits').upsert({
      user_id: user.id,
      action_type: 'story_generation',
      last_action_at: new Date().toISOString(),
    });

    console.log("Generating story node for battleId:", battleId, "userId:", user.id);

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
    const clientToUse = serverId ? supabaseAdmin : supabaseClient;

    if (serverId) {
      const { data, error } = await clientToUse
        .from("battle_states")
        .select("*, dungeons(*)")
        .eq("dungeon_id", battleId)
        .eq("server_id", serverId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) {
        console.error("Battle state error:", error);
        throw error;
      }
      battleState = data;
    } else {
      const { data, error } = await clientToUse
        .from("battle_states")
        .select("*, dungeons(*)")
        .eq("dungeon_id", battleId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("Battle state error:", error);
        throw error;
      }
      battleState = data;
    }

    if (!battleState) {
      console.error("Battle state not found for dungeonId:", battleId);
      throw new Error(`Battle state not found. Please start the dungeon first.`);
    }

    console.log("Battle state loaded:", battleState.id, "Room:", battleState.current_room_index);

    const storyNodeResponse = (node: any) =>
      new Response(JSON.stringify({ storyNode: node }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // If a real story node already exists for this room, return it (no regen)
    if (battleState.current_story_node &&
        !battleState.current_story_node.generating &&
        battleState.current_story_node.storyText) {
      console.log("Returning existing story node for room", battleState.current_room_index);
      return storyNodeResponse(battleState.current_story_node);
    }

    // -----------------------------------------------------------------------
    // GENERATION CLAIM (fixed):
    //   1. Atomically claim when the node is NULL (the normal post-choice state
    //      now that resolve-story-choice nulls it).
    //   2. If someone else holds a claim, take it over only if it's stale.
    //   3. Otherwise POLL for their result -- never fall through and generate a
    //      duplicate (the old code did exactly that after a pointless 2s nap).
    // -----------------------------------------------------------------------
    const claimId = crypto.randomUUID();
    const marker = { generating: true, timestamp: Date.now(), claimId };
    let ownsGeneration = false;

    const { data: claim1 } = await supabaseAdmin
      .from("battle_states")
      .update({ current_story_node: marker })
      .eq("id", battleState.id)
      .is("current_story_node", null)
      .select("id")
      .maybeSingle();
    if (claim1) ownsGeneration = true;

    if (!ownsGeneration) {
      const { data: cur } = await supabaseAdmin
        .from("battle_states")
        .select("current_story_node")
        .eq("id", battleState.id)
        .single();
      const node = cur?.current_story_node;

      if (node && !node.generating && node.storyText) {
        return storyNodeResponse(node); // someone already finished
      }

      // Stale claim (crashed generator or legacy marker)? Take over atomically:
      // the filter on the old timestamp makes sure only one taker wins.
      if (node?.generating && typeof node.timestamp === "number" && Date.now() - node.timestamp > CLAIM_STALE_MS) {
        const { data: claim2 } = await supabaseAdmin
          .from("battle_states")
          .update({ current_story_node: marker })
          .eq("id", battleState.id)
          .eq("current_story_node->>timestamp", String(node.timestamp))
          .select("id")
          .maybeSingle();
        if (claim2) ownsGeneration = true;
      }

      if (!ownsGeneration) {
        // Poll for the winner's result (max ~9s), then tell the client to retry.
        for (let i = 0; i < 6; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const { data: poll } = await supabaseAdmin
            .from("battle_states")
            .select("current_story_node")
            .eq("id", battleState.id)
            .single();
          const n = poll?.current_story_node;
          if (n && !n.generating && n.storyText) {
            console.log("Returning story generated by concurrent request");
            return storyNodeResponse(n);
          }
        }
        return new Response(
          JSON.stringify({ error: "Story is still being generated, please retry in a moment." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
        );
      }
    }

    console.log("This request owns story generation, claimId:", claimId);

    try {
      // Get party member stats - if server battle, get all members; otherwise just current user
      let partyStats = [];

      if (battleState.server_id) {
        // Admin client so RLS can't hide other members (the old code claimed
        // this but used the anon client for the membership lookup).
        const { data: serverPlayers } = await supabaseAdmin
          .from('server_players')
          .select('user_id')
          .eq('server_id', battleState.server_id);

        if (serverPlayers && serverPlayers.length > 0) {
          const userIds = serverPlayers.map(p => p.user_id);
          const { data } = await supabaseAdmin
            .from("player_stats")
            .select("*")
            .in("user_id", userIds);
          partyStats = data || [];
        }
      } else {
        const { data } = await supabaseClient
          .from("player_stats")
          .select("*")
          .eq("user_id", user.id);
        partyStats = data || [];
      }

      const context = {
        dungeon: {
          name: battleState.dungeons.name,
          theme: battleState.dungeons.theme,
          difficulty: battleState.dungeons.difficulty,
        },
        roomIndex: battleState.current_room_index,
        party: partyStats,
        lastChoice: lastChoice || null,
        recentEvents: (battleState.battle_log || []).slice(-6),
      };

      // Get quest context from dungeon JSON
      const dungeonJson = battleState.dungeons.dungeon_json as any;
      const roomsArr: any[] = Array.isArray(dungeonJson.rooms) ? dungeonJson.rooms : [];
      const currentRoom = roomsArr[context.roomIndex];
      const questObjective = dungeonJson.questObjective || "Complete the dungeon";
      const roomDescription = currentRoom?.description || "You enter a mysterious chamber.";
      const roomType = currentRoom?.room_type ?? currentRoom?.roomType ?? "unknown";

      // --- Persistent narrative memory (durable across rooms) ---
      const storyMemory = (battleState.story_memory || {}) as any;
      const storyBeats: string[] = Array.isArray(storyMemory.beats) ? storyMemory.beats : [];
      const knownNpcs: Record<string, string> =
        storyMemory.npcs && typeof storyMemory.npcs === "object" ? storyMemory.npcs : {};
      const chronicle: string = typeof storyMemory.chronicle === "string" ? storyMemory.chronicle.trim() : "";
      const storySoFar = storyBeats.length
        ? storyBeats.map((b) => `- ${b}`).join("\n")
        : "(the adventure has just begun)";
      const knownCharacters = Object.keys(knownNpcs).length
        ? Object.entries(knownNpcs).map(([name, note]) => `- ${name}: ${note}`).join("\n")
        : "(none yet)";

      // Extract the most recent narrative description (not choices or dice rolls)
      const narrativeEvents = (battleState.battle_log || [])
        .filter((e: any) => e?.message && typeof e.message === 'string' && e.type !== 'choice' && e.type !== 'dice_success' && e.type !== 'dice_failure')
        .slice(-3);

      const lastConsequence = narrativeEvents.length > 0
        ? narrativeEvents[narrativeEvents.length - 1].message
        : null;

      // ---------------------------------------------------------------------
      // SERVER-ROLLED ENCOUNTER TYPE: the engine decides the scene type, the
      // model writes it. (The old prompt gave the model percentage "guidelines"
      // it was free to ignore -- pacing was vibes.)
      // ---------------------------------------------------------------------
      const isFinalRoom = context.roomIndex >= roomsArr.length - 1 && roomsArr.length > 0;
      const hasEnemy = !!currentRoom?.enemy;
      let encounterType: string;
      if (isFinalRoom) {
        encounterType = hasEnemy
          ? "QUEST CLIMAX -- the quest objective is HERE, guarded by this room's enemy. Make the objective achievable in this scene."
          : "QUEST CLIMAX -- the quest objective is HERE and achievable in this scene.";
      } else if (hasEnemy) {
        encounterType = "ENEMY ENCOUNTER -- build toward a possible fight with this room's configured enemy. Dialogue and avoidance choices (with dice) are allowed alongside direct combat.";
      } else {
        const r = Math.random();
        encounterType =
          r < 0.30 ? "ENVIRONMENTAL CHALLENGE -- a puzzle, trap, or hazard. No monsters."
          : r < 0.55 ? "DISCOVERY -- lore, a clue, or a mysterious artifact. No combat."
          : r < 0.75 ? "NPC MEETING -- an ally, merchant, or neutral party to interact with. No combat."
          : r < 0.90 ? "REST OPPORTUNITY -- a safe spot; offer recovery-flavored choices. No combat."
          : "QUEST PROGRESSION -- an event that directly advances the quest objective. No combat.";
      }

      const aiPrompt = `You are a JRPG dungeon master for "${battleState.dungeons.name}", running a ${battleState.dungeons.theme} themed dungeon. Stay true to THIS dungeon's name and theme -- do not rename it or import a different setting.

Party stats: ${JSON.stringify(partyStats)}
Dungeon: ${battleState.dungeons.name} (${battleState.dungeons.difficulty})
Theme: ${battleState.dungeons.theme}
Current room: ${context.roomIndex + 1}/${roomsArr.length || 10}
Room type: ${roomType}
Room description: ${roomDescription}
${currentRoom?.enemy ? `\n**CRITICAL ENEMY CONSTRAINT: This room contains the enemy "${currentRoom.enemy.name}": ${currentRoom.enemy.description}**\n\n⚠️ MANDATORY RULE FOR COMBAT CHOICES:\n- If you create ANY choice that involves fighting, attacking, or combat, the choice MUST say "Fight ${currentRoom.enemy.name}" or "Attack ${currentRoom.enemy.name}"\n- NEVER name any other enemy. ALL combat choices must reference "${currentRoom.enemy.name}"\n- DO NOT invent different enemies. Use "${currentRoom.enemy.name}" or write non-combat choices.` : ''}
${lastChoice ? `\nLast player action: ${lastChoice}` : ''}

## THIS ROOM'S ENCOUNTER TYPE (decided by the game engine -- you MUST write this kind of scene):
${encounterType}
${chronicle ? `\n## EARLIER CHAPTERS (compressed summary of older events -- stay consistent):\n${chronicle}\n` : ''}
## STORY SO FAR (durable memory -- you MUST stay consistent with these facts):
${storySoFar}

## KNOWN CHARACTERS (reuse their names and relationships; never contradict them):
${knownCharacters}

## QUEST OBJECTIVE (weave toward this): ${questObjective}

## WHAT JUST HAPPENED (THIS IS THE IMMEDIATE PRESENT):
${lastConsequence ? `"${lastConsequence}"` : `"${roomDescription}"`}

## RECENT EVENTS LEADING TO THIS MOMENT:
${context.recentEvents.filter((e: any) => e?.message && typeof e.message === 'string').map((e: any, idx: number) => `${idx + 1}. ${e.message}`).join('\n')}

⚠️ CRITICAL TEXT FORMATTING:
- NEVER use em dashes (—). Use double hyphens (--) instead.
- Use only standard ASCII punctuation that renders correctly in pixel fonts.

⚠️ CRITICAL NARRATIVE CONTINUITY RULES:
1. Your storyText continues IMMEDIATELY from "WHAT JUST HAPPENED" above - that is the PRESENT MOMENT
2. DO NOT reintroduce the scene or restate what already happened
3. DO NOT write "As the..." or "After..." - the consequence JUST occurred, NOW describe what happens NEXT
4. Your first sentence should pick up the story EXACTLY where the last event left off
5. Example: If last event was "debris falls, obscuring vision" → Your story: "A large creature detaches from the wall..."
6. The player is ALREADY in the moment described in "WHAT JUST HAPPENED" - don't re-describe it, continue it

## CRITICAL DICE MECHANIC INSTRUCTIONS
**DICE CHECKS ARE REQUIRED FOR:**
1. ALL social interactions (talking, calling out, persuading, intimidating, deceiving, reasoning, negotiating)
2. ALL investigation/search actions (searching for clues, hidden mechanisms, weaknesses, patterns, examining for secrets)
3. ALL physical skill attempts (breaking through barriers, forcing doors, climbing, sneaking, acrobatics)
4. ALL magical manipulation attempts (dispelling barriers, disrupting magic, arcane analysis, ritual manipulation)
5. ALL knowledge checks (identifying creatures, recalling lore, understanding ancient texts)

**DICE CHECKS ARE NOT REQUIRED FOR:**
- Simple observations ("Look around casually", "Glance at the area")
- Direct combat initiation ("Attack immediately", "Draw weapon and strike")
- Safe movements ("Continue forward cautiously", "Retreat back")
- Obvious actions with no skill ("Pick up the key", "Open the unlocked door")

**IMPORTANT:** If an action involves "search", "examine", "investigate", "look for", "find", or "discover" something non-obvious, it REQUIRES a dice check!

- Dice checks use 5 six-sided dice (Habbo holodice): totals range from 5 (all 1s) to 30 (all 6s). The player's skill adds a small modifier (0-6) on top.
- Set appropriate DC (difficulty class) based on the challenge:
  * Easy checks: DC 10-14 (e.g., intimidate weak goblin, search for obvious clues, identify common creature)
  * Medium checks: DC 15-19 (e.g., persuade suspicious guard, find hidden mechanism, dispel minor magic)
  * Hard checks: DC 20-24 (e.g., deceive powerful enemy, discover well-hidden secret, analyze complex runes)
  * Very hard checks: DC 25-29 (e.g., reason with hostile boss, uncover master-crafted trap, master-level arcane work)
- Always provide 3-5 options including both dice-required and direct action choices

## DICE CHECK CHOICE FORMAT (strict JSON, no comments)
Choice requiring dice:
{"id": "choice1", "label": "Try to persuade the guard [Dice Check: DC 15]", "diceRequired": true, "diceDC": 15, "skillType": "persuasion"}
Valid skillType values: "persuasion", "intimidation", "deception", "insight", "investigation", "perception", "strength", "agility", "stealth", "endurance", "arcana", "lore".
Choice without dice:
{"id": "choice2", "label": "Attack immediately", "diceRequired": false}

## MANDATORY DICE CHECK EXAMPLES - THESE MUST HAVE DICE:
❌ WRONG: "Search the perimeter for hidden doors" (diceRequired: false)
✅ CORRECT: "Carefully search the perimeter for hidden doors [Dice Check: DC 16]" (diceRequired: true, diceDC: 16, skillType: "investigation")

❌ WRONG: "Look for weaknesses in the barrier" (diceRequired: false)
✅ CORRECT: "Examine the barrier for structural weaknesses [Dice Check: DC 18]" (diceRequired: true, diceDC: 18, skillType: "perception")

❌ WRONG: "Call out to the mage" (diceRequired: false)
✅ CORRECT: "Call out to demand passage [Dice Check: DC 15]" (diceRequired: true, diceDC: 15, skillType: "persuasion")

If an action contains these words, it MUST have diceRequired: true:
- "search", "look for", "find", "discover", "investigate", "examine", "inspect", "scout"
- "persuade", "convince", "reason", "negotiate", "talk", "call out", "demand"
- "intimidate", "threaten", "force", "break", "smash", "destroy"
- "sneak", "hide", "steal", "pickpocket", "avoid detection"
- "dispel", "disrupt", "manipulate", "analyze", "decipher"

## Story Structure Rules
1. NARRATIVE FLOW (TOP PRIORITY): continue immediately from "WHAT JUST HAPPENED"; do not restate or reintroduce; your first sentence seamlessly continues the action. Example flow: "debris falls" → "Through the settling dust, a shape emerges..." NOT "As the debris settles..."
2. WRITE THE ENGINE'S SCENE: the encounter type above was chosen by the game engine. Do not change it to a different kind of scene.
3. ENEMY DIALOGUE: when this room's enemy is present, you may offer dialogue choices before combat (with dice) alongside a direct "Attack" choice (no dice).
4. QUEST INTEGRATION: reference the quest objective (${questObjective}) as the dungeon progresses; build tension toward it; in the final room it must be achievable. The boss may guard the objective, but the objective itself is the goal -- don't make every quest just "kill the boss".
5. PARTY AWARENESS: acknowledge party members in descriptions; maintain a consistent tone and theme.
6. ITEM REWARDS (VERY RARE, ~5% of story choices): only for exceptional discoveries or major victories. Items MUST have valid format: {"name": "Iron Helmet", "quantity": 1, "type": "armor"}. Never reward items for simple choices.
7. CONSEQUENCES MATTER: failed dice checks have meaningful (but not game-ending) consequences; successful checks provide advantages (avoid combat, gain allies, learn secrets); some encounters are unavoidable.

## Response Format
**CRITICAL: You MUST return ONLY a valid JSON object with this structure:**
- storyText: string (100-200 words describing what happens NEXT, continuing seamlessly from the last event)
- choices: array of 2-4 choice objects, each with id, label, diceRequired boolean, and if dice: diceDC number and skillType string
- itemsGained: array (usually empty)

DO NOT include any explanatory text before or after the JSON. DO NOT include comments inside the JSON. RETURN ONLY THE JSON OBJECT.`;

      // Call Lovable AI
      const aiResponse = await fetch(AI_GATEWAY, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [{ role: "user", content: aiPrompt }],
          temperature: 0.8,
          response_format: { type: "json_object" },
        }),
      });

      if (!aiResponse.ok) {
        throw new Error(`AI API error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();

      const choice = aiData.choices?.[0];
      if (choice?.error) {
        const errorMsg = choice.error.message || "Unknown AI API error";
        const errorCode = choice.error.code || 500;
        console.error("AI API returned error:", choice.error);
        throw new Error(`AI API error (${errorCode}): ${errorMsg}`);
      }

      let storyContent = choice?.message?.content || "";
      if (!storyContent || storyContent.trim().length === 0) {
        throw new Error("AI API returned empty content");
      }

      // Remove markdown code fences and any explanatory text
      storyContent = storyContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

      const jsonMatch = storyContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        storyContent = jsonMatch[0];
      }

      storyContent = storyContent
        .replace(/,\s*\]/g, ']')
        .replace(/,\s*\}/g, '}')
        .replace(/\n/g, ' ')
        .replace(/\r/g, '')
        .replace(/—/g, '--')
        .replace(/"(\w+)"\s+"([^"]*)"/g, '"$1": "$2"');

      let storyNode;
      let parseAttempts = 0;
      const maxAttempts = 3;

      while (parseAttempts < maxAttempts) {
        try {
          storyNode = JSON.parse(storyContent);
          break;
        } catch (parseError) {
          parseAttempts++;
          console.error(`Parse attempt ${parseAttempts} failed:`, parseError);

          if (parseAttempts === maxAttempts) {
            console.error("Failed to parse AI response after all attempts. Content:", storyContent);
            const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
            throw new Error(`Invalid AI response format: ${errorMsg}`);
          }

          if (parseAttempts === 1) {
            storyContent = storyContent
              .replace(/"(\w+)"\s*"([^"]*)"/g, '"$1": "$2"')
              .replace(/\\"/g, '"')
              .replace(/\\'/g, "'");
          } else if (parseAttempts === 2) {
            const firstBrace = storyContent.indexOf('{');
            const lastBrace = storyContent.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              storyContent = storyContent.substring(firstBrace, lastBrace + 1);
            }
            storyContent = storyContent.replace(/"(\w+)"\s*"([^"]*)"/g, '"$1": "$2"');
          }
        }
      }

      // Store the node on THIS battle row only, and only if we still own the
      // claim (a stale-takeover winner may have already written its own node).
      const { data: stored } = await supabaseAdmin
        .from("battle_states")
        .update({ current_story_node: storyNode })
        .eq("id", battleState.id)
        .eq("current_story_node->>claimId", claimId)
        .select("id")
        .maybeSingle();

      if (!stored) {
        console.warn("Claim was taken over during generation; returning our node anyway");
      }

      return storyNodeResponse(storyNode);
    } catch (genError) {
      // Release the claim so the next request can retry instead of waiting out
      // the stale window.
      try {
        await supabaseAdmin
          .from("battle_states")
          .update({ current_story_node: null })
          .eq("id", battleState.id)
          .eq("current_story_node->>claimId", claimId);
      } catch (releaseError) {
        console.error("Failed to release generation claim:", releaseError);
      }
      throw genError;
    }
  } catch (error) {
    console.error("Error in generate-story-node:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
