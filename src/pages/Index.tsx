import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { DailyLeaderboard } from "@/components/DailyLeaderboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Index = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const handleSearch = () => {
    if (searchTerm.trim()) {
      navigate(`/player-profile/${encodeURIComponent(searchTerm)}`);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-black text-primary">Habbo Dungeons</h1>
          <p className="text-xl text-muted-foreground">Adventure awaits in the frozen depths!</p>
          
          <div className="flex gap-4 justify-center pt-4">
            <Button 
              onClick={() => navigate("/auth")}
              size="lg"
              className="font-bold border-4 border-habbo-dark"
            >
              Get Started
            </Button>
            <Button 
              onClick={() => navigate("/dashboard")}
              size="lg"
              variant="outline"
              className="font-bold border-4 border-habbo-dark"
            >
              Player Dashboard
            </Button>
          </div>
        </div>

        {/* Search Habbo Players */}
        <div className="bg-card border-4 border-habbo-dark rounded-xl p-4 shadow-lg">
          <div className="flex gap-2">
            <Input
              placeholder="Search by Habbo Origins username"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 h-12 text-base bg-card border-2 border-habbo-dark"
            />
            <Button
              onClick={handleSearch}
              className="h-12 px-6 bg-green-600 hover:bg-green-700 text-white font-bold border-2 border-habbo-dark"
            >
              Search
            </Button>
          </div>
        </div>

        {/* Daily Leaderboard */}
        <DailyLeaderboard />
      </div>
    </AppLayout>
  );
};

export default Index;
