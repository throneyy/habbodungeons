import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/AppLayout";
import { Users, ArrowLeft, Loader2 } from "lucide-react";

interface Server {
  id: string;
  server_name: string;
  max_players: number;
  difficulty: string;
  player_count: number;
}

const DungeonList = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please log in to join servers",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }
      
      // Only initialize once per session
      if (!hasInitialized) {
        setHasInitialized(true);
        await initializeGlobalServers();
      } else {
        await loadServers();
      }
    };
    
    checkAuth();

    // Subscribe to changes
    const channel = supabase
      .channel('global-servers')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'servers'
      }, () => {
        loadServers();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'server_players'
      }, () => {
        loadServers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const initializeGlobalServers = async () => {
    setInitializing(true);
    try {
      // Clean up abandoned servers first
      console.log('🧹 Cleaning up abandoned servers...');
      await supabase.functions.invoke("cleanup-completed-servers");
      
      // Check for existing global servers (no dungeon assigned)
      const { data: existingServers } = await supabase
        .from('servers')
        .select('id, difficulty, server_name')
        .is('dungeon_id', null)
        .eq('is_active', true);

      console.log('📊 Found', existingServers?.length || 0, 'available global servers');

      // Extract existing server numbers for each difficulty
      const existingNormalNumbers = new Set(
        existingServers
          ?.filter(s => s.difficulty === 'Normal')
          .map(s => {
            const match = s.server_name.match(/Frostkeep Dungeon (\d+)/);
            return match ? parseInt(match[1]) : null;
          })
          .filter(n => n !== null) || []
      );

      const existingHardcoreNumbers = new Set(
        existingServers
          ?.filter(s => s.difficulty === 'Hardcore')
          .map(s => {
            const match = s.server_name.match(/Frostkeep Hardcore (\d+)/);
            return match ? parseInt(match[1]) : null;
          })
          .filter(n => n !== null) || []
      );

      // Create missing Normal servers (1-10)
      const missingNormal = [];
      for (let i = 1; i <= 10; i++) {
        if (!existingNormalNumbers.has(i)) {
          missingNormal.push(i);
        }
      }

      if (missingNormal.length > 0) {
        console.log(`⚔️ Creating ${missingNormal.length} missing Normal dungeons: ${missingNormal.join(', ')}`);
        for (const num of missingNormal) {
          await supabase.functions.invoke("create-server", {
            body: { 
              serverName: `Frostkeep Dungeon ${num}`,
              maxPlayers: 6,
              difficulty: 'Normal',
              isSystemServer: true
            },
          });
        }
      }

      // Create missing Hardcore servers (1-4)
      const missingHardcore = [];
      for (let i = 1; i <= 4; i++) {
        if (!existingHardcoreNumbers.has(i)) {
          missingHardcore.push(i);
        }
      }

      if (missingHardcore.length > 0) {
        console.log(`🔥 Creating ${missingHardcore.length} missing Hardcore dungeons: ${missingHardcore.join(', ')}`);
        for (const num of missingHardcore) {
          await supabase.functions.invoke("create-server", {
            body: { 
              serverName: `Frostkeep Hardcore ${num}`,
              maxPlayers: 6,
              difficulty: 'Hardcore',
              isSystemServer: true
            },
          });
        }
      }

      await loadServers();
    } catch (error) {
      console.error('Failed to initialize servers:', error);
      loadServers(); // Still try to load
    } finally {
      setInitializing(false);
    }
  };

  const loadServers = async () => {
    try {
      // Get global servers (no dungeon assigned yet)
      const { data: serverData, error: serversError } = await supabase
        .from('servers')
        .select(`
          id,
          server_name,
          max_players,
          difficulty,
          server_players(count)
        `)
        .is('dungeon_id', null)
        .eq('is_active', true)
        .order('difficulty', { ascending: true })
        .order('server_name', { ascending: true });

      if (serversError) throw serversError;

      const serversWithData: Server[] = serverData?.map(server => ({
        id: server.id,
        server_name: server.server_name,
        max_players: server.max_players,
        difficulty: server.difficulty || 'Normal',
        player_count: server.server_players[0]?.count || 0,
      })) || [];

      // Sort by difficulty (Normal first) then by extracting number from name
      serversWithData.sort((a, b) => {
        if (a.difficulty !== b.difficulty) {
          return a.difficulty === 'Normal' ? -1 : 1;
        }
        const numA = parseInt(a.server_name.match(/\d+$/)?.[0] || '0');
        const numB = parseInt(b.server_name.match(/\d+$/)?.[0] || '0');
        return numA - numB;
      });

      setServers(serversWithData);
    } catch (error: any) {
      console.error('Failed to load servers:', error);
      toast({
        title: "Failed to load servers",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinServer = async (serverId: string) => {
    try {
      const { error } = await supabase.functions.invoke("join-server", {
        body: { serverId },
      });

      if (error) throw error;

      toast({
        title: "Joined Server!",
        description: "Waiting for adventure to begin...",
      });

      // Navigate to server lobby
      navigate(`/server-lobby/${serverId}`);
    } catch (error: any) {
      toast({
        title: "Failed to join server",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-black text-primary">Server Browser</h1>
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="font-bold border-4 border-habbo-dark"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>

        <HabboPanel title="Available Servers">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Normal Servers */}
              <div className="space-y-3">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <span className="px-3 py-1 bg-accent text-accent-foreground rounded">NORMAL</span>
                  Servers (6 Players Max)
                </h3>
                <div className="grid md:grid-cols-2 gap-3">
                  {servers.filter(s => s.difficulty === 'Normal').map((server) => (
                    <div
                      key={server.id}
                      className="flex items-center justify-between p-4 bg-muted rounded-lg border-4 border-habbo-dark hover:border-accent transition-all"
                    >
                      <div className="flex-1">
                        <div className="font-bold text-lg">{server.server_name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {server.player_count}/{server.max_players} players
                        </div>
                      </div>
                      <Button
                        onClick={() => handleJoinServer(server.id)}
                        disabled={server.player_count >= server.max_players}
                        className="font-bold"
                      >
                        Join
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hardcore Servers */}
              <div className="space-y-3">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <span className="px-3 py-1 bg-[hsl(0,84%,50%)] text-white rounded">HARDCORE</span>
                  Servers (6 Players Max)
                </h3>
                <div className="grid md:grid-cols-2 gap-3">
                  {servers.filter(s => s.difficulty === 'Hardcore').map((server) => (
                    <div
                      key={server.id}
                      className="flex items-center justify-between p-4 bg-muted rounded-lg border-4 border-[hsl(0,84%,50%)] hover:border-[hsl(0,84%,60%)] transition-all"
                    >
                      <div className="flex-1">
                        <div className="font-bold text-lg text-[hsl(0,84%,50%)]">{server.server_name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {server.player_count}/{server.max_players} players
                        </div>
                      </div>
                      <Button
                        onClick={() => handleJoinServer(server.id)}
                        disabled={server.player_count >= server.max_players}
                        className="font-bold bg-[hsl(0,84%,50%)] hover:bg-[hsl(0,84%,45%)] border-0"
                      >
                        Join
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </HabboPanel>
      </div>
    </AppLayout>
  );
};

export default DungeonList;
