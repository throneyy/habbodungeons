import { ReactNode } from "react";
import SnowFall from "./SnowFall";
import { MainNav } from "./MainNav";
import dungeonBg from "@/assets/ice-pool-isometric.png";

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background relative">
      <SnowFall />
      <div 
        className="fixed inset-0 opacity-30 bg-center bg-no-repeat brightness-75"
        style={{ backgroundImage: `url(${dungeonBg})`, backgroundSize: '110%' }}
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
