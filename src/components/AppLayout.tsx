import { ReactNode } from "react";
import SnowFall from "./SnowFall";
import { MainNav } from "./MainNav";
import dungeonBg from "@/assets/dungeon-bg.png";

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background relative">
      <SnowFall />
      <div 
        className="fixed inset-0 opacity-20 bg-center bg-cover"
        style={{ backgroundImage: `url(${dungeonBg})` }}
      />
      
      <div className="relative z-10 p-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <MainNav />
          {children}
        </div>
      </div>
    </div>
  );
};
