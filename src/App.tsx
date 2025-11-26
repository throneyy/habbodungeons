import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import LinkHabbo from "./pages/LinkHabbo";
import Dashboard from "./pages/Dashboard";
import CreateDungeon from "./pages/CreateDungeon";
import DungeonList from "./pages/DungeonList";
import ServerLobby from "./pages/ServerLobby";
import Battle from "./pages/Battle";
import Inventory from "./pages/Inventory";
import NotFound from "./pages/NotFound";
import LootBox from "./pages/LootBox";
import AdminPanel from "./pages/AdminPanel";
import PlayerProfile from "./pages/PlayerProfile";
import MonsterManual from "./pages/MonsterManual";
import SpriteEditor from "./pages/SpriteEditor";
import Store from "./pages/Store";
import BattleSim from "./pages/BattleSim";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/link-habbo" element={<LinkHabbo />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/create-dungeon" element={<CreateDungeon />} />
          <Route path="/dungeon-list" element={<DungeonList />} />
          <Route path="/server-lobby/:serverId" element={<ServerLobby />} />
          <Route path="/battle/:id" element={<Battle />} />
          <Route path="/loot-box" element={<LootBox />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/player/:habboUsername" element={<PlayerProfile />} />
          <Route path="/monster-manual" element={<MonsterManual />} />
          <Route path="/sprite-editor" element={<SpriteEditor />} />
          <Route path="/store" element={<Store />} />
          <Route path="/battle-sim" element={<BattleSim />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
