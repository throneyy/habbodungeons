import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HabboPanel } from "./HabboPanel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Users } from "lucide-react";

export const JoinPartyQuick = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoinParty = async () => {
    if (!joinCode.trim()) {
      toast({
        title: "Enter a party code",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("join-party", {
        body: { inviteCode: joinCode.trim() },
      });

      if (error) throw error;

      toast({ title: "Joined party!" });
      
      // Navigate to the dungeon lobby
      if (data.party?.dungeon_id) {
        navigate(`/dungeon-lobby/${data.party.dungeon_id}`);
      }
    } catch (error: any) {
      toast({
        title: "Failed to join party",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <HabboPanel title="Join a Party">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enter a party invite code to join your friends on their quest!
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Enter party code..."
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            className="font-mono border-2 border-habbo-dark"
            maxLength={6}
          />
          <Button
            onClick={handleJoinParty}
            disabled={loading || !joinCode.trim()}
            className="font-bold border-2 border-habbo-dark"
          >
            <Users className="w-4 h-4 mr-2" />
            Join
          </Button>
        </div>
      </div>
    </HabboPanel>
  );
};
