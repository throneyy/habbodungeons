export interface StoreItem {
  id: string;
  name: string;
  description: string;
  sprite: string;
  category: 'consumable' | 'weapon' | 'material';
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
    goldPrice: 20,
    silverPrice: 2,
    itemType: 'consumable'
  },
  {
    id: 'ether',
    name: 'Ether',
    description: 'Restores 40 MP',
    sprite: 'elixer.png',
    category: 'consumable',
    goldPrice: 25,
    silverPrice: 3,
    itemType: 'consumable'
  },
  {
    id: 'elixir',
    name: 'Elixir',
    description: 'Restores 50 MP',
    sprite: 'elixer.png',
    category: 'consumable',
    goldPrice: 30,
    silverPrice: 3,
    itemType: 'consumable'
  },
  // Consumables - Food
  {
    id: 'sweetcakes',
    name: 'Sweetcakes',
    description: 'Restores 15 HP',
    sprite: 'sweetcakes.png',
    category: 'consumable',
    goldPrice: 10,
    silverPrice: 1,
    itemType: 'consumable'
  },
  {
    id: 'frothy-pint',
    name: 'Frothy Pint',
    description: 'Restores 20 HP',
    sprite: 'frothy-pint.png',
    category: 'consumable',
    goldPrice: 15,
    silverPrice: 2,
    itemType: 'consumable'
  },
  {
    id: 'cured-meat',
    name: 'Cured Meat',
    description: 'Restores 25 HP',
    sprite: 'cured-meat.png',
    category: 'consumable',
    goldPrice: 20,
    silverPrice: 2,
    itemType: 'consumable'
  },
  // Weapons
  {
    id: 'rusty-sword',
    name: 'Rusty Sword',
    description: "An old, rusty sword. It's seen better days but still sharp enough to be useful. (+5 ATK, +2 DEF)",
    sprite: '', // Will use AI-generated icon
    category: 'weapon',
    goldPrice: 50,
    silverPrice: 5,
    itemType: 'weapon'
  },
  {
    id: 'ice-dagger',
    name: 'Ice Dagger',
    description: 'A frost-enchanted dagger that chills enemies (+8 ATK, +5 DEF)',
    sprite: '', // Will use AI-generated icon
    category: 'weapon',
    goldPrice: 120,
    silverPrice: 12,
    itemType: 'weapon'
  },
  {
    id: 'fighters-sword',
    name: 'Fighters Sword',
    description: 'A sturdy blade (+15 ATK)',
    sprite: 'fighters-sword.png',
    category: 'weapon',
    goldPrice: 200,
    silverPrice: 20,
    itemType: 'weapon'
  },
  {
    id: 'mage-staff',
    name: 'Mage Staff',
    description: 'Arcane weapon (+10 ATK, +20 MP)',
    sprite: 'mage-staff.png',
    category: 'weapon',
    goldPrice: 250,
    silverPrice: 25,
    itemType: 'weapon'
  },
  {
    id: 'bow-and-arrow',
    name: 'Bow and Arrow',
    description: 'Ranged weapon (+12 ATK)',
    sprite: 'bow-and-arrow.png',
    category: 'weapon',
    goldPrice: 180,
    silverPrice: 18,
    itemType: 'weapon'
  },
  // Materials
  {
    id: 'runestones',
    name: 'Runestones',
    description: 'Magical stones for crafting',
    sprite: 'runestones.png',
    category: 'material',
    goldPrice: 15,
    silverPrice: 2,
    itemType: 'material'
  },
  {
    id: 'crystal-shards',
    name: 'Crystal Shards',
    description: 'Fragments of mystical crystals',
    sprite: 'crystal-shards.png',
    category: 'material',
    goldPrice: 20,
    silverPrice: 2,
    itemType: 'material'
  },
  {
    id: 'cloth-squares',
    name: 'Cloth Squares',
    description: 'Basic fabric material',
    sprite: 'cloth-squares.png',
    category: 'material',
    goldPrice: 10,
    silverPrice: 1,
    itemType: 'material'
  },
  {
    id: 'stick-pile',
    name: 'Stick Pile',
    description: 'Bundle of wooden sticks',
    sprite: 'stick-pile.png',
    category: 'material',
    goldPrice: 5,
    silverPrice: 1,
    itemType: 'material'
  },
  {
    id: 'metal-ingot',
    name: 'Metal Ingot',
    description: 'Refined metal for crafting',
    sprite: 'metal-ingot.png',
    category: 'material',
    goldPrice: 25,
    silverPrice: 3,
    itemType: 'material'
  },
  {
    id: 'herb',
    name: 'Herb',
    description: 'Medicinal plant',
    sprite: 'herb.png',
    category: 'material',
    goldPrice: 12,
    silverPrice: 1,
    itemType: 'material'
  },
  // Scrolls - Healing
  {
    id: 'scroll-minor-healing',
    name: 'Scroll of Minor Healing',
    description: 'Restores 20 HP instantly (no dice required)',
    sprite: 'scroll.png',
    category: 'consumable',
    goldPrice: 25,
    silverPrice: 3,
    itemType: 'scroll'
  },
  {
    id: 'scroll-greater-healing',
    name: 'Scroll of Greater Healing',
    description: 'Restores 50 HP instantly (no dice required)',
    sprite: 'scroll-open.png',
    category: 'consumable',
    goldPrice: 50,
    silverPrice: 5,
    itemType: 'scroll'
  },
  {
    id: 'scroll-full-healing',
    name: 'Scroll of Full Healing',
    description: 'Restores 100 HP instantly (no dice required)',
    sprite: 'scroll-stack.png',
    category: 'consumable',
    goldPrice: 100,
    silverPrice: 10,
    itemType: 'scroll'
  },
  // Scrolls - Support
  {
    id: 'scroll-protection',
    name: 'Scroll of Protection',
    description: 'Grants +15 DEF for 3 turns (no dice required)',
    sprite: 'scroll.png',
    category: 'consumable',
    goldPrice: 40,
    silverPrice: 4,
    itemType: 'scroll'
  },
  {
    id: 'scroll-haste',
    name: 'Scroll of Haste',
    description: 'Grants +20 SPD for 3 turns (no dice required)',
    sprite: 'scroll-open.png',
    category: 'consumable',
    goldPrice: 45,
    silverPrice: 5,
    itemType: 'scroll'
  },
  {
    id: 'scroll-strength',
    name: 'Scroll of Strength',
    description: 'Grants +15 ATK for 3 turns (no dice required)',
    sprite: 'scroll-stack.png',
    category: 'consumable',
    goldPrice: 50,
    silverPrice: 5,
    itemType: 'scroll'
  },
  // Scrolls - Attack
  {
    id: 'scroll-fireball',
    name: 'Scroll of Fireball',
    description: 'Deals 25 fire damage to enemy (no dice required)',
    sprite: 'scroll.png',
    category: 'consumable',
    goldPrice: 60,
    silverPrice: 6,
    itemType: 'scroll'
  },
  {
    id: 'scroll-lightning',
    name: 'Scroll of Lightning',
    description: 'Deals 30 lightning damage to enemy (no dice required)',
    sprite: 'scroll-open.png',
    category: 'consumable',
    goldPrice: 70,
    silverPrice: 7,
    itemType: 'scroll'
  },
  {
    id: 'scroll-ice-blast',
    name: 'Scroll of Ice Blast',
    description: 'Deals 20 ice damage and reduces enemy SPD by 10 for 2 turns (no dice required)',
    sprite: 'scroll-stack.png',
    category: 'consumable',
    goldPrice: 65,
    silverPrice: 7,
    itemType: 'scroll'
  },
  // Scrolls - Curse
  {
    id: 'scroll-weakness',
    name: 'Scroll of Weakness',
    description: 'Reduces enemy ATK by 15 for 3 turns (no dice required)',
    sprite: 'scroll.png',
    category: 'consumable',
    goldPrice: 45,
    silverPrice: 5,
    itemType: 'scroll'
  },
  {
    id: 'scroll-poison',
    name: 'Scroll of Poison',
    description: 'Deals 10 poison damage per turn for 3 turns (no dice required)',
    sprite: 'scroll-open.png',
    category: 'consumable',
    goldPrice: 50,
    silverPrice: 5,
    itemType: 'scroll'
  },
  {
    id: 'scroll-confusion',
    name: 'Scroll of Confusion',
    description: 'Reduces enemy accuracy by 30% for 2 turns (no dice required)',
    sprite: 'scroll-stack.png',
    category: 'consumable',
    goldPrice: 55,
    silverPrice: 6,
    itemType: 'scroll'
  }
];

export const getCategoryItems = (category: StoreItem['category']) => {
  return STORE_ITEMS.filter(item => item.category === category);
};

export const getItemByName = (name: string) => {
  return STORE_ITEMS.find(item => item.name === name);
};
