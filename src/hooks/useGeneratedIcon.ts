import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseGeneratedIconOptions {
  itemName: string;
  itemType: string;
  description?: string;
  sprite?: string;
  enabled?: boolean;
}

export const useGeneratedIcon = ({ 
  itemName, 
  itemType, 
  description, 
  sprite,
  enabled = true 
}: UseGeneratedIconOptions) => {
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !itemName) return;
    
    // If sprite is provided and exists, use it
    if (sprite && sprite !== 'placeholder') {
      try {
        const spriteUrl = `/src/assets/${sprite}`;
        setIconUrl(spriteUrl);
        return;
      } catch {
        // If sprite loading fails, proceed to generation
      }
    }
    
    // Check for existing generated icon
    const checkExistingIcon = async () => {
      const { data: existingIcon } = await supabase
        .from('generated_icons')
        .select('storage_path')
        .eq('item_name', itemName)
        .maybeSingle();
      
      if (existingIcon) {
        const { data: publicUrl } = supabase.storage
          .from('item-icons')
          .getPublicUrl(existingIcon.storage_path);
        
        setIconUrl(publicUrl.publicUrl);
        return true;
      }
      return false;
    };
    
    // Generate icon if needed
    const generateIcon = async () => {
      const hasExisting = await checkExistingIcon();
      if (hasExisting) return;
      
      setIsGenerating(true);
      setError(null);
      
      try {
        const { data, error: fnError } = await supabase.functions.invoke('generate-item-icon', {
          body: { itemName, itemType, description }
        });
        
        if (fnError) throw fnError;
        if (data.error) throw new Error(data.error);
        
        setIconUrl(data.iconUrl);
      } catch (err: any) {
        console.error('Failed to generate icon:', err);
        setError(err.message);
        // Set placeholder on error
        setIconUrl('/placeholder.svg');
      } finally {
        setIsGenerating(false);
      }
    };
    
    generateIcon();
  }, [itemName, itemType, description, sprite, enabled]);

  const regenerate = async () => {
    setIsGenerating(true);
    setError(null);
    
    try {
      // Mark for regeneration
      await supabase
        .from('generated_icons')
        .update({ regenerate_requested: true })
        .eq('item_name', itemName);
      
      const { data, error: fnError } = await supabase.functions.invoke('generate-item-icon', {
        body: { itemName, itemType, description }
      });
      
      if (fnError) throw fnError;
      if (data.error) throw new Error(data.error);
      
      setIconUrl(data.iconUrl);
    } catch (err: any) {
      console.error('Failed to regenerate icon:', err);
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return { iconUrl, isGenerating, error, regenerate };
};