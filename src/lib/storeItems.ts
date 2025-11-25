export interface StoreItem {
  id: string;
  name: string;
  description: string;
  sprite: string;
  category: 'consumable' | 'weapon' | 'armor' | 'material';
  goldPrice: number;
  silverPrice: number;
  itemType: string;
}

export const STORE_ITEMS: StoreItem[] = [
  // Consumables - Healing
  {
    id: 'potion',
    name: 'Potion',
    description: 'Restores 50 HP',
    sprite: 'potion.png',
    category: 'consumable',
    goldPrice: 2,
    silverPrice: 20,
    itemType: 'consumable'
  },
  {
    id: 'ether',
    name: 'Ether',
    description: 'Restores 40 MP',
    sprite: 'elixer.png',
    category: 'consumable',
    goldPrice: 3,
    silverPrice: 25,
    itemType: 'consumable'
  },
  {
    id: 'elixir',
    name: 'Elixir',
    description: 'Restores 50 MP',
    sprite: 'elixer.png',
    category: 'consumable',
    goldPrice: 3,
    silverPrice: 30,
    itemType: 'consumable'
  },
  // Consumables - Food
  {
    id: 'sweetcakes',
    name: 'Sweetcakes',
    description: 'Restores 15 HP',
    sprite: 'sweetcakes.png',
    category: 'consumable',
    goldPrice: 1,
    silverPrice: 10,
    itemType: 'consumable'
  },
  {
    id: 'frothy-pint',
    name: 'Frothy Pint',
    description: 'Restores 20 HP',
    sprite: 'frothy-pint.png',
    category: 'consumable',
    goldPrice: 2,
    silverPrice: 15,
    itemType: 'consumable'
  },
  {
    id: 'cured-meat',
    name: 'Cured Meat',
    description: 'Restores 25 HP',
    sprite: 'cured-meat.png',
    category: 'consumable',
    goldPrice: 2,
    silverPrice: 20,
    itemType: 'consumable'
  },
  // Weapons
  {
    id: 'rusty-sword',
    name: 'Rusty Sword',
    description: 'Basic weapon for beginners',
    sprite: 'fighters-sword.png',
    category: 'weapon',
    goldPrice: 5,
    silverPrice: 50,
    itemType: 'weapon'
  },
  {
    id: 'fighters-sword',
    name: 'Fighters Sword',
    description: 'A sturdy blade (+15 ATK)',
    sprite: 'fighters-sword.png',
    category: 'weapon',
    goldPrice: 20,
    silverPrice: 200,
    itemType: 'weapon'
  },
  {
    id: 'mage-staff',
    name: 'Mage Staff',
    description: 'Arcane weapon (+10 ATK, +20 MP)',
    sprite: 'mage-staff.png',
    category: 'weapon',
    goldPrice: 25,
    silverPrice: 250,
    itemType: 'weapon'
  },
  {
    id: 'bow-and-arrow',
    name: 'Bow & Arrow',
    description: 'Ranged weapon (+12 ATK)',
    sprite: 'bow-and-arrow.png',
    category: 'weapon',
    goldPrice: 18,
    silverPrice: 180,
    itemType: 'weapon'
  },
  // Materials
  {
    id: 'runestones',
    name: 'Runestones',
    description: 'Magical stones for crafting',
    sprite: 'runestones.png',
    category: 'material',
    goldPrice: 2,
    silverPrice: 15,
    itemType: 'material'
  },
  {
    id: 'crystal-shards',
    name: 'Crystal Shards',
    description: 'Fragments of mystical crystals',
    sprite: 'crystal-shards.png',
    category: 'material',
    goldPrice: 2,
    silverPrice: 20,
    itemType: 'material'
  },
  {
    id: 'cloth-squares',
    name: 'Cloth Squares',
    description: 'Basic fabric material',
    sprite: 'cloth-squares.png',
    category: 'material',
    goldPrice: 1,
    silverPrice: 10,
    itemType: 'material'
  },
  {
    id: 'stick-pile',
    name: 'Stick Pile',
    description: 'Bundle of wooden sticks',
    sprite: 'stick-pile.png',
    category: 'material',
    goldPrice: 1,
    silverPrice: 5,
    itemType: 'material'
  },
  {
    id: 'herb',
    name: 'Herb',
    description: 'Medicinal plant',
    sprite: 'herb.png',
    category: 'material',
    goldPrice: 1,
    silverPrice: 12,
    itemType: 'material'
  },
  // Scrolls - Healing
  {
    id: 'scroll-minor-healing',
    name: 'Scroll of Minor Healing',
    description: 'Restores 20 HP instantly (no dice required)',
    sprite: 'scroll.png',
    category: 'consumable',
    goldPrice: 3,
    silverPrice: 25,
    itemType: 'scroll'
  },
  {
    id: 'scroll-greater-healing',
    name: 'Scroll of Greater Healing',
    description: 'Restores 50 HP instantly (no dice required)',
    sprite: 'scroll-open.png',
    category: 'consumable',
    goldPrice: 5,
    silverPrice: 50,
    itemType: 'scroll'
  },
  {
    id: 'scroll-full-healing',
    name: 'Scroll of Full Healing',
    description: 'Restores 100 HP instantly (no dice required)',
    sprite: 'scroll-stack.png',
    category: 'consumable',
    goldPrice: 10,
    silverPrice: 100,
    itemType: 'scroll'
  },
  // Scrolls - Support
  {
    id: 'scroll-protection',
    name: 'Scroll of Protection',
    description: 'Grants +15 DEF for 3 turns (no dice required)',
    sprite: 'scroll.png',
    category: 'consumable',
    goldPrice: 4,
    silverPrice: 40,
    itemType: 'scroll'
  },
  {
    id: 'scroll-haste',
    name: 'Scroll of Haste',
    description: 'Grants +20 SPD for 3 turns (no dice required)',
    sprite: 'scroll-open.png',
    category: 'consumable',
    goldPrice: 5,
    silverPrice: 45,
    itemType: 'scroll'
  },
  {
    id: 'scroll-strength',
    name: 'Scroll of Strength',
    description: 'Grants +15 ATK for 3 turns (no dice required)',
    sprite: 'scroll-stack.png',
    category: 'consumable',
    goldPrice: 5,
    silverPrice: 50,
    itemType: 'scroll'
  },
  // Scrolls - Attack
  {
    id: 'scroll-fireball',
    name: 'Scroll of Fireball',
    description: 'Deals 25 fire damage to enemy (no dice required)',
    sprite: 'scroll.png',
    category: 'consumable',
    goldPrice: 6,
    silverPrice: 60,
    itemType: 'scroll'
  },
  {
    id: 'scroll-lightning',
    name: 'Scroll of Lightning',
    description: 'Deals 30 lightning damage to enemy (no dice required)',
    sprite: 'scroll-open.png',
    category: 'consumable',
    goldPrice: 7,
    silverPrice: 70,
    itemType: 'scroll'
  },
  {
    id: 'scroll-ice-blast',
    name: 'Scroll of Ice Blast',
    description: 'Deals 20 ice damage and reduces enemy SPD by 10 for 2 turns (no dice required)',
    sprite: 'scroll-stack.png',
    category: 'consumable',
    goldPrice: 7,
    silverPrice: 65,
    itemType: 'scroll'
  },
  // Scrolls - Curse
  {
    id: 'scroll-weakness',
    name: 'Scroll of Weakness',
    description: 'Reduces enemy ATK by 15 for 3 turns (no dice required)',
    sprite: 'scroll.png',
    category: 'consumable',
    goldPrice: 5,
    silverPrice: 45,
    itemType: 'scroll'
  },
  {
    id: 'scroll-poison',
    name: 'Scroll of Poison',
    description: 'Deals 10 poison damage per turn for 3 turns (no dice required)',
    sprite: 'scroll-open.png',
    category: 'consumable',
    goldPrice: 5,
    silverPrice: 50,
    itemType: 'scroll'
  },
  {
    id: 'scroll-confusion',
    name: 'Scroll of Confusion',
    description: 'Reduces enemy accuracy by 30% for 2 turns (no dice required)',
    sprite: 'scroll-stack.png',
    category: 'consumable',
    goldPrice: 6,
    silverPrice: 55,
    itemType: 'scroll'
  },
  // Very Rare Items
  {
    id: 'royal-sword',
    name: 'Royal Sword',
    description: 'Legendary blade fit for royalty (+40 ATK)',
    sprite: 'royal-sword.png',
    category: 'weapon',
    goldPrice: 5000,
    silverPrice: 50000,
    itemType: 'weapon'
  },
  {
    id: 'royal-armor',
    name: 'Royal Armor',
    description: 'Legendary armor forged for kings (+35 DEF)',
    sprite: 'royal-armor.png',
    category: 'armor',
    goldPrice: 5000,
    silverPrice: 50000,
    itemType: 'armor'
  },
  {
    id: 'gold-crown',
    name: 'Gold Crown',
    description: 'Magnificent golden crown adorned with gems (+50 DEF)',
    sprite: 'white-sack.png',
    category: 'armor',
    goldPrice: 8000,
    silverPrice: 80000,
    itemType: 'armor'
  },
  {
    id: 'silver-tiara',
    name: 'Silver Tiara',
    description: 'Elegant silver tiara fit for nobility (+45 DEF)',
    sprite: 'brown-sack.png',
    category: 'armor',
    goldPrice: 7000,
    silverPrice: 70000,
    itemType: 'armor'
  },
  {
    id: 'red-amulet',
    name: 'Red Amulet',
    description: 'Powerful amulet pulsing with crimson energy (+30 MP, +15 ATK)',
    sprite: 'summoning-circle-red.png',
    category: 'armor',
    goldPrice: 6000,
    silverPrice: 60000,
    itemType: 'accessory'
  },
  {
    id: 'purple-amulet',
    name: 'Purple Amulet',
    description: 'Mystical amulet radiating arcane power (+40 MP, +10 DEF)',
    sprite: 'summoning-circle-purple.png',
    category: 'armor',
    goldPrice: 6000,
    silverPrice: 60000,
    itemType: 'accessory'
  },
  // New Weapons
  {
    id: 'longsword',
    name: 'Longsword Sprite',
    description: 'A versatile blade favored by knights (+18 ATK)',
    sprite: 'longsword.png',
    category: 'weapon',
    goldPrice: 30,
    silverPrice: 300,
    itemType: 'weapon'
  },
  // New Armor
  {
    id: 'blue-robes',
    name: 'Blue Robes',
    description: 'Mystical robes that enhance magical power (+10 DEF, +10 MP)',
    sprite: 'blue-robes.png',
    category: 'armor',
    goldPrice: 25,
    silverPrice: 250,
    itemType: 'armor'
  },
  {
    id: 'red-robes',
    name: 'Red Robes',
    description: 'Enchanted robes infused with fire magic (+10 DEF, +5 ATK)',
    sprite: 'red-robes.png',
    category: 'armor',
    goldPrice: 25,
    silverPrice: 250,
    itemType: 'armor'
  }
];

export const getCategoryItems = (category: StoreItem['category']) => {
  return STORE_ITEMS.filter(item => item.category === category);
};

export const getItemByName = (name: string) => {
  return STORE_ITEMS.find(item => item.name === name);
};
