import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { LogIn, User, BookOpen, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import habboDungeonsBanner from "@/assets/habbo-dungeons-banner.gif";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export const MainNav = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <nav className="bg-card border-4 border-habbo-dark rounded-xl p-4 mb-6 shadow-lg">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <img 
          src={habboDungeonsBanner}
          alt="Habbo Dungeons"
          className="cursor-pointer pixel-icon h-8"
          onClick={() => navigate("/")}
        />
        
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="border-2 border-habbo-dark font-bold shadow-md"
            onClick={() => navigate("/monster-manual")}
          >
            Monsters
          </Button>
          <Button
            variant="secondary"
            className="border-2 border-habbo-dark font-bold shadow-md"
            onClick={() => navigate("/dungeon-list")}
          >
            Dungeons
          </Button>
          <Button
            variant="secondary"
            className="border-2 border-habbo-dark font-bold shadow-md"
            onClick={() => navigate("/inventory")}
          >
            Inventory
          </Button>
          {user ? (
            <Button
              variant="outline"
              className="border-2 border-habbo-dark shadow-md"
              onClick={() => navigate("/dashboard")}
            >
              <User className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
          ) : (
            <Button
              variant="default"
              className="border-2 border-habbo-dark bg-primary hover:bg-primary/90 shadow-md"
              onClick={() => navigate("/auth")}
            >
              <LogIn className="w-4 h-4 mr-2" />
              Login
            </Button>
          )}
        </div>
      </div>
    </nav>
  );
};
