import { useState, useEffect } from "react";
import { HabboPanel } from "./HabboPanel";
import { Button } from "./ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Users, Loader2 } from "lucide-react";

interface Server {
  id: string;
  server_name: string;
  host_user_id: string;
  max_players: number;
  player_count: number;
  host_username: string;
}

interface ServerListProps {
  dungeonId: string;
  onServerJoined: (serverId: string) => void;
}

export const ServerList = ({ dungeonId, onServerJoined }: ServerListProps) => {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    initializeServers();
    
    // Subscribe to server changes
    const channel = supabase
      .channel(`servers-${dungeonId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'servers',
        filter: `dungeon_id=eq.${dungeonId}`
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
  }, [dungeonId]);

  const initializeServers = async () => {
    setLoading(true);
    setInitializing(true);
    
    try {
      // Check if servers exist
      const { data: existingServers } = await supabase
        .from('servers')
        .select('id')
        .eq('dungeon_id', dungeonId)
        .eq('is_active', true);

      // If we don't have 10 servers, create them
      if (!existingServers || existingServers.length < 10) {
        const serversToCreate = 10 - (existingServers?.length || 0);
        const startNum = (existingServers?.length || 0) + 1;
        
        for (let i = 0; i < serversToCreate; i++) {
          await supabase.functions.invoke("create-server", {
            body: { 
              dungeonId, 
              serverName: `Server ${startNum + i}`,
              maxPlayers: 6,
              isSystemServer: true
            },
          });
        }
      }
      
      await loadServers();
    } catch (error: any) {
      console.error('Failed to initialize servers:', error);
    } finally {
      setInitializing(false);
      setLoading(false);
    }
  };

  const loadServers = async () => {
    try {
      const { data, error } = await supabase
        .from('servers')
        .select(`
          id,
          server_name,
          host_user_id,
          max_players,
          server_players(count)
        `)
        .eq('dungeon_id', dungeonId)
        .eq('is_active', true);

      if (error) throw error;

      // Get host usernames
      const hostIds = data?.map(s => s.host_user_id) || [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, habbo_username')
        .in('id', hostIds);

      const serversWithData = data?.map(server => ({
        id: server.id,
        server_name: server.server_name,
        host_user_id: server.host_user_id,
        max_players: server.max_players,
        player_count: server.server_players[0]?.count || 0,
        host_username: profiles?.find(p => p.id === server.host_user_id)?.habbo_username 
                      || profiles?.find(p => p.id === server.host_user_id)?.username 
                      || 'Unknown'
      })) || [];

      setServers(serversWithData);
    } catch (error: any) {
      console.error('Failed to load servers:', error);
    } finally {
      setLoading(false);
    }
  };


  const joinServer = async (serverId: string) => {
    try {
      const { error } = await supabase.functions.invoke("join-server", {
        body: { serverId },
      });

      if (error) throw error;

      toast({
        title: "Joined Run!",
      });

      onServerJoined(serverId);
    } catch (error: any) {
      toast({
        title: "Failed to join run",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <HabboPanel title="Join a Server">
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-bold text-sm">Available Servers (6 Players Max)</h3>
          
          {loading || initializing ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
              {initializing && <p className="ml-2 text-sm">Setting up servers...</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {servers.map((server) => (
                <div
                  key={server.id}
                  className="flex items-center justify-between p-3 bg-muted rounded border-2 border-habbo-dark"
                >
                  <div className="flex-1">
                    <div className="font-bold">
                      {server.server_name}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm">
                      <Users className="w-4 h-4 inline mr-1" />
                      {server.player_count}/{server.max_players}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => joinServer(server.id)}
                      disabled={server.player_count >= server.max_players}
                    >
                      Join
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </HabboPanel>
  );
};