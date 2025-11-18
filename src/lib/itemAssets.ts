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

export const ITEM_ASSETS: Record<string, string> = {
  "Rusty Sword": rustySword,
  "Runestones": runestones,
  "Crystal Shards": crystalShards,
  "Gold Coins": goldCoins,
  "Stick Pile": stickPile,
  "Cloth Squares": clothSquares,
  "Metal Ingot": metalIngot,
  "Potion": potion,
  "Ether": elixer,
  "Elixer": elixer,
  "Everyday Supply Chest": everydaySupplyChest,
  "Fighters Sword": fightersSword,
  "Warriors Sword": warriorsSword,
  "Mage Staff": mageStaff,
  "Powerful Mage Staff": powerfulMageStaff,
};

export const getItemImage = (itemName: string): string | undefined => {
  return ITEM_ASSETS[itemName];
};
