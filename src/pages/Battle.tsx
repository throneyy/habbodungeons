import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { PartyMembers } from "@/components/PartyMembers";
import { StatBar } from "@/components/StatBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Swords, Shield, Sparkles, Package, Users, Plus, Copy } from "lucide-react";
import dungeonBg from "@/assets/dungeon-bg.png";
import frostkeepBanner from "@/assets/the-shattered-frostkeep.gif";

interface BattleLogEntry {
  user_id: string;
  message: string;
  type?: string;
}

interface BattleData {
  enemy: {
    name: string;
    description: string;
    current_hp: number;
    max_hp: number;
    atk: number;
    def: number;
    spd: number;
    status_effects: string[];
  };
  player: {
    level: number;
    current_hp: number;
    max_hp: number;
    current_mp: number;
    max_mp: number;
    atk: number;
    def: number;
    spd: number;
    status_effects: string[];
    current_xp?: number;
    xp_to_next_level?: number;
  };
  room_description: string;
  battle_log: BattleLogEntry[];
  mode?: "story" | "battle";
}

interface Profile {
  username: string;
  habbo_username: string | null;
  habbo_profile_json: any;
}

interface StoryNode {
  storyText: string;
  choices: Array<{ id: string; label: string }>;
}

const Battle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [battleData, setBattleData] = useState<BattleData | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [partyProfiles, setPartyProfiles] = useState<Map<string, Profile>>(new Map());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [dice, setDice] = useState<number[]>([1, 1, 1, 1, 1]);
  const [loading, setLoading] = useState(false);
  const [showCombatPanels, setShowCombatPanels] = useState(false);
  
  // Story mode states
  const [storyNode, setStoryNode] = useState<StoryNode | null>(null);
  const [storyLoading, setStoryLoading] = useState(false);
  
  // Party states
  const [partyMembers, setPartyMembers] = useState<any[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  useEffect(() => {
    loadBattle();
    loadProfile();
    loadCurrentUser();
    checkExistingParty();
    loadInventory();
  }, [id]);

  // Set up Realtime subscription for battle state changes
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel('battle-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'battle_states',
          filter: `dungeon_id=eq.${id}`
        },
        (payload) => {
          console.log('Battle state updated:', payload);
          // Reload battle data when it changes
          loadBattle();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const loadBattle = async () => {
    if (!id) {
      console.error("Cannot load battle: battleId is undefined");
      navigate("/dashboard");
      return;
    }
    
    try {
      console.log("Loading battle for battleId:", id);
      const { data, error } = await supabase.functions.invoke("load-battle", {
        body: { battleId: id },
      });

      if (error) throw error;
      if (data.battleData) {
        setBattleData(data.battleData);
        
        // If in story mode, load story node
        if (data.battleData.mode === "story") {
          setShowCombatPanels(false);
          loadStoryNode();
        } else {
          // Clear story node and trigger combat panel animation for battle mode
          setStoryNode(null);
          setTimeout(() => setShowCombatPanels(true), 100);
        }
      }
    } catch (error: any) {
      toast({
        title: "Failed to load battle",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadInventory = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .eq("user_id", user.id)
      .order("item_name");

    if (data) {
      setInventory(data);
    }
  };

  const loadCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    } catch (error: any) {
      console.error("Failed to load current user:", error);
    }
  };

  const checkExistingParty = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberData } = await supabase
        .from("party_members")
        .select("party_id, parties(invite_code)")
        .eq("user_id", user.id)
        .maybeSingle();

      if (memberData) {
        setPartyId(memberData.party_id);
        setInviteCode((memberData.parties as any)?.invite_code || null);
        loadPartyMembers(memberData.party_id);
      }
    } catch (error: any) {
      console.error("Failed to check existing party:", error);
    }
  };

  const createParty = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("create-party", {
        body: { dungeonId: id },
      });

      if (error) throw error;

      setPartyId(data.party.id);
      setInviteCode(data.inviteCode);
      setShowInviteDialog(true);
      loadPartyMembers(data.party.id);
      
      toast({
        title: "Party Created!",
        description: `Share code: ${data.inviteCode}`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to create party",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadPartyMembers = async (pId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("get-party-members", {
        body: { partyId: pId },
      });

      if (error) throw error;
      setPartyMembers(data.members || []);
    } catch (error: any) {
      console.error("Failed to load party members:", error);
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

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      setProfile(data);
      
      // Load all party members' profiles for battle log display
      await loadPartyProfiles();
    } catch (error: any) {
      console.error("Failed to load profile:", error);
    }
  };

  const loadPartyProfiles = async () => {
    try {
      // Get all unique user IDs from battle log entries
      if (!battleData?.battle_log) return;
      
      const userIds = [...new Set(battleData.battle_log.map(entry => entry.user_id))];
      
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .in("id", userIds);

      if (error) throw error;
      
      const profileMap = new Map<string, Profile>();
      data?.forEach(profile => {
        profileMap.set(profile.id, profile);
      });
      
      setPartyProfiles(profileMap);
    } catch (error: any) {
      console.error("Failed to load party profiles:", error);
    }
  };

  const loadStoryNode = async () => {
    if (!id) {
      console.error("Cannot load story node: battleId is undefined");
      return;
    }
    
    setStoryLoading(true);
    try {
      console.log("Loading story node for battleId:", id);
      
      // Ensure we have a valid session before making the call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error("No active session");
        toast({
          title: "Session expired",
          description: "Please log in again",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }
      
      const { data, error } = await supabase.functions.invoke("generate-story-node", {
        body: { battleId: id },
      });

      if (error) throw error;
      if (data.storyNode) {
        setStoryNode(data.storyNode);
      }
    } catch (error: any) {
      console.error("Story node error:", error);
      toast({
        title: "Failed to load story",
        description: error.message,
        variant: "destructive",
      });
    }
    setStoryLoading(false);
  };

  const handleStoryChoice = async (choiceId: string) => {
    if (!storyNode) return;

    const choice = storyNode.choices.find((c) => c.id === choiceId);
    if (!choice) return;

    setStoryLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-story-choice", {
        body: {
          battleId: id,
          choiceId: choice.id,
          choiceLabel: choice.label,
          storyText: storyNode.storyText,
        },
      });

      if (error) throw error;

      // Show consequence toast
      if (data.outcome) {
        toast({
          title: data.outcome.triggersBattle ? "Battle!" : "The path unfolds",
          description: data.outcome.consequenceText,
        });
      }

      // Reload battle to get updated state
      await loadBattle();
    } catch (error: any) {
      toast({
        title: "Failed to resolve choice",
        description: error.message,
        variant: "destructive",
      });
    }
    setStoryLoading(false);
  };

  const handleResolveTurn = async () => {
    if (!selectedAction) {
      toast({ title: "Please select an action", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-turn", {
        body: {
          battleId: id,
          action: selectedAction,
          dice,
        },
      });

      if (error) throw error;
      
      if (data.battleData) {
        setBattleData(data.battleData);
        setSelectedAction("");
        
        if (data.victory) {
          toast({ title: "Victory!", description: "You defeated the enemy!" });
          // After victory, reload to switch to story mode
          setTimeout(() => {
            loadBattle();
          }, 2000);
        } else if (data.defeat) {
          toast({ title: "Defeat", description: "You were defeated...", variant: "destructive" });
        }
      }
    } catch (error: any) {
      toast({
        title: "Failed to resolve turn",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  if (!battleData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-2xl font-bold">Loading...</p>
      </div>
    );
  }

  // Render story mode
  if (battleData.mode === "story") {
    const partyMembers = [
      {
        userId: "player",
        username: profile?.habbo_username || profile?.username.split("@")[0] || "Player",
        habboAvatar: profile?.habbo_username && profile.habbo_profile_json
          ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${profile.habbo_profile_json.figureString}&direction=2&head_direction=3&action=wav&gesture=sml&size=s`
          : undefined,
        level: battleData.player.level,
        currentHp: battleData.player.current_hp,
        maxHp: battleData.player.max_hp,
        currentMp: battleData.player.current_mp,
        maxMp: battleData.player.max_mp,
        statusEffects: battleData.player.status_effects,
      },
    ];

    return (
      <div className="min-h-screen bg-background relative">
        <div 
          className="fixed inset-0 opacity-20 bg-center bg-cover"
          style={{ backgroundImage: `url(${dungeonBg})` }}
        />
        
        <div className="relative z-10 p-8">
          <div className="max-w-7xl mx-auto space-y-6">
          {/* Frostkeep Banner */}
          <div className="flex justify-center mb-6">
            <img 
              src={frostkeepBanner} 
              alt="The Shattered Frostkeep" 
              className="pixel-icon"
              style={{ width: "auto", height: "auto" }}
            />
          </div>

            {/* Battle Log - Main Focus */}
            <HabboPanel title="Chronicle of Events">
              <div className="h-96 overflow-y-auto space-y-2 p-4 bg-muted rounded border-2 border-habbo-dark">
              {battleData.battle_log.length > 0 ? (
                  battleData.battle_log.map((entry: any, i) => {
                    // Handle entry - can be string, object, or JSON string
                    let message = '';
                    let userId = null;
                    let entryType = undefined;
                    
                    // Helper function to extract message recursively
                    const extractMessage = (obj: any): string => {
                      if (typeof obj === 'string') return obj;
                      if (obj && typeof obj === 'object' && obj.message) {
                        return extractMessage(obj.message);
                      }
                      return JSON.stringify(obj);
                    };
                    
                    if (typeof entry === 'string') {
                      // Try to parse if it looks like JSON
                      const trimmedEntry = entry.trim();
                      if (trimmedEntry.startsWith('{')) {
                        try {
                          const parsed = JSON.parse(trimmedEntry);
                          message = extractMessage(parsed.message || parsed);
                          userId = parsed.user_id || null;
                          entryType = parsed.type;
                        } catch (e) {
                          message = entry;
                        }
                      } else {
                        message = entry;
                      }
                    } else if (entry && typeof entry === 'object') {
                      // It's already an object
                      message = extractMessage(entry.message || entry);
                      userId = entry.user_id || null;
                      entryType = entry.type;
                    }
                    
                    // Ensure message is always a string
                    message = String(message || '');
                    
                    const isCurrentUser = userId === currentUserId;
                    const userProfile = userId ? partyProfiles.get(userId) : null;
                    const username = userProfile?.habbo_username || userProfile?.username || "Unknown";
                    const isDiceRoll = entryType === 'dice_roll' || message.includes('rolled');
                    
                    return (
                      <p key={i} className={`text-sm animate-fade-in ${isDiceRoll ? 'text-[#FFD700] font-bold' : ''}`}>
                        <span className="text-primary font-bold">›</span>{" "}
                        {isCurrentUser || !userId ? (
                          message
                        ) : (
                          <>
                            {!isDiceRoll && <span className="text-[#FFD700] font-bold">{username}</span>}
                            {message.includes("chose:") ? (
                              <> {message.replace("You ", "")}</>
                            ) : (
                              <> {isDiceRoll ? message : message}</>
                            )}
                          </>
                        )}
                      </p>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Your journey begins...
                  </p>
                )}
              </div>
            </HabboPanel>

            {/* Story Panel Below Log */}
            <div className="grid md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <HabboPanel title="The Story Unfolds">
                  <div className="space-y-6">
                    {/* Story Text */}
                    <div className="p-6 bg-muted/50 border-2 border-habbo-dark rounded-lg min-h-[200px]">
                      {storyLoading && !storyNode ? (
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
                              onClick={() => handleStoryChoice(choice.id)}
                              disabled={storyLoading}
                              variant="outline"
                              className="w-full text-left justify-start h-auto py-4 px-6 font-bold border-4 border-habbo-dark text-base hover-scale"
                            >
                              <span className="mr-3 text-2xl">›</span>
                              {choice.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {storyLoading && (
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
                  {/* Party Avatars Row */}
                  <div className="flex gap-2 mb-4 pb-4 border-habbo-dark">
                    {partyMembers.slice(0, 4).map((member) => (
                      <button
                        key={`avatar-${member.userId}`}
                        onClick={() => setSelectedMemberId(member.userId)}
                        className="border-2 border-habbo-dark rounded overflow-hidden bg-card hover:border-primary transition-colors cursor-pointer"
                        title={`Click to view ${member.username}'s stats`}
                      >
                        {member.habboAvatar && (
                          <img
                            src={member.habboAvatar}
                            alt={member.username}
                            className="pixel-icon"
                            style={{ width: 'auto', height: 'auto' }}
                          />
                        )}
                      </button>
                    ))}
                    {partyMembers.length < 4 && Array.from({ length: 4 - partyMembers.length }).map((_, i) => (
                      <button
                        key={`empty-${i}`}
                        onClick={() => partyId ? setShowInviteDialog(true) : createParty()}
                        className="w-12 h-12 border-2 border-dashed border-muted rounded bg-muted/20 flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-colors cursor-pointer"
                        title="Invite player"
                      >
                        <Plus className="text-muted-foreground w-4 h-4" />
                      </button>
                    ))}
                  </div>
                  
                  <div className="space-y-4">
                    {selectedMemberId && partyMembers.find(m => m.userId === selectedMemberId) ? (
                      (() => {
                        const member = partyMembers.find(m => m.userId === selectedMemberId)!;
                        return (
                      <div
                        key={member.userId}
                        className="p-4 bg-muted rounded-lg border-2 border-habbo-dark space-y-3"
                      >
                        {/* Avatar */}
                        {member.habboAvatar && (
                          <div className="flex justify-center">
                            <div className="border-2 border-habbo-dark rounded overflow-hidden bg-card">
                              <img
                                src={member.habboAvatar.replace('size=s', 'size=m')}
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
                        {member.statusEffects && member.statusEffects.length > 0 && (
                          <div className="text-xs space-y-1">
                            <p className="font-bold">Effects:</p>
                            {member.statusEffects.map((effect: string, i: number) => (
                              <p key={i} className="text-accent">
                                {effect}
                              </p>
                            ))}
                          </div>
                        )}
                        
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setSelectedMemberId(null)}
                          className="w-full"
                        >
                          Back to Party
                        </Button>
                      </div>
                        );
                      })()
                    ) : (
                      partyMembers.map((member) => (
                        <div
                          key={member.userId}
                          className="p-3 bg-muted rounded border border-habbo-dark flex items-center gap-3"
                        >
                          {member.habboAvatar && (
                            <img
                              src={member.habboAvatar}
                              alt={member.username}
                              className="pixel-icon w-8 h-8"
                            />
                          )}
                          <div className="flex-1">
                            <p className="font-bold text-sm">{member.username}</p>
                            <p className="text-xs text-muted-foreground">Level {member.level}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  {/* Invite Dialog */}
                  <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Invite Friends to Party</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Share this code with your friends so they can join your party from the dungeon lobby:
                        </p>
                        <div className="flex gap-2">
                          <Input
                            value={inviteCode || ""}
                            readOnly
                            className="font-mono text-lg font-bold text-center"
                          />
                          <Button size="icon" variant="outline" onClick={copyInviteCode}>
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </HabboPanel>
              </div>
            </div>

            <Button
              onClick={() => navigate("/dashboard")}
              variant="outline"
              className="font-bold border-4 border-habbo-dark"
            >
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render battle mode
  return (
    <div className="min-h-screen bg-background relative">
      <div 
        className="fixed inset-0 opacity-20 bg-center bg-cover"
        style={{ backgroundImage: `url(${dungeonBg})` }}
      />
      
      <div className="relative z-10 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Frostkeep Banner */}
          <div className="flex justify-center mb-6">
            <img 
              src={frostkeepBanner} 
              alt="The Shattered Frostkeep" 
              className="pixel-icon"
              style={{ width: "auto", height: "auto" }}
            />
          </div>

          {/* Battle Log - Main Focus */}
          <HabboPanel title="Battle Log">
            <div className="h-96 overflow-y-auto space-y-2 p-4 bg-muted rounded border-2 border-habbo-dark">
              {battleData.battle_log.length > 0 ? (
                battleData.battle_log.map((entry: any, i) => {
                  // Handle entry - can be string, object, or JSON string
                  let message = '';
                  let userId = null;
                  let entryType = undefined;
                  
                  // Helper function to extract message recursively
                  const extractMessage = (obj: any): string => {
                    if (typeof obj === 'string') return obj;
                    if (obj && typeof obj === 'object' && obj.message) {
                      return extractMessage(obj.message);
                    }
                    return JSON.stringify(obj);
                  };
                  
                  if (typeof entry === 'string') {
                    // Try to parse if it looks like JSON
                    const trimmedEntry = entry.trim();
                    if (trimmedEntry.startsWith('{')) {
                      try {
                        const parsed = JSON.parse(trimmedEntry);
                        message = extractMessage(parsed.message || parsed);
                        userId = parsed.user_id || null;
                        entryType = parsed.type;
                      } catch (e) {
                        message = entry;
                      }
                    } else {
                      message = entry;
                    }
                  } else if (entry && typeof entry === 'object') {
                    // It's already an object
                    message = extractMessage(entry.message || entry);
                    userId = entry.user_id || null;
                    entryType = entry.type;
                  }
                  
                  // Ensure message is always a string
                  message = String(message || '');
                  
                  const isCurrentUser = userId === currentUserId;
                  const userProfile = userId ? partyProfiles.get(userId) : null;
                  const username = userProfile?.habbo_username || userProfile?.username || "Unknown";
                  const isDiceRoll = entryType === 'dice_roll' || message.includes('rolled');
                  
                  return (
                    <p key={i} className={`text-sm animate-fade-in ${isDiceRoll ? 'text-[#FFD700] font-bold' : ''}`}>
                      {isCurrentUser || !userId ? (
                        message
                      ) : (
                        <>
                          {!isDiceRoll && <span className="text-[#FFD700] font-bold">{username}</span>}
                          {message.includes("chose:") ? (
                            <> {message.replace("You ", "")}</>
                          ) : (
                            <> {isDiceRoll ? message : message}</>
                          )}
                        </>
                      )}
                    </p>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground italic">Battle begins...</p>
              )}
            </div>
          </HabboPanel>

          {/* Combat Panels - Slide in from top */}
          <div className={`grid md:grid-cols-3 gap-6 transition-all duration-500 ${
            showCombatPanels ? "translate-y-0 opacity-100" : "-translate-y-8 opacity-0"
          }`}>
          {/* Enemy Panel - Only show when in battle mode with valid enemy */}
          {battleData.mode === "battle" && battleData.enemy.current_hp > 0 && (
            <HabboPanel title="Enemy" className="md:col-span-1">
            <div className="space-y-4">
              <h3 className="text-2xl font-black text-destructive">{battleData.enemy.name}</h3>
              <p className="text-sm text-muted-foreground">{battleData.enemy.description}</p>
              <StatBar
                label="HP"
                current={battleData.enemy.current_hp}
                max={battleData.enemy.max_hp}
                color="hp"
              />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-xs font-bold">ATK</p>
                  <p className="font-bold">{battleData.enemy.atk}</p>
                </div>
                <div className="p-2 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-xs font-bold">DEF</p>
                  <p className="font-bold">{battleData.enemy.def}</p>
                </div>
                <div className="p-2 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-xs font-bold">SPD</p>
                  <p className="font-bold">{battleData.enemy.spd}</p>
                </div>
              </div>
              {battleData.enemy.status_effects.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-bold">Status Effects:</p>
                  {battleData.enemy.status_effects.map((effect, i) => (
                    <p key={i} className="text-sm text-accent">{effect}</p>
                  ))}
                </div>
              )}
            </div>
            </HabboPanel>
          )}

          {/* Action Panel */}
          <HabboPanel title="Current Turn" className="md:col-span-1">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{battleData.room_description}</p>
              
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={selectedAction === "attack" ? "default" : "outline"}
                  onClick={() => {
                    setSelectedAction("attack");
                    setSelectedItem(null);
                  }}
                  className="font-bold border-4 border-habbo-dark"
                >
                  <Swords className="w-4 h-4 mr-2" />
                  Attack
                </Button>
                <Button
                  variant={selectedAction === "skill" ? "default" : "outline"}
                  onClick={() => {
                    setSelectedAction("skill");
                    setSelectedItem(null);
                  }}
                  className="font-bold border-4 border-habbo-dark"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Skill
                </Button>
                <Button
                  variant={selectedAction === "defend" ? "default" : "outline"}
                  onClick={() => {
                    setSelectedAction("defend");
                    setSelectedItem(null);
                  }}
                  className="font-bold border-4 border-habbo-dark"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Defend
                </Button>
                <Button
                  variant={selectedAction === "item" ? "default" : "outline"}
                  onClick={() => setSelectedAction("item")}
                  className="font-bold border-4 border-habbo-dark"
                >
                  <Package className="w-4 h-4 mr-2" />
                  Item
                </Button>
              </div>

              {/* Item Selection */}
              {selectedAction === "item" && (
                <div className="space-y-2 p-3 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-xs font-bold mb-2">Select Item:</p>
                  {inventory.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {inventory.map((item) => (
                        <Button
                          key={item.id}
                          variant={selectedItem === item.item_name ? "default" : "outline"}
                          onClick={() => setSelectedItem(item.item_name)}
                          className="font-bold text-xs h-auto py-2"
                        >
                          {item.item_name} ({item.quantity})
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      No items in inventory
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <p className="font-bold text-sm">Enter your Holodice results from Habbo:</p>
                <div className="grid grid-cols-5 gap-2">
                  {dice.map((val, i) => (
                    <Input
                      key={i}
                      type="number"
                      min="1"
                      max="6"
                      value={val}
                      onChange={(e) => {
                        const newDice = [...dice];
                        newDice[i] = Math.max(1, Math.min(6, parseInt(e.target.value) || 1));
                        setDice(newDice);
                      }}
                      className="text-center font-bold border-2 border-habbo-dark"
                    />
                  ))}
                </div>
              </div>

              <Button
                onClick={handleResolveTurn}
                disabled={loading || !selectedAction}
                size="lg"
                className="w-full font-bold border-4 border-habbo-dark text-lg py-6"
              >
                {loading ? "Resolving..." : "Resolve Turn"}
              </Button>
            </div>
          </HabboPanel>

          {/* Player Panel */}
          <HabboPanel title="You" className="md:col-span-1">
            <div className="space-y-4">
              {/* Player Habbo Avatar */}
              {profile?.habbo_username && profile.habbo_profile_json && (
                <div className="flex justify-center">
                  <div className="border-4 border-habbo-dark rounded-lg overflow-hidden bg-card">
                    <img
                      src={`https://www.habbo.com/habbo-imaging/avatarimage?figure=${profile.habbo_profile_json.figureString}&direction=2&head_direction=3&action=wav&gesture=sml&size=m`}
                      alt={profile.habbo_username}
                      className="pixel-icon"
                      style={{ width: 'auto', height: 'auto', maxWidth: '100px' }}
                    />
                  </div>
                </div>
              )}
              <div className="text-center">
                <p className="text-xs text-muted-foreground">
                  {profile?.habbo_username || profile?.username.split('@')[0] || "Player"}
                </p>
              </div>
              <div className="text-center p-2 bg-primary rounded border-4 border-habbo-dark">
                <p className="text-sm font-bold text-primary-foreground">Level {battleData.player.level}</p>
              </div>
              {battleData.player.current_xp !== undefined && battleData.player.xp_to_next_level !== undefined && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold">XP Progress</span>
                    <span className="text-muted-foreground">
                      {battleData.player.current_xp}/{battleData.player.xp_to_next_level}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full border-2 border-habbo-dark overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#FFD700] to-[#FFA500] transition-all duration-500"
                      style={{ 
                        width: `${(battleData.player.current_xp / battleData.player.xp_to_next_level) * 100}%` 
                      }}
                    />
                  </div>
                </div>
              )}
              <StatBar
                label="HP"
                current={battleData.player.current_hp}
                max={battleData.player.max_hp}
                color="hp"
              />
              <StatBar
                label="MP"
                current={battleData.player.current_mp}
                max={battleData.player.max_mp}
                color="mp"
              />
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-xs font-bold">ATK</p>
                  <p className="font-bold">{battleData.player.atk}</p>
                </div>
                <div className="p-2 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-xs font-bold">DEF</p>
                  <p className="font-bold">{battleData.player.def}</p>
                </div>
                <div className="p-2 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-xs font-bold">SPD</p>
                  <p className="font-bold">{battleData.player.spd}</p>
                </div>
              </div>
              {battleData.player.status_effects.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-bold">Status Effects:</p>
                  {battleData.player.status_effects.map((effect, i) => (
                    <p key={i} className="text-sm text-accent">{effect}</p>
                  ))}
                </div>
              )}
            </div>
          </HabboPanel>
        </div>

        {/* Party Members Section */}
        <div className="grid md:grid-cols-2 gap-6">
          <HabboPanel title="Party Members">
            {partyId ? (
              <PartyMembers partyId={partyId} />
            ) : (
              <div className="text-center space-y-4 p-4">
                <Users className="w-12 h-12 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No active party
                </p>
                <Button onClick={createParty} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Party
                </Button>
              </div>
            )}
          </HabboPanel>

          {partyId && inviteCode && (
            <HabboPanel title="Invite Friends">
              <div className="space-y-4">
                <p className="text-sm">Share this code with your friends:</p>
                <div className="flex gap-2">
                  <Input
                    value={inviteCode}
                    readOnly
                    className="font-mono text-lg font-bold text-center"
                  />
                  <Button size="icon" variant="outline" onClick={copyInviteCode}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Friends can join using this code from the dungeon lobby
                </p>
              </div>
            </HabboPanel>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => navigate("/dashboard")}
          className="font-bold border-4 border-habbo-dark"
        >
          Return to Dashboard
        </Button>
        </div>
      </div>
    </div>
  );
};

export default Battle;