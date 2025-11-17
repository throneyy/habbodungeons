import { useState } from "react";
import { HabboPanel } from "./HabboPanel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Users, UserPlus } from "lucide-react";

interface PartyInviteProps {
  dungeonId?: string;
  onPartyCreated?: (partyId: string, inviteCode: string) => void;
  onPartyJoined?: (partyId: string) => void;
}

export const PartyInvite = ({ dungeonId, onPartyCreated, onPartyJoined }: PartyInviteProps) => {
  const [inviteCode, setInviteCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const createParty = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-party", {
        body: { dungeonId },
      });

      if (error) throw error;

      setInviteCode(data.inviteCode);
      toast({
        title: "Party Created!",
        description: `Share code: ${data.inviteCode}`,
      });

      onPartyCreated?.(data.party.id, data.inviteCode);
    } catch (error: any) {
      toast({
        title: "Failed to create party",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const joinParty = async () => {
    if (!joinCode.trim()) {
      toast({
        title: "Enter a code",
        description: "Please enter an invite code",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("join-party", {
        body: { inviteCode: joinCode.toUpperCase() },
      });

      if (error) throw error;

      toast({
        title: "Joined Party!",
        description: data.message,
      });

      setJoinCode("");
      onPartyJoined?.(data.party.id);
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

  const copyInviteCode = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      toast({
        title: "Copied!",
        description: "Invite code copied to clipboard",
      });
    }
  };

  return (
    <HabboPanel title="Party System">
      <div className="space-y-4">
        {/* Create Party Section */}
        <div className="space-y-2">
          <h3 className="font-bold flex items-center gap-2">
            <Users className="w-4 h-4" />
            Create Party
          </h3>
          <Button
            onClick={createParty}
            disabled={loading || !!inviteCode}
            className="w-full"
          >
            Create New Party
          </Button>

          {inviteCode && (
            <div className="p-3 bg-muted rounded border-2 border-habbo-dark">
              <p className="text-sm mb-2">Your Invite Code:</p>
              <div className="flex gap-2">
                <Input
                  value={inviteCode}
                  readOnly
                  className="font-mono text-lg font-bold text-center"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={copyInviteCode}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t-2 border-habbo-dark my-4" />

        {/* Join Party Section */}
        <div className="space-y-2">
          <h3 className="font-bold flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Join Party
          </h3>
          <div className="flex gap-2">
            <Input
              placeholder="Enter invite code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="font-mono uppercase"
            />
            <Button
              onClick={joinParty}
              disabled={loading || !joinCode.trim()}
            >
              Join
            </Button>
          </div>
        </div>
      </div>
    </HabboPanel>
  );
};
