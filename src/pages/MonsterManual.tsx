import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { HabboPanel } from "@/components/HabboPanel";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { EnemySprite } from "@/components/EnemySprite";
import { toast } from "sonner";
import monsterManualTitle from "@/assets/monster-manual-title.png";
import ancientJailImage from "@/assets/ancient-jail.png";

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
import frostRat from "@/assets/frost-rat.gif";
import goblinTrio from "@/assets/goblin-trio.png";
import frostbiteSpider from "@/assets/frostbite-spider.png";
import frostUndead from "@/assets/frost-undead.gif";
import flamingPhantom from "@/assets/flaming-phantom.png";
import fireDrake from "@/assets/fire-drake.png";
import werewolf from "@/assets/werewolf.png";
import bloodDragonBoss from "@/assets/blood-dragon-boss.gif";
import iceKnightBoss from "@/assets/ice-knight-boss.png";
import icedStoneDragon from "@/assets/iced-stone-dragon.png";
import mysticShaman from "@/assets/mystic-shaman-boss.png";
import frostBrute from "@/assets/frost-brute.png";
import voidStalker from "@/assets/void-stalker.png";
import swampLurker from "@/assets/swamp-lurker.png";
import infernalHound from "@/assets/infernal-hound.png";
import iceGorgon from "@/assets/ice-gorgon.png";
import phoenix from "@/assets/phoenix.png";
import slumberBear from "@/assets/slumber-bear.gif";
import gryphon from "@/assets/gryphon.png";
import emeraldDrake from "@/assets/emerald-drake.png";
import azureDragon from "@/assets/azure-dragon.png";
import ancientTreant from "@/assets/ancient-treant.png";
import wolfPup from "@/assets/wolf-pup.png";

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
  "ice-shade.png": iceShade,
  "undead-habbo.png": undeadHabbo,
  "frost-rat.gif": frostRat,
  "goblin-trio.png": goblinTrio,
  "frostbite-spider.png": frostbiteSpider,
  "frost-undead.gif": frostUndead,
  "flaming-phantom.png": flamingPhantom,
  "fire-drake.png": fireDrake,
  "werewolf.png": frostWolf,
  "blood-dragon-boss.gif": bloodDragonBoss,
  "ice-knight-boss.png": iceKnightBoss,
  "iced-stone-dragon.png": icedStoneDragon,
  "mystic-shaman-boss.png": mysticShaman,
  "frost-brute.png": frostBrute,
  "void-stalker.png": voidStalker,
  "swamp-lurker.png": swampLurker,
  "infernal-hound.png": infernalHound,
  "ice-gorgon.png": iceGorgon,
  "phoenix.png": phoenix,
  "slumber-bear.gif": slumberBear,
  "gryphon.png": gryphon,
  "emerald-drake.png": emeraldDrake,
  "azure-dragon.png": azureDragon,
  "ancient-treant.png": ancientTreant,
  "wolf-pup.png": wolfPup,
};

interface Monster {
  id: string;
  enemy_name: string;
  sprite_filename: string;
}

