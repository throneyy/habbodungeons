// Item asset mappings
import rustySword from "@/assets/pixel-sword.png";
import runestones from "@/assets/runestones.png";
import crystalShards from "@/assets/crystal-shards.png";
import goldCoins from "@/assets/gold-coins.png";
import stickPile from "@/assets/stick-pile.png";
import clothSquares from "@/assets/cloth-squares.png";
import metalIngot from "@/assets/metal-ingot.png";
import potion from "@/assets/potion.png";
import elixer from "@/assets/elixer.png";
import everydaySupplyChest from "@/assets/everyday-supply-chest.png";
import fightersSword from "@/assets/fighters-sword.png";
import warriorsSword from "@/assets/warriors-sword.png";
import mageStaff from "@/assets/mage-staff.png";
import powerfulMageStaff from "@/assets/powerful-mage-staff.png";
import frothyPint from "@/assets/frothy-pint.png";
import sweetcakes from "@/assets/sweetcakes.png";
import bowAndArrow from "@/assets/bow-and-arrow.png";
import herb from "@/assets/herb.png";
import scroll from "@/assets/scroll.png";
import scrollStack from "@/assets/scroll-stack.png";
import scrollOpen from "@/assets/scroll-open.png";
import sackOfPotatoes from "@/assets/sack-of-potatoes.png";
import curedMeat from "@/assets/cured-meat.png";
import pouch from "@/assets/pouch.png";
import candles from "@/assets/candles.png";
import poison from "@/assets/poison.png";
import longFeathers from "@/assets/long-feathers.png";
import crystals from "@/assets/crystals.png";
import werewolf from "@/assets/werewolf.png";
import flamingPhantom from "@/assets/flaming-phantom.png";
import spiritOwl from "@/assets/spirit-owl.png";
import victoryTrophy from "@/assets/victory-trophy.png";

export const ITEM_ASSETS: Record<string, string> = {
  "Rusty Sword": rustySword,
  "Runestones": runestones,
  "Crystal Shards": crystalShards,
  "Gold Coins": goldCoins,
  "Gold": goldCoins,
  "Stick Pile": stickPile,
  "Sticks": stickPile,
  "Wood": stickPile,
  "Cloth Squares": clothSquares,
  "Cloth": clothSquares,
  "Metal Ingot": metalIngot,
  "Metal": metalIngot,
  "Silver": metalIngot,
  "Silver Key": metalIngot,
  "Iron": metalIngot,
  "Bronze": metalIngot,
  "Potion": potion,
  "Ether": elixer,
  "Elixer": elixer,
  "Everyday Supply Chest": everydaySupplyChest,
  "Rare Treasure Chest": victoryTrophy,
  "Fighters Sword": fightersSword,
  "Warriors Sword": warriorsSword,
  "Mage Staff": mageStaff,
  "Powerful Mage Staff": powerfulMageStaff,
  "Frothy Pint": frothyPint,
  "Sweetcakes": sweetcakes,
  "Bow & Arrow": bowAndArrow,
  "Herb": herb,
  "Scroll": scroll,
  "Ancient Scroll": scrollStack,
  "Tome": scrollOpen,
  "Sack of Potatoes": sackOfPotatoes,
  "Potatoes": sackOfPotatoes,
  "Cured Meat": curedMeat,
  "Pouch": pouch,
  "Candles": candles,
  "Candle": candles,
  "Poison": poison,
  "Long Feathers": longFeathers,
  "Feathers": longFeathers,
  "Feather": longFeathers,
  "Crystals": crystals,
  "Werewolf": werewolf,
  "Flaming Phantom": flamingPhantom,
  "Phantom": flamingPhantom,
  "Spirit Owl": spiritOwl,
  "Owl": spiritOwl,
  // Quest items
  "Scroll of Minor Healing": scroll,
  "Potion of Minor Healing": potion,
  "Rune of Frostsight": runestones,
  "Frostbloom Herb": herb,
  // Weapons - daggers, swords
  "Ornate Dagger": rustySword,
  "Dagger": rustySword,
  "Blade": rustySword,
  "Sword": fightersSword,
  "Longsword": warriorsSword,
  "Shortsword": fightersSword,
  "Greatsword": warriorsSword,
  // Keys
  "Key": metalIngot,
  "Old Key": metalIngot,
  "Ancient Key": metalIngot,
  "Rusted Key": metalIngot,
  // Gems and crystals
  "Gem": crystalShards,
  "Crystal": crystalShards,
  "Jewel": crystalShards,
  "Diamond": crystalShards,
  "Ruby": crystalShards,
  "Sapphire": crystalShards,
  "Emerald": crystalShards,
  // Currency
  "Coins": goldCoins,
  "Silver Coins": goldCoins,
  "Copper Coins": goldCoins,
  // Consumables
  "Food": sweetcakes,
  "Drink": frothyPint,
  "Bread": sweetcakes,
  "Meat": sweetcakes,
  "Water": frothyPint,
  "Wine": frothyPint,
  // Materials
  "Leather": clothSquares,
  "Hide": clothSquares,
  "Fur": clothSquares,
  "Ore": metalIngot,
  "Ingot": metalIngot,
  "Stone": runestones,
  "Rock": runestones,
};

export const getItemImage = (itemName: string): string | undefined => {
  // Direct match
  if (ITEM_ASSETS[itemName]) {
    return ITEM_ASSETS[itemName];
  }
  
  // Try partial matching for items with adjectives
  const nameLower = itemName.toLowerCase();
  for (const [key, sprite] of Object.entries(ITEM_ASSETS)) {
    const keyLower = key.toLowerCase();
    if (nameLower.includes(keyLower) || keyLower.includes(nameLower)) {
      return sprite;
    }
  }
  
  // Default fallback - use everyday supply chest as generic item icon
  return everydaySupplyChest;
};
