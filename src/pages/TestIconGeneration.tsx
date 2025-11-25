import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/AppLayout';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TestIconGeneration() {
  const [generating, setGenerating] = useState(false);
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  const generateRustySwordIcon = async () => {
    setGenerating(true);
    setIconUrl(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-item-icon', {
        body: {
          itemName: 'Rusty Sword',
          itemType: 'weapon',
          description: "An old, rusty sword. It's seen better days but still sharp enough to be useful."
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setIconUrl(data.iconUrl);
      toast.success('Icon generated successfully!');
    } catch (error: any) {
      toast.error(`Failed to generate icon: ${error.message}`);
      console.error(error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Test Icon Generation - Rusty Sword</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Click the button below to generate a Habbo-style pixel art icon for the Rusty Sword using Banana Nano AI.
            </p>
            
            <Button 
              onClick={generateRustySwordIcon}
              disabled={generating}
              className="w-full"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Icon...
                </>
              ) : (
                'Generate Rusty Sword Icon'
              )}
            </Button>

            {iconUrl && (
              <div className="mt-6 space-y-4">
                <div className="border-2 border-primary rounded-lg p-4 bg-muted">
                  <p className="text-sm font-bold mb-2">Generated Icon:</p>
                  <div className="flex justify-center bg-black p-4 rounded">
                    <img 
                      src={iconUrl} 
                      alt="Rusty Sword"
                      className="pixel-icon"
                      style={{ width: '64px', height: '64px' }}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-xs font-bold">Icon URL:</p>
                  <code className="block text-xs bg-muted p-2 rounded break-all">
                    {iconUrl}
                  </code>
                </div>

                <p className="text-xs text-muted-foreground">
                  This icon has been saved to the storage bucket and will now be used automatically in the inventory and store when displaying the Rusty Sword.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}