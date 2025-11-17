import { useState, useEffect } from "react";
import { HabboPanel } from "./HabboPanel";
import { StatBar } from "./StatBar";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";

interface PartyMember {
  userId: string;
  username: string;
  habboAvatar: string | null;
  level: number;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  statusEffects: string[];
}

interface PartyMembersProps {
  partyId: string;
}

export const PartyMembers = ({ partyId }: PartyMembersProps) => {
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMembers = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-party-members", {
        body: { partyId },
      });

      if (error) throw error;
      setMembers(data.members);
    } catch (error) {
      console.error("Failed to load party members:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();

    // Subscribe to party member changes
    const channel = supabase
      .channel('party-member-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'party_members',
          filter: `party_id=eq.${partyId}`
        },
        () => {
          console.log('Party members changed, reloading...');
          loadMembers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partyId]);

  if (loading) {
    return (
      <HabboPanel title="Party Members">
        <div className="text-center py-4 text-muted-foreground">
          Loading party members...
        </div>
      </HabboPanel>
    );
  }

  return (
    <HabboPanel title={`Party Members (${members.length})`}>
      <div className="space-y-3">
        {members.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No party members yet</p>
          </div>
        ) : (
          members.map((member) => (
            <div
              key={member.userId}
              className="p-4 bg-muted rounded-lg border-2 border-habbo-dark space-y-3"
            >
              {/* Avatar */}
              {member.habboAvatar && (
                <div className="flex justify-center">
                  <div className="border-2 border-habbo-dark rounded overflow-hidden bg-card">
                    <img
                      src={member.habboAvatar}
                      alt={member.username}
                      className="pixel-icon"
                      style={{ width: "auto", height: "auto", maxWidth: "80px" }}
                    />
                  </div>
                </div>
              )}

              {/* Name & Level */}
              <div className="text-center">
                <p className="font-bold">{member.username}</p>
                <p className="text-xs text-muted-foreground">Level {member.level}</p>
              </div>

              {/* Stats */}
              <StatBar
                label="HP"
                current={member.currentHp}
                max={member.maxHp}
                color="hp"
              />
              <StatBar
                label="MP"
                current={member.currentMp}
                max={member.maxMp}
                color="mp"
              />

              {/* Status Effects */}
              {member.statusEffects.length > 0 && (
                <div className="text-xs space-y-1">
                  <p className="font-bold">Effects:</p>
                  {member.statusEffects.map((effect, i) => (
                    <p key={i} className="text-accent">
                      {effect}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </HabboPanel>
  );
};