const MONSTER_DESCRIPTIONS: Record<string, { type: string; description: string; difficulty: string }> = {
  "Frost Rat": {
    type: "Beast",
    description: "Ice-adapted vermin with crystalline fur that scurry through the frozen dungeons, their bite carries a numbing chill.",
    difficulty: "Common"
  },
  "Skeleton": {
    type: "Undead",
    description: "Animated bones of fallen warriors, cursed to guard the frozen halls for eternity.",
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
    description: "Black-furred predators adapted to the icy wastes, their bite carries the chill of death.",
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
  },
  "Iced Stone Dragon": {
    type: "Boss - Elemental Dragon",
    description: "An ancient trickster dragon combining ice and stone elemental magic. Known for testing adventurers with riddles before unleashing devastating frost attacks.",
    difficulty: "Legendary"
  },
  "Mystic Shaman": {
    type: "Boss - Elemental Mystic",
    description: "A powerful shaman channeling primal elemental forces. Commands both fire and ice magic, summoning ancestral spirits to overwhelm foes with raw elemental fury.",
    difficulty: "Legendary"
  },
  "Frost Brute": {
    type: "Giant",
    description: "A massive blue-skinned brute empowered by ancient frost magic. Its tremendous strength and icy resilience make it a formidable opponent.",
    difficulty: "Uncommon"
  },
  "Void Stalker": {
    type: "Aberration",
    description: "A creature from the dark void between worlds, its shadowy form absorbs light and drains life energy from those who dare approach.",
    difficulty: "Uncommon"
  },
  "Swamp Lurker": {
    type: "Troll",
    description: "A vicious green-skinned troll that dwells in the frozen marshlands. Despite the cold, it regenerates quickly and fights with savage ferocity.",
    difficulty: "Uncommon"
  },
  "Infernal Hound": {
    type: "Fiend",
    description: "A demonic beast wreathed in dark flames. These hounds hunt in packs and their bites carry both fire and shadow magic.",
    difficulty: "Uncommon"
  },
  "Ice Gorgon": {
    type: "Elemental Construct",
    description: "A crystalline sentinel formed from enchanted ice and ancient magic. Its petrifying gaze can freeze enemies solid, while its body radiates an aura of absolute cold.",
    difficulty: "Rare"
  },
  "Phoenix": {
    type: "Mythical Beast",
    description: "A legendary bird wreathed in eternal flames, reborn from its own ashes. Its fiery wings can scorch entire rooms, and it possesses devastating fire magic.",
    difficulty: "Epic"
  },
  "Slumber Bear": {
    type: "Magical Beast",
    description: "A massive hibernating bear infused with dream magic. Its drowsy appearance belies its ferocious power when awakened. Those who disturb its slumber face crushing strength and sleep-inducing spells.",
    difficulty: "Rare"
  },
  "Gryphon": {
    type: "Mythical Beast",
    description: "A majestic creature combining the nobility of an eagle with the might of a lion. Its razor-sharp talons and powerful beak make it a formidable aerial predator.",
    difficulty: "Epic"
  },
  "Emerald Drake": {
    type: "Dragon",
    description: "A young green dragon with mastery over nature and poison. Its venomous breath can corrupt the land itself, and its scales shimmer like precious emeralds.",
    difficulty: "Epic"
  },
  "Azure Dragon": {
    type: "Dragon",
    description: "An elegant blue dragon with command over water and lightning. Its serpentine form dances through the air as it calls down thunderbolts and tidal waves upon its foes.",
    difficulty: "Legendary"
  },
  "Ancient Treant": {
    type: "Elemental Construct",
    description: "A towering tree-like guardian animated by primal nature magic. Its wooden limbs possess immense strength, and it can command the very roots of the earth to entangle enemies.",
    difficulty: "Rare"
  },
  "Wolf Pup": {
    type: "Beast",
    description: "A young, ravenous wolf cub separated from its pack. Despite its small size, it fights with surprising ferocity and razor-sharp teeth, driven by hunger and survival instinct.",
    difficulty: "Common"
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
      <div className="py-8 space-y-6">
        <HabboPanel className="bg-gradient-to-br from-destructive/20 to-primary/20 relative overflow-hidden">
          <div 
            className="absolute inset-0 opacity-15 bg-center bg-no-repeat pointer-events-none"
            style={{ backgroundImage: `url(${ancientJailImage})`, backgroundSize: '140%' }}
          />
          <div className="space-y-3 relative z-10">
            <img 
              src={monsterManualTitle} 
              alt="Monster Manual" 
              className="pixel-icon"
              style={{ imageRendering: 'pixelated' }}
            />
            <p className="text-sm text-muted-foreground">A Comprehensive Guide to the Creatures of the Frozen Wastes</p>
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
                      <EnemySprite
                        spriteUrl={sprite}
                        spriteFilename={monster.sprite_filename}
                        name={monster.enemy_name}
                        shouldFace="left"
                        className="pixel-icon max-h-full max-w-full object-contain"
                        style={{
                          transform: `scale(${
                            monster.sprite_filename === 'frostbite-spider.png' ? '1.5' : 
                            monster.sprite_filename === 'frost-rat.gif' ? '3.213' : '1'
                          })`
                        }}
                      />
                    ) : (
                      <span className="text-[96px] text-muted-foreground font-['Volter'] leading-none">ª</span>
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
            <span className="text-[64px] text-muted-foreground font-['Volter'] leading-none block mb-4">ª</span>
            <p className="text-xl text-muted-foreground">No creatures documented yet...</p>
          </HabboPanel>
        )}
      </div>
    </AppLayout>
  );
}
