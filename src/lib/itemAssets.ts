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
import rareTreasureChest from "@/assets/rare-treasure-chest.png";
import spikedChestArmour from "@/assets/spiked-chest-armour.png";
import ironChestArmour from "@/assets/iron-chest-armour.png";
import ironSabatons from "@/assets/iron-sabatons.png";
import hornedHelmet from "@/assets/horned-helmet.png";
import ironHelmet from "@/assets/iron-helmet.png";
import ironLegArmour from "@/assets/iron-leg-armour.png";

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
  "Rare Treasure Chest": rareTreasureChest,
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
  // Boss Armor
  "Spiked Chest Armour": spikedChestArmour,
  "Iron Chest Armour": ironChestArmour,
  "Iron Sabatons": ironSabatons,
  "Horned Helmet": hornedHelmet,
  "Iron Helmet": ironHelmet,
  "Iron Leg Armour": ironLegArmour,
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

export const ITEM_DESCRIPTIONS: Record<string, string> = {
  // Weapons
  "Rusty Sword": "A weathered blade that's seen better days. Basic but reliable.",
  "Fighters Sword": "A well-crafted blade for seasoned warriors. +15 ATK",
  "Warriors Sword": "A masterwork weapon forged for champions. +25 ATK",
  "Mage Staff": "Channels magical energy for devastating spells. +10 ATK, +20 MP",
  "Powerful Mage Staff": "An ancient staff pulsing with arcane power. +20 ATK, +40 MP",
  "Bow & Arrow": "Strike enemies from afar with precision. +12 ATK",
  "Ornate Dagger": "A decorated blade perfect for swift strikes. +8 ATK",
  "Dagger": "A simple but deadly close-range weapon. +5 ATK",
  "Longsword": "A versatile blade favored by knights. +18 ATK",
  "Shortsword": "Quick and nimble for fast attacks. +10 ATK",
  "Greatsword": "A massive two-handed weapon of destruction. +30 ATK",
  "Blade": "A sharp cutting weapon. +8 ATK",
  "Sword": "A reliable steel blade. +12 ATK",
  
  // Armor
  "Spiked Chest Armour": "Heavy plated armor with dangerous spikes. +20 DEF",
  "Iron Chest Armour": "Solid iron protection for your torso. +15 DEF",
  "Iron Sabatons": "Heavy boots that protect your feet. +8 DEF",
  "Horned Helmet": "An intimidating helm with curved horns. +12 DEF",
  "Iron Helmet": "Standard iron headgear for warriors. +10 DEF",
  "Iron Leg Armour": "Protective plating for your legs. +10 DEF",
  
  // Consumables - Healing
  "Potion": "Restores 50 HP. A staple for any adventurer.",
  "Potion of Minor Healing": "Heals minor wounds. Restores 30 HP.",
  "Elixer": "Restores 50 MP. Essential for spellcasters.",
  "Ether": "Replenishes magical energy. Restores 40 MP.",
  
  // Consumables - Food
  "Frothy Pint": "A hearty drink that restores stamina. +20 HP",
  "Sweetcakes": "Delicious pastries that boost morale. +15 HP",
  "Sack of Potatoes": "Simple but filling. Can cook for better effects.",
  "Potatoes": "Raw vegetables. Better when cooked.",
  "Cured Meat": "Preserved meat for long journeys. +25 HP",
  
  // Materials - Basic
  "Stick Pile": "Common wood scraps. Used in basic crafting.",
  "Sticks": "Simple wooden sticks. Crafting material.",
  "Wood": "Sturdy timber for construction and crafting.",
  "Cloth Squares": "Woven fabric for tailoring and bandages.",
  "Cloth": "Basic textile material.",
  
  // Materials - Metals
  "Metal Ingot": "Refined metal ready for smithing.",
  "Metal": "Raw metallic material.",
  "Iron": "Strong metal for weapons and armor.",
  "Bronze": "A durable copper-tin alloy.",
  "Silver": "Precious metal with mystical properties.",
  
  // Materials - Magical
  "Runestones": "Ancient stones inscribed with power runes.",
  "Crystal Shards": "Fragments of magical crystals. Glow faintly.",
  "Crystals": "Pure magical crystals radiating energy.",
  "Frostbloom Herb": "A rare herb that grows in frozen conditions.",
  "Herb": "Medicinal plant for brewing potions.",
  
  // Scrolls & Books
  "Scroll": "A rolled parchment containing knowledge.",
  "Scroll of Minor Healing": "A magical scroll that heals wounds when read.",
  "Ancient Scroll": "Yellowed parchment with forgotten wisdom.",
  "Tome": "A thick book filled with arcane secrets.",
  
  // Quest Items
  "Rune of Frostsight": "A mystical rune revealing hidden ice magic.",
  "Silver Key": "An ornate key that opens special locks.",
  "Key": "A simple key. Wonder what it unlocks?",
  "Old Key": "A tarnished key from ages past.",
  "Ancient Key": "A mysterious key covered in runes.",
  "Rusted Key": "Barely functional but might still work.",
  
  // Currency & Treasure
  "Gold Coins": "Shiny currency accepted everywhere.",
  "Gold": "Valuable gold pieces.",
  "Everyday Supply Chest": "A common chest with basic supplies inside.",
  "Rare Treasure Chest": "A precious chest containing rare items!",
  "Victory Trophy": "A gleaming trophy proving your triumph.",
  
  // Misc Items
  "Candles": "Wax candles that provide light in darkness.",
  "Candle": "A single candle. Burns for several hours.",
  "Poison": "Deadly toxin. Handle with extreme care!",
  "Long Feathers": "Pristine feathers for fletching arrows.",
  "Feathers": "Soft plumage from various birds.",
  "Feather": "A single delicate feather.",
  "Pouch": "A small leather bag for carrying items.",
  
  // Creature Items
  "Werewolf": "A cursed lycanthrope pelt. Radiates dark magic.",
  "Flaming Phantom": "Essence of a fire spirit. Burns eternally.",
  "Phantom": "Spectral residue from defeated ghosts.",
  "Spirit Owl": "The spirit of a wise owl. Offers guidance.",
  "Owl": "Feathers and talons from a mystical owl.",
};

export const getItemDescription = (itemName: string): string => {
  return ITEM_DESCRIPTIONS[itemName] || "A mysterious item.";
};
