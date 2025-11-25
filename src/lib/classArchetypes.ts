export interface ClassArchetype {
  id: string;
  name: string;
  description: string;
  suggestedStatFocus: string[];
  icon: string;
}

export const CLASS_ARCHETYPES: ClassArchetype[] = [
  {
    id: "fighter",
    name: "Fighter",
    description: "Frontline warrior who excels in melee combat and defense. Masters of blade and shield, Fighters endure where others fall.",
    suggestedStatFocus: ["HP", "DEF", "Physical Attack"],
    icon: ""
  },
  {
    id: "rogue",
    name: "Rogue",
    description: "Stealthy assassin with high critical strike chance. Swift shadows who strike from darkness and vanish before retaliation.",
    suggestedStatFocus: ["SPD", "Critical Hit", "Agility"],
    icon: ""
  },
  {
    id: "cleric",
    name: "Cleric",
    description: "Holy healer and support specialist. Divine channelers who mend wounds and smite the unholy with sacred light.",
    suggestedStatFocus: ["MP", "Healing Power", "Holy Damage"],
    icon: ""
  },
  {
    id: "wizard",
    name: "Wizard",
    description: "Arcane master dealing devastating magical damage. Glass cannons who wield reality-bending power at great personal risk.",
    suggestedStatFocus: ["MP", "Magic Attack", "Spell Power"],
    icon: ""
  },
  {
    id: "ranger",
    name: "Ranger",
    description: "Expert marksman specializing in ranged combat and traps. Wilderness hunters who control the battlefield from afar.",
    suggestedStatFocus: ["SPD", "Ranged Attack", "Precision"],
    icon: ""
  },
  {
    id: "warlock",
    name: "Warlock",
    description: "Dark pact wielder who drains life and curses enemies. Those who bargained with shadows for forbidden power.",
    suggestedStatFocus: ["MP", "Dark Magic", "Life Drain"],
    icon: ""
  },
  {
    id: "barbarian",
    name: "Barbarian",
    description: "Savage berserker with overwhelming strength. Primal warriors who trade finesse for raw, unbridled fury.",
    suggestedStatFocus: ["HP", "Physical Attack", "Rage"],
    icon: ""
  },
  {
    id: "bard",
    name: "Bard",
    description: "Charismatic performer who buffs allies and debuffs foes. Wandering minstrels whose songs alter the tide of battle.",
    suggestedStatFocus: ["MP", "Support", "Charisma"],
    icon: ""
  }
];

export const getArchetypeById = (id: string): ClassArchetype | undefined => {
  return CLASS_ARCHETYPES.find(archetype => archetype.id === id);
};
