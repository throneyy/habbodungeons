import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import dungeonBg from "@/assets/dungeon-bg.png";
import habboDungeonBanner from "@/assets/habbo-dungeon-banner.gif";
import pixelDice from "@/assets/pixel-dice.png";
import pixelStar from "@/assets/pixel-star.png";
import pixelSword from "@/assets/pixel-sword.png";
import SnowFall from "@/components/SnowFall";

const Home = () => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background p-8 relative">
      <SnowFall />
      <div 
        className="absolute inset-0 opacity-20 bg-center bg-cover"
        style={{ backgroundImage: `url(${dungeonBg})` }}
      />
      <div className="max-w-6xl mx-auto space-y-8 relative z-10">
        {/* Hero Header */}
        <HabboPanel className="text-center">
          <div className="space-y-4">
            <img 
              src={habboDungeonBanner} 
              alt="Habbo Dungeon" 
              className="mx-auto w-auto pixel-icon"
              style={{ height: "auto", maxWidth: "500px" }}
            />
            <p className="text-2xl font-bold text-foreground">
              AI-powered JRPG battles for Habbo roleplayers
            </p>
            <p className="text-lg text-muted-foreground">
              Roll dice in Habbo. Fight monsters on Habbo Dungeon.
            </p>
          </div>
        </HabboPanel>

        {/* How It Works */}
        <HabboPanel title="How It Works">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-primary rounded-lg mx-auto flex items-center justify-center border-4 border-habbo-dark p-2">
                <img src={pixelDice} alt="Dice" className="w-full h-full object-contain pixel-icon" />
              </div>
              <h3 className="font-bold text-lg">1. Roll the Dice</h3>
              <p className="text-muted-foreground">Roll 5 holodice in a Habbo room</p>
            </div>
            
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-secondary rounded-lg mx-auto flex items-center justify-center border-4 border-habbo-dark p-2">
                <img src={pixelStar} alt="Star" className="w-full h-full object-contain pixel-icon" />
              </div>
              <h3 className="font-bold text-lg">2. Input Your Dice</h3>
              <p className="text-muted-foreground">Enter your dice results into Habbo Dungeon</p>
            </div>
            
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-accent rounded-lg mx-auto flex items-center justify-center border-4 border-habbo-dark p-2">
                <img src={pixelSword} alt="Sword" className="w-full h-full object-contain pixel-icon" />
              </div>
              <h3 className="font-bold text-lg">3. Watch the Battle</h3>
              <p className="text-muted-foreground">See your JRPG battle unfold with AI narration</p>
            </div>
          </div>
        </HabboPanel>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {isLoggedIn ? (
            <Button 
              size="lg"
              className="text-lg font-bold px-8 py-6 border-4 border-habbo-dark"
              onClick={() => navigate("/dashboard")}
            >
              Go to My Dashboard
            </Button>
          ) : (
            <>
              <Button 
                size="lg"
                className="text-lg font-bold px-8 py-6 border-4 border-habbo-dark"
                onClick={() => navigate("/auth")}
              >
                Sign Up / Log In
              </Button>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground">
          Habbo Dungeon is a fan-made project and is not affiliated with Habbo or Sulake Corporation.
        </p>
      </div>
    </div>
  );
};

export default Home;