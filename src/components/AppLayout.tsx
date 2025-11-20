import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import SnowFall from "./SnowFall";
import { DailyLeaderboard } from "./DailyLeaderboard";
import dungeonBg from "@/assets/dungeon-bg.png";
import habboDungeonsBanner from "@/assets/habbo-dungeons-banner.gif";

interface AppLayoutProps {
  children: ReactNode;
  hideBanner?: boolean;
  hideLeaderboard?: boolean;
}

export const AppLayout = ({ children, hideBanner = false, hideLeaderboard = false }: AppLayoutProps) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background relative">
      <SnowFall />
      <div 
        className="fixed inset-0 opacity-20 bg-center bg-cover"
        style={{ backgroundImage: `url(${dungeonBg})` }}
      />
      
      <div className="relative z-10">
        <div className="flex justify-between items-start p-4 gap-4">
          {/* Banner */}
          <div className="flex-1" />
          
          {!hideBanner && (
            <div className="flex justify-center">
              <img 
                src={habboDungeonsBanner} 
                alt="Habbo Dungeons" 
                className="cursor-pointer pixel-icon"
                onClick={() => navigate("/")}
                style={{ height: 'auto', width: 'auto', maxHeight: '96px' }}
              />
            </div>
          )}
          
          {/* Leaderboard */}
          {!hideLeaderboard ? (
            <div className="flex-1 flex justify-end">
              <DailyLeaderboard />
            </div>
          ) : (
            <div className="flex-1" />
          )}
        </div>
        
        <div className="p-8 pt-4">
          {children}
        </div>
      </div>
    </div>
  );
};
