import { useState, useEffect } from "react";
import { HabboPanel } from "./HabboPanel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Users, Crown, Loader2 } from "lucide-react";

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
  const [serverName, setServerName] = useState("");
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadServers();
    
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

  const createServer = async () => {
    if (!serverName.trim()) {
      toast({
        title: "Server name required",
        description: "Please enter a name for your server",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-server", {
        body: { dungeonId, serverName: serverName.trim() },
      });

      if (error) throw error;

      toast({
        title: "Server Created!",
        description: "Your server is now visible to other players",
      });

      setServerName("");
      onServerJoined(data.serverId);
    } catch (error: any) {
      toast({
        title: "Failed to create server",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const joinServer = async (serverId: string) => {
    try {
      const { error } = await supabase.functions.invoke("join-server", {
        body: { serverId },
      });

      if (error) throw error;

      toast({
        title: "Joined Server!",
      });

      onServerJoined(serverId);
    } catch (error: any) {
      toast({
        title: "Failed to join server",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <HabboPanel title="Server List">
      <div className="space-y-4">
        {/* Create Server Section */}
        <div className="space-y-2">
          <h3 className="font-bold text-sm">Create a Server</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Server name..."
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              maxLength={30}
              onKeyDown={(e) => e.key === 'Enter' && createServer()}
            />
            <Button
              onClick={createServer}
              disabled={creating || !serverName.trim()}
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </Button>
          </div>
        </div>

        {/* Available Servers */}
        <div className="space-y-2">
          <h3 className="font-bold text-sm">Available Servers</h3>
          
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : servers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No servers available</p>
              <p className="text-xs">Create one to get started!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {servers.map((server) => (
                <div
                  key={server.id}
                  className="flex items-center justify-between p-3 bg-muted rounded border-2 border-habbo-dark"
                >
                  <div className="flex-1">
                    <div className="font-bold flex items-center gap-2">
                      {server.server_name}
                      <Crown className="w-3 h-3 text-yellow-500" />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Host: {server.host_username}
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