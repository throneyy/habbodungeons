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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
