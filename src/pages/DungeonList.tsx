import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/AppLayout";
import { Users, Swords, ArrowLeft, Loader2 } from "lucide-react";

interface ActiveDungeon {
  id: string;
  name: string;
  difficulty: string;
  theme: string;
  server_id: string | null;
  server_name: string | null;
  host_username: string | null;
  player_count: number;
  players: Array<{
    username: string;
    habbo_username: string | null;
  }>;
}

const DungeonList = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dungeons, setDungeons] = useState<ActiveDungeon[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadActiveDungeons();

    // Subscribe to changes
    const channel = supabase
      .channel('active-dungeons')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'battle_states'
      }, () => {
        loadActiveDungeons();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'server_players'
      }, () => {
        loadActiveDungeons();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadActiveDungeons = async () => {
    try {
      // Get active battle states with dungeon info
      const { data: battles, error: battlesError } = await supabase
        .from('battle_states')
        .select(`
          id,
          dungeon_id,
          server_id,
          dungeons (
            id,
            name,
            difficulty,
            theme
          ),
          servers (
            id,
            server_name,
            host_user_id
          )
        `)
        .eq('is_active', true);

      if (battlesError) throw battlesError;

      // Get all unique server IDs
      const serverIds = battles
        ?.map(b => b.server_id)
        .filter(id => id !== null) || [];

      // Get players for each server
      const playersByServer: Record<string, any[]> = {};
      
      if (serverIds.length > 0) {
        const { data: serverPlayers, error: playersError } = await supabase
          .from('server_players')
          .select('server_id, user_id')
          .in('server_id', serverIds);

        if (playersError) throw playersError;

        // Get unique user IDs
        const userIds = serverPlayers?.map(sp => sp.user_id) || [];
        
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, habbo_username')
            .in('id', userIds);

          serverPlayers?.forEach(sp => {
            if (!playersByServer[sp.server_id]) {
              playersByServer[sp.server_id] = [];
            }
            const profile = profiles?.find(p => p.id === sp.user_id);
            if (profile) {
              playersByServer[sp.server_id].push({
                username: profile.username,
                habbo_username: profile.habbo_username
              });
            }
          });
        }
      }

      // Get host usernames
      const hostIds = battles
        ?.map(b => b.servers?.host_user_id)
        .filter(id => id) || [];

      const { data: hostProfiles } = await supabase
        .from('profiles')
        .select('id, username, habbo_username')
        .in('id', hostIds);

      // Format the data
      const formatted: ActiveDungeon[] = battles?.map(battle => {
        const serverId = battle.server_id;
        const players = serverId ? (playersByServer[serverId] || []) : [];
        const hostProfile = hostProfiles?.find(p => p.id === battle.servers?.host_user_id);

        return {
          id: battle.dungeon_id,
          name: battle.dungeons.name,
          difficulty: battle.dungeons.difficulty,
          theme: battle.dungeons.theme,
          server_id: battle.server_id,
          server_name: battle.servers?.server_name || null,
          host_username: hostProfile?.habbo_username || hostProfile?.username || null,
          player_count: players.length,
          players: players.map(p => ({
            username: p.username,
            habbo_username: p.habbo_username
          }))
        };
      }) || [];

      setDungeons(formatted);
    } catch (error: any) {
      console.error('Failed to load active dungeons:', error);
      toast({
        title: "Failed to load dungeons",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinDungeon = (dungeonId: string) => {
    navigate(`/dungeon-lobby/${dungeonId}`);
  };

  const handleStartNewDungeon = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-dungeon", {
        body: {
          theme: "Classic",
          encounters: 3,
          difficulty: "Normal",
        },
      });

      if (error) throw error;

      toast({ title: "Quest generated!" });
      navigate(`/dungeon-lobby/${data.dungeonId}`);
    } catch (error: any) {
      toast({
        title: "Failed to generate quest",
        description: error.message,
        variant: "destructive",
      });
      setGenerating(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-black text-primary">Active Dungeons</h1>
          <div className="flex gap-3">
            <Button
              onClick={handleStartNewDungeon}
              disabled={generating}
              className="font-bold border-4 border-habbo-dark"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {generating ? "Generating..." : "Start New Dungeon"}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard")}
              className="font-bold border-4 border-habbo-dark"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>

        <HabboPanel title="Active Dungeon Runs">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : dungeons.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Swords className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-bold">No Active Dungeons</p>
              <p className="text-sm">Start a new dungeon to begin your adventure!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {dungeons.map((dungeon) => (
                <div
                  key={`${dungeon.id}-${dungeon.server_id}`}
                  className="p-4 bg-muted rounded-lg border-4 border-habbo-dark hover:border-primary transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-primary">{dungeon.name}</h3>
                      {dungeon.server_name && (
                        <p className="text-sm text-muted-foreground">
                          Run: {dungeon.server_name}
                        </p>
                      )}
                      <div className="flex gap-3 mt-2">
                        <span className="px-2 py-1 bg-accent rounded text-xs font-bold">
                          {dungeon.difficulty}
                        </span>
                        <span className="px-2 py-1 bg-secondary rounded text-xs font-bold">
                          {dungeon.theme}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleJoinDungeon(dungeon.id)}
                      className="font-bold"
                    >
                      View
                    </Button>
                  </div>

                  {/* Players List */}
                  <div className="mt-4 pt-4 border-t-2 border-habbo-dark">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4" />
                      <span className="font-bold text-sm">
                        Players ({dungeon.player_count})
                      </span>
                      {dungeon.host_username && (
                        <span className="text-xs text-muted-foreground ml-2">
                          Host: {dungeon.host_username}
                        </span>
                      )}
                    </div>
                    
                    {dungeon.players.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {dungeon.players.map((player, idx) => (
                          <div
                            key={idx}
                            className="px-3 py-1 bg-background rounded border-2 border-habbo-dark"
                          >
                            <span className="text-sm font-semibold">
                              {player.habbo_username || player.username.split('@')[0]}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        Solo adventure
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </HabboPanel>
      </div>
    </AppLayout>
  );
};

export default DungeonList;
