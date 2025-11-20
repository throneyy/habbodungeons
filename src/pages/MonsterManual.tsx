import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { HabboPanel } from "@/components/HabboPanel";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { BookOpen, Skull } from "lucide-react";
import { toast } from "sonner";

// Import enemy sprites
import skeleton from "@/assets/skeleton.png";
import iceTiger from "@/assets/ice-tiger.gif";
import iceElemental from "@/assets/ice-elemental.png";
import iceGuardian from "@/assets/ice-guardian.png";
import frostWolf from "@/assets/frost-wolf.png";
import glacialImp from "@/assets/glacial-imp.png";
import frozenGoblin from "@/assets/frozen-goblin.png";
import frostMutant from "@/assets/frost-mutant.png";
import frostWraith from "@/assets/frost-wraith.png";
import iceShade from "@/assets/ice-shade.png";
import undeadHabbo from "@/assets/undead-habbo.png";
import giantRat from "@/assets/giant-rat.png";
import goblinTrio from "@/assets/goblin-trio.png";
import frostbiteSpider from "@/assets/frostbite-spider.webp";
import frostUndead from "@/assets/frost-undead.gif";
import flamingPhantom from "@/assets/flaming-phantom.png";
import fireDrake from "@/assets/fire-drake.png";
import werewolf from "@/assets/werewolf.png";
import bloodDragonBoss from "@/assets/blood-dragon-boss.gif";
import iceKnightBoss from "@/assets/ice-knight-boss.png";

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
  "ice-shade.png": iceShade,
  "undead-habbo.png": undeadHabbo,
  "giant-rat.png": giantRat,
  "goblin-trio.png": goblinTrio,
  "frostbite-spider.webp": frostbiteSpider,
  "frost-undead.gif": frostUndead,
  "flaming-phantom.png": flamingPhantom,
  "fire-drake.png": fireDrake,
  "werewolf.png": werewolf,
  "blood-dragon-boss.gif": bloodDragonBoss,
  "ice-knight-boss.png": iceKnightBoss,
};

interface Monster {
  id: string;
  enemy_name: string;
  sprite_filename: string;
}

const MONSTER_DESCRIPTIONS: Record<string, { type: string; description: string; difficulty: string }> = {
  "Giant Rat": {
    type: "Beast",
    description: "Oversized vermin that scurry through the frozen dungeons, carriers of plague and pestilence.",
    difficulty: "Common"
  },
  "Skeleton": {
    type: "Undead",
    description: "Animated bones of fallen warriors, cursed to guard the frozen halls for eternity.",
    difficulty: "Common"
  },
  "Frozen Goblin": {
    type: "Humanoid",
    description: "Small, vicious creatures warped by the eternal winter, they attack in savage packs.",
    difficulty: "Common"
  },
  "Goblin Trio": {
    type: "Humanoid",
    description: "Three goblins that fight as one, coordinating their attacks with deadly precision.",
    difficulty: "Uncommon"
  },
  "Glacial Imp": {
    type: "Demon",
    description: "Mischievous ice demons that delight in tormenting adventurers with frost magic.",
    difficulty: "Uncommon"
  },
  "Frost Wolf": {
    type: "Beast",
    description: "White-furred predators adapted to the icy wastes, their bite carries the chill of death.",
    difficulty: "Uncommon"
  },
  "Frostbite Spider": {
    type: "Beast",
    description: "Giant arachnids with crystalline fangs that inject paralytic venom.",
    difficulty: "Uncommon"
  },
  "Undead Habbo": {
    type: "Undead",
    description: "Former adventurers who fell to the dungeon's curse, now shambling husks seeking to spread their fate.",
    difficulty: "Uncommon"
  },
  "Ice Shade": {
    type: "Undead Spirit",
    description: "Spectral beings made of frozen mist, they drain the warmth from living creatures.",
    difficulty: "Rare"
  },
  "Frost Wraith": {
    type: "Undead Spirit",
    description: "Malevolent spirits bound to the frozen wastes, their touch brings numbing cold.",
    difficulty: "Rare"
  },
  "Frost Undead": {
    type: "Undead",
    description: "Powerful undead warriors preserved by the eternal ice, wielding frozen weapons.",
    difficulty: "Rare"
  },
  "Frost Mutant": {
    type: "Aberration",
    description: "Twisted creatures warped by dark magic and endless cold into monstrous forms.",
    difficulty: "Rare"
  },
  "Ice Elemental": {
    type: "Elemental",
    description: "Living embodiments of winter's fury, these beings command the very essence of ice.",
    difficulty: "Rare"
  },
  "Ice Tiger": {
    type: "Magical Beast",
    description: "Magnificent predators with crystalline stripes, their roar can freeze the blood.",
    difficulty: "Rare"
  },
  "Flaming Phantom": {
    type: "Undead Spirit",
    description: "Contradictory spirits of fire trapped in the frozen halls, burning with eternal rage.",
    difficulty: "Epic"
  },
  "Fire Drake": {
    type: "Dragon",
    description: "Young dragons that breathe searing flames, their presence melts the ancient ice.",
    difficulty: "Epic"
  },
  "Werewolf": {
    type: "Lycanthrope",
    description: "Cursed beings that transform under the pale moon, combining human cunning with bestial fury.",
    difficulty: "Epic"
  },
  "Ice Guardian": {
    type: "Construct",
    description: "Ancient magical guardians carved from eternal ice, sworn to protect the deepest vaults.",
    difficulty: "Epic"
  },
  "Ice Knight Commander": {
    type: "Boss - Undead Knight",
    description: "The fallen commander of the frozen legion, wielding legendary ice-forged weapons with terrifying skill.",
    difficulty: "Legendary"
  },
  "Blood Dragon": {
    type: "Boss - Ancient Dragon",
    description: "A fearsome wyrm corrupted by dark magic, its blood-red scales resistant to all but the mightiest strikes.",
    difficulty: "Legendary"
  }
};

