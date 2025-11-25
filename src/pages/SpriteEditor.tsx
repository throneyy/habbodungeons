import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import frostUndeadOriginal from "@/assets/frost-undead.gif";

export default function SpriteEditor() {
  const [loading, setLoading] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const { toast } = useToast();

  const upscaleAndFlipFrostUndead = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('upscale-sprite', {
        body: {
          imageUrl: frostUndeadOriginal,
          instructions: "Upscale this pixel art undead creature sprite to higher resolution (at least 512x512), maintaining the pixel art style and crisp edges. Then flip it horizontally so it faces the opposite direction. Keep the dark, frosty, undead aesthetic. Preserve the transparency/background."
        }
      });

      if (error) throw error;

      if (data?.imageUrl) {
        setResultImage(data.imageUrl);
        toast({
          title: "Success!",
          description: "Frost undead sprite upscaled and flipped. Right-click to save.",
        });
      }
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Sprite Editor</h1>
        
        <div className="space-y-6">
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Frost Undead - Upscale & Flip</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Original:</p>
                <img src={frostUndeadOriginal} alt="Original Frost Undead" className="pixel-art border" />
              </div>
              
              {resultImage && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Upscaled & Flipped:</p>
                  <img src={resultImage} alt="Upscaled Frost Undead" className="pixel-art border" />
                </div>
              )}
            </div>
            
            <Button 
              onClick={upscaleAndFlipFrostUndead}
              disabled={loading}
            >
              {loading ? "Processing..." : "Upscale & Flip"}
            </Button>
            
            {resultImage && (
              <p className="text-sm text-muted-foreground mt-4">
                Right-click the image and "Save Image As" to download. 
                Save it as src/assets/frost-undead.gif to replace the original.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
