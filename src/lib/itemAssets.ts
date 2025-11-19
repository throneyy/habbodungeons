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
  // Additional mappings for quest items
  "Scroll of Minor Healing": scroll,
  "Potion of Minor Healing": potion,
  "Rune of Frostsight": runestones,
  "Frostbloom Herb": herb,
  // Generic fallbacks for common item types
  "Key": metalIngot,
  "Gem": crystalShards,
  "Crystal": crystalShards,
  "Coins": goldCoins,
  "Food": sweetcakes,
  "Drink": frothyPint,
};

export const getItemImage = (itemName: string): string | undefined => {
  return ITEM_ASSETS[itemName];
};
