import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import habboDungeonsBanner from "@/assets/habbo-dungeons-banner.gif";

export const MainNav = () => {
  const navigate = useNavigate();

  return (
    <nav className="bg-card border-4 border-habbo-dark rounded-xl p-4 mb-6">
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
        </div>
      </div>
    </nav>
  );
};
