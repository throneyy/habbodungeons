export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  source: "fishing" | "gardening";
  mpCost: number;
  oncePerDungeon?: boolean;
  requiredFishingLevel?: number;
  requiredGardeningLevel?: number;
  effectType: "damage" | "heal" | "buff" | "debuff" | "special";
  effectValues: {
    amount?: number;
    target?: "single" | "aoe" | "self" | "party";
    statType?: string;
    duration?: number;
  };
}

export const SKILL_DEFINITIONS: SkillDefinition[] = [
  // Fishing Skills
  {
    id: "hooked_strike",
    name: "Hooked Strike",
    description: "A swift strike that hooks the enemy, dealing moderate damage.",
    source: "fishing",
    mpCost: 8,
    requiredFishingLevel: 10,
    effectType: "damage",
    effectValues: { amount: 25, target: "single" }
  },
  {
    id: "net_toss",
    name: "Net Toss",
    description: "Toss a net to ensnare multiple enemies, dealing damage to all.",
    source: "fishing",
    mpCost: 15,
    requiredFishingLevel: 30,
    effectType: "damage",
    effectValues: { amount: 20, target: "aoe" }
  },
  {
    id: "anglers_instinct",
    name: "Angler's Instinct",
    description: "Heighten your senses, increasing critical hit chance.",
    source: "fishing",
    mpCost: 12,
    requiredFishingLevel: 40,
    effectType: "buff",
    effectValues: { target: "self", statType: "crit", amount: 15, duration: 3 }
  },
  {
    id: "foam_barrier",
    name: "Foam Barrier",
    description: "Create a protective barrier of foam, increasing defense.",
    source: "fishing",
    mpCost: 14,
    requiredFishingLevel: 55,
    effectType: "buff",
    effectValues: { target: "self", statType: "def", amount: 20, duration: 3 }
  },
  {
    id: "tidal_guard",
    name: "Tidal Guard",
    description: "Summon a tidal wave to shield all allies, boosting party defense.",
    source: "fishing",
    mpCost: 20,
    requiredFishingLevel: 70,
    effectType: "buff",
    effectValues: { target: "party", statType: "def", amount: 15, duration: 3 }
  },
  {
    id: "undertow",
    name: "Undertow",
    description: "Pull enemies into a whirlpool, reducing their speed.",
    source: "fishing",
    mpCost: 16,
    requiredFishingLevel: 85,
    effectType: "debuff",
    effectValues: { target: "aoe", statType: "spd", amount: -20, duration: 2 }
  },
  {
    id: "leviathan_lure",
    name: "Leviathan's Lure",
    description: "Call upon the deep sea beast, dealing massive damage to a single foe.",
    source: "fishing",
    mpCost: 30,
    requiredFishingLevel: 99,
    effectType: "damage",
    effectValues: { amount: 80, target: "single" }
  },
  {
    id: "depths_bounty",
    name: "Depth's Bounty",
    description: "ULTIMATE: Harvest the riches of the deep, granting bonus loot and XP.",
    source: "fishing",
    mpCost: 40,
    oncePerDungeon: true,
    requiredFishingLevel: 100,
    effectType: "special",
    effectValues: { target: "party" }
  },

  // Gardening Skills
  {
    id: "herbal_salve",
    name: "Herbal Salve",
    description: "Apply healing herbs to restore health.",
    source: "gardening",
    mpCost: 10,
    requiredGardeningLevel: 10,
    effectType: "heal",
    effectValues: { amount: 30, target: "single" }
  },
  {
    id: "spore_burst",
    name: "Spore Burst",
    description: "Release toxic spores that poison all enemies.",
    source: "gardening",
    mpCost: 15,
    requiredGardeningLevel: 30,
    effectType: "debuff",
    effectValues: { target: "aoe", statType: "poison", amount: 10, duration: 3 }
  },
  {
    id: "sapling_shield",
    name: "Sapling Shield",
    description: "Grow a protective sapling barrier around yourself.",
    source: "gardening",
    mpCost: 12,
    requiredGardeningLevel: 40,
    effectType: "buff",
    effectValues: { target: "self", statType: "res", amount: 25, duration: 3 }
  },
  {
    id: "verdant_pulse",
    name: "Verdant Pulse",
    description: "Send out a wave of life energy, healing all allies.",
    source: "gardening",
    mpCost: 18,
    requiredGardeningLevel: 55,
    effectType: "heal",
    effectValues: { amount: 25, target: "party" }
  },
  {
    id: "evergreen_ward",
    name: "Evergreen Ward",
    description: "Bestow nature's blessing on all allies, increasing resistance.",
    source: "gardening",
    mpCost: 20,
    requiredGardeningLevel: 70,
    effectType: "buff",
    effectValues: { target: "party", statType: "res", amount: 20, duration: 3 }
  },
  {
    id: "rot_bloom",
    name: "Rot Bloom",
    description: "Summon decaying flowers that wither enemies, dealing damage over time.",
    source: "gardening",
    mpCost: 16,
    requiredGardeningLevel: 85,
    effectType: "debuff",
    effectValues: { target: "aoe", statType: "bleed", amount: 15, duration: 3 }
  },
  {
    id: "thorn_barrage",
    name: "Thorn Barrage",
    description: "Launch a devastating volley of thorns at a single enemy.",
    source: "gardening",
    mpCost: 30,
    requiredGardeningLevel: 99,
    effectType: "damage",
    effectValues: { amount: 75, target: "single" }
  },
  {
    id: "bloom_of_life",
    name: "Bloom of Life",
    description: "ULTIMATE: Channel nature's full power to revive and heal the entire party.",
    source: "gardening",
    mpCost: 40,
    oncePerDungeon: true,
    requiredGardeningLevel: 100,
    effectType: "heal",
    effectValues: { amount: 100, target: "party" }
  }
];

export function getUnlockedSkills(fishingLevel: number, gardeningLevel: number): string[] {
  return SKILL_DEFINITIONS
    .filter(skill => {
      const meetsFishing = skill.requiredFishingLevel == null || fishingLevel >= skill.requiredFishingLevel;
      const meetsGardening = skill.requiredGardeningLevel == null || gardeningLevel >= skill.requiredGardeningLevel;
      return meetsFishing && meetsGardening;
    })
    .map(skill => skill.id);
}

export function getSkillById(skillId: string): SkillDefinition | undefined {
  return SKILL_DEFINITIONS.find(skill => skill.id === skillId);
}
