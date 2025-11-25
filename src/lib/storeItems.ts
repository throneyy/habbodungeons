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
    description: 'Basic weapon for beginners',
    sprite: 'fighters-sword.png',
    category: 'weapon',
    goldPrice: 50,
    silverPrice: 5,
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
  }
];

export const getCategoryItems = (category: StoreItem['category']) => {
  return STORE_ITEMS.filter(item => item.category === category);
};

export const getItemByName = (name: string) => {
  return STORE_ITEMS.find(item => item.name === name);
};
