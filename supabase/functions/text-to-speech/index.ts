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

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    // Map voice names to ElevenLabs voice IDs
    const voiceIds: Record<string, string> = {
      'Edward': 'goT3UYdM9bhm0n2lmKQx', // Deep British - perfect for fantasy narration
      'Liam': 'TX3LPaxmHKxFdv7VOQHJ', // Deep, dramatic
      'George': 'JBFqnCBsd6RMkjVDRZzb', // Rich, authoritative
      'Callum': 'N2lVS1w4EtoT3dr4eOWO', // Strong, narrative
      'Aria': '9BWtsMINqrJLrRacOk9x',
      'Roger': 'CwhRBWXzGAHq8TQ4Fs17',
    };

    const voiceId = voiceIds[voice] || voiceIds['Edward'];

    console.log('Generating speech for text:', text.substring(0, 50) + '...');
    console.log('Using voice:', voice, 'Voice ID:', voiceId);

    // Call ElevenLabs API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs API error:', error);
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
