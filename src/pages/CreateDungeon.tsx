import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/AppLayout";

const CreateDungeon = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [dungeonName, setDungeonName] = useState("");
  const [difficulty, setDifficulty] = useState("Normal");
  const [theme, setTheme] = useState("Classic");
  const [encounters, setEncounters] = useState(3);

  const handleGenerate = async () => {
    if (!dungeonName.trim()) {
      toast({
        title: "Please enter a dungeon name",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-dungeon", {
        body: {
          dungeonName,
          difficulty,
          theme,
          encounters,
        },
      });

      if (error) throw error;

      toast({ title: "Dungeon generated!" });
      navigate(`/dungeon-lobby/${data.dungeonId}`);
    } catch (error: any) {
      toast({
        title: "Failed to generate dungeon",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <HabboPanel title="Create a Dungeon">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="dungeon-name">Dungeon Name</Label>
              <Input
                id="dungeon-name"
                value={dungeonName}
                onChange={(e) => setDungeonName(e.target.value)}
                placeholder="The Dark Caverns"
                className="border-2 border-habbo-dark"
              />
            </div>

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
              <Label htmlFor="theme">Theme</Label>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="border-2 border-habbo-dark">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Classic">Classic</SelectItem>
                  <SelectItem value="Horror">Horror</SelectItem>
                  <SelectItem value="Magical">Magical</SelectItem>
                  <SelectItem value="Nature">Nature</SelectItem>
                  <SelectItem value="Chaos">Chaos</SelectItem>
                  <SelectItem value="Random">Random</SelectItem>
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
                  <SelectItem value="3">3 encounters</SelectItem>
                  <SelectItem value="4">4 encounters</SelectItem>
                  <SelectItem value="5">5 encounters</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading}
              size="lg"
              className="w-full font-bold border-4 border-habbo-dark text-lg py-6"
            >
              {loading ? "Generating Dungeon..." : "Generate Dungeon"}
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