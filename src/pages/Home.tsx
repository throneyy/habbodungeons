import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { MainNav } from "@/components/MainNav";
import dungeonBg from "@/assets/dungeon-bg.png";
import SnowFall from "@/components/SnowFall";
import { toast } from "sonner";

const Home = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      toast.error("Please enter a Habbo username");
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('habbo_username')
      .ilike('habbo_username', searchTerm)
      .not('habbo_username', 'is', null)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      toast.error("No player found with that Habbo username");
      return;
    }

    navigate(`/player/${data.habbo_username}`);
  };

  return (
    <div className="min-h-screen bg-background p-8 relative">
      <SnowFall />
      <div 
        className="absolute inset-0 opacity-20 bg-center bg-cover"
        style={{ backgroundImage: `url(${dungeonBg})` }}
      />
      <div className="max-w-6xl mx-auto space-y-6 relative z-10">
        <MainNav />
        
        {/* Hero Search */}
        <HabboPanel className="bg-gradient-to-br from-primary/20 to-secondary/20">
          <div className="flex gap-2">
            <Input
              placeholder="Enter Habboname to view their profile"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="h-12 text-lg border-2 border-habbo-dark"
            />
            <Button
              onClick={handleSearch}
              className="h-12 px-8 font-bold border-2 border-habbo-dark bg-green-600 hover:bg-green-700 whitespace-nowrap"
            >
              Search
            </Button>
          </div>
        </HabboPanel>

        <p className="text-center text-sm text-muted-foreground">
          This is a fan-made project and is not affiliated with Habbo or Sulake Corporation Oy.
        </p>
      </div>
    </div>
  );
};

export default Home;