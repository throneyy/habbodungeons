import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { itemName, itemType, description } = await req.json();
    
    console.log(`Generating icon for: ${itemName} (${itemType})`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Check if icon already exists
    const { data: existingIcon } = await supabase
      .from('generated_icons')
      .select('*')
      .eq('item_name', itemName)
      .maybeSingle();
    
    if (existingIcon && !existingIcon.regenerate_requested) {
      console.log(`Icon already exists for ${itemName}, returning cached version`);
      const { data: publicUrl } = supabase.storage
        .from('item-icons')
        .getPublicUrl(existingIcon.storage_path);
      
      return new Response(
        JSON.stringify({ 
          iconUrl: publicUrl.publicUrl,
          cached: true 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Generate prompt based on item type
    const prompt = generatePrompt(itemName, itemType, description);
    console.log(`Generated prompt: ${prompt}`);
    
    // Call Banana Nano API
    const bananaApiKey = Deno.env.get('BANANA_API_KEY');
    if (!bananaApiKey) {
      throw new Error('BANANA_API_KEY not configured');
    }
    
    const bananaResponse = await fetch('https://api.banana.dev/start/v4', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bananaApiKey}`,
      },
      body: JSON.stringify({
        apiKey: bananaApiKey,
        modelKey: 'google/gemini-2.5-flash-image-preview',
        modelInputs: {
          prompt: prompt,
          width: 64,
          height: 64,
          seed: generateSeed(itemName),
        },
      }),
    });
    
    if (!bananaResponse.ok) {
      const errorText = await bananaResponse.text();
      console.error('Banana API error:', errorText);
      throw new Error(`Banana API error: ${bananaResponse.status}`);
    }
    
    const bananaData = await bananaResponse.json();
    console.log('Banana API response received');
    
    // Extract base64 image from response
    let imageBase64: string;
    if (bananaData.modelOutputs && bananaData.modelOutputs[0]) {
      imageBase64 = bananaData.modelOutputs[0].image_base64;
    } else if (bananaData.output) {
      imageBase64 = bananaData.output;
    } else {
      throw new Error('No image data in Banana API response');
    }
    
    // Convert base64 to blob
    const imageBuffer = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
    
    // Upload to Supabase Storage
    const fileName = `${itemName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
    const storagePath = `${itemType}/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('item-icons')
      .upload(storagePath, imageBuffer, {
        contentType: 'image/png',
        upsert: true,
      });
    
    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error(`Failed to upload icon: ${uploadError.message}`);
    }
    
    console.log(`Icon uploaded to: ${storagePath}`);
    
    // Save to generated_icons table
    if (existingIcon) {
      await supabase
        .from('generated_icons')
        .update({
          storage_path: storagePath,
          prompt_used: prompt,
          regenerate_requested: false,
          created_at: new Date().toISOString(),
        })
        .eq('item_name', itemName);
    } else {
      await supabase
        .from('generated_icons')
        .insert({
          item_name: itemName,
          item_type: itemType,
          storage_path: storagePath,
          prompt_used: prompt,
        });
    }
    
    // Get public URL
    const { data: publicUrl } = supabase.storage
      .from('item-icons')
      .getPublicUrl(storagePath);
    
    return new Response(
      JSON.stringify({ 
        iconUrl: publicUrl.publicUrl,
        cached: false 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
    console.error('Error generating icon:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

function generatePrompt(itemName: string, itemType: string, description?: string): string {
  const baseStyle = "Habbo Hotel isometric pixel art style, 45-degree angle, colorful, retro game aesthetic, clean outlines, simple shading, game item icon, vibrant colors, black background";
  
  switch (itemType.toLowerCase()) {
    case 'weapon':
      return `${itemName} weapon in ${baseStyle}, fantasy RPG weapon, glowing effects`;
    case 'armor':
    case 'helmet':
    case 'chest':
    case 'legs':
    case 'boots':
      return `${itemName} armor piece in ${baseStyle}, fantasy RPG equipment, metallic texture`;
    case 'scroll':
      return `${itemName} in ${baseStyle}, brown parchment scroll with mystical runes, glowing text`;
    case 'potion':
    case 'consumable':
      return `${itemName} in ${baseStyle}, glass bottle with colorful liquid, magical glow`;
    case 'material':
      return `${itemName} in ${baseStyle}, crafting material, fantasy resource item`;
    case 'monster':
    case 'enemy':
      return `${itemName} in ${baseStyle}, fantasy creature sprite, menacing pose`;
    default:
      return `${itemName} in ${baseStyle}, fantasy game item${description ? ', ' + description : ''}`;
  }
}

function generateSeed(itemName: string): number {
  // Generate deterministic seed from item name
  let hash = 0;
  for (let i = 0; i < itemName.length; i++) {
    const char = itemName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}