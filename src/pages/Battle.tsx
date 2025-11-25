import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { HabboPanel } from "@/components/HabboPanel";
import { PartyMembers } from "@/components/PartyMembers";
import { StatBar } from "@/components/StatBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { VictoryLoot } from "@/components/VictoryLoot";
import { PartyWipeDialog } from "@/components/PartyWipeDialog";
import { ItemTooltip } from "@/components/ItemTooltip";
import { QuestDetailsDialog } from "@/components/QuestDetailsDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { DungeonBoard } from "@/components/DungeonBoard";
import { SkillMenu } from "@/components/SkillMenu";
import { SKILL_DEFINITIONS } from "@/lib/skillDefinitions";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { Swords, Shield, Sparkles, Package, Users, Plus, Copy, ScrollText, Volume2 } from "lucide-react";
import dungeonBg from "@/assets/dungeon-bg.png";
import explosionHit from "@/assets/explosion-hit.gif";
import hitBump from "@/assets/hit-bump.gif";

import skeleton from "@/assets/skeleton.png";
import iceTiger from "@/assets/ice-tiger.gif";
import iceElemental from "@/assets/ice-elemental.png";
import iceGuardian from "@/assets/ice-guardian.png";
import frostWolf from "@/assets/frost-wolf.png";
import glacialImp from "@/assets/glacial-imp.png";
import frozenGoblin from "@/assets/frozen-goblin.png";
import frostMutant from "@/assets/frost-mutant.png";
import frostWraith from "@/assets/frost-wraith.png";
import undeadHabbo from "@/assets/undead-habbo.png";
import frostbiteSpider from "@/assets/frostbite-spider.png";
import giantRat from "@/assets/giant-rat.png";
import iceShade from "@/assets/ice-shade.png";
import fireDrake from "@/assets/fire-drake.png";
import bloodDragonBoss from "@/assets/blood-dragon-boss.gif";
import flamingPhantom from "@/assets/flaming-phantom.png";
import goblinTrio from "@/assets/goblin-trio.png";
import iceKnightBoss from "@/assets/ice-knight-boss.png";
import spiritOwl from "@/assets/spirit-owl.png";
import werewolf from "@/assets/werewolf.png";
import swampLurker from "@/assets/swamp-lurker.png";
import voidStalker from "@/assets/void-stalker.png";
import frostBrute from "@/assets/frost-brute.png";
import icedStoneDragon from "@/assets/iced-stone-dragon.png";
import infernalHound from "@/assets/infernal-hound.png";
import mysticShamanBoss from "@/assets/mystic-shaman-boss.png";
import treasureChestOpen from "@/assets/treasure-chest-open.png";
import mysticalIcon from "@/assets/mystical-icon.png";
import diceSprite from "@/assets/dice-sprite.gif";
import victoryTrophy from "@/assets/victory-trophy.png";
import { getNPCById } from "@/lib/npcData";

// Enemy sprite mapping
const ENEMY_SPRITES: Record<string, string> = {
  "skeleton.png": skeleton,
  "ice-tiger.gif": iceTiger,
  "ice-elemental.png": iceElemental,
  "ice-guardian.png": iceGuardian,
  "frost-wolf.png": werewolf,
  "glacial-imp.png": glacialImp,
  "frozen-goblin.png": frozenGoblin,
  "frost-mutant.png": frostMutant,
  "frost-wraith.png": frostWraith,
  "frost-undead.gif": undeadHabbo,
  "undead-habbo.png": undeadHabbo,
  "frostbite-spider.png": frostbiteSpider,
  "giant-rat.png": giantRat,
  "ice-shade.png": iceShade,
  "fire-drake.png": fireDrake,
  "blood-dragon-boss.gif": bloodDragonBoss,
  "flaming-phantom.png": flamingPhantom,
  "goblin-trio.png": goblinTrio,
  "ice-knight-boss.png": iceKnightBoss,
  "spirit-owl.png": spiritOwl,
  "werewolf.png": frostWolf,
  "swamp-lurker.png": swampLurker,
  "void-stalker.png": voidStalker,
  "frost-brute.png": frostBrute,
  "iced-stone-dragon.png": icedStoneDragon,
  "infernal-hound.png": infernalHound,
  "mystic-shaman-boss.png": mysticShamanBoss,
};

interface BattleLogEntry {
  user_id: string;
  message: string;
  type?: string;
}

// Helper function to get the latest narrative from battle log or story node
const getLatestNarrative = (battleData: BattleData): string => {
  // CRITICAL: When current_story_node exists, it's the source of truth for BOTH storyText AND choices
  // This ensures narrative text and choices are always in sync (from the same story node)
  if (battleData.current_story_node?.storyText) {
    return battleData.current_story_node.storyText;
  }
  
  // Otherwise fall back to battle log (for resolved choices/combat results)
  if (battleData.battle_log && battleData.battle_log.length > 0) {
    // Filter out choice and dice check messages, get the last narrative message
    const narrativeMessages = battleData.battle_log.filter(
      entry => entry.type !== 'choice' && entry.type !== 'dice_failure' && entry.type !== 'dice_success'
    );
    
    if (narrativeMessages.length > 0) {
      return narrativeMessages[narrativeMessages.length - 1].message;
    }
  }
  
  // Final fallback to static room description
  return battleData.room_description;
};

interface PlayerStats {
  userId: string;
  username: string;
  habboAvatar?: string;
  figureString?: string;
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
  dungeon_name?: string;
  dungeon_theme?: string;
  dungeon_difficulty?: string;
  quest_objective?: string;
  intro_text?: string;
  room_description: string;
  room_type?: string;
  treasure_description?: string | null;
  event_type?: string | null;
  event_amount?: number | null;
  event_description?: string | null;
  battle_log: BattleLogEntry[];
  mode?: "story" | "battle";
  battle_status?: "battle" | "won" | "lost" | "story" | "finished";
  isPartyBattle?: boolean;
  currentTurnUserId?: string;
  turnOrder?: string[];
  current_story_node?: {
    storyText: string;
    choices?: Array<{
      id: string;
      label: string;
      diceRequired?: boolean;
      diceDC?: number;
      skillType?: string;
    }>;
  } | null;
  dungeon?: {
    width: number;
    height: number;
    entities: Array<{
      id: string;
      type: 'player' | 'enemy';
      x: number;
      y: number;
      username?: string;
      name?: string;
      habboAvatar?: string | null;
      sprite?: string;
      current_hp?: number;
      max_hp?: number;
      isDead?: boolean;
    }>;
  };
  availableSkills?: Array<{
    id: string;
    name: string;
    description: string;
    source: "fishing" | "gardening";
    mpCost: number;
    canUse: boolean;
    onCooldown: boolean;
    oncePerDungeon?: boolean;
    requiredFishingLevel?: number;
    requiredGardeningLevel?: number;
  }>;
  fishingLevel?: number;
  gardeningLevel?: number;
}

interface Profile {
  username: string;
  habbo_username: string | null;
  habbo_profile_json: any;
}

interface StoryNode {
  storyText: string;
  choices: Array<{ 
    id: string; 
    label: string;
    diceRequired?: boolean;
    diceDC?: number;
    skillType?: string;
  }>;
}

// Helper function to get dynamic Habbo avatar based on state
const getHabboAvatar = (
  figureString: string | undefined,
  hpPercentage: number,
  isCurrentTurn: boolean,
  isVictory: boolean,
  size: 's' | 'm' | 'b' = 's'
): string => {
  if (!figureString) return '';
  
  let gesture = 'std';
  let action = 'std';
  let direction = '2';
  
  if (hpPercentage <= 0) {
    // Dead
    action = 'lay';
    gesture = 'std';
    direction = '4';
  } else if (isVictory) {
    // Victory - smiling
    gesture = 'sml';
    action = 'std';
  } else if (hpPercentage < 30) {
    // Hurt
    gesture = 'sad';
    action = 'std';
  } else if (isCurrentTurn) {
    // Fighting
    gesture = 'agr';
    action = 'std';
  }
  // Default is std/std for normal idle state
  
  return `https://www.habbo.com/habbo-imaging/avatarimage?figure=${figureString}&hotel=COM&size=${size}&action=${action}&gesture=${gesture}&direction=${direction}&head_direction=2&service=official`;
};

