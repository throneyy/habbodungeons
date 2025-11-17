import { useState, useEffect } from "react";
import { HabboPanel } from "@/components/HabboPanel";
import { StatBar } from "@/components/StatBar";
import { Button } from "@/components/ui/button";
import { Scroll, Users } from "lucide-react";

interface StoryChoice {
  id: string;
  label: string;
}

interface StoryNode {
  storyText: string;
  choices: StoryChoice[];
}

interface PartyMember {
  userId: string;
  username: string;
  habboAvatar?: string;
  level: number;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  statusEffects: string[];
}

interface StoryExplorationProps {
  storyNode: StoryNode | null;
  partyMembers: PartyMember[];
  storyLog: string[];
  isLeader: boolean;
  loading: boolean;
  onChoiceSelect: (choiceId: string) => void;
}

export const StoryExploration = ({
  storyNode,
  partyMembers,
  storyLog,
  isLeader,
  loading,
  onChoiceSelect,
}: StoryExplorationProps) => {
  const [selectedChoice, setSelectedChoice] = useState<string>("");

  useEffect(() => {
    setSelectedChoice("");
  }, [storyNode]);

  const handleChoiceClick = (choiceId: string) => {
    if (!isLeader || loading) return;
    setSelectedChoice(choiceId);
    onChoiceSelect(choiceId);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Main Story Panel */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <HabboPanel title="The Story Unfolds">
              <div className="space-y-6">
                {/* Story Text */}
                <div className="p-6 bg-muted/50 border-2 border-habbo-dark rounded-lg min-h-[200px]">
                  {loading && !storyNode ? (
                    <div className="flex items-center justify-center h-40">
                      <p className="text-lg italic animate-pulse">
                        The dungeon master consults the ancient tomes...
                      </p>
                    </div>
                  ) : storyNode ? (
                    <p className="text-lg leading-relaxed whitespace-pre-wrap">
                      {storyNode.storyText}
                    </p>
                  ) : (
                    <p className="text-lg italic text-muted-foreground">
                      Awaiting your next decision...
                    </p>
                  )}
                </div>

                {/* Choices */}
                {storyNode && storyNode.choices.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xl font-black mb-4">What will you do?</h3>
                    <div className="space-y-3">
                      {storyNode.choices.map((choice) => (
                        <Button
                          key={choice.id}
                          onClick={() => handleChoiceClick(choice.id)}
                          disabled={!isLeader || loading || selectedChoice !== ""}
                          variant={selectedChoice === choice.id ? "default" : "outline"}
                          className="w-full text-left justify-start h-auto py-4 px-6 font-bold border-4 border-habbo-dark text-base hover-scale"
                        >
                          <span className="mr-3 text-2xl">›</span>
                          {choice.label}
                        </Button>
                      ))}
                    </div>
                    {!isLeader && (
                      <p className="text-sm text-muted-foreground italic text-center mt-4">
                        Waiting for the party leader to decide...
                      </p>
                    )}
                  </div>
                )}

                {loading && (
                  <div className="text-center py-4">
                    <p className="text-lg font-bold animate-pulse">
                      Resolving your choice...
                    </p>
                  </div>
                )}
              </div>
            </HabboPanel>
          </div>

          {/* Party Panel */}
          <div className="md:col-span-1">
            <HabboPanel title="Your Party">
              <div className="space-y-4">
                {partyMembers.map((member) => (
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
                ))}
              </div>
            </HabboPanel>
          </div>
        </div>

        {/* Story Log */}
        <HabboPanel title="Chronicle of Events">
          <div className="h-48 overflow-y-auto space-y-2 p-4 bg-muted rounded border-2 border-habbo-dark">
            {storyLog.length > 0 ? (
              storyLog.map((entry, i) => (
                <p key={i} className="text-sm animate-fade-in">
                  <span className="text-primary font-bold">›</span> {entry}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Your journey begins...
              </p>
            )}
          </div>
        </HabboPanel>
      </div>
    </div>
  );
};
