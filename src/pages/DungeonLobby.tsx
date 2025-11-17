import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { PartyInvite } from "@/components/PartyInvite";
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
  const [partyId, setPartyId] = useState<string | null>(null);
  const [isPartyLeader, setIsPartyLeader] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadDungeon();
  }, [id]);

  // Separate useEffect for Realtime subscription after party status is known
  useEffect(() => {
    if (!currentUserId) return; // Wait until we have user ID

    console.log('Setting up realtime subscription', { partyId, isPartyLeader, currentUserId });

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
          console.log('Current state:', { partyId, isPartyLeader });
          
          // If we're in a party and not the leader, follow the leader to battle
          if (partyId && !isPartyLeader) {
            console.log('Non-leader detected, navigating to battle');
            toast({ title: "Party leader started the battle!" });
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
  }, [id, partyId, isPartyLeader, currentUserId]);

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
        .single();

      if (error) throw error;
      setDungeon(data);

      // Check if user is in a party for this dungeon
      const { data: partyData } = await supabase
        .from("party_members")
        .select("party_id, parties!inner(leader_id, dungeon_id)")
        .eq("user_id", user.id)
        .eq("parties.dungeon_id", id)
        .maybeSingle();

      if (partyData) {
        setPartyId(partyData.party_id);
        setIsPartyLeader(partyData.parties.leader_id === user.id);
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
                <h3 className="text-xl font-black mb-2">Your Quest: {dungeon.name}</h3>
                {dungeon.dungeon_json?.questObjective && (
                  <p className="text-lg mb-4 text-foreground font-semibold">
                    {dungeon.dungeon_json.questObjective}
                  </p>
                )}
                <div className="mt-6 space-y-4">
                  {partyId && !isPartyLeader ? (
                    <div className="p-4 bg-muted rounded-lg border-2 border-habbo-dark text-center">
                      <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="font-bold">Waiting for party leader to start...</p>
                      <p className="text-sm text-muted-foreground mt-1">Only the party leader can choose the difficulty</p>
                    </div>
                  ) : (
                    <>
                      <p className="font-bold text-sm text-muted-foreground">
                        {partyId ? "Choose Difficulty for Your Party:" : "Choose Your Difficulty:"}
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
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </HabboPanel>

        {/* Party & Actions Panel */}
        <div className="grid md:grid-cols-2 gap-6">
          <PartyInvite 
            dungeonId={id}
            onPartyCreated={(id) => {
              setPartyId(id);
              setIsPartyLeader(true);
            }}
            onPartyJoined={(partyId, dungeonId) => {
              // If the party is for a different dungeon, navigate to it
              if (dungeonId && dungeonId !== id) {
                toast({
                  title: "Redirecting to party dungeon...",
                  description: "Taking you to your party's dungeon lobby",
                });
                setTimeout(() => navigate(`/dungeon-lobby/${dungeonId}`), 1000);
              } else {
                setPartyId(partyId);
                setIsPartyLeader(false);
              }
            }}
          />
          
          {partyId && <PartyMembers partyId={partyId} />}
        </div>

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
