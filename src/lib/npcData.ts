import npcWarrior from "@/assets/npc-warrior.png";
import npcMerchant from "@/assets/npc-merchant.png";
import npcScholar from "@/assets/npc-scholar.png";
import npcMaiden from "@/assets/npc-maiden.png";
import npcGuard from "@/assets/npc-guard.png";
import npcMage from "@/assets/npc-mage.png";
import npcKnight from "@/assets/npc-knight.png";

export interface NPC {
  id: string;
  name: string;
  sprite: string;
  title: string;
  personality: string;
  questTheme: string;
  questTypes: string[];
  greeting: string;
}

export const NPCS: NPC[] = [
  {
    id: "warrior",
    name: "Bjorn the Brave",
    sprite: npcWarrior,
    title: "Veteran Warrior",
    personality: "A gruff but honorable warrior who values strength and courage. He speaks directly and has little patience for cowardice.",
    questTheme: "Combat-focused dungeons with challenging enemy encounters and boss battles",
    questTypes: ["Defeat powerful enemies", "Clear monster nests", "Hunt legendary beasts"],
    greeting: "You look like you can handle yourself in a fight. I've got work for capable warriors."
  },
  {
    id: "merchant",
    name: "Goldwyn the Prosperous",
    sprite: npcMerchant,
    title: "Master Trader",
    personality: "A shrewd merchant with an eye for profit. Friendly but always calculating value. Loves treasure and rare items.",
    questTheme: "Treasure hunting and loot-focused dungeons with valuable rewards",
    questTypes: ["Recover lost treasures", "Find rare artifacts", "Explore abandoned vaults"],
    greeting: "Ah, an adventurer! I have information about treasures that need... acquiring."
  },
  {
    id: "scholar",
    name: "Aldric the Wise",
    sprite: npcScholar,
    title: "Ancient Historian",
    personality: "A learned scholar fascinated by ancient history and forgotten lore. Speaks in a measured, thoughtful manner.",
    questTheme: "Exploration and mystery-focused dungeons with puzzles and lore",
    questTypes: ["Investigate ancient ruins", "Uncover forgotten knowledge", "Solve ancient mysteries"],
    greeting: "Excellent timing! I require someone capable of delving into places lost to time."
  },
  {
    id: "maiden",
    name: "Elara the Kind",
    sprite: npcMaiden,
    title: "Village Healer",
    personality: "A compassionate healer who cares deeply for others. Gentle and encouraging, but determined to help those in need.",
    questTheme: "Rescue and protection-focused dungeons with civilians to save",
    questTypes: ["Rescue captured villagers", "Protect the innocent", "Cleanse corrupted lands"],
    greeting: "Please, brave adventurer, I need your help. People are suffering and I cannot reach them alone."
  },
  {
    id: "guard",
    name: "Captain Roderick",
    sprite: npcGuard,
    title: "City Guard Captain",
    personality: "A disciplined military officer who values order and justice. Professional and strategic in approach.",
    questTheme: "Strategic combat dungeons with tactical challenges and defense scenarios",
    questTypes: ["Defend strategic locations", "Eliminate bandit camps", "Secure dangerous areas"],
    greeting: "Citizen. The city has need of skilled fighters. Are you up for official guard business?"
  },
  {
    id: "mage",
    name: "Mystara the Arcane",
    sprite: npcMage,
    title: "Archmage",
    personality: "A powerful mage obsessed with magical phenomena. Eccentric and intense, speaks of magic with reverence.",
    questTheme: "Magic-focused dungeons with elemental challenges and arcane mysteries",
    questTypes: ["Investigate magical anomalies", "Contain wild magic", "Recover mystical artifacts"],
    greeting: "The very fabric of magic calls out! I sense you have the potential to handle what I'm about to ask."
  },
  {
    id: "knight",
    name: "Sir Gareth the Just",
    sprite: npcKnight,
    title: "Paladin Commander",
    personality: "A noble paladin devoted to righteousness and honor. Speaks with conviction and expects moral conduct.",
    questTheme: "Holy crusade dungeons fighting darkness and undead threats",
    questTypes: ["Purge undead corruption", "Reclaim holy sites", "Vanquish dark forces"],
    greeting: "The light guides the worthy. I have a sacred duty that requires a champion of good."
  }
];

export const getNPCById = (id: string): NPC | undefined => {
  return NPCS.find(npc => npc.id === id);
};
