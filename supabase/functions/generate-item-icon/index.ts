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
    
    // Call Lovable AI Gateway for image generation
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: prompt,
          }
        ],
        modalities: ['image', 'text'],
      }),
    });
    
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', errorText);
      throw new Error(`Lovable AI error: ${aiResponse.status}`);
    }
    
    const aiData = await aiResponse.json();
    console.log('Lovable AI response received');
    
    // Extract base64 image from response
    const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      throw new Error('No image data in AI response');
    }
    
    // Extract base64 data from data URL
    const base64Match = imageUrl.match(/^data:image\/\w+;base64,(.+)$/);
    if (!base64Match) {
      throw new Error('Invalid image data format');
    }
    const imageBase64 = base64Match[1];
    
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
  
  // Special prompt for Rusty Sword
  if (itemName.toLowerCase() === 'rusty sword') {
    return "Rusty Sword in Habbo Hotel pixel art style, isometric view at 45-degree angle, weathered brown-orange blade with rust spots, simple medieval sword, game item icon, vibrant retro colors, clean outlines, simple shading, 64x64px resolution, black background";
  }
  
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