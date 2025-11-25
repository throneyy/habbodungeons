import npcWarrior from "@/assets/npc-warrior.png";
import npcMerchant from "@/assets/npc-merchant.png";
import npcScholar from "@/assets/npc-scholar.png";
import npcMaiden from "@/assets/npc-maiden.png";
import npcGuard from "@/assets/npc-guard.png";
import npcMage from "@/assets/npc-mage.png";
import npcKnight from "@/assets/npc-knight.png";
import npcGnome from "@/assets/npc-gnome.png";
import npcPrince from "@/assets/npc-prince.png";

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
    name: "Bjorn the Bard",
    sprite: npcWarrior,
    title: "Traveling Minstrel",
    personality: "A charismatic bard who weaves tales through song and lute. He's jovial and dramatic, believing every quest deserves an epic ballad.",
    questTheme: "Story-rich dungeons with memorable encounters and dramatic moments worth singing about",
    questTypes: ["Uncover legendary tales", "Meet interesting characters", "Create memorable stories"],
    greeting: "Hail, friend! Every great hero needs a witness to their deeds. Care to give me a tale worth singing?"
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
  },
  {
    id: "gnome",
    name: "Bramble Thistlewick",
    sprite: npcGnome,
    title: "Forest Guardian",
    personality: "An ancient gnome druid with centuries of woodland wisdom. Speaks in riddles and nature metaphors, but fiercely protective of the wild. Mischievous yet deeply caring about the balance of nature.",
    questTheme: "Nature-focused dungeons with elemental challenges, wildlife encounters, and environmental puzzles",
    questTypes: ["Restore corrupted groves", "Protect endangered creatures", "Harness primal elements"],
    greeting: "Ah, a sprout brave enough to venture deep! The forest whispers of imbalance... will you help the roots reclaim what's been taken?"
  },
  {
    id: "prince",
    name: "Prince Silverwing",
    sprite: npcPrince,
    title: "Heir of the Fey Court",
    personality: "A mysterious fairy prince from the realm between worlds. Elegant and ethereal, speaking in poetic riddles with double meanings. Playful yet dangerous, bound by ancient fey contracts and oaths.",
    questTheme: "Enchantment-focused dungeons with illusions, fey creatures, and magical bargains",
    questTypes: ["Break ancient curses", "Navigate fey politics", "Unravel magical deceptions"],
    greeting: "Well met, mortal walker. The threads of fate have woven you into my court's troubles. Dare you dance with the fey and risk what mortals hold dear?"
  }
];

export const getNPCById = (id: string): NPC | undefined => {
  return NPCS.find(npc => npc.id === id);
};