export default function MonsterManual() {
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMonsters();
  }, []);

  const loadMonsters = async () => {
    try {
      const { data, error } = await supabase
        .from("enemy_sprites")
        .select("*")
        .order("enemy_name");

      if (error) throw error;

      setMonsters(data || []);
    } catch (error) {
      console.error("Error loading monsters:", error);
      toast.error("Failed to load monster manual");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner />
        </div>
      </AppLayout>
    );
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Common": return "text-muted-foreground";
      case "Uncommon": return "text-green-500";
      case "Rare": return "text-blue-500";
      case "Epic": return "text-purple-500";
      case "Legendary": return "text-yellow-500";
      default: return "text-foreground";
    }
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8 space-y-6">
        <HabboPanel className="bg-gradient-to-br from-destructive/20 to-primary/20">
          <div className="flex items-center gap-4 mb-2">
            <BookOpen className="w-12 h-12 text-destructive" />
            <div>
              <h1 className="text-5xl font-black text-foreground">Monster Manual</h1>
              <p className="text-lg text-muted-foreground">A Comprehensive Guide to the Creatures of the Frozen Wastes</p>
            </div>
          </div>
        </HabboPanel>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {monsters.map((monster) => {
            const sprite = ENEMY_SPRITES[monster.sprite_filename];
            const details = MONSTER_DESCRIPTIONS[monster.enemy_name] || {
              type: "Unknown",
              description: "A mysterious creature lurking in the frozen depths...",
              difficulty: "Unknown"
            };

            return (
              <HabboPanel key={monster.id} className="bg-gradient-to-br from-card to-muted/20 hover:scale-105 transition-transform">
                <div className="space-y-4">
                  {/* Monster Sprite */}
                  <div className="flex justify-center items-center h-48 bg-background/50 rounded-lg border-2 border-habbo-dark p-4">
                    {sprite ? (
                      <img
                        src={sprite}
                        alt={monster.enemy_name}
                        className="pixel-icon max-h-full max-w-full object-contain"
                        style={{ 
                          imageRendering: 'pixelated',
                          transform: (monster.sprite_filename === 'ice-guardian.png' || 
                                     monster.sprite_filename === 'blood-dragon-boss.gif' ||
                                     monster.sprite_filename === 'glacial-imp.png' ||
                                     monster.sprite_filename === 'ice-knight-boss.png' ||
                                     monster.sprite_filename === 'undead-habbo.png' ||
                                     monster.sprite_filename === 'werewolf.png' ||
                                     monster.sprite_filename === 'skeleton.png' ||
                                     monster.sprite_filename === 'goblin-trio.png' ||
                                     monster.sprite_filename === 'frost-wraith.png' ||
                                     monster.sprite_filename === 'frost-mutant.png' ||
                                     monster.sprite_filename === 'flaming-phantom.png') ? 'none' : 'scaleX(-1)'
                        }}
                      />
                    ) : (
                      <Skull className="w-24 h-24 text-muted-foreground" />
                    )}
                  </div>

                  {/* Monster Info */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-black text-foreground">{monster.enemy_name}</h2>
                      <span className={`text-sm font-bold ${getDifficultyColor(details.difficulty)}`}>
                        {details.difficulty}
                      </span>
                    </div>
                    
                    <div className="inline-block px-3 py-1 bg-primary/20 rounded-lg border border-primary/50">
                      <span className="text-xs font-bold text-primary">{details.type}</span>
                    </div>

                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {details.description}
                    </p>
                  </div>
                </div>
              </HabboPanel>
            );
          })}
        </div>

        {monsters.length === 0 && (
          <HabboPanel className="text-center py-12">
            <Skull className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-xl text-muted-foreground">No creatures documented yet...</p>
          </HabboPanel>
        )}
      </div>
    </AppLayout>
  );
}
