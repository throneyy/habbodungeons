import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { MainNav } from "@/components/MainNav";
import dungeonBg from "@/assets/dungeon-bg.png";
import frostkeepBanner from "@/assets/the-shattered-frostkeep.gif";
import SnowFall from "@/components/SnowFall";
import { toast } from "sonner";
import pixelSword from "@/assets/pixel-sword.png";
import goblinTrio from "@/assets/goblin-trio.png";
import victoryTrophy from "@/assets/victory-trophy.png";
import pixelStar from "@/assets/pixel-star.png";
import npcKnight from "@/assets/npc-knight.png";

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
      <div className="max-w-6xl mx-auto space-y-8 relative z-10">
        <MainNav />
        
        {/* Search Habbo Players */}
        <div className="bg-card border-4 border-habbo-dark rounded-xl p-4 shadow-lg">
          <div className="flex gap-2">
            <Input
              placeholder="Enter your Habboname and find your fishy info"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 h-12 text-base bg-card border-2 border-habbo-dark"
            />
            <Button
              onClick={handleSearch}
              className="h-12 px-6 bg-green-600 hover:bg-green-700 text-white font-bold border-2 border-habbo-dark"
            >
              Search
            </Button>
          </div>
        </div>
        
        {/* Hero Section */}
        <HabboPanel className="bg-gradient-to-br from-primary/30 to-secondary/30 overflow-hidden">
          <div className="space-y-6 py-8">
            <img 
              src={frostkeepBanner}
              alt="The Shattered Frostkeep"
              className="mx-auto pixel-icon animate-fade-in"
              style={{ imageRendering: 'pixelated' }}
            />
            
            <div className="grid md:grid-cols-[auto_1fr] gap-6 items-start max-w-4xl mx-auto">
              {/* NPC Knight Guide */}
              <div className="flex justify-center md:justify-start animate-scale-in">
                <div className="relative">
                  <img 
                    src={npcKnight} 
                    alt="Royal Guard" 
                    className="w-24 h-24 md:w-32 md:h-32 pixel-icon hover-scale"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary/90 text-primary-foreground px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap border-2 border-habbo-dark">
                    Royal Guard
                  </div>
                </div>
              </div>
              
              {/* Story Content */}
              <div className="space-y-4 text-left animate-fade-in">
                <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
                  <span className="text-primary font-bold">"Greetings, brave adventurer!"</span>
                  {" "}Beneath the grandeur of the Habbo Hotel lies a dark secret—the Shattered Frostkeep, 
                  an ancient dungeon consumed by eternal winter. What was once the hotel's magnificent basement 
                  has been overtaken by an evil curse, transforming it into a frozen realm of terror.
                </p>
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                  The Ice Knight and his cursed legion have claimed these depths as their domain. 
                  Form a party with fellow Habbos, battle through waves of frozen enemies, and collect legendary loot. 
                  Only the bravest will survive the bitter cold and restore peace to the hotel above!
                </p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-6">
              <Button
                onClick={() => navigate("/auth")}
                size="lg"
                className="h-14 px-8 text-lg font-bold border-2 border-habbo-dark bg-primary hover:bg-primary/90 shadow-lg hover-scale"
              >
                Start Your Adventure
              </Button>
              <Button
                onClick={() => navigate("/dungeon-list")}
                size="lg"
                variant="outline"
                className="h-14 px-8 text-lg font-bold border-2 border-habbo-dark shadow-lg hover-scale"
              >
                Browse Dungeons
              </Button>
            </div>
          </div>
        </HabboPanel>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <HabboPanel className="bg-gradient-to-br from-red-500/20 to-orange-500/20 text-center">
            <img src={pixelSword} alt="Epic Battles" className="w-16 h-16 mx-auto mb-4 pixel-icon" style={{ imageRendering: 'pixelated' }} />
            <h3 className="text-xl font-bold text-foreground mb-2">Epic Battles</h3>
            <p className="text-muted-foreground">
              Face challenging enemies in turn-based combat with strategic depth
            </p>
          </HabboPanel>

          <HabboPanel className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 text-center">
            <img src={goblinTrio} alt="Party System" className="w-16 h-16 mx-auto mb-4 pixel-icon" style={{ imageRendering: 'pixelated' }} />
            <h3 className="text-xl font-bold text-foreground mb-2">Party System</h3>
            <p className="text-muted-foreground">
              Team up with friends or join public servers to conquer dungeons together
            </p>
          </HabboPanel>

          <HabboPanel className="bg-gradient-to-br from-yellow-500/20 to-amber-500/20 text-center">
            <img src={victoryTrophy} alt="Legendary Loot" className="w-16 h-16 mx-auto mb-4 pixel-icon" style={{ imageRendering: 'pixelated' }} />
            <h3 className="text-xl font-bold text-foreground mb-2">Legendary Loot</h3>
            <p className="text-muted-foreground">
              Discover powerful weapons, armor, and consumables to enhance your character
            </p>
          </HabboPanel>

          <HabboPanel className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 text-center">
            <img src={pixelStar} alt="Level Up" className="w-16 h-16 mx-auto mb-4 pixel-icon" style={{ imageRendering: 'pixelated' }} />
            <h3 className="text-xl font-bold text-foreground mb-2">Level Up</h3>
            <p className="text-muted-foreground">
              Gain experience, increase your stats, and become an unstoppable warrior
            </p>
          </HabboPanel>
        </div>

        {/* How to Play */}
        <HabboPanel className="bg-gradient-to-br from-secondary/20 to-accent/20">
          <h2 className="text-3xl font-bold text-foreground mb-6 text-center">How to Play</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center space-y-2">
              <div className="text-4xl font-bold text-primary mb-2">1</div>
              <h4 className="text-xl font-bold text-foreground">Create Account</h4>
              <p className="text-muted-foreground">
                Sign up and link your Habbo account to get started
              </p>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl font-bold text-primary mb-2">2</div>
              <h4 className="text-xl font-bold text-foreground">Join a Server</h4>
              <p className="text-muted-foreground">
                Browse available servers or create your own dungeon lobby
              </p>
            </div>
            <div className="text-center space-y-2">
              <div className="text-4xl font-bold text-primary mb-2">3</div>
              <h4 className="text-xl font-bold text-foreground">Battle & Loot</h4>
              <p className="text-muted-foreground">
                Fight monsters, collect rewards, and level up your character
              </p>
            </div>
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