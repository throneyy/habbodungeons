import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { DailyLeaderboard } from "@/components/DailyLeaderboard";
import { Button } from "@/components/ui/button";

const Index = () => {
  const navigate = useNavigate();

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

        {/* Daily Leaderboard */}
        <div className="max-w-2xl mx-auto pt-8">
          <DailyLeaderboard />
        </div>
      </div>
    </AppLayout>
  );
};

export default Index;
