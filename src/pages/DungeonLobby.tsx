import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { ServerList } from "@/components/ServerList";
import { PartyMembers } from "@/components/PartyMembers";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/AppLayout";
import { Swords, Users } from "lucide-react";
import frostkeepBanner from "@/assets/the-shattered-frostkeep.gif";

interface DungeonInfo {
  name: string;
  difficulty: string;
  theme: string;
  dungeon_json: any;
}

const DungeonLobby = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dungeon, setDungeon] = useState<DungeonInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverId, setServerId] = useState<string | null>(null);
  const [isServerHost, setIsServerHost] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadDungeon();
  }, [id]);

  // Separate useEffect for Realtime subscription after server status is known
  useEffect(() => {
    if (!currentUserId) return; // Wait until we have user ID

    console.log('Setting up realtime subscription', { serverId, isServerHost, currentUserId });

    // Subscribe to battle state changes for this dungeon
    const channel = supabase
      .channel(`dungeon-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'battle_states',
          filter: `dungeon_id=eq.${id}`
        },
        (payload) => {
          console.log('Battle started! Payload:', payload);
          console.log('Current state:', { serverId, isServerHost });
          
          // If we're in a server and not the host, follow the host to battle
          if (serverId && !isServerHost) {
            console.log('Non-host detected, navigating to battle');
            toast({ title: "Server host started the battle!" });
            setTimeout(() => navigate(`/battle/${id}`), 1000);
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [id, serverId, isServerHost, currentUserId]);

  const loadDungeon = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from("dungeons")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        toast({
          title: "Dungeon Not Found",
          description: "This dungeon no longer exists. It may have been deleted.",
          variant: "destructive",
        });
        navigate("/dashboard");
        return;
      }
      
      setDungeon(data);

      // Check if user is in a server for this dungeon
      const { data: serverData, error: serverError } = await supabase
        .from("server_players")
        .select("server_id, servers!inner(host_user_id, dungeon_id)")
        .eq("user_id", user.id)
        .eq("servers.dungeon_id", id)
        .eq("servers.is_active", true)
        .order("joined_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (serverError) {
        console.error("Server lookup error:", serverError);
      }

      if (serverData) {
        setServerId(serverData.server_id);
        setIsServerHost(serverData.servers.host_user_id === user.id);
        
        // Check if there's already an active battle for this server
        const { data: activeBattle } = await supabase
          .from("battle_states")
          .select("id")
          .eq("dungeon_id", id)
          .eq("server_id", serverData.server_id)
          .eq("is_active", true)
          .maybeSingle();

        if (activeBattle) {
          console.log('Active server battle found, navigating to battle');
          toast({ title: "Joining active battle..." });
          navigate(`/battle/${id}`);
          return;
        }
      } else {
        // Solo player - check for their active battle
        const { data: activeBattle } = await supabase
          .from("battle_states")
          .select("id")
          .eq("dungeon_id", id)
          .eq("user_id", user.id)
          .is("server_id", null)
          .eq("is_active", true)
          .maybeSingle();

        if (activeBattle) {
          console.log('Active solo battle found, navigating to battle');
          toast({ title: "Resuming battle..." });
          navigate(`/battle/${id}`);
          return;
        }
      }
    } catch (error: any) {
      toast({
        title: "Failed to load dungeon",
        description: error.message,
        variant: "destructive",
      });
      navigate("/dashboard");
    }
    setLoading(false);
  };

  const handleStartBattle = async (difficulty: "Normal" | "Hardcore") => {
    setLoading(true);
    try {
      // Log current server state for debugging
      console.log('Starting battle with state:', { serverId, isServerHost, dungeonId: id });
      
      const { data, error } = await supabase.functions.invoke("start-dungeon-battle", {
        body: {
          dungeonId: id,
          difficulty,
        },
      });

      if (error) throw error;

      // Wait a moment for the battle state to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      toast({ title: `${difficulty} mode started!` });
      navigate(`/battle/${id}`);
    } catch (error: any) {
      toast({
        title: "Failed to start battle",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout hideBanner>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-2xl font-bold">Loading dungeon...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout hideBanner>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Universe Banner */}
        <img 
          src={frostkeepBanner} 
          alt="The Shattered Frostkeep" 
          className="pixel-icon border-4 border-habbo-dark rounded-lg mx-auto"
        />

        {/* Universe Introduction */}
        <HabboPanel title="The Shattered Frostkeep">
          <div className="space-y-4">
            <div className="text-lg leading-relaxed">
              <p className="mb-4">
                Beneath the frozen hotel lies the <span className="font-bold text-primary">Shattered Frostkeep</span>, an ancient dungeon of ice, forgotten loot, and monsters drawn to the cold.
              </p>
              <p className="mb-4">
                Endless glacial corridors twist through abandoned fortresses carved from solid ice. The walls glisten with crystalline frost, and the air itself cuts like a blade against exposed skin.
              </p>
              <p className="text-muted-foreground italic">
                Winter&apos;s grip has claimed this realm. Only the bravest dare venture into these frozen depths.
              </p>
            </div>

            {dungeon && (
              <div className="mt-6 pt-6 border-t-2 border-habbo-dark">
                <h3 className="text-xl font-black mb-2 text-primary">{dungeon.name}</h3>
                {dungeon.dungeon_json?.introText && (
                  <p className="text-base mb-4 text-foreground leading-relaxed italic">
                    {dungeon.dungeon_json.introText}
                  </p>
                )}
                {dungeon.dungeon_json?.questObjective && (
                  <p className="text-lg mb-4 text-foreground font-semibold">
                    <span className="text-muted-foreground">Objective:</span> {dungeon.dungeon_json.questObjective}
                  </p>
                )}
                {!serverId && (
                  <div className="mt-6 space-y-4">
                    <p className="font-bold text-sm text-muted-foreground">
                      Choose Your Difficulty:
                    </p>
                    <div className="flex gap-4">
                      <Button
                        onClick={() => handleStartBattle("Normal")}
                        disabled={loading}
                        className="font-bold border-2 border-primary bg-primary/20 hover:bg-primary/30"
                      >
                        <Swords className="w-4 h-4 mr-2" />
                        Normal
                      </Button>
                      <Button
                        onClick={() => handleStartBattle("Hardcore")}
                        disabled={loading}
                        className="font-bold border-2 border-destructive bg-destructive/20 hover:bg-destructive/30"
                      >
                        <Swords className="w-4 h-4 mr-2" />
                        Hardcore
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </HabboPanel>

        {/* Server List & Members Panel */}
        {!serverId ? (
          <div className="grid md:grid-cols-2 gap-6">
            <ServerList 
              dungeonId={id!}
              onServerJoined={async (newServerId) => {
                console.log('Server joined/created:', newServerId);
                setServerId(newServerId);
                
                // Check if user is the host
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                  const { data: server } = await supabase
                    .from('servers')
                    .select('host_user_id')
                    .eq('id', newServerId)
                    .single();
                  
                  if (server) {
                    setIsServerHost(server.host_user_id === user.id);
                  }
                }
                
                await loadDungeon(); // Reload to update server status
              }}
            />
          </div>
        ) : (
          <PartyMembers partyId={serverId} />
        )}

        {/* Return Button */}
        <div className="flex justify-center">
          <Button
            onClick={() => navigate("/dashboard")}
            variant="outline"
            className="font-bold border-4 border-habbo-dark"
          >
            Return to Dashboard
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default DungeonLobby;
