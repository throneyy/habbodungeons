import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/AppLayout";
import { Users, Loader2, ArrowLeft, Swords } from "lucide-react";

interface ServerInfo {
  id: string;
  server_name: string;
  difficulty: string;
  max_players: number;
}

interface Player {
  id: string;
  username: string;
  habbo_username: string | null;
}

const ServerLobby = () => {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    // Clean up abandoned servers first
    cleanupServers();
    loadServerData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const cleanupServers = async () => {
    try {
      console.log('🧹 Running server cleanup...');
      await supabase.functions.invoke("cleanup-completed-servers");
    } catch (error) {
      console.error('Cleanup failed:', error);
      // Don't show error to user, just log it
    }
  };

  useEffect(() => {
    if (!serverId) return;

    loadServerData();

    console.log('Setting up server_players subscription for server:', serverId);

    // Subscribe to server changes
    const channel = supabase
      .channel(`server-lobby-${serverId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'server_players',
        filter: `server_id=eq.${serverId}`
      }, (payload) => {
        console.log('🔥 SERVER_PLAYERS CHANGE DETECTED:', payload);
        loadServerData();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'servers',
        filter: `id=eq.${serverId}`
      }, (payload) => {
        console.log('🔥 SERVER UPDATE DETECTED:', payload);
        console.log('🔍 New dungeon_id:', payload.new?.dungeon_id);
        checkForDungeon();
      })
      .subscribe((status) => {
        console.log('📡 ServerLobby subscription status:', status);
      });

    // Fallback: Poll for dungeon assignment every 2 seconds
    // This ensures navigation happens even if real-time fails
    const pollInterval = setInterval(async () => {
      console.log('🔄 Polling for dungeon assignment...');
      await checkForDungeon();
    }, 2000);

    return () => {
      console.log('Cleaning up server subscription');
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [serverId]);

  const checkForDungeon = async () => {
    if (!serverId) return;

    console.log('🔍 Checking for dungeon assignment for server:', serverId);

    // Check if a dungeon has been assigned to this server
    const { data: serverData, error } = await supabase
      .from('servers')
      .select('dungeon_id')
      .eq('id', serverId)
      .maybeSingle();

    console.log('📋 Server query result:', { data: serverData, error });

    if (error) {
      console.error('❌ Error checking for dungeon:', error);
      return;
    }

    if (serverData?.dungeon_id) {
      console.log('✅ Dungeon found! Navigating to:', serverData.dungeon_id);
      
      // Show notification for ALL players (host and non-host)
      toast({ 
        title: "Adventure ready!",
        description: "Entering dungeon now..."
      });
      
      // Navigate to dungeon lobby - this happens for everyone simultaneously
      navigate(`/dungeon-lobby/${serverData.dungeon_id}`);
    } else {
      console.log('⏳ No dungeon assigned yet');
    }
  };

  const loadServerData = async () => {
    if (!serverId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      console.log('Loading server data for server:', serverId);

      // Get server info
      const { data: serverData, error: serverError } = await supabase
        .from('servers')
        .select('id, server_name, difficulty, max_players, dungeon_id')
        .eq('id', serverId)
        .maybeSingle();

      if (serverError) throw serverError;
      
      // If server has a dungeon, navigate there
      if (serverData.dungeon_id) {
        navigate(`/dungeon-lobby/${serverData.dungeon_id}`);
        return;
      }

      setServer(serverData);

      // Get players in server
      const { data: serverPlayers, error: playersError } = await supabase
        .from('server_players')
        .select('user_id')
        .eq('server_id', serverId);

      console.log('📋 Server players query result:', serverPlayers);

      if (playersError) {
        console.error('Error loading players:', playersError);
        throw playersError;
      }

      if (serverPlayers && serverPlayers.length > 0) {
        const userIds = serverPlayers.map(sp => sp.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, habbo_username')
          .in('id', userIds);

        console.log('👥 Player profiles:', profiles);

        setPlayers(profiles?.map(p => ({
          id: p.id,
          username: p.username,
          habbo_username: p.habbo_username
        })) || []);
      } else {
        console.log('No players found in server');
        setPlayers([]);
      }
    } catch (error: any) {
      console.error('Failed to load server data:', error);
      toast({
        title: "Failed to load server",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartAdventure = async () => {
    setStarting(true);
    try {
      console.log('🎯 Starting adventure for server:', serverId);
      const { data, error } = await supabase.functions.invoke("start-server-dungeon", {
        body: { serverId },
      });

      if (error) throw error;

      console.log('✅ Edge function returned:', data);

      toast({ 
        title: "Adventure starting!",
        description: "Loading dungeon for all players..."
      });
      
      // Check for dungeon immediately as fallback in case realtime is slow
      await checkForDungeon();
      
      // If still not navigated after 2 seconds, force check again
      setTimeout(async () => {
        console.log('⏰ Timeout fallback - checking for dungeon');
        await checkForDungeon();
        setStarting(false); // Reset loading state even if navigation didn't happen
      }, 2000);
    } catch (error: any) {
      console.error('❌ Failed to start adventure:', error);
      toast({
        title: "Failed to start adventure",
        description: error.message,
        variant: "destructive",
      });
      setStarting(false);
    }
  };

  const handleLeaveServer = async () => {
    try {
      await supabase
        .from('server_players')
        .delete()
        .eq('server_id', serverId)
        .eq('user_id', currentUserId);

      toast({ title: "Left server" });
      navigate("/dungeon-list");
    } catch (error: any) {
      toast({
        title: "Failed to leave server",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!server) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto text-center py-12">
          <p className="text-lg text-muted-foreground">Server not found</p>
          <Button onClick={() => navigate("/dungeon-list")} className="mt-4">
            Back to Server Browser
          </Button>
        </div>
      </AppLayout>
    );
  }

  const isHardcore = server.difficulty === 'Hardcore';

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black text-primary">{server.server_name}</h1>
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-3 py-1 rounded font-bold text-sm ${
                isHardcore 
                  ? 'bg-[hsl(0,84%,50%)] text-white' 
                  : 'bg-accent text-accent-foreground'
              }`}>
                {server.difficulty}
              </span>
              <span className="text-muted-foreground">
                <Users className="w-4 h-4 inline mr-1" />
                {players.length}/{server.max_players} players
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/dungeon-list")}
            className="font-bold border-4 border-habbo-dark"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Servers
          </Button>
        </div>

        <HabboPanel title="Lobby">
          <div className="space-y-6">
            {/* Players List */}
            <div>
              <h3 className="font-bold mb-3">Players in Lobby</h3>
              {players.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Waiting for players to join...
                </p>
              ) : (
                <div className="grid md:grid-cols-2 gap-3">
                  {players.map((player) => (
                    <div
                      key={player.id}
                      className={`p-4 rounded-lg border-4 ${
                        player.id === currentUserId
                          ? 'bg-primary/10 border-primary'
                          : 'bg-muted border-habbo-dark'
                      }`}
                    >
                      <p className="font-bold">
                        {player.habbo_username || player.username.split('@')[0]}
                        {player.id === currentUserId && (
                          <span className="text-xs ml-2 text-muted-foreground">(You)</span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-center pt-4 border-t-4 border-habbo-dark">
              <Button
                size="lg"
                onClick={handleStartAdventure}
                disabled={starting || players.length === 0}
                className={`font-bold text-lg py-6 px-8 ${
                  isHardcore 
                    ? 'bg-[hsl(0,84%,50%)] hover:bg-[hsl(0,84%,45%)] border-0'
                    : 'border-4 border-habbo-dark'
                }`}
              >
                {starting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Generating Adventure...
                  </>
                ) : (
                  <>
                    <Swords className="w-5 h-5 mr-2" />
                    Start Adventure
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleLeaveServer}
                disabled={starting}
                className="font-bold border-4 border-habbo-dark text-lg py-6 px-8"
              >
                Leave Server
              </Button>
            </div>

            {players.length > 0 && (
              <p className="text-center text-sm text-muted-foreground">
                Any player can start the adventure when ready
              </p>
            )}
          </div>
        </HabboPanel>
      </div>
    </AppLayout>
  );
};

export default ServerLobby;
