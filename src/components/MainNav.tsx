import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export const MainNav = () => {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <nav className="bg-card border-4 border-habbo-dark rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div 
          className="text-2xl font-bold text-primary cursor-pointer pixel-icon"
          onClick={() => navigate("/")}
          style={{ fontFamily: 'Volter, monospace', letterSpacing: '2px' }}
        >
          HABBO-DUNGEONS
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="border-2 border-habbo-dark font-bold"
            onClick={() => navigate("/")}
          >
            Home
          </Button>
          <Button
            variant="secondary"
            className="border-2 border-habbo-dark font-bold"
            onClick={() => navigate("/dungeon-list")}
          >
            Dungeons
          </Button>
          <Button
            variant="secondary"
            className="border-2 border-habbo-dark font-bold"
            onClick={() => navigate("/inventory")}
          >
            Inventory
          </Button>
          <Button
            variant="secondary"
            className="border-2 border-habbo-dark font-bold"
            onClick={() => navigate("/dashboard")}
          >
            Dashboard
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            className="border-2 border-habbo-dark"
            onClick={() => setIsDark(!isDark)}
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
      </div>
    </nav>
  );
};
