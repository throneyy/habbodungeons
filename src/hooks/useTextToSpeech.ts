import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useTextToSpeech = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const audioRef = useState<HTMLAudioElement | null>(null)[0];

  const speak = async (text: string, voice: string = 'Edward') => {
    if (!text) return;

    // Stop any currently playing audio
    if (audioRef) {
      audioRef.pause();
      audioRef.currentTime = 0;
    }

    try {
      setIsLoading(true);

      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: { text, voice }
      });

      if (error) {
        console.error('TTS error:', error);
        toast({
          title: "Text-to-speech unavailable",
          description: error.message || "Please check your ElevenLabs credits or try a shorter text",
          variant: "destructive"
        });
        return;
      }

      if (!data.audioContent) {
        if (data.error) {
          toast({
            title: "Text-to-speech failed",
            description: data.error,
            variant: "destructive"
          });
        }
        console.warn('No audio content received from TTS');
        return;
      }

      // Convert base64 to audio
      const audioData = atob(data.audioContent);
      const audioArray = new Uint8Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        audioArray[i] = audioData.charCodeAt(i);
      }

      const audioBlob = new Blob([audioArray], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      
      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
        toast({
          title: "Audio Error",
          description: "Failed to play audio",
          variant: "destructive"
        });
      };

      await audio.play();
    } catch (error) {
      console.warn('Text-to-speech error:', error);
      // Silently fail - TTS is a nice-to-have feature, not critical
    } finally {
      setIsLoading(false);
    }
  };

  const stop = () => {
    if (audioRef) {
      audioRef.pause();
      audioRef.currentTime = 0;
      setIsPlaying(false);
    }
  };

  return { speak, stop, isPlaying, isLoading };
};