const Battle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { speak, isPlaying, isLoading: ttsLoading } = useTextToSpeech();
  
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
  const victoryDialogActiveRef = useRef(false);
  const lastRoomIndexRef = useRef<number | null>(null);
  const turnAdvanceAttemptedRef = useRef(false);
  const battleLogRef = useRef<HTMLDivElement>(null);
  const previousBattleStatusRef = useRef<string | null>(null);
  const animationActiveRef = useRef(false);
  const lastReloadTimeRef = useRef(0);
  
  // Story mode states
  const [storyNode, setStoryNode] = useState<StoryNode | null>(null);
  const [storyLoading, setStoryLoading] = useState(false);
  const [treasureClaimed, setTreasureClaimed] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<StoryNode['choices'][0] | null>(null);
  const [storyDice, setStoryDice] = useState<number[]>([1, 1, 1, 1, 1]);
  
  // Party states
  const [partyMembers, setPartyMembers] = useState<any[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showEndQuestDialog, setShowEndQuestDialog] = useState(false);
  const [showQuestDetailsDialog, setShowQuestDetailsDialog] = useState(false);
  const [playerHit, setPlayerHit] = useState(false);
  const [enemyHit, setEnemyHit] = useState(false);
  const [showPartyWipeDialog, setShowPartyWipeDialog] = useState(false);
  
  // AI dungeon background state
  const [dungeonBackground, setDungeonBackground] = useState<string | null>(null);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [attackingEntityId, setAttackingEntityId] = useState<string | undefined>();
  const [targetEntityId, setTargetEntityId] = useState<string | undefined>();
  const [damageDealt, setDamageDealt] = useState<{ entityId: string; amount: number } | undefined>();
  
  // Item and skill dialog states
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [consumables, setConsumables] = useState<any[]>([]);
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  
  // Turn-based combat state
  const isMyTurn = !battleData?.isPartyBattle || battleData?.currentTurnUserId === currentUserId;
  const currentTurnPlayer = battleData?.players?.find(p => p.userId === battleData?.currentTurnUserId);

  // Helper function to render text with weapon/item names highlighted in purple
  const renderTextWithWeapons = (text: string) => {
    // Match both [WEAPON:...] and regular item names in brackets like [Silver Key]
    const parts = text.split(/(\[WEAPON:.*?\]|\[[^\]]+\])/g);
    return parts.map((part, idx) => {
      const weaponMatch = part.match(/\[WEAPON:(.*?)\]/);
      if (weaponMatch) {
        const weaponName = weaponMatch[1];
        return (
          <ItemTooltip key={idx} itemName={weaponName}>
            <span className="text-purple-500 font-bold cursor-help">
              [{weaponName}]
            </span>
          </ItemTooltip>
        );
      }
      
      // Check if it's an item in brackets
      const itemMatch = part.match(/\[([^\]]+)\]/);
      if (itemMatch) {
        const itemName = itemMatch[1];
        
        // Skip styling for "Dice Check:" text
        if (itemName.includes('Dice Check:')) {
          return <span key={idx}>{part}</span>;
        }
        
        // Check if this is a player name by looking in partyProfiles
        let playerUserId: string | null = null;
        let playerProfile: Profile | null = null;
        
        for (const [userId, profile] of partyProfiles.entries()) {
          if ((profile.habbo_username && profile.habbo_username.toLowerCase() === itemName.toLowerCase()) ||
              (profile.username && profile.username.toLowerCase() === itemName.toLowerCase())) {
            playerUserId = userId;
            playerProfile = profile;
            break;
          }
        }
        
        if (playerProfile && playerUserId) {
          // It's a player name - show avatar on hover with yellow color for current user
          const isCurrentUser = playerUserId === currentUserId;
          const avatarUrl = playerProfile.habbo_profile_json?.figureString
            ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${playerProfile.habbo_profile_json.figureString}&hotel=COM&size=b&action=std&gesture=sml&direction=2&head_direction=2&service=official`
            : null;
          
          return (
            <span 
              key={idx} 
              className="relative inline-block"
              onMouseEnter={(e) => {
                if (!avatarUrl) return;
                const tooltip = document.createElement('div');
                tooltip.className = 'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 animate-fade-in';
                tooltip.innerHTML = `
                  <div class="bg-habbo-dark border-2 border-primary p-2 rounded shadow-lg">
                    <img 
                      src="${avatarUrl}" 
                      alt="${itemName}"
                      class="pixel-icon w-16 h-16 object-contain"
                    />
                    <p class="text-xs text-center text-foreground mt-1 font-bold whitespace-nowrap">
                      ${itemName}
                    </p>
                  </div>
                `;
                e.currentTarget.appendChild(tooltip);
              }}
              onMouseLeave={(e) => {
                const tooltip = e.currentTarget.querySelector('.animate-fade-in');
                if (tooltip) tooltip.remove();
              }}
            >
              <span className="text-[#FFD700] font-bold cursor-help">
                [{itemName}]
              </span>
            </span>
          );
        }
        
        // Regular item
        return (
          <ItemTooltip key={idx} itemName={itemName}>
            <span className="text-purple-500 font-bold cursor-help">
              [{itemName}]
            </span>
          </ItemTooltip>
        );
      }
      
      return <span key={idx}>{part}</span>;
    });
  };

  // Preload battle animation assets
  const preloadBattleAssets = () => {
    const imagesToPreload = [explosionHit, hitBump];
    imagesToPreload.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  };

  useEffect(() => {
    preloadBattleAssets();
    loadBattle();
    loadProfile();
    loadCurrentUser();
    checkExistingParty();
    loadInventory();
  }, [id]);

  // Generate or fetch AI dungeon background
  const generateDungeonBackground = async () => {
    if (!id) return;
    
    setBackgroundLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-dungeon-background', {
        body: {
          theme: battleData?.dungeon_theme || 'ice_winter',
          difficulty: battleData?.dungeon_difficulty === 'Hardcore' ? 2 : 1,
          dungeonId: id
        }
      });

      if (error) {
        console.error('Error generating dungeon background:', error);
        toast({
          title: "Background Generation Failed",
          description: "Using default background instead.",
          variant: "destructive"
        });
      } else if (data?.imageUrl) {
        setDungeonBackground(data.imageUrl);
        console.log('Dungeon background loaded:', data.imageUrl);
      }
    } catch (err) {
      console.error('Failed to generate background:', err);
    } finally {
      setBackgroundLoading(false);
    }
  };

  // Re-generate background when battle data loads with theme info
  useEffect(() => {
    if (battleData && !dungeonBackground && !backgroundLoading) {
      generateDungeonBackground();
    }
  }, [battleData?.dungeon_theme, battleData?.dungeon_difficulty]);

  // Set up Realtime subscription for battle state changes
  useEffect(() => {
    if (!id || showPartyWipeDialog) return; // Pause realtime updates while dialog is showing

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
        .channel('battle-updates', {
          config: {
            broadcast: { self: true }
          }
        })
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'battle_states',
            filter
          },
          async (payload) => {
            console.log('🔄 Battle state updated via realtime:', payload);
            
            // Don't reload if victory dialog is showing - let user close it first
            if (victoryDialogActiveRef.current) {
              console.log('Victory dialog is showing, skipping reload');
              return;
            }
            
            // Skip reload if animations are active (use ref to avoid stale closure)
            if (animationActiveRef.current) {
              console.log('Combat animations active, skipping reload to prevent screen flash');
              return;
            }
            
            // Debounce rapid reloads
            const now = Date.now();
            if (now - lastReloadTimeRef.current < 2000) {
              console.log('Debouncing reload, too soon after last reload');
              return;
            }
            lastReloadTimeRef.current = now;
            
            // Check if this is a room progression (victory transition) - if so, skip reload
            // The handleResolveTurn function will handle showing the victory modal
            const newState = payload.new as any;
            if (newState && lastRoomIndexRef.current !== null && 
                newState.current_room_index > lastRoomIndexRef.current) {
              console.log('Room progressed from', lastRoomIndexRef.current, 'to', newState.current_room_index, '- skipping reload, waiting for victory modal');
              lastRoomIndexRef.current = newState.current_room_index;
              return;
            }
            
            // Force a fresh reload to ensure we get latest data
            await loadBattle();
          }
        )
        .subscribe((status) => {
          console.log('Realtime subscription status:', status);
        });

      return channel;
    };

    let channel: any;
    setupSubscription().then(ch => { channel = ch; });

    return () => {
      if (channel) {
        console.log('Cleaning up realtime subscription');
        supabase.removeChannel(channel);
      }
    };
  }, [id, showPartyWipeDialog]);

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
          figureString: profile.habbo_profile_json?.figureString || undefined,
          habboAvatar:
            profile.habbo_username && profile.habbo_profile_json
              ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${profile.habbo_profile_json.figureString}&hotel=COM&size=s&action=std&gesture=std&direction=2&head_direction=2&service=official`
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

  // Reset treasure claimed when room changes
  useEffect(() => {
    setTreasureClaimed(false);
  }, [battleData?.room_description, battleData?.room_type]);

  // Auto-scroll battle log to bottom when new messages arrive
  useEffect(() => {
    if (battleLogRef.current) {
      battleLogRef.current.scrollTop = battleLogRef.current.scrollHeight;
    }
  }, [battleData?.battle_log]);

  // Detect victory when battle_status transitions to "won" - triggers regardless of mode
  useEffect(() => {
    if (!battleData || !battleData.battle_status) return;

    const currentStatus = battleData.battle_status;
    const previousStatus = previousBattleStatusRef.current;

    // Trigger victory modal when transitioning from any non-won state to "won"
    if (currentStatus === "won" && previousStatus !== "won" && !victoryDialogActiveRef.current) {
      console.log("Victory detected via battle_status transition:", previousStatus, "→", currentStatus);
      victoryDialogActiveRef.current = true;

      // Extract loot and XP from the most recent battle log entries
      const recentLog = (battleData.battle_log || []).slice(-10);
      const lootItems: any[] = [];
      let xpGained = 0;

      for (const entry of recentLog) {
        const message = typeof entry === 'string' ? entry : entry.message || '';

        // Parse loot messages like "Received 5x [Gold Coins]"
        const lootMatch = message.match(/Received (\d+)x \[(.*?)\]/);
        if (lootMatch) {
          lootItems.push({
            item_name: lootMatch[2],
            quantity: parseInt(lootMatch[1]),
            item_type: 'loot'
          });
        }

        // Parse XP messages like "+50 XP for victory!"
        const xpMatch = message.match(/\+(\d+) XP/);
        if (xpMatch) {
          xpGained += parseInt(xpMatch[1]);
        }
      }

      setVictoryLootData({ items: lootItems, xp: xpGained });
      setShowVictoryLoot(true);
    }

  // Update previous battle status
    previousBattleStatusRef.current = currentStatus;
  }, [battleData?.battle_status, battleData?.battle_log]);

  // Auto-generate next story node when story choice is resolved
  useEffect(() => {
    if (!battleData || !battleData.current_story_node) return;
    
    const storyNode = battleData.current_story_node as any;
    
    // Check if backend set generating marker after resolving a choice
    if (storyNode.generating === true && !storyLoading) {
      console.log('Detected story node generation marker, loading next story node...');
      loadStoryNode();
    }
  }, [battleData?.current_story_node, storyLoading]);
  const loadBattle = async (isRetry = false) => {
    if (!id) {
      console.error("Cannot load battle: battleId is undefined");
      navigate("/dashboard");
      return;
    }
    
    // Reset victory loot state when loading new battle (unless dialog is currently active)
    if (!victoryDialogActiveRef.current) {
      setShowVictoryLoot(false);
      setVictoryLootData({ items: [], xp: 0 });
    }
    
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
            
            // Check if it's a dungeon not found error
            const errorMessage = initError.message || '';
            if (errorMessage.includes('Dungeon not found')) {
              toast({
                title: "Dungeon Not Found",
                description: "This dungeon no longer exists. Returning to dashboard.",
                variant: "destructive",
              });
              navigate("/dashboard", { replace: true });
              return;
            }
            
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
        console.log("Battle is completed - checking if party wipe dialog is showing");
        // Don't auto-redirect if party wipe dialog is showing - let user close it manually
        if (showPartyWipeDialog) {
          console.log("Party wipe dialog is showing, skipping auto-redirect");
          return;
        }
        console.log("Redirecting to dashboard");
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
        console.log("🔍 Setting battleData from backend. Has dungeon?", !!data.battleData.dungeon);
        console.log("🔍 Dungeon data:", data.battleData.dungeon ? 
          `width=${data.battleData.dungeon.width}, height=${data.battleData.dungeon.height}, entities=${data.battleData.dungeon.entities?.length}` : 
          "MISSING!");
        
        setBattleData(data.battleData);
        
        // Track room index for realtime updates
        if (data.battleData.room_index !== undefined) {
          lastRoomIndexRef.current = data.battleData.room_index;
        }
        
        // Auto-skip dead players' turns in party battles
        if (data.battleData.mode === 'battle' &&
            data.battleData.isPartyBattle && 
            data.battleData.currentTurnUserId === userId &&
            data.battleData.deadPlayers?.includes(userId) &&
            !turnAdvanceAttemptedRef.current) {
          console.log('Current player is dead, automatically advancing turn');
          turnAdvanceAttemptedRef.current = true;
          // Wait a moment then advance to next alive player
          setTimeout(async () => {
            try {
              const alivePlayers = (data.battleData.turnOrder || [])
                .filter((id: string) => !data.battleData.deadPlayers?.includes(id));
              
              if (alivePlayers.length > 0) {
                const currentIndex = data.battleData.turnOrder?.indexOf(userId) || 0;
                let nextIndex = (currentIndex + 1) % data.battleData.turnOrder!.length;
                let nextPlayerId = data.battleData.turnOrder![nextIndex];
                
                // Keep advancing until we find an alive player
                let attempts = 0;
                while (data.battleData.deadPlayers?.includes(nextPlayerId) && attempts < 10) {
                  nextIndex = (nextIndex + 1) % data.battleData.turnOrder!.length;
                  nextPlayerId = data.battleData.turnOrder![nextIndex];
                  attempts++;
                }
                
                // Update battle state with next alive player  
                await supabase
                  .from('battle_states')
                  .update({ current_turn_user_id: nextPlayerId })
                  .eq('id', data.battleData.battleStateId);
                
                console.log('Advanced turn from dead player to:', nextPlayerId);
                await loadBattle();
              }
            } catch (error) {
              console.error('Error auto-advancing turn:', error);
            } finally {
              turnAdvanceAttemptedRef.current = false;
            }
          }, 500);
        } else {
          turnAdvanceAttemptedRef.current = false;
        }
        
        // Load party profiles for battle log display
        loadPartyProfiles(userServerId);
        
        // If in story mode, load story node
        if (data.battleData.mode === "story") {
          setShowCombatPanels(false);
          
          // Use existing story node from battleData if available
          if (data.battleData.current_story_node) {
            setStoryNode(data.battleData.current_story_node);
          } else {
            // Only generate new story node if one doesn't exist
            await loadStoryNode();
          }
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
            
            // Check if it's a dungeon not found error
            const errorMsg = initError.message || '';
            if (errorMsg.includes('Dungeon not found')) {
              toast({
                title: "Dungeon No Longer Exists",
                description: "This dungeon has been removed. Returning to dashboard.",
                variant: "destructive",
              });
              navigate("/dashboard", { replace: true });
              return;
            }
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
      } else {
        setServerId(null); // Clear serverId for solo/party battles
      }
      
      if (battleState?.party_id) {
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
    } catch (error: any) {
      console.error("Failed to load profile:", error);
    }
  };

  const loadPartyProfiles = async (serverIdParam?: string) => {
    try {
      let userIds: string[] = [];
      
      // For server battles, get all server players
      if (serverIdParam || serverId) {
        const { data: serverPlayers, error: serverError } = await supabase
          .from("server_players")
          .select("user_id")
          .eq("server_id", serverIdParam || serverId);
        
        if (!serverError && serverPlayers) {
          userIds = serverPlayers.map(sp => sp.user_id);
        }
      }
      
      // Also get user IDs from battle log entries
      if (battleData?.battle_log) {
        const logUserIds = [...new Set(battleData.battle_log.map((entry: any) => entry.user_id).filter(Boolean))];
        userIds = [...new Set([...userIds, ...logUserIds])];
      }
      
      if (userIds.length === 0) return;
      
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .in("id", userIds);

      if (error) throw error;
      
      const profileMap = new Map<string, Profile>();
      data?.forEach(profile => {
        profileMap.set(profile.id, profile);
      });
      
      console.log("Loaded party profiles:", profileMap.size, "profiles for users:", userIds);
      setPartyProfiles(profileMap);
    } catch (error: any) {
      console.error("Failed to load party profiles:", error);
    }
  };

  const loadStoryNode = async () => {
    if (!id) {
      console.error("Cannot load story node: battleId is undefined");
      setStoryLoading(false);
      return;
    }
    
    setStoryLoading(true);
    try {
      console.log("Loading story node for battleId:", id);
      
      // Ensure we have a valid session before making the call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error("No active session");
        setStoryLoading(false);
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

      if (error) {
        console.error("Story node generation error:", error);
        throw error;
      }
      
      if (data?.storyNode) {
        console.log("Story node loaded successfully");
        setStoryNode(data.storyNode);
      } else {
        console.error("No story node in response:", data);
        throw new Error("No story node returned from server");
      }
    } catch (error: any) {
      console.error("Story node error:", error);
      toast({
        title: "Failed to load story",
        description: error.message || "Unable to generate story content",
        variant: "destructive",
      });
    } finally {
      setStoryLoading(false);
    }
  };

  const handleStoryChoice = async (choiceId: string, skipDiceCheck = false) => {
    if (!storyNode) return;

    const choice = storyNode.choices.find((c) => c.id === choiceId);
    if (!choice) return;

    // If choice requires dice and we haven't skipped the check, show dice input
    if (choice.diceRequired && !skipDiceCheck) {
      setSelectedChoice(choice);
      return;
    }

    setStoryLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-story-choice", {
        body: {
          battleId: id,
          choiceId: choice.id,
          choiceLabel: choice.label,
          storyText: storyNode.storyText,
          diceRoll: choice.diceRequired ? storyDice : undefined,
          diceDC: choice.diceDC,
          skillType: choice.skillType || "check",
        },
      });

      if (error) throw error;

      let shouldReloadBattle = true;

      // Show consequence toast with dice result if applicable
      if (data.outcome) {
        if (data.outcome.dungeonComplete) {
          setQuestComplete(true);
          toast({
            title: "Quest Complete!",
            description: "You have conquered this challenge. What will you do next?",
          });
          // Stay on current view, don't reload battle
          shouldReloadBattle = false;
        } else if (data.outcome.progressRoom) {
          // Calculate and show dice result if this was a dice check
          let toastTitle = "Moving forward";
          let toastDescription = data.outcome.consequenceText;
          
          if (choice.diceRequired && choice.diceDC) {
            const diceTotal = storyDice.reduce((a, b) => a + b, 0);
            const success = diceTotal >= choice.diceDC;
            const margin = diceTotal - choice.diceDC;
            
            toastTitle = success 
              ? `Success! (${diceTotal} vs DC ${choice.diceDC}, +${margin})`
              : `Failed! (${diceTotal} vs DC ${choice.diceDC}, ${margin})`;
          }
          
          toast({
            title: toastTitle,
            description: toastDescription,
            action: toastDescription ? (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  // Read from current battle state, not cached description
                  if (battleData) {
                    speak(getLatestNarrative(battleData));
                  }
                }}
                className="h-8 w-8"
              >
                <Volume2 className="h-4 w-4" />
              </Button>
            ) : undefined,
          });
          // Let the backend's room advancement logic handle progression; just reload below
        } else {
          // Calculate and show dice result if this was a dice check
          let toastTitle = data.outcome.triggersBattle ? "Battle!" : "The path unfolds";
          let toastDescription = data.outcome.consequenceText;
          
          if (choice.diceRequired && choice.diceDC) {
            const diceTotal = storyDice.reduce((a, b) => a + b, 0);
            const success = diceTotal >= choice.diceDC;
            const margin = diceTotal - choice.diceDC;
            
            toastTitle = success 
              ? `Success! (${diceTotal} vs DC ${choice.diceDC}, +${margin})`
              : `Failed! (${diceTotal} vs DC ${choice.diceDC}, ${margin})`;
          }
          
          toast({
            title: toastTitle,
            description: toastDescription,
            action: toastDescription ? (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  // Read from current battle state, not cached description
                  if (battleData) {
                    speak(getLatestNarrative(battleData));
                  }
                }}
                className="h-8 w-8"
              >
                <Volume2 className="h-4 w-4" />
              </Button>
            ) : undefined,
          });
        }
      }

      // Reload battle to get updated state (only if not complete)
      if (shouldReloadBattle) {
        // Clear loading state BEFORE reload to prevent UI flicker
        setStoryLoading(false);
        await loadBattle();
      } else {
        setStoryLoading(false);
      }
    } catch (error: any) {
      console.error("Story choice error:", error);
      setStoryLoading(false);
      
      // Handle specific error cases
      if (error.message?.includes("Not your turn")) {
        toast({
          title: "Not Your Turn",
          description: "Please wait for your turn to make a choice.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to resolve choice",
          description: error.message || "An unexpected error occurred",
          variant: "destructive",
        });
      }
    } finally {
      // Reset dice input state
      setSelectedChoice(null);
      setStoryDice([1, 1, 1, 1, 1]);
    }
  };

  const handleClaimTreasure = async () => {
    if (!id || treasureClaimed) return;
    
    setLoading(true);
    setTreasureClaimed(true);
    try {
      // Generate random loot
      const treasureLoot = [
        { item_name: "Gold Coins", quantity: Math.floor(Math.random() * 50) + 20, item_type: "currency" },
        { item_name: "Potion", quantity: Math.floor(Math.random() * 3) + 1, item_type: "consumable" }
      ];
      
      // Add loot to inventory
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      for (const loot of treasureLoot) {
        const { data: existing } = await supabase
          .from('inventory')
          .select('*')
          .eq('user_id', user.id)
          .eq('item_name', loot.item_name)
          .maybeSingle();
        
        if (existing) {
          await supabase
            .from('inventory')
            .update({ quantity: existing.quantity + loot.quantity })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('inventory')
            .insert({ user_id: user.id, ...loot });
        }
      }
      
      toast({
        title: "Treasure Found!",
        description: `You received: ${treasureLoot.map(l => `${l.quantity}x [${l.item_name}]`).join(', ')}`,
      });
      
      // Add to battle log
      const { data: battleState } = await supabase
        .from('battle_states')
        .select('battle_log')
        .eq('dungeon_id', id)
        .eq('user_id', user.id)
        .single();
      
      if (battleState) {
        const currentLog = (battleState.battle_log as any[]) || [];
        const lootMessage = `Found treasure: ${treasureLoot.map(l => `${l.quantity}x [${l.item_name}]`).join(', ')}`;
        await supabase
          .from('battle_states')
          .update({
            battle_log: [...currentLog, { user_id: user.id, message: lootMessage }]
          })
          .eq('dungeon_id', id)
          .eq('user_id', user.id);
      }
      
      // Move to next room
      await loadBattle();
    } catch (error: any) {
      toast({
        title: "Error claiming treasure",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const handleSaveChestForLater = async () => {
    if (!id || treasureClaimed) return;
    
    setLoading(true);
    setTreasureClaimed(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Add unopened chest to inventory
      const chestItem = { 
        item_name: "Rare Treasure Chest", 
        quantity: 1, 
        item_type: "chest" 
      };
      
      const { data: existing } = await supabase
        .from('inventory')
        .select('*')
        .eq('user_id', user.id)
        .eq('item_name', chestItem.item_name)
        .maybeSingle();
      
      if (existing) {
        await supabase
          .from('inventory')
          .update({ quantity: existing.quantity + 1 })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('inventory')
          .insert({ user_id: user.id, ...chestItem });
      }
      
      toast({
        title: "Chest saved!",
        description: "The treasure chest has been added to your inventory for later.",
      });
      
      // Add to battle log
      const { data: battleState } = await supabase
        .from('battle_states')
        .select('battle_log')
        .eq('dungeon_id', id)
        .eq('user_id', user.id)
        .single();
      
      if (battleState) {
        const currentLog = (battleState.battle_log as any[]) || [];
        await supabase
          .from('battle_states')
          .update({
            battle_log: [...currentLog, { user_id: user.id, message: "Saved a treasure chest for later" }]
          })
          .eq('dungeon_id', id)
          .eq('user_id', user.id);
      }
      
      // Move to next room
      await loadBattle();
    } catch (error: any) {
      toast({
        title: "Error saving chest",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const handleContinueToNextRoom = async () => {
    if (!id) return;
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Determine if this is a server battle or solo battle
      const { data: serverMember, error: serverError } = await supabase
        .from("server_players")
        .select("server_id, servers!inner(dungeon_id)")
        .eq("user_id", user.id)
        .eq("servers.dungeon_id", id)
        .maybeSingle();

      if (serverError) {
        console.error("Error fetching server membership:", serverError);
      }

      const userServerId = serverMember?.server_id ?? null;
      
      // Get current battle state to increment room index
      let stateQuery = supabase
        .from("battle_states")
        .select("current_room_index, server_id")
        .eq("dungeon_id", id)
        .eq("is_active", true);

      if (userServerId) {
        stateQuery = stateQuery.eq("server_id", userServerId);
      } else {
        stateQuery = stateQuery.eq("user_id", user.id).is("server_id", null);
      }

      const { data: battleState, error: stateError } = await stateQuery.maybeSingle();

      if (stateError) {
        throw stateError;
      }
      
      if (battleState) {
        const { current_room_index, server_id } = battleState as any;

        const { error: updateError } = await supabase
          .from("battle_states")
          .update({ 
            current_room_index: current_room_index + 1,
            current_story_node: null,
          })
          .eq("dungeon_id", id)
          .eq(server_id ? "server_id" : "user_id", server_id || user.id);

        if (updateError) {
          throw updateError;
        }
      }
      
      // Reload battle with new room
      await loadBattle();
      setTreasureClaimed(false);
    } catch (error: any) {
      console.error("Error advancing room:", error);
      toast({
        title: "Error advancing room",
        description: error.message || "Something went wrong moving to the next room.",
        variant: "destructive",
      });
    }
    setLoading(false);
  };
  const handleApplyEventBoost = async () => {
    if (!id || !battleData?.event_type) return;
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Apply stat boost
      const { data: stats } = await supabase
        .from('player_stats')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (stats) {
        const updates: any = {};
        let boostMessage = '';
        
        if (battleData.event_type === 'hp') {
          const hpGained = battleData.event_amount || 0;
          updates.current_hp = Math.min(stats.max_hp, stats.current_hp + hpGained);
          boostMessage = `You received a spiritual blessing! HP restored by ${hpGained}!`;
        } else if (battleData.event_type === 'mp') {
          const mpGained = battleData.event_amount || 0;
          updates.current_mp = Math.min(stats.max_mp, stats.current_mp + mpGained);
          boostMessage = `You received a spiritual blessing! MP restored by ${mpGained}!`;
        } else if (battleData.event_type === 'atk') {
          const atkGained = battleData.event_amount || 0;
          updates.atk = stats.atk + atkGained;
          boostMessage = `You received a spiritual blessing! ATK increased by +${atkGained}!`;
        } else if (battleData.event_type === 'def') {
          const defGained = battleData.event_amount || 0;
          updates.def = stats.def + defGained;
          boostMessage = `You received a spiritual blessing! DEF increased by +${defGained}!`;
        }
        
        await supabase
          .from('player_stats')
          .update(updates)
          .eq('user_id', user.id);
        
        // Add to battle log
        const { data: battleState } = await supabase
          .from('battle_states')
          .select('battle_log')
          .eq('dungeon_id', id)
          .eq('user_id', user.id)
          .single();
        
        if (battleState) {
          const currentLog = (battleState.battle_log as any[]) || [];
          await supabase
            .from('battle_states')
            .update({
              battle_log: [...currentLog, { user_id: user.id, message: boostMessage, type: 'spiritual_boost' }]
            })
            .eq('dungeon_id', id)
            .eq('user_id', user.id);
        }
        
        toast({
          title: "Power Surge!",
          description: battleData.event_description || "You feel stronger!",
        });
      }
      
      // Move to next room
      await handleContinueToNextRoom();
    } catch (error: any) {
      toast({
        title: "Error applying boost",
        description: error.message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const handleResolveTurn = async () => {
    if (!selectedAction) {
      toast({ title: "Please select an action", variant: "destructive" });
      return;
    }
    
    // Handle skill action
    if (selectedAction === 'skill' && !selectedSkill) {
      setShowSkillMenu(true);
      return;
    }

    // Block realtime updates during animations
    animationActiveRef.current = true;

    // Trigger attack animation - player attacks enemy
    if (currentUserId && battleData?.dungeon) {
      const enemyEntity = battleData.dungeon.entities.find(e => e.type === 'enemy');
      if (enemyEntity) {
        setAttackingEntityId(currentUserId);
        setTargetEntityId(enemyEntity.id);
        setTimeout(() => {
          setAttackingEntityId(undefined);
          setTargetEntityId(undefined);
        }, 700);
      }
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-turn", {
        body: {
          battleId: id,
          action: selectedAction,
          dice,
          itemName: selectedItem,
          skillId: selectedSkill,
        },
      });

      if (error) throw error;
      
      if (data.battleData) {
        setBattleData(data.battleData);
        setSelectedAction("");
        setSelectedItem(null);
        setSelectedSkill(null);
        setShowSkillMenu(false);
        
        // Load party profiles for battle log display (in case new entries were added)
        loadPartyProfiles(serverId || undefined);
        
        // Reload inventory in case items were consumed
        loadInventory();
        
        // Trigger hit animations SEQUENTIALLY - player attacks first, then enemy counterattacks
        
        if (data.playerDamageDealt && data.playerDamageDealt > 0) {
          setEnemyHit(true);
          
          // Show damage on dungeon board entity
          const enemyEntity = data.battleData?.dungeon?.entities.find((e: any) => e.type === 'enemy');
          if (enemyEntity) {
            setDamageDealt({ entityId: enemyEntity.id, amount: data.playerDamageDealt });
            setTimeout(() => {
              setDamageDealt(undefined);
            }, 800);
          }
          
          setTimeout(() => {
            setEnemyHit(false);
          }, 600);
        }
        
        // Enemy counterattacks AFTER player's attack animation (1 second delay)
        if (data.enemyDamageDealt && data.enemyDamageDealt > 0) {
          setTimeout(() => {
            setPlayerHit(true);
            
            // Trigger enemy attack animation
            const enemyEntity = data.battleData?.dungeon?.entities.find((e: any) => e.type === 'enemy');
            if (enemyEntity && currentUserId) {
              setAttackingEntityId(enemyEntity.id);
              setTargetEntityId(currentUserId);
              setTimeout(() => {
                setAttackingEntityId(undefined);
                setTargetEntityId(undefined);
              }, 300);
            }
            
            // Show damage on dungeon board entity (current user)
            if (currentUserId) {
              setDamageDealt({ entityId: currentUserId, amount: data.enemyDamageDealt });
              setTimeout(() => {
                setDamageDealt(undefined);
              }, 800);
            }
            
            setTimeout(() => {
              setPlayerHit(false);
              
              // All animations complete - unblock realtime updates
              animationActiveRef.current = false;
            }, 600);
          }, 1000);
        } else {
          // No enemy counterattack - unblock immediately after player attack completes
          setTimeout(() => {
            animationActiveRef.current = false;
          }, 1000);
        }
        
        if (data.victory) {
          // Set victory dialog flag immediately to prevent realtime update from interfering
          victoryDialogActiveRef.current = true;
          
          // Show victory loot modal with data immediately
          setVictoryLootData({ items: data.lootItems || [], xp: data.xpGained || 0 });
          setShowVictoryLoot(true);
          // Note: loadBattle will be called when user closes the modal
        } else if (data.playerDied && !data.defeat) {
          // This player died but party continues
          toast({ 
            title: "You have fallen!", 
            description: "Your party members continue the fight. You'll be revived if they win!",
            variant: "destructive" 
          });
          // Battle state already updated via real-time subscription, no need to reload
        } else if (data.defeat) {
          // Entire party wiped out - show dramatic dialog
          setShowPartyWipeDialog(true);
        }
      }
    } catch (error: any) {
      console.error("❌ ERROR in handleResolveTurn:", error);
      toast({
        title: "Failed to resolve turn",
        description: error.message,
        variant: "destructive",
      });
      // Unblock on error
      animationActiveRef.current = false;
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
              <div className="flex justify-center">
                <img src={victoryTrophy} alt="Victory Trophy" className="pixelated" style={{ width: 'auto', height: 'auto', maxWidth: '120px' }} />
              </div>
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
      : battleData.player ? [
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
        ] : [];

    const partyMembers = storyPlayers.map((p) => {
      const playerUsername = (p as any).username || profile?.habbo_username || profile?.username?.split("@")[0] || "Player";
      const isCurrentUser = (p as any).userId === currentUserId || (!battleData.players && (p as any).userId === "player");

      // Use habboAvatar from backend if available, otherwise construct for current user
      let habboAvatar = (p as any).habboAvatar || null;
      let figureString = (p as any).figureString || null;
      
      if (!habboAvatar && isCurrentUser && profile?.habbo_username && profile.habbo_profile_json) {
        figureString = profile.habbo_profile_json.figureString;
        habboAvatar = `https://www.habbo.com/habbo-imaging/avatarimage?figure=${figureString}&hotel=COM&size=s&action=std&gesture=std&direction=2&head_direction=2&service=official`;
      }

      return {
        userId: (p as any).userId,
        username: playerUsername,
        habboAvatar,
        figureString,
        level: (p as any).level,
        currentHp: (p as any).current_hp,
        maxHp: (p as any).max_hp,
        currentMp: (p as any).current_mp,
        maxMp: (p as any).max_mp,
        statusEffects: (p as any).status_effects || [],
      };
    });

    const currentStoryText = battleData ? getLatestNarrative(battleData) : storyNode?.storyText || "";
    // CRITICAL: Use battleData.current_story_node directly for choices to stay in sync with narrative
    const activeStoryNode = battleData?.current_story_node || null;

    return (
      <>
      <div className="min-h-screen bg-background relative">
        <div 
          className="fixed inset-0 opacity-20 bg-center bg-cover"
          style={{ backgroundImage: `url(${dungeonBg})` }}
        />
        
        <div className="relative z-10 p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Battle Log - Main Focus */}
            <HabboPanel title="Chronicle of Events">
              <div ref={battleLogRef} className="h-96 overflow-y-auto space-y-2 p-4 bg-muted rounded border-2 border-habbo-dark">
              {/* Quest Information - Always at top */}
              {battleData.dungeon_name && (() => {
                const questNPC = getNPCById(battleData.dungeon_theme || '');
                return (
                  <div className="mb-4 p-4 bg-primary/10 border-2 border-primary rounded-lg">
                    <div className="flex items-start gap-3 mb-3">
                      {questNPC && (
                        <img 
                          src={questNPC.sprite} 
                          alt={questNPC.name}
                          className="w-auto pixel-icon"
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="text-xl font-black text-primary">
                          Quest: {battleData.dungeon_name}
                        </h3>
                        {questNPC && (
                          <p className="text-xs text-muted-foreground">
                            From {questNPC.name}, {questNPC.title}
                          </p>
                        )}
                      </div>
                    </div>
                    {battleData.intro_text && (
                      <div className="text-sm text-foreground mb-3">
                        <div className="flex gap-2">
                          <span className="text-primary">&gt;</span>
                          <span>{battleData.intro_text}</span>
                        </div>
                      </div>
                    )}
                    {battleData.quest_objective && (
                      <div className="text-sm text-foreground flex gap-2 pt-2 border-t border-primary/20">
                        <span className="text-primary">&gt;</span>
                        <span><span className="font-bold text-primary">Objective:</span> {battleData.quest_objective}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
              
              {battleData.battle_log && battleData.battle_log.length > 0 ? (
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
                    const isDiceSuccess = entryType === 'dice_success' || message.includes('PASSING') || message.toUpperCase().includes('SUCCESS');
                    const isDiceFailure = entryType === 'dice_failure' || message.includes('FAILING') || message.toUpperCase().includes('FAIL');
                    const isSpiritualBoost = entryType === 'spiritual_boost';
                    const isDamage = entryType === 'damage';
                    const isDamageDealt = isDamage && message.includes('Dealt');
                    const isDamageTaken = isDamage && message.includes('Took');
                    
                    // Replace "You" with actual username for other players' messages
                    let displayMessage = message;
                    if (!isCurrentUser && userId) {
                      // Replace "You " at the start of the message with [username] in brackets
                      displayMessage = message.replace(/^You /, `[${username}] `);
                      // Replace " You " in the middle with [username] in brackets
                      displayMessage = displayMessage.replace(/ You /g, ` [${username}] `);
                      // Replace "Your " with possessive form in brackets
                      displayMessage = displayMessage.replace(/Your /g, `[${username}]'s `);
                    } else if (isCurrentUser) {
                      // Replace "You " with [username] in brackets for current user too
                      displayMessage = message.replace(/^You /, `[${username}] `);
                      displayMessage = displayMessage.replace(/ You /g, ` [${username}] `);
                      displayMessage = displayMessage.replace(/Your /g, `[${username}]'s `);
                    }
                    
                    return (
                      <p key={i} className={`text-sm animate-fade-in ${
                        isSpiritualBoost ? 'text-green-500 font-bold' :
                        isDiceSuccess ? 'text-green-500 font-bold' : 
                        isDiceFailure ? 'text-red-500 font-bold' : 
                        isDiceRoll ? 'text-[#FFD700] font-bold' :
                        isDamageDealt ? 'text-habbo-orange font-bold' :
                        isDamageTaken ? 'text-red-400 font-bold' : ''
                      }`}>
                        <span className="text-primary font-bold">›</span>{" "}
                        {isCurrentUser || !userId ? (
                          renderTextWithWeapons(displayMessage)
                        ) : (
                          <>
                            {isDiceRoll ? (
                              renderTextWithWeapons(displayMessage)
                            ) : (
                              renderTextWithWeapons(displayMessage)
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

            {/* Story Panel Below Log - Only show in story mode */}
            {battleData.mode === "story" && (
              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                  <HabboPanel title="The Story Unfolds">
                    <div className="space-y-6">
                      {/* Story Text */}
                      <div className="p-6 bg-muted/50 border-2 border-habbo-dark rounded-lg min-h-[200px]">
                        {/* Treasure Room */}
                        {battleData.room_type === 'treasure' && (
                          <div className="space-y-4">
                            <h3 className="text-2xl font-black text-center mb-4 flex items-center justify-center gap-2">
                              <img src={treasureChestOpen} alt="Treasure" className="w-8 h-8 pixelated" />
                              Treasure Found!
                            </h3>
                            <p className="text-lg leading-relaxed">
                              {battleData.treasure_description || 'A frost-covered chest sits in the corner, its contents unknown...'}
                            </p>
                            {!treasureClaimed ? (
                              <div className="flex justify-center gap-4 pt-4">
                                <Button
                                  onClick={handleClaimTreasure}
                                  disabled={loading}
                                  size="lg"
                                  className="font-black text-lg px-8"
                                >
                                  <Package className="mr-2 h-5 w-5" />
                                  {loading ? 'Opening...' : 'Open Chest'}
                                </Button>
                                <Button
                                  onClick={handleSaveChestForLater}
                                  disabled={loading}
                                  size="lg"
                                  variant="outline"
                                  className="font-black text-lg px-8 border-4 border-habbo-dark"
                                >
                                  {loading ? 'Saving...' : 'Open Later'}
                                </Button>
                              </div>
                            ) : (
                              <div className="flex justify-center pt-4">
                                <Button
                                  onClick={handleContinueToNextRoom}
                                  disabled={loading}
                                  size="lg"
                                  className="font-black text-lg px-8"
                                >
                                  {loading ? <LoadingSpinner /> : 'Continue'}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Event Room */}
                        {battleData.room_type === 'event' && (
                          <div className="space-y-4">
                            <h3 className="text-2xl font-black text-center mb-4 flex items-center justify-center gap-2">
                              <img src={mysticalIcon} alt="Mystical" className="w-8 h-8 pixel-icon" />
                              Mystical Encounter
                            </h3>
                            <p className="text-lg leading-relaxed">
                              {battleData.event_description || 'Strange energies fill the air...'}
                            </p>
                            <div className="flex justify-center pt-4">
                              <Button
                                onClick={handleApplyEventBoost}
                                disabled={loading}
                                size="lg"
                                className="font-black text-lg px-8"
                              >
                                <Sparkles className="mr-2 h-5 w-5" />
                                {loading ? 'Accepting...' : 'Accept Blessing'}
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {/* Regular Story Content */}
                        {(!battleData.room_type || (battleData.room_type !== 'treasure' && battleData.room_type !== 'event')) && (
                          <>
                            {storyLoading && !currentStoryText ? (
                              <div className="flex items-center justify-center h-40">
                                <p className="text-lg italic animate-pulse">
                                  The dungeon master consults the ancient tomes...
                                </p>
                              </div>
                            ) : currentStoryText ? (
                              <div className="relative">
                                <Button
                                  onClick={() => speak(currentStoryText)}
                                  disabled={isPlaying || ttsLoading || !currentStoryText}
                                  variant="ghost"
                                  size="sm"
                                  className="absolute -top-2 -right-2 h-8 w-8 p-0 rounded-full bg-muted hover:bg-muted/80 border-2 border-habbo-dark"
                                  title="Read story aloud"
                                >
                                  <Volume2 className={`h-4 w-4 ${isPlaying ? 'animate-pulse text-primary' : ''}`} />
                                </Button>
                                <p className="text-lg leading-relaxed whitespace-pre-wrap">
                                  {currentStoryText}
                                </p>
                              </div>
                            ) : (
                              <p className="text-lg italic text-muted-foreground">
                                Awaiting your next decision...
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      {/* Choices - Only show for regular story rooms */}
                      {(!battleData.room_type || (battleData.room_type !== 'treasure' && battleData.room_type !== 'event')) && activeStoryNode && activeStoryNode.choices && activeStoryNode.choices.length > 0 && (
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
                        
                        {/* Dice input dialog */}
                        {selectedChoice && selectedChoice.diceRequired && (
                          <div className="mb-6 p-6 bg-muted border-4 border-habbo-dark rounded-lg space-y-4">
                            <div className="flex items-start gap-3 mb-2">
                              <img src={diceSprite} alt="Dice" className="w-auto pixelated" />
                              <div className="flex-1">
                                <h4 className="text-lg font-black">
                                  Roll Your Dice!
                                </h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {selectedChoice.label}
                                </p>
                              </div>
                            </div>
                            <p className="text-center font-bold text-primary">
                              Target: {selectedChoice.diceDC}+ (Roll 5 dice in Habbo)
                            </p>
                            <div className="space-y-2">
                              <label className="text-sm font-bold">
                                Enter your 5 dice results:
                              </label>
                              <div className="grid grid-cols-5 gap-2">
                                {storyDice.map((val, i) => (
                                  <Input
                                    key={i}
                                    type="number"
                                    min="1"
                                    max="6"
                                    value={val}
                                    onChange={(e) => {
                                      const newDice = [...storyDice];
                                      newDice[i] = Math.min(6, Math.max(1, parseInt(e.target.value) || 1));
                                      setStoryDice(newDice);
                                    }}
                                    className="text-center text-xl font-black border-4 border-habbo-dark"
                                    disabled={storyLoading}
                                  />
                                ))}
                              </div>
                              <p className="text-center text-sm">
                                Total: <span className="font-black text-xl">{storyDice.reduce((a, b) => a + b, 0)}</span>
                              </p>
                            </div>
                            <div className="flex gap-3">
                              <Button
                                onClick={() => handleStoryChoice(selectedChoice.id, true)}
                                disabled={storyLoading}
                                className="flex-1 font-black border-4 border-habbo-dark"
                                size="lg"
                              >
                                <Sparkles className="mr-2 h-5 w-5" />
                                {storyLoading ? "Resolving..." : "Submit Dice"}
                              </Button>
                              <Button
                                onClick={() => {
                                  setSelectedChoice(null);
                                  setStoryDice([1, 1, 1, 1, 1]);
                                }}
                                disabled={storyLoading}
                                variant="outline"
                                className="font-bold border-4 border-habbo-dark"
                                size="lg"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        <div className="space-y-3">
                          {activeStoryNode.choices.map((choice) => {
                            // Remove the dice check text from the label if it exists
                            const cleanLabel = choice.label.replace(/\s*\[Dice Check:.*?\]\s*$/i, '');
                            
                            return (
                              <Button
                                key={choice.id}
                                onClick={() => handleStoryChoice(choice.id)}
                                disabled={storyLoading || (battleData.isPartyBattle && !isMyTurn) || (selectedChoice !== null)}
                                variant="outline"
                                className="w-full text-left justify-start h-auto py-4 px-6 font-bold border-4 border-habbo-dark hover-scale disabled:opacity-50 flex-col items-start whitespace-normal"
                              >
                                <div className="flex items-start w-full">
                                  <span className="mr-3 text-2xl flex-shrink-0">›</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-base font-bold break-words">{cleanLabel}</div>
                                    {choice.diceRequired && choice.diceDC && (
                                      <div className="text-xs italic text-muted-foreground mt-1">
                                        Dice Check: DC {choice.diceDC}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </Button>
                            );
                          })}
                        </div>
                        
                        {/* Quest Actions */}
                        <div className="pt-4 border-t-2 border-habbo-dark/30 space-y-2">
                          <Button
                            onClick={() => setShowQuestDetailsDialog(true)}
                            variant="outline"
                            className="w-full text-sm font-bold border-2 border-habbo-dark"
                          >
                            <ScrollText className="w-4 h-4 mr-2" />
                            View Quest Details
                          </Button>
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
                  {battleData.isPartyBattle && battleData.turnOrder && battleData.turnOrder.length > 1 && partyMembers && partyMembers.length > 0 && (
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

                  {/* Party Avatars Row - Updated to match battle mode styling */}
                  <div className="flex gap-3 mb-4 pb-4 border-b-2 border-habbo-dark">
                    {partyMembers && partyMembers.length > 0 ? (
                      <>
                        {partyMembers.slice(0, 4).map((member) => {
                          const isCurrentTurn = battleData.currentTurnUserId === member.userId;
                          const isCurrentUser = member.userId === currentUserId;
                          const turnIndex = battleData.turnOrder?.indexOf(member.userId);
                          const hpPercentage = (member.currentHp / member.maxHp) * 100;
                          
                          // Get dynamic avatar with expression based on state
                          const dynamicAvatar = member.figureString 
                            ? getHabboAvatar(member.figureString, hpPercentage, isCurrentTurn, false, 's')
                            : member.habboAvatar;
                          
                          return (
                            <button
                              key={`avatar-${member.userId}`}
                              onClick={() => setSelectedMemberId(member.userId)}
                              className={`relative flex-1 min-w-[120px] p-3 rounded-lg border-4 transition-all cursor-pointer ${
                                isCurrentTurn 
                                  ? 'border-green-400 ring-4 ring-green-400/50 bg-green-500/20 animate-pulse' 
                                  : isCurrentUser
                                  ? 'border-primary bg-primary/10 hover:bg-primary/20'
                                  : 'border-habbo-dark bg-muted/50 hover:border-primary/50'
                              }`}
                              title={`${member.username}${isCurrentTurn ? ' - CURRENT TURN' : ''}`}
                            >
                              {/* Turn order badge */}
                              {turnIndex !== undefined && turnIndex >= 0 && (
                                <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-habbo-dark border-2 border-foreground flex items-center justify-center text-sm font-bold z-10 shadow-lg">
                                  {turnIndex + 1}
                                </div>
                              )}
                              
                              {/* Current turn indicator */}
                              {isCurrentTurn && (
                                <div className="absolute -top-2 -left-2 animate-bounce z-10">
                                  <Swords className="w-5 h-5 text-green-400 drop-shadow-lg" />
                                </div>
                              )}
                              
                              <div className="flex flex-col items-center gap-2">
                                {/* Avatar */}
                                {dynamicAvatar && (
                                  <div className="w-20 h-24 flex items-center justify-center">
                                    <img
                                      src={dynamicAvatar}
                                      alt={member.username}
                                      className="pixelated max-w-full max-h-full object-contain"
                                    />
                                  </div>
                                )}
                                
                                {/* Username */}
                                <div className="text-sm font-bold text-center truncate w-full px-1">
                                  {member.username}
                                </div>
                                
                                {/* HP Bar */}
                                <div className="w-full bg-muted border-2 border-habbo-dark rounded-md h-3 overflow-hidden">
                                  <div 
                                    className="h-full bg-hp transition-all duration-300"
                                    style={{ width: `${hpPercentage}%` }}
                                  />
                                </div>
                                
                                {/* HP Text */}
                                <div className="text-xs font-bold text-muted-foreground">
                                  {member.currentHp}/{member.maxHp}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                        {partyMembers.length < 4 && Array.from({ length: 4 - partyMembers.length }).map((_, i) => (
                          <button
                            key={`empty-${i}`}
                            onClick={() => partyId ? setShowInviteDialog(true) : createParty()}
                            className="flex-1 min-w-[120px] p-3 border-4 border-dashed border-muted rounded-lg bg-muted/20 flex items-center justify-center hover:border-primary hover:bg-primary/10 transition-colors cursor-pointer"
                            title="Invite player"
                          >
                            <Plus className="text-muted-foreground w-8 h-8" />
                          </button>
                        ))}
                      </>
                    ) : (
                      <div className="flex-1 text-center py-4 text-muted-foreground">
                        No players in battle. Please refresh.
                      </div>
                    )}
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
            )}

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

      {/* Victory Loot Modal - Story Mode */}
      <VictoryLoot
        isOpen={showVictoryLoot}
        onClose={() => {
          victoryDialogActiveRef.current = false;
          setShowVictoryLoot(false);
          setVictoryLootData({ items: [], xp: 0 });
        }}
        onContinue={async () => {
          victoryDialogActiveRef.current = false;
          setShowVictoryLoot(false);
          setVictoryLootData({ items: [], xp: 0 });
          
          // Check if this was the final room by trying to load battle
          try {
            const { data: battleCheck } = await supabase
              .from('battle_states')
              .select('current_room_index, is_active, dungeons!inner(dungeon_json)')
              .eq('dungeon_id', id)
              .eq('is_active', true)
              .maybeSingle();
            
            if (!battleCheck || !battleCheck.is_active) {
              // Battle is complete - show completion screen
              setQuestComplete(true);
            } else {
              // Continue to next room
              await loadBattle();
            }
          } catch (error) {
            // If any error, assume quest is complete
            setQuestComplete(true);
          }
        }}
        lootItems={victoryLootData.items}
        xpGained={victoryLootData.xp}
      />
      </>
    );
  }

  // Render battle mode
  return (
    <div className="min-h-screen relative overflow-hidden bg-habbo-dark">
      {/* Background Loading Indicator */}
      {backgroundLoading && (
        <div className="fixed top-4 right-4 z-50 bg-habbo-dark/90 border-2 border-primary rounded-lg px-4 py-2 flex items-center gap-2">
          <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
          <span className="text-sm font-bold text-foreground">Generating dungeon...</span>
        </div>
      )}
      
      {/* Main Battle Stage - Dungeon Board takes center stage */}
      <div className="relative h-screen flex flex-col">
        {/* Battle Stage Area - 65% of screen */}
        <div className="relative h-[65vh]">
          {(() => {
            console.log("🎨 Render check: battleData exists?", !!battleData, "dungeon exists?", !!battleData?.dungeon);
            if (battleData?.dungeon) {
              console.log("✅ Rendering DungeonBoard with dungeon:", {
                width: battleData.dungeon.width,
                height: battleData.dungeon.height,
                entityCount: battleData.dungeon.entities?.length
              });
            } else {
              console.log("❌ Cannot render DungeonBoard - dungeon is missing from battleData");
            }
            return battleData?.dungeon;
          })() ? (
            <DungeonBoard 
              dungeon={{
                ...battleData.dungeon,
                entities: battleData.dungeon.entities.map(entity => ({
                  ...entity,
                  spriteFilename: entity.sprite, // Preserve original filename for direction lookup
                  sprite: entity.type === 'enemy' && entity.sprite
                    ? (ENEMY_SPRITES[entity.sprite] || entity.sprite)
                    : entity.sprite
                }))
              }}
              backgroundImageUrl={dungeonBackground || dungeonBg}
              attackingEntityId={attackingEntityId}
              targetEntityId={targetEntityId}
              damageDealt={damageDealt}
            />
          ) : (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-habbo-dark">
              <div className="text-center space-y-4">
                <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="text-lg font-bold text-foreground">Loading battle arena...</p>
              </div>
            </div>
          )}
        </div>

        {/* UI Panel Area - 35% of screen with shadow overlay */}
        <div className="relative h-[35vh] bg-gradient-to-b from-black/40 via-habbo-dark/98 to-habbo-dark overflow-y-auto shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.8)]">
          <div className="max-w-7xl mx-auto p-4 space-y-3">

          {/* Battle Log - Main Focus */}
          <HabboPanel title="Battle Log">
            <div ref={battleLogRef} className="h-96 overflow-y-auto space-y-2 p-4 bg-muted rounded border-2 border-habbo-dark">
              {battleData.battle_log && battleData.battle_log.length > 0 ? (
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
                  const isDiceSuccess = entryType === 'dice_success' || message.includes('PASSING') || message.toUpperCase().includes('SUCCESS');
                  const isDiceFailure = entryType === 'dice_failure' || message.includes('FAILING') || message.toUpperCase().includes('FAIL');
                  const isSpiritualBoost = entryType === 'spiritual_boost';
                  const isDamage = entryType === 'damage';
                  const isDamageDealt = isDamage && message.includes('Dealt');
                  const isDamageTaken = isDamage && message.includes('Took');
                  
                  // Replace "You" with actual username for other players' messages
                  let displayMessage = message;
                  if (!isCurrentUser && userId) {
                    // Replace "You " at the start of the message with [username] in brackets
                    displayMessage = message.replace(/^You /, `[${username}] `);
                    // Replace " You " in the middle with [username] in brackets
                    displayMessage = displayMessage.replace(/ You /g, ` [${username}] `);
                    // Replace "Your " with possessive form in brackets
                    displayMessage = displayMessage.replace(/Your /g, `[${username}]'s `);
                  } else if (isCurrentUser) {
                    // Replace "You " with [username] in brackets for current user too
                    displayMessage = message.replace(/^You /, `[${username}] `);
                    displayMessage = displayMessage.replace(/ You /g, ` [${username}] `);
                    displayMessage = displayMessage.replace(/Your /g, `[${username}]'s `);
                  }
                  
                  return (
                    <p key={i} className={`text-sm animate-fade-in ${
                      isSpiritualBoost ? 'text-green-500 font-bold' :
                      isDiceSuccess ? 'text-green-500 font-bold' : 
                      isDiceFailure ? 'text-red-500 font-bold' : 
                      isDiceRoll ? 'text-[#FFD700] font-bold' :
                      isDamageDealt ? 'text-habbo-orange font-bold' :
                      isDamageTaken ? 'text-red-400 font-bold' : ''
                    }`}>
                      <span className="text-primary font-bold">›</span>{" "}
                      {isCurrentUser || !userId ? (
                        renderTextWithWeapons(displayMessage)
                      ) : (
                        <>
                          {isDiceRoll ? (
                            renderTextWithWeapons(displayMessage)
                          ) : (
                            renderTextWithWeapons(displayMessage)
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
          {/* Enemy Panel - Stats Only */}
          {battleData.mode === "battle" && battleData.enemy.current_hp > 0 && (
            <HabboPanel title="NOW FIGHTING" className="md:col-span-1">
            <div className="space-y-3">
              <div className="text-center pb-2 border-b border-habbo-dark/50">
                <p className="text-lg font-bold text-destructive">{battleData.enemy.name}</p>
                <p className="text-xs text-muted-foreground italic mt-1">{battleData.enemy.description}</p>
              </div>
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
              {battleData.enemy.status_effects && battleData.enemy.status_effects.length > 0 && (
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
                    setShowSkillMenu(true);
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
                  {inventory && inventory.length > 0 ? (
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
                <div className="flex items-start gap-2 mb-2">
                  <img src={diceSprite} alt="Dice" className="w-auto pixelated" />
                  <p className="font-bold text-sm flex-1">Enter your Dice results from Habbo:</p>
                </div>
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
              
              {/* Quest Actions */}
              <div className="pt-4 border-t-2 border-habbo-dark/30 space-y-2">
                <Button
                  onClick={() => setShowQuestDetailsDialog(true)}
                  variant="outline"
                  className="w-full text-sm font-bold border-2 border-habbo-dark"
                >
                  <ScrollText className="w-4 h-4 mr-2" />
                  View Quest Details
                </Button>
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

          {/* Player Panel - Stats Only */}
          <HabboPanel title="You" className="md:col-span-1">
            <div className="space-y-3">
              <div className="text-center pb-2 border-b border-habbo-dark/50">
                <p className="text-lg font-bold">
                  {profile?.habbo_username || profile?.username.split('@')[0] || "Player"}
                </p>
                <div className="inline-block mt-1 px-3 py-1 bg-primary rounded border-2 border-habbo-dark">
                  <p className="text-sm font-bold text-primary-foreground">Level {battleData.player.level}</p>
                </div>
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
              
              {battleData.player.status_effects && battleData.player.status_effects.length > 0 && (
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
                const hpPercentage = (player.current_hp / player.max_hp) * 100;
                const isVictory = false; // Victory is shown in separate screen
                
                // Prefer explicit figureString, but fall back to parsing from avatar URL if needed
                const effectiveFigureString = player.figureString || player.habboAvatar?.match(/figure=([^&]+)/)?.[1];
                
                // Get dynamic avatar based on state
                const dynamicAvatar = effectiveFigureString
                  ? getHabboAvatar(effectiveFigureString, hpPercentage, isCurrentTurn, isVictory, 's')
                  : player.habboAvatar;
                
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
                        src={dynamicAvatar || ''}
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
                  const hpPercentage = (player.current_hp / player.max_hp) * 100;
                  const isCurrentTurn = battleData.currentTurnUserId === player.userId;
                  const isVictory = false; // Victory is shown in separate screen
                  
                  // Prefer explicit figureString, but fall back to parsing from avatar URL if needed
                  const effectiveFigureString = player.figureString || player.habboAvatar?.match(/figure=([^&]+)/)?.[1];
                  
                  // Get dynamic medium avatar
                  const dynamicAvatar = effectiveFigureString
                    ? getHabboAvatar(effectiveFigureString, hpPercentage, isCurrentTurn, isVictory, 'm')
                    : player.habboAvatar?.replace('size=s', 'size=m');
                  
                  return (
                    <div className="flex gap-4 items-start">
                      {/* Medium Avatar */}
                      <div className="w-32 h-40 relative flex items-center justify-center flex-shrink-0 bg-muted/50 border border-habbo-dark rounded-lg p-2">
                        <img
                          src={dynamicAvatar || ''}
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
      </div>

      {/* Victory Loot Modal */}
      <VictoryLoot
        isOpen={showVictoryLoot}
        onClose={() => {
          victoryDialogActiveRef.current = false;
          setShowVictoryLoot(false);
          setVictoryLootData({ items: [], xp: 0 });
        }}
        onContinue={async () => {
          victoryDialogActiveRef.current = false;
          setShowVictoryLoot(false);
          setVictoryLootData({ items: [], xp: 0 });
          
          // Check if this was the final room by trying to load battle
          try {
            const { data: battleCheck } = await supabase
              .from('battle_states')
              .select('current_room_index, is_active, dungeons!inner(dungeon_json)')
              .eq('dungeon_id', id)
              .eq('is_active', true)
              .maybeSingle();
            
            if (!battleCheck || !battleCheck.is_active) {
              // Battle is complete - show completion screen
              setQuestComplete(true);
            } else {
              // Continue to next room
              await loadBattle();
            }
          } catch (error) {
            // If any error, assume quest is complete
            setQuestComplete(true);
          }
        }}
        lootItems={victoryLootData.items}
        xpGained={victoryLootData.xp}
      />

      {/* Party Wipe Dialog */}
      <PartyWipeDialog
        open={showPartyWipeDialog}
        onClose={() => {
          setShowPartyWipeDialog(false);
          navigate("/dashboard");
        }}
      />

      {/* Skill Menu Dialog */}
      <SkillMenu
        open={showSkillMenu}
        onOpenChange={setShowSkillMenu}
        skills={(battleData as any)?.availableSkills || []}
        currentMp={battleData?.player?.current_mp || 0}
        fishingLevel={(battleData as any)?.fishingLevel || 0}
        gardeningLevel={(battleData as any)?.gardeningLevel || 0}
        onSelectSkill={(skillId) => {
          setSelectedSkill(skillId);
          setShowSkillMenu(false);
        }}
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

      {/* Quest Details Dialog */}
      {battleData && (
        <QuestDetailsDialog
          open={showQuestDetailsDialog}
          onOpenChange={setShowQuestDetailsDialog}
          dungeonName={battleData.dungeon_name || "Unknown Quest"}
          questObjective={battleData.quest_objective || "Complete the dungeon"}
          introText={battleData.intro_text || "Embark on this quest to face the challenges ahead."}
        />
      )}
    </div>
  );
};

export default Battle;