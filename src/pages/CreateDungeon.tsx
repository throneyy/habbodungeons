import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/AppLayout";
import { NPCS, NPC } from "@/lib/npcData";
import { cn } from "@/lib/utils";

const CreateDungeon = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [difficulty, setDifficulty] = useState("Normal");
  const [selectedNPC, setSelectedNPC] = useState<NPC | null>(null);
  const [encounters, setEncounters] = useState(10);

  const handleGenerate = async () => {
    if (!selectedNPC) {
      toast({
        title: "Please select a quest giver",
        description: "Choose an NPC to receive a quest from",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-dungeon", {
        body: {
          difficulty,
          npcId: selectedNPC.id,
          encounters,
        },
      });

      if (error) throw error;

      toast({ title: "Quest received from " + selectedNPC.name + "!" });
      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Failed to generate quest",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <HabboPanel title="Quest Board - Select Your Quest Giver">
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-lg font-bold">Choose a Quest Giver</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {NPCS.map((npc) => (
                  <button
                    key={npc.id}
                    onClick={() => setSelectedNPC(npc)}
                    className={cn(
                      "flex flex-col items-center p-4 rounded-lg border-4 transition-all hover:scale-105",
                      selectedNPC?.id === npc.id
                        ? "border-primary bg-primary/20 shadow-lg"
                        : "border-habbo-dark bg-card hover:border-primary/50"
                    )}
                  >
                    <img 
                      src={npc.sprite} 
                      alt={npc.name} 
                      className="h-16 pixel-icon mb-2"
                    />
                    <p className="font-bold text-sm text-center">{npc.name}</p>
                    <p className="text-xs text-muted-foreground text-center">{npc.title}</p>
                  </button>
                ))}
              </div>
            </div>

            {selectedNPC && (
              <div className="p-4 bg-primary/10 border-2 border-primary rounded-lg space-y-2">
                <div className="flex items-start gap-3">
                  <img 
                    src={selectedNPC.sprite} 
                    alt={selectedNPC.name} 
                    className="h-12 pixel-icon"
                  />
                  <div className="flex-1">
                    <p className="font-bold text-lg">{selectedNPC.name}</p>
                    <p className="text-sm text-muted-foreground italic">"{selectedNPC.greeting}"</p>
                  </div>
                </div>
                <div className="text-sm space-y-1">
                  <p><span className="font-bold text-primary">Quest Type:</span> {selectedNPC.questTheme}</p>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger className="border-2 border-habbo-dark">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Easy">Easy</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Hard">Hard</SelectItem>
                    <SelectItem value="Brutal">Brutal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="encounters">Number of Encounters</Label>
                <Select 
                  value={encounters.toString()} 
                  onValueChange={(val) => setEncounters(parseInt(val))}
                >
                  <SelectTrigger className="border-2 border-habbo-dark">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 encounters (Short)</SelectItem>
                    <SelectItem value="10">10 encounters (Normal)</SelectItem>
                    <SelectItem value="13">13 encounters (Long)</SelectItem>
                    <SelectItem value="15">15 encounters (Epic)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || !selectedNPC}
              size="lg"
              className="w-full font-bold border-4 border-habbo-dark text-lg py-6"
            >
              {loading ? "Receiving Quest..." : "Accept Quest"}
            </Button>

            <Button
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="w-full font-bold border-4 border-habbo-dark"
            >
              Back to Dashboard
            </Button>
          </div>
        </HabboPanel>
      </div>
    </AppLayout>
  );
};

export default CreateDungeon;