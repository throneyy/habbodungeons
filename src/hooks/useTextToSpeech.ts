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

      // Try ElevenLabs first
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: { text, voice }
      });

      if (error || !data?.audioContent) {
        // Fall back to browser TTS
        console.log('ElevenLabs unavailable, using browser TTS fallback');
        useBrowserTTS(text);
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
        // Fall back to browser TTS on audio playback error
        useBrowserTTS(text);
      };

      await audio.play();
    } catch (error) {
      console.warn('ElevenLabs error, falling back to browser TTS:', error);
      useBrowserTTS(text);
    } finally {
      setIsLoading(false);
    }
  };

  const useBrowserTTS = (text: string) => {
    if (!('speechSynthesis' in window)) {
      toast({
        title: "Text-to-speech unavailable",
        description: "Your browser doesn't support text-to-speech",
        variant: "destructive"
      });
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; // Slightly slower for better clarity
    utterance.pitch = 1.0;
    
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => {
      setIsPlaying(false);
      toast({
        title: "Speech Error",
        description: "Browser text-to-speech failed",
        variant: "destructive"
      });
    };

    window.speechSynthesis.speak(utterance);
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
