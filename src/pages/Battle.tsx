import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { PartyMembers } from "@/components/PartyMembers";
import { StatBar } from "@/components/StatBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { VictoryLoot } from "@/components/VictoryLoot";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Swords, Shield, Sparkles, Package, Users, Plus, Copy } from "lucide-react";
import dungeonBg from "@/assets/dungeon-bg.png";
import explosionHit from "@/assets/explosion-hit.gif";
import hitBump from "@/assets/hit-bump.gif";
import frostkeepBanner from "@/assets/the-shattered-frostkeep.gif";
import skeleton from "@/assets/skeleton.png";
import iceTiger from "@/assets/ice-tiger.gif";
import iceElemental from "@/assets/ice-elemental.png";
import iceGuardian from "@/assets/ice-guardian.png";
import frostWolf from "@/assets/frost-wolf.png";
import glacialImp from "@/assets/glacial-imp.png";
import frozenGoblin from "@/assets/frozen-goblin.png";
import frostMutant from "@/assets/frost-mutant.png";
import frostWraith from "@/assets/frost-wraith.png";
import frostUndead from "@/assets/frost-undead.gif";
import frostbiteSpider from "@/assets/frostbite-spider.webp";

// Enemy sprite mapping
const ENEMY_SPRITES: Record<string, string> = {
  "skeleton.png": skeleton,
  "ice-tiger.gif": iceTiger,
  "ice-elemental.png": iceElemental,
  "ice-guardian.png": iceGuardian,
  "frost-wolf.png": frostWolf,
  "glacial-imp.png": glacialImp,
  "frozen-goblin.png": frozenGoblin,
  "frost-mutant.png": frostMutant,
  "frost-wraith.png": frostWraith,
  "frost-undead.gif": frostUndead,
  "frostbite-spider.webp": frostbiteSpider,
};

interface BattleLogEntry {
  user_id: string;
  message: string;
  type?: string;
}

interface PlayerStats {
  userId: string;
  username: string;
  habboAvatar?: string;
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
}

