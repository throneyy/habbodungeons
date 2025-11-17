import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import SnowFall from "./SnowFall";
import dungeonBg from "@/assets/dungeon-bg.png";
import habboDungeonsBanner from "@/assets/habbo-dungeons-banner.gif";

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background relative">
      <SnowFall />
      <div 
        className="fixed inset-0 opacity-20 bg-center bg-cover"
        style={{ backgroundImage: `url(${dungeonBg})` }}
      />
      
      <div className="relative z-10">
        <div className="p-4 flex justify-center">
          <img 
            src={habboDungeonsBanner} 
            alt="Habbo Dungeons" 
            className="cursor-pointer pixel-icon"
            onClick={() => navigate("/dashboard")}
            style={{ height: 'auto', width: 'auto', maxHeight: '48px' }}
          />
        </div>
        
        <div className="p-8 pt-4">
          {children}
        </div>
      </div>
    </div>
  );
};
