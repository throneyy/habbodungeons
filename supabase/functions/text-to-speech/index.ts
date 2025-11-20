import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { text, voice = "Edward" } = await req.json();

    if (!text) {
      throw new Error('Text is required');
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Map voice names to OpenAI voice IDs
    const voiceIds: Record<string, string> = {
      'alloy': 'alloy',
      'echo': 'echo',
      'fable': 'fable',
      'onyx': 'onyx',
      'nova': 'nova',
      'shimmer': 'shimmer',
    };

    const voiceId = voiceIds[voice.toLowerCase()] || 'alloy';

    console.log('Generating speech for text:', text.substring(0, 50) + '...');
    console.log('Using OpenAI TTS voice:', voiceId);

    // Call OpenAI TTS API
    const response = await fetch(
      'https://api.openai.com/v1/audio/speech',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: voiceId,
          response_format: 'mp3',
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      throw new Error(`Failed to generate speech: ${error}`);
    }

    // Get audio data
    const audioBuffer = await response.arrayBuffer();
    
    // Convert to base64 safely without using Function.apply
    const uint8Array = new Uint8Array(audioBuffer);
    let binary = "";

    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }

    const base64Audio = btoa(binary);

    console.log('Speech generated successfully, size:', audioBuffer.byteLength);

    return new Response(
      JSON.stringify({ audioContent: base64Audio }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in text-to-speech:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
