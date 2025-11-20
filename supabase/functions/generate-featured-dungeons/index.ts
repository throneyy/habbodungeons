import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting featured dungeon generation...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create a system user ID for featured dungeons
    const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

    const themes = ["Frozen Wastes", "Dark Forest", "Ancient Ruins", "Volcanic Depths"];
    const difficulties = ["Easy", "Normal", "Hard"];
    
    const dungeonsToGenerate = 20;
    const generatedDungeons = [];

    for (let i = 0; i < dungeonsToGenerate; i++) {
      const theme = themes[Math.floor(Math.random() * themes.length)];
      const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];

      console.log(`Generating dungeon ${i + 1}/${dungeonsToGenerate}: ${theme} - ${difficulty}`);

      try {
        // Call the existing generate-dungeon function
        const { data: dungeonData, error: generateError } = await supabase.functions.invoke(
          "generate-dungeon",
          {
            body: { theme, difficulty, name: `Featured: ${theme} ${difficulty}` }
          }
        );

        if (generateError) {
          console.error(`Error generating dungeon ${i + 1}:`, generateError);
          continue;
        }

        if (!dungeonData?.dungeon) {
          console.error(`No dungeon data returned for ${i + 1}`);
          continue;
        }

        // Insert the dungeon as featured
        const { data: insertedDungeon, error: insertError } = await supabase
          .from("dungeons")
          .insert({
            name: `Featured: ${theme} ${difficulty}`,
            theme,
            difficulty,
            dungeon_json: dungeonData.dungeon,
            owner_user_id: SYSTEM_USER_ID,
            is_featured: true,
            times_played: 0
          })
          .select()
          .single();

        if (insertError) {
          console.error(`Error inserting dungeon ${i + 1}:`, insertError);
          continue;
        }

        generatedDungeons.push(insertedDungeon);
        console.log(`Successfully generated dungeon ${i + 1}: ${insertedDungeon.id}`);

      } catch (error) {
        console.error(`Exception generating dungeon ${i + 1}:`, error);
        continue;
      }
    }

    // Clean up old featured dungeons (keep only the newest 30)
    const { data: allFeatured } = await supabase
      .from("dungeons")
      .select("id, created_at")
      .eq("is_featured", true)
      .order("created_at", { ascending: false });

    if (allFeatured && allFeatured.length > 30) {
      const toDelete = allFeatured.slice(30).map(d => d.id);
      await supabase
        .from("dungeons")
        .delete()
        .in("id", toDelete);
      console.log(`Cleaned up ${toDelete.length} old featured dungeons`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        generated: generatedDungeons.length,
        message: `Generated ${generatedDungeons.length} featured dungeons`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-featured-dungeons:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});

