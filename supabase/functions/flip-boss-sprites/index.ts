import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData, filename } = await req.json();

    // Decode base64 image
    const imageBytes = Uint8Array.from(atob(imageData.split(',')[1]), c => c.charCodeAt(0));
    
    // Create a canvas to flip the image
    const canvas = new OffscreenCanvas(1, 1);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Load image
    const blob = new Blob([imageBytes], { type: 'image/png' });
    const imageBitmap = await createImageBitmap(blob);
    
    // Set canvas size to match image
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    
    // Flip horizontally
    ctx.scale(-1, 1);
    ctx.drawImage(imageBitmap, -canvas.width, 0);
    
    // Convert back to blob
    const flippedBlob = await canvas.convertToBlob({ type: 'image/png' });
    const arrayBuffer = await flippedBlob.arrayBuffer();
    const flippedBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    return new Response(
      JSON.stringify({ 
        flippedImage: `data:image/png;base64,${flippedBase64}`,
        filename: `flipped-${filename}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error flipping image:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