interface BattleData {
  enemy: {
    name: string;
    description: string;
    sprite?: string;
    current_hp: number;
    max_hp: number;
    atk: number;
    def: number;
    spd: number;
    status_effects: string[];
  };
  // Convenience reference for the current player
  player: PlayerStats;
  // All participants in the battle (solo, party, or server-wide)
  players?: PlayerStats[];
  room_description: string;
  battle_log: BattleLogEntry[];
  mode?: "story" | "battle";
  isPartyBattle?: boolean;
  currentTurnUserId?: string;
  turnOrder?: string[];
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
  const [serverId, setServerId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [dice, setDice] = useState<number[]>([1, 1, 1, 1, 1]);
  const [loading, setLoading] = useState(false);
  const [showCombatPanels, setShowCombatPanels] = useState(false);
  const [questComplete, setQuestComplete] = useState(false);
  const [battleLoadError, setBattleLoadError] = useState<string | null>(null);
  const [showVictoryLoot, setShowVictoryLoot] = useState(false);
  const [victoryLootData, setVictoryLootData] = useState<{ items: any[]; xp: number }>({ items: [], xp: 0 });
  
  // Story mode states
  const [storyNode, setStoryNode] = useState<StoryNode | null>(null);
  const [storyLoading, setStoryLoading] = useState(false);
  
  // Party states
  const [partyMembers, setPartyMembers] = useState<any[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showEndQuestDialog, setShowEndQuestDialog] = useState(false);
  const [playerHit, setPlayerHit] = useState(false);
  const [enemyHit, setEnemyHit] = useState(false);
  
  // Turn-based combat state
  const isMyTurn = !battleData?.isPartyBattle || battleData?.currentTurnUserId === currentUserId;
  const currentTurnPlayer = battleData?.players?.find(p => p.userId === battleData?.currentTurnUserId);

  // Helper function to render text with weapon names highlighted in purple
  const renderTextWithWeapons = (text: string) => {
    const parts = text.split(/(\[WEAPON:.*?\])/g);
    return parts.map((part, idx) => {
      const weaponMatch = part.match(/\[WEAPON:(.*?)\]/);
      if (weaponMatch) {
        return (
          <span key={idx} className="text-purple-500 font-bold">
            {weaponMatch[1]}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

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

    // Determine the correct filter for the subscription
    const setupSubscription = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      
      // Check if user is in a server for this dungeon
      const { data: serverMember } = await supabase
        .from('server_players')
        .select('server_id, servers!inner(dungeon_id)')
        .eq('user_id', userId || '')
        .eq('servers.dungeon_id', id)
        .maybeSingle();
      
      const userServerId = serverMember?.server_id;
      
      // Build filter based on whether this is a server battle
      const filter = userServerId 
        ? `server_id=eq.${userServerId}`
        : `dungeon_id=eq.${id}`;
      
      console.log('Setting up real-time subscription with filter:', filter);
      
      const channel = supabase
        .channel('battle-updates')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'battle_states',
            filter
          },
          (payload) => {
            console.log('Battle state updated:', payload);
            // Reload battle data when it changes
            loadBattle();
          }
        )
        .subscribe();

      return channel;
    };

    let channel: any;
    setupSubscription().then(ch => { channel = ch; });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [id]);

  // Load party/server members for story mode party panel
  useEffect(() => {
    if (!battleData || battleData.mode !== "story") return;

    // For server-based runs, show all server players
    if (serverId) {
      loadServerMembers(serverId);
      return;
    }

    // For party-based runs, show all party members
    if (partyId) {
      loadPartyMembers(partyId);
      return;
    }

    // Solo story run fallback: just the current player
    if (currentUserId && profile) {
      setPartyMembers([
        {
          userId: currentUserId,
          username: profile.habbo_username || profile.username?.split("@")[0] || "Player",
          habboAvatar:
            profile.habbo_username && profile.habbo_profile_json
              ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${profile.habbo_profile_json.figureString}&hotel=COM&size=s&action=wlk&gesture=agr&direction=4&head_direction=1&service=official`
              : null,
          level: battleData.player.level,
          currentHp: battleData.player.current_hp,
          maxHp: battleData.player.max_hp,
          currentMp: battleData.player.current_mp,
          maxMp: battleData.player.max_mp,
          statusEffects: battleData.player.status_effects || [],
        },
      ]);
    }
  }, [battleData, serverId, partyId, currentUserId, profile]);

  const loadBattle = async (isRetry = false) => {
    if (!id) {
      console.error("Cannot load battle: battleId is undefined");
      navigate("/dashboard");
      return;
    }
    
    // Reset victory loot state when loading new battle
    setShowVictoryLoot(false);
    setVictoryLootData({ items: [], xp: 0 });
    
    try {
      // Pre-check: Verify battle exists and is active before calling edge function
      console.log("Pre-checking battle status for dungeon:", id);
      
      // Check if user is in a server first to determine which battle to look for
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      
      const { data: serverMember } = await supabase
        .from('server_players')
        .select('server_id, servers!inner(dungeon_id)')
        .eq('user_id', userId || '')
        .eq('servers.dungeon_id', id)
        .maybeSingle();
      
      const userServerId = serverMember?.server_id || null;
      
      // Build query based on whether this is a server battle or solo
      let battleQuery = supabase
        .from('battle_states')
        .select('is_active')
        .eq('dungeon_id', id);
      
      if (userServerId) {
        battleQuery = battleQuery.eq('server_id', userServerId);
      } else {
        battleQuery = battleQuery.eq('user_id', userId || '').is('server_id', null);
      }
      
      let { data: battleCheck, error: checkError } = await battleQuery.maybeSingle();
      
      if (checkError) {
        console.error("Error checking battle status:", checkError);
      }
      
      if (!battleCheck) {
        console.log("No battle found for this dungeon - initializing battle state");
        
        // Automatically start the battle for this dungeon
        try {
          const { data: initData, error: initError } = await supabase.functions.invoke("start-dungeon-battle", {
            body: { 
              dungeonId: id,
              difficulty: "Normal" // Will be read from dungeon settings
            },
          });

          if (initError) {
            console.error("Failed to initialize battle:", initError);
            toast({
              title: "Failed to Start Battle",
              description: "Could not initialize the battle. Please try again.",
              variant: "destructive",
            });
            navigate("/dashboard", { replace: true });
            return;
          }

          console.log("Battle initialized, re-fetching battle state...");
          
          // Re-fetch the battle state after initialization with proper filtering
          let refetchQuery = supabase
            .from('battle_states')
            .select('is_active')
            .eq('dungeon_id', id);
          
          if (userServerId) {
            refetchQuery = refetchQuery.eq('server_id', userServerId);
          } else {
            refetchQuery = refetchQuery.eq('user_id', userId || '').is('server_id', null);
          }
          
          const { data: newBattleCheck, error: refetchError } = await refetchQuery.maybeSingle();
          
          if (refetchError || !newBattleCheck) {
            console.error("Failed to fetch battle after initialization:", refetchError);
            navigate("/dashboard", { replace: true });
            return;
          }
          
          // Update battleCheck with the newly created battle
          battleCheck = newBattleCheck;
        } catch (initError) {
          console.error("Error initializing battle:", initError);
          navigate("/dashboard", { replace: true });
          return;
        }
      }
      
      if (battleCheck && !battleCheck.is_active) {
        console.log("Battle is completed - redirecting to dashboard");
        toast({
          title: "Quest Completed",
          description: "This quest has already been completed.",
        });
        navigate("/dashboard", { replace: true });
        return;
      }

      // Battle is active, proceed with loading
      console.log("Battle is active, loading data for battleId:", id);
      const { data, error } = await supabase.functions.invoke("load-battle", {
        body: { battleId: id },
      });

      console.log("Load battle response:", { data, error });

      // Check for errors in both error object and data.error
      if (error) {
        console.error("Edge function error:", error);
        
        // Check for specific error types
        const errorMsg = error.message || JSON.stringify(error);
        if (errorMsg.includes('DUNGEON_DELETED')) {
          toast({
            title: "Dungeon Deleted",
            description: "This dungeon was deleted by its owner. The party has been disbanded.",
            variant: "destructive",
          });
          navigate("/dashboard", { replace: true });
          return;
        }
        
        throw new Error(errorMsg);
      }
      
      if (data?.error) {
        console.error("Data error:", data.error);
        
        // Check for specific error types
        if (data.error.includes('DUNGEON_DELETED')) {
          toast({
            title: "Dungeon Deleted",
            description: "This dungeon was deleted by its owner. The party has been disbanded.",
            variant: "destructive",
          });
          navigate("/dashboard", { replace: true });
          return;
        }
        
        throw new Error(data.error);
      }
      
      if (data?.battleData) {
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
      } else {
        throw new Error("No battle data received");
      }
    } catch (error: any) {
      console.error("Battle load error:", error);
      console.error("Error details:", { 
        message: error.message, 
        error: error.error,
        fullError: JSON.stringify(error) 
      });
      
      // Normalize error message
      const errorMessage = error.message || error.error || JSON.stringify(error);
      const isBattleNotFound = errorMessage.includes("Battle not found") || 
                               errorMessage.includes("not found for dungeon");
      const isBattleNotStarted = errorMessage.includes("Battle Not Started") ||
                                 errorMessage.includes("hasn't been started yet");

      // Legacy "battle not started" fallback – try once to auto-start then reload
      if (isBattleNotStarted && !isRetry && id) {
        console.log("Battle reported as not started, attempting auto-start then reload...");
        try {
          const { error: initError } = await supabase.functions.invoke("start-dungeon-battle", {
            body: {
              dungeonId: id,
              difficulty: "Normal",
            },
          });

          if (initError) {
            console.error("Fallback battle init failed:", initError);
          } else {
            console.log("Fallback battle init succeeded, retrying load...");
          }
        } catch (initError) {
          console.error("Error during fallback battle init:", initError);
        }

        // Retry load once after attempting init
        await loadBattle(true);
        return;
      }
      
      setBattleLoadError(errorMessage);
      
      if (isBattleNotFound) {
        toast({
          title: "Battle Not Found",
          description: "This battle doesn't exist or has been completed. Redirecting...",
          variant: "destructive",
        });
        // Immediate redirect for completed battles
        setTimeout(() => {
          navigate("/dashboard", { replace: true });
        }, 1000);
      } else {
        toast({
          title: "Failed to load battle",
          description: typeof error === 'string' ? error : (error.message || "Unknown error"),
          variant: "destructive",
        });
      }
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

      // Check for party or server associated with THIS dungeon's battle
      const { data: battleState } = await supabase
        .from("battle_states")
        .select("party_id, server_id")
        .eq("dungeon_id", id)
        .eq("is_active", true)
        .maybeSingle();

      // Server battle takes priority
      if (battleState?.server_id) {
        setServerId(battleState.server_id);
      } else if (battleState?.party_id) {
        // Get party info for this specific battle
        const { data: memberData } = await supabase
          .from("party_members")
          .select("party_id, parties(invite_code)")
          .eq("party_id", battleState.party_id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (memberData) {
          setPartyId(memberData.party_id);
          setInviteCode((memberData.parties as any)?.invite_code || null);
          // Don't call loadPartyMembers - load-battle already provides player data
        }
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

  const loadPartyMembers = async (pId: string | null) => {
    // Skip if no party ID (solo battle)
    if (!pId) {
      console.log("No party ID, skipping party member load");
      return;
    }

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

  const loadServerMembers = async (sId: string | null) => {
    // Skip if no server ID
    if (!sId) {
      console.log("No server ID, skipping server member load");
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("get-server-players", {
        body: { serverId: sId },
      });

      if (error) throw error;
      setPartyMembers(data.members || []);
    } catch (error: any) {
      console.error("Failed to load server members:", error);
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
        if (data.outcome.dungeonComplete) {
          setQuestComplete(true);
          toast({
            title: "Quest Complete!",
            description: "You have conquered this challenge. What will you do next?",
          });
          return;
        } else {
          toast({
            title: data.outcome.triggersBattle ? "Battle!" : "The path unfolds",
            description: data.outcome.consequenceText,
          });
        }
      }

      // Reload battle to get updated state (only if not complete)
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
          itemName: selectedItem,
        },
      });

      if (error) throw error;
      
      if (data.battleData) {
        setBattleData(data.battleData);
        setSelectedAction("");
        setSelectedItem(null);
        
        // Reload inventory in case items were consumed
        loadInventory();
        
        // Trigger hit animations SEQUENTIALLY - player attacks first, then enemy counterattacks
        console.log("Damage dealt - Player:", data.playerDamageDealt, "Enemy:", data.enemyDamageDealt);
        
        if (data.playerDamageDealt && data.playerDamageDealt > 0) {
          console.log("Setting enemyHit to TRUE - Player dealt", data.playerDamageDealt, "damage");
          setEnemyHit(true);
          setTimeout(() => {
            console.log("Resetting enemyHit to FALSE");
            setEnemyHit(false);
          }, 600);
        }
        
        // Enemy counterattacks AFTER player's attack animation (1 second delay)
        if (data.enemyDamageDealt && data.enemyDamageDealt > 0) {
          setTimeout(() => {
            console.log("Setting playerHit to TRUE - Enemy dealt", data.enemyDamageDealt, "damage");
            setPlayerHit(true);
            setTimeout(() => {
              console.log("Resetting playerHit to FALSE");
              setPlayerHit(false);
            }, 600);
          }, 1000);
        }
        
        if (data.victory) {
          // Show victory loot modal with data
          setVictoryLootData({ items: data.lootItems || [], xp: data.xpGained || 0 });
          setShowVictoryLoot(true);
          // Note: loadBattle will be called when user closes the modal
        } else if (data.defeat) {
          toast({ 
            title: "Defeated!", 
            description: "You retreat to town with 50% HP/MP restored...",
            variant: "destructive" 
          });
          // Redirect to dashboard after defeat
          setTimeout(() => {
            navigate("/dashboard");
          }, 3000);
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

  // Show error screen if battle load failed
  if (battleLoadError) {
    const isBattleNotFound = battleLoadError.includes("Battle not found") || 
                             battleLoadError.includes("not found for dungeon");
    
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center space-y-6 max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-3xl font-bold text-destructive">
            {isBattleNotFound ? "Battle Not Found" : "Error Loading Battle"}
          </h1>
          <p className="text-muted-foreground">
            {isBattleNotFound 
              ? "This battle has already been completed or doesn't exist. Redirecting you to the dashboard..."
              : battleLoadError
            }
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className="animate-pulse">Redirecting in 1 second...</span>
          </div>
          <Button 
            onClick={() => navigate("/dashboard", { replace: true })} 
            variant="outline"
            className="mt-4"
          >
            Go to Dashboard Now
          </Button>
        </div>
      </div>
    );
  }

  if (!battleData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-2xl font-bold animate-pulse">Loading battle...</p>
          <p className="text-muted-foreground">Preparing your adventure</p>
        </div>
      </div>
    );
  }

  // Quest Completion Modal
  if (questComplete) {
    return (
      <div className="min-h-screen bg-background relative flex items-center justify-center">
        <div 
          className="fixed inset-0 opacity-20 bg-center bg-cover"
          style={{ backgroundImage: `url(${dungeonBg})` }}
        />
        
        <div className="relative z-10 p-8 max-w-2xl w-full">
          <HabboPanel title="Quest Complete!">
            <div className="space-y-6 p-6 text-center">
              <div className="text-6xl">🏆</div>
              <h2 className="text-3xl font-black">Victory!</h2>
              <p className="text-lg">
                You have conquered this challenge and emerged victorious. The realm needs heroes like you.
              </p>
              
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="p-4 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-sm font-bold">Current HP</p>
                  <p className="text-2xl font-bold text-green-500">{battleData.player.current_hp}/{battleData.player.max_hp}</p>
                </div>
                <div className="p-4 bg-muted rounded border-2 border-habbo-dark">
                  <p className="text-sm font-bold">Current MP</p>
                  <p className="text-2xl font-bold text-blue-500">{battleData.player.current_mp}/{battleData.player.max_mp}</p>
                </div>
              </div>

              <div className="space-y-3 pt-4">
                <Button
                  onClick={() => navigate("/create-dungeon")}
                  className="w-full text-xl py-6 font-black border-4 border-habbo-dark hover-scale"
                  size="lg"
                >
                  Embark on New Adventure
                </Button>
                <Button
                  onClick={() => navigate("/dashboard")}
                  variant="outline"
                  className="w-full text-lg py-4 font-bold border-4 border-habbo-dark hover-scale"
                >
                  Return to Town
                </Button>
              </div>
            </div>
          </HabboPanel>
        </div>
      </div>
    );
  }

  // Render story mode
  if (battleData.mode === "story") {
    // Build party list from battle participants when available (server/party battle)
    const storyPlayers = (battleData.players && battleData.players.length > 0)
      ? battleData.players
      : [
          {
            userId: currentUserId || "player",
            username: (profile?.habbo_username || profile?.username?.split("@")[0] || "Player") as string,
            level: battleData.player.level,
            current_hp: battleData.player.current_hp,
            max_hp: battleData.player.max_hp,
            current_mp: battleData.player.current_mp,
            max_mp: battleData.player.max_mp,
            atk: battleData.player.atk,
            def: battleData.player.def,
            spd: battleData.player.spd,
            status_effects: battleData.player.status_effects,
            current_xp: battleData.player.current_xp,
            xp_to_next_level: battleData.player.xp_to_next_level,
          },
        ];

    const partyMembers = storyPlayers.map((p) => {
      const playerUsername = (p as any).username || profile?.habbo_username || profile?.username?.split("@")[0] || "Player";
      const isCurrentUser = (p as any).userId === currentUserId || (!battleData.players && (p as any).userId === "player");

      // Use habboAvatar from backend if available, otherwise construct for current user
      let habboAvatar = (p as any).habboAvatar || null;
      
      if (!habboAvatar && isCurrentUser && profile?.habbo_username && profile.habbo_profile_json) {
        habboAvatar = `https://www.habbo.com/habbo-imaging/avatarimage?figure=${profile.habbo_profile_json.figureString}&hotel=COM&size=s&action=wlk&gesture=agr&direction=4&head_direction=1&service=official`;
      }

      return {
        userId: (p as any).userId,
        username: playerUsername,
        habboAvatar,
        level: (p as any).level,
        currentHp: (p as any).current_hp,
        maxHp: (p as any).max_hp,
        currentMp: (p as any).current_mp,
        maxMp: (p as any).max_mp,
        statusEffects: (p as any).status_effects || [],
      };
    });

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
                          renderTextWithWeapons(message)
                        ) : (
                          <>
                            {!isDiceRoll && <span className="text-[#FFD700] font-bold">{username}</span>}
                            {message.includes("chose:") ? (
                              <> {renderTextWithWeapons(message.replace("You ", ""))}</>
                            ) : (
                              <> {isDiceRoll ? renderTextWithWeapons(message) : renderTextWithWeapons(message)}</>
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
                        {/* Turn-based choice header */}
                        {battleData.isPartyBattle && (
                          <div className={`p-3 rounded-lg border-2 mb-4 ${
                            isMyTurn 
                              ? 'bg-green-500/20 border-green-400' 
                              : 'bg-gray-500/20 border-gray-400'
                          }`}>
                            <div className="text-center font-bold text-sm">
                              {isMyTurn ? (
                                <span className="text-green-400">Your turn to choose!</span>
                              ) : (
                                <span className="text-gray-300">
                                  Waiting for {currentTurnPlayer?.username || 'player'} to decide...
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        
                        <h3 className="text-xl font-black mb-4">What will you do?</h3>
                        <div className="space-y-3">
                          {storyNode.choices.map((choice) => (
                            <Button
                              key={choice.id}
                              onClick={() => handleStoryChoice(choice.id)}
                              disabled={storyLoading || (battleData.isPartyBattle && !isMyTurn)}
                              variant="outline"
                              className="w-full text-left justify-start h-auto py-4 px-6 font-bold border-4 border-habbo-dark text-base hover-scale disabled:opacity-50"
                            >
                              <span className="mr-3 text-2xl">›</span>
                              {choice.label}
                            </Button>
                          ))}
                        </div>
                        
                        {/* End Quest Button */}
                        <div className="pt-4 border-t-2 border-habbo-dark/30">
                          <Button
                            onClick={() => setShowEndQuestDialog(true)}
                            variant="ghost"
                            className="w-full text-sm font-bold text-muted-foreground hover:text-foreground"
                          >
                            End Quest Here
                          </Button>
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

              {/* Party Panel - Full width in battle mode for horizontal display */}
              <div className={battleData.mode !== "story" ? "md:col-span-3" : "md:col-span-1"}>
                <HabboPanel title={battleData.mode !== "story" ? "Battle Party" : "Your Party"}>
                  {/* Turn Order Info */}
                  {battleData.isPartyBattle && battleData.turnOrder && battleData.turnOrder.length > 1 && (
                    <div className="mb-4 p-2 bg-muted/50 border-2 border-habbo-dark rounded text-center">
                      <p className="text-xs font-bold text-muted-foreground">
                        Turn Order: {battleData.turnOrder.map((id, idx) => {
                          const member = partyMembers.find(m => m.userId === id);
                          const isActive = id === battleData.currentTurnUserId;
                          return (
                            <span key={id} className={isActive ? 'text-green-400 font-black' : ''}>
                              {member?.username || 'Unknown'}
                              {idx < battleData.turnOrder.length - 1 ? ' → ' : ''}
                            </span>
                          );
                        })}
                      </p>
                    </div>
                  )}

                  {/* Party Avatars Row */}
                  <div className="flex gap-2 mb-4 pb-4 border-b-2 border-habbo-dark">
                    {partyMembers.slice(0, 4).map((member) => {
                      const isCurrentTurn = battleData.currentTurnUserId === member.userId;
                      const turnIndex = battleData.turnOrder?.indexOf(member.userId);
                      
                      return (
                        <button
                          key={`avatar-${member.userId}`}
                          onClick={() => setSelectedMemberId(member.userId)}
                          className={`relative flex items-center justify-center w-16 min-h-[64px] border-2 rounded overflow-hidden transition-all cursor-pointer ${
                            isCurrentTurn 
                              ? 'border-green-400 ring-4 ring-green-400/50 bg-green-500/20 animate-pulse' 
                              : 'border-habbo-dark bg-card hover:border-primary'
                          }`}
                          title={`${member.username}${isCurrentTurn ? ' - CURRENT TURN' : ''}`}
                        >
                          {/* Turn order badge */}
                          {turnIndex !== undefined && turnIndex >= 0 && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-habbo-dark border-2 border-foreground flex items-center justify-center text-xs font-bold z-10">
                              {turnIndex + 1}
                            </div>
                          )}
                          
                          {member.habboAvatar && (
                            <img
                              src={member.habboAvatar}
                              alt={member.username}
                              className="pixelated max-w-full max-h-[60px] w-auto h-auto"
                            />
                          )}
                        </button>
                      );
                    })}
                    {partyMembers.length < 4 && Array.from({ length: 4 - partyMembers.length }).map((_, i) => (
                      <button
                        key={`empty-${i}`}
                        onClick={() => partyId ? setShowInviteDialog(true) : createParty()}
                        className="w-12 h-12 border-2 border-dashed border-muted rounded bg-muted/20 flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-colors cursor-pointer min-h-[48px]"
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
                        const isCurrentTurn = battleData.currentTurnUserId === member.userId;
                        const isCurrentUser = member.userId === currentUserId;
                        
                        return (
                      <div
                        key={member.userId}
                        className={`p-4 rounded-lg border-2 space-y-3 ${
                          isCurrentTurn 
                            ? 'bg-green-500/20 border-green-400 ring-2 ring-green-400/50' 
                            : 'bg-muted border-habbo-dark'
                        }`}
                      >
                        {/* Turn status banner */}
                        {isCurrentTurn && (
                          <div className="text-center py-2 bg-green-500/30 -mx-4 -mt-4 mb-3 border-b-2 border-green-400">
                            <p className="font-black text-green-400 text-sm animate-pulse">
                              CURRENTLY ACTING
                            </p>
                          </div>
                        )}

                        {/* Avatar */}
                        {member.habboAvatar && (
                          <div className="flex justify-center">
                            <div className="border-2 border-habbo-dark rounded overflow-hidden bg-card p-2">
                              <img
                                src={member.habboAvatar.replace('size=s', 'size=m')}
                                alt={member.username}
                                className="pixelated w-auto h-auto max-w-[80px]"
                              />
                            </div>
                          </div>
                        )}

                        {/* Name & Level */}
                        <div className="text-center">
                          <p className="font-bold">
                            {member.username}
                            {isCurrentUser && <span className="ml-2 text-xs text-primary">(You)</span>}
                          </p>
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
                      partyMembers.map((member) => {
                        const isCurrentTurn = battleData.currentTurnUserId === member.userId;
                        const isCurrentUser = member.userId === currentUserId;
                        
                        return (
                        <div
                          key={member.userId}
                          onClick={() => setSelectedMemberId(member.userId)}
                          className={`p-3 rounded border-2 flex items-center gap-3 cursor-pointer transition-all ${
                            isCurrentTurn
                              ? 'bg-green-500/20 border-green-400 ring-2 ring-green-400/50 hover:bg-green-500/30'
                              : 'bg-muted border-habbo-dark hover:border-primary'
                          }`}
                        >
                          {member.habboAvatar && (
                            <div className="flex items-center justify-center w-12 border-2 border-habbo-dark rounded overflow-hidden bg-card p-1">
                              <img
                                src={member.habboAvatar}
                                alt={member.username}
                                className="pixelated w-auto h-auto max-h-[40px]"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold text-sm truncate ${isCurrentTurn ? 'text-green-400' : ''}`}>
                              {member.username}
                              {isCurrentUser && <span className="ml-1 text-xs text-primary">(You)</span>}
                            </p>
                            <p className="text-xs text-muted-foreground">Level {member.level}</p>
                            {isCurrentTurn && (
                              <p className="text-xs text-green-400 font-bold animate-pulse">Taking turn...</p>
                            )}
                          </div>
                          
                          {/* HP bar mini preview */}
                          <div className="w-16">
                            <div className="h-2 bg-muted border border-habbo-dark rounded-sm overflow-hidden">
                              <div 
                                className="h-full bg-hp transition-all"
                                style={{ width: `${(member.currentHp / member.maxHp) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        );
                      })
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
                        renderTextWithWeapons(message)
                      ) : (
                        <>
                          {!isDiceRoll && <span className="text-[#FFD700] font-bold">{username}</span>}
                          {message.includes("chose:") ? (
                            <> {renderTextWithWeapons(message.replace("You ", ""))}</>
                          ) : (
                            <> {isDiceRoll ? renderTextWithWeapons(message) : renderTextWithWeapons(message)}</>
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
            <HabboPanel title="NOW FIGHTING" className="md:col-span-1">
            <div className="space-y-4">
              {/* Enemy Sprite */}
              {battleData.enemy.sprite && ENEMY_SPRITES[battleData.enemy.sprite] && (
                <div className="flex justify-center">
                  <div className="relative overflow-visible p-2">
                    <img
                      src={ENEMY_SPRITES[battleData.enemy.sprite]}
                      alt={battleData.enemy.name}
                      className={`pixel-icon ${enemyHit ? 'animate-bump-right' : ''}`}
                      style={{ width: 'auto', height: 'auto', maxWidth: '120px' }}
                    />
                    {enemyHit && (
                      <>
                        <img
                          src={explosionHit}
                          alt="Hit"
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
                          style={{ width: '80px', height: '80px' }}
                        />
                        <img
                          src={hitBump}
                          alt="Bump"
                          className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 pointer-events-none z-10 animate-fade-in"
                          style={{ width: '60px', height: 'auto' }}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}
              <div className="p-3 bg-destructive/10 border-2 border-destructive rounded-lg">
                <p className="text-xs font-bold text-destructive mb-1">CURRENT ENEMY</p>
                <h3 className="text-2xl font-black text-destructive">{battleData.enemy.name}</h3>
              </div>
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
                  disabled={!isMyTurn}
                  className="font-bold border-4 border-habbo-dark disabled:opacity-50"
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
                  disabled={!isMyTurn}
                  className="font-bold border-4 border-habbo-dark disabled:opacity-50"
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
                  disabled={!isMyTurn}
                  className="font-bold border-4 border-habbo-dark disabled:opacity-50"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Defend
                </Button>
                <Button
                  variant={selectedAction === "item" ? "default" : "outline"}
                  onClick={() => setSelectedAction("item")}
                  disabled={!isMyTurn}
                  className="font-bold border-4 border-habbo-dark disabled:opacity-50"
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
                disabled={loading || !selectedAction || !isMyTurn}
                size="lg"
                className="w-full font-bold border-4 border-habbo-dark text-lg py-6"
              >
                {loading ? "Resolving..." : isMyTurn ? "Resolve Turn" : "Waiting for turn..."}
              </Button>
              
              {/* End Quest Button */}
              <div className="pt-4 border-t-2 border-habbo-dark/30">
                <Button
                  onClick={() => setShowEndQuestDialog(true)}
                  variant="ghost"
                  className="w-full text-sm font-bold text-muted-foreground hover:text-foreground"
                >
                  End Quest Here
                </Button>
              </div>
            </div>
          </HabboPanel>

          {/* Player Panel */}
          <HabboPanel title="You" className="md:col-span-1">
            <div className="space-y-4">
              {/* Player Habbo Avatar */}
              {profile?.habbo_username && profile.habbo_profile_json && (
                <div className="flex justify-center">
                  <div className="relative rounded-lg overflow-visible bg-card">
                    <img
                      src={`https://www.habbo.com/habbo-imaging/avatarimage?figure=${profile.habbo_profile_json.figureString}&hotel=COM&size=m&action=wlk&gesture=agr&direction=4&head_direction=1&service=official`}
                      alt={profile.habbo_username}
                      className={`pixel-icon ${playerHit ? 'animate-bump-left' : ''}`}
                      style={{ width: 'auto', height: 'auto', maxWidth: '100px' }}
                    />
                    {playerHit && (
                      <>
                        <img
                          src={explosionHit}
                          alt="Hit"
                          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
                          style={{ width: '80px', height: '80px' }}
                        />
                        <img
                          src={hitBump}
                          alt="Bump"
                          className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 pointer-events-none z-10 animate-fade-in"
                          style={{ width: '60px', height: 'auto' }}
                        />
                      </>
                    )}
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
              
              {/* Equipped Weapon */}
              <div className="p-3 bg-muted rounded-lg border-2 border-habbo-dark">
                <p className="text-xs font-bold mb-1">Equipped Weapon:</p>
                <p className="text-sm">
                  {inventory.find(item => item.is_equipped && item.item_type === 'weapon')?.item_name || 'None'}
                </p>
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

        {/* Party Turn Indicator - Minimal horizontal display in battle mode */}
        {battleData.mode === "battle" ? (
          <HabboPanel title="Battle Party" className="w-full">
            <div className="flex gap-3 justify-center">
              {battleData.players?.slice(0, 6).map((player) => {
                const isCurrentTurn = battleData.currentTurnUserId === player.userId;
                const turnIndex = battleData.turnOrder?.indexOf(player.userId);
                const isCurrentUser = player.userId === currentUserId;
                
                return (
                  <button
                    key={player.userId}
                    onClick={() => setSelectedMemberId(selectedMemberId === player.userId ? null : player.userId)}
                    className={`relative flex flex-col items-center gap-2 p-3 border-2 rounded-lg transition-all ${
                      isCurrentTurn
                        ? 'border-green-400 bg-green-500/20 ring-2 ring-green-400/50 animate-pulse'
                        : isCurrentUser
                        ? 'border-primary bg-primary/10'
                        : 'border-habbo-dark bg-card hover:border-primary'
                    }`}
                  >
                    {/* Turn order badge */}
                    {turnIndex !== undefined && turnIndex >= 0 && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-habbo-dark border-2 border-foreground flex items-center justify-center text-xs font-bold z-10">
                        {turnIndex + 1}
                      </div>
                    )}
                    
                    {/* Current turn indicator */}
                    {isCurrentTurn && (
                      <div className="absolute -top-2 -left-2 z-10">
                        <Swords className="w-5 h-5 text-green-400 animate-bounce" />
                      </div>
                    )}
                    
                    {/* Avatar */}
                    <div className="w-16 h-20 relative flex items-center justify-center">
                      <img
                        src={player.habboAvatar || ''}
                        alt={player.username}
                        className="max-w-full max-h-full object-contain pixelated"
                      />
                    </div>
                    
                    {/* Username */}
                    <div className="text-xs font-bold text-center max-w-[80px] truncate">
                      {player.username}
                    </div>
                    
                    {/* HP bar */}
                    <div className="w-full bg-muted border border-habbo-dark rounded-sm h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-hp transition-all duration-300"
                        style={{ width: `${(player.current_hp / player.max_hp) * 100}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            
            {/* Selected player details */}
            {selectedMemberId && battleData.players?.find(p => p.userId === selectedMemberId) && (
              <div className="mt-4 p-4 bg-muted/50 border-2 border-habbo-dark rounded-lg">
                {(() => {
                  const player = battleData.players.find(p => p.userId === selectedMemberId)!;
                  return (
                    <div className="flex gap-4 items-start">
                      {/* Medium Avatar */}
                      <div className="w-32 h-40 relative flex items-center justify-center flex-shrink-0 bg-muted/50 border border-habbo-dark rounded-lg p-2">
                        <img
                          src={player.habboAvatar?.replace('size=s', 'size=m') || ''}
                          alt={player.username}
                          className="max-w-full max-h-full object-contain pixelated"
                        />
                      </div>
                      
                      {/* Stats Grid */}
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">HP</p>
                          <p className="text-lg font-bold">{player.current_hp}/{player.max_hp}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">MP</p>
                          <p className="text-lg font-bold">{player.current_mp}/{player.max_mp}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">ATK</p>
                          <p className="text-lg font-bold">{player.atk}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">DEF</p>
                          <p className="text-lg font-bold">{player.def}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </HabboPanel>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <HabboPanel title={serverId ? "Server Players" : "Party Members"} className={battleData.mode === "battle" ? "flex-1" : ""}>
              {serverId ? (
                <PartyMembers serverId={serverId} />
              ) : partyId ? (
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
        )}
        <Button
          variant="outline"
          onClick={() => navigate("/dashboard")}
          className="font-bold border-4 border-habbo-dark"
        >
          Return to Dashboard
        </Button>
        </div>
      </div>

      {/* Victory Loot Modal */}
      <VictoryLoot
        isOpen={showVictoryLoot}
        onClose={() => {
          setShowVictoryLoot(false);
          setVictoryLootData({ items: [], xp: 0 });
        }}
        onContinue={() => {
          // Reload battle to switch to story mode after victory
          loadBattle();
        }}
        lootItems={victoryLootData.items}
        xpGained={victoryLootData.xp}
      />

      {/* End Quest Confirmation Dialog */}
      <AlertDialog open={showEndQuestDialog} onOpenChange={setShowEndQuestDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Quest?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to end this quest? Your progress will be saved, but you'll return to the dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate("/dashboard")}>
              End Quest
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Battle;