import { useEffect, useState } from "react";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { MainNav } from "@/components/MainNav";
import dungeonBg from "@/assets/dungeon-bg.png";
import SnowFall from "@/components/SnowFall";
import { toast } from "sonner";

interface PlayerStats {
  username: string;
  habbo_username: string;
  level: number;
  max_hp: number;
  atk: number;
  def: number;
}

const Home = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        username,
        habbo_username,
        player_stats (
          level,
          max_hp,
          atk,
          def
        )
      `)
      .not('habbo_username', 'is', null)
      .order('player_stats(level)', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error loading players:', error);
      setLoading(false);
      return;
    }

    const formattedPlayers = data.map((player: any) => ({
      username: player.username,
      habbo_username: player.habbo_username,
      level: player.player_stats?.[0]?.level || 1,
      max_hp: player.player_stats?.[0]?.max_hp || 100,
      atk: player.player_stats?.[0]?.atk || 10,
      def: player.player_stats?.[0]?.def || 10,
    }));

    setPlayers(formattedPlayers);
    setLoading(false);
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      toast.error("Please enter a Habbo username");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        username,
        habbo_username,
        player_stats (
          level,
          max_hp,
          atk,
          def
        )
      `)
      .ilike('habbo_username', `%${searchTerm}%`)
      .not('habbo_username', 'is', null);

    if (error) {
      console.error('Error searching:', error);
      toast.error("Error searching for player");
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      toast.error("No players found with that Habbo username");
      setLoading(false);
      return;
    }

    const formattedPlayers = data.map((player: any) => ({
      username: player.username,
      habbo_username: player.habbo_username,
      level: player.player_stats?.[0]?.level || 1,
      max_hp: player.player_stats?.[0]?.max_hp || 100,
      atk: player.player_stats?.[0]?.atk || 10,
      def: player.player_stats?.[0]?.def || 10,
    }));

    setPlayers(formattedPlayers);
    setLoading(false);
    toast.success(`Found ${data.length} player(s)`);
  };

  return (
    <div className="min-h-screen bg-background p-8 relative">
      <SnowFall />
      <div 
        className="absolute inset-0 opacity-20 bg-center bg-cover"
        style={{ backgroundImage: `url(${dungeonBg})` }}
      />
      <div className="max-w-6xl mx-auto space-y-6 relative z-10">
        <MainNav />
        
        {/* Hero Search */}
        <HabboPanel className="bg-gradient-to-br from-primary/20 to-secondary/20">
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-center text-foreground">
              Enter your Habboname and find your stats
            </h1>
            <div className="flex gap-2 max-w-2xl mx-auto">
              <Input
                placeholder="Enter your Habboname and find your stats"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="h-12 text-lg border-2 border-habbo-dark"
              />
              <Button
                onClick={handleSearch}
                className="h-12 px-8 font-bold border-2 border-habbo-dark bg-green-600 hover:bg-green-700"
              >
                Search
              </Button>
            </div>
          </div>
        </HabboPanel>

        {/* Player Stats */}
        <HabboPanel title="Habbo Dungeons Players">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading players...</p>
            </div>
          ) : players.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No players found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-habbo-dark">
                    <th className="text-left py-3 px-4 font-bold">Habbo Username</th>
                    <th className="text-center py-3 px-4 font-bold">Level</th>
                    <th className="text-center py-3 px-4 font-bold">HP</th>
                    <th className="text-center py-3 px-4 font-bold">ATK</th>
                    <th className="text-center py-3 px-4 font-bold">DEF</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player, index) => (
                    <tr 
                      key={index}
                      className="border-b border-border hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium">{player.habbo_username}</td>
                      <td className="text-center py-3 px-4">{player.level}</td>
                      <td className="text-center py-3 px-4 text-habbo-hp">{player.max_hp}</td>
                      <td className="text-center py-3 px-4 text-habbo-orange">{player.atk}</td>
                      <td className="text-center py-3 px-4 text-blue-400">{player.def}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </HabboPanel>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground border-t-2 border-border pt-6">
          Habbo Dungeons is a fan-made project and is not affiliated with Sulake Corporation Oy.
        </p>
      </div>
    </div>
  );
};

export default Home;