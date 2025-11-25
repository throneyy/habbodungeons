import bookOfWolvesImg from "@/assets/book-of-wolves.png";
import bookOfRatsImg from "@/assets/book-of-rats.png";
import bookOfDrakesImg from "@/assets/book-of-drakes.png";
import bookOfPhoenixesImg from "@/assets/book-of-phoenixes.png";
import bookOfGoblinsImg from "@/assets/book-of-goblins.png";
import bookOfGryphonsImg from "@/assets/book-of-gryphons.png";

export interface MaterialCost {
  itemName: string;
  quantity: number;
}

export interface DailyBook {
  id: string;
  name: string;
  description: string;
  sprite: string;
  summonType: string;
  materialCosts: MaterialCost[];
}

const AVAILABLE_MATERIALS = [
  'Runestones',
  'Pouch of Frost-Kissed Dust',
  'Stick Pile',
  'Crystal Shards',
  'Cloth Squares',
  'Herbs'
];

const ALL_BOOKS = [
  {
    id: 'book_of_wolves',
    name: 'Book of Ancient Treants',
    description: 'Summon the ancient guardians of the forest. These wise treants bring nature\'s fury.',
    sprite: bookOfWolvesImg,
    summonType: 'Ancient Treant'
  },
  {
    id: 'book_of_rats',
    name: 'Book of Azure Dragons',
    description: 'Call forth the legendary azure dragons. Masters of the skies and arcane power.',
    sprite: bookOfRatsImg,
    summonType: 'Azure Dragon'
  },
  {
    id: 'book_of_drakes',
    name: 'Book of Emerald Drakes',
    description: 'Summon powerful emerald drakes. These majestic creatures wield devastating nature magic.',
    sprite: bookOfDrakesImg,
    summonType: 'Emerald Drake'
  },
  {
    id: 'book_of_phoenixes',
    name: 'Book of Phoenixes',
    description: 'Bind phoenixes to your will. These legendary birds bring fire and rebirth.',
    sprite: bookOfPhoenixesImg,
    summonType: 'Phoenix'
  },
  {
    id: 'book_of_goblins',
    name: 'Book of Slumber Bears',
    description: 'Command the mighty slumber bears. These gentle giants awaken to protect their allies.',
    sprite: bookOfGoblinsImg,
    summonType: 'Slumber Bear'
  },
  {
    id: 'book_of_gryphons',
    name: 'Book of Gryphons',
    description: 'Summon noble gryphons. These legendary guardians combine the strength of lions with the majesty of eagles.',
    sprite: bookOfGryphonsImg,
    summonType: 'Gryphon'
  }
];

// Generate deterministic random costs based on date seed
function getDailySeed(): number {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function shuffleArray<T>(array: T[], seed: number): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getDailyBooks(): DailyBook[] {
  const seed = getDailySeed();
  
  // Shuffle books and select 3 for today
  const shuffledBooks = shuffleArray(ALL_BOOKS, seed);
  const todaysBooks = shuffledBooks.slice(0, 3);
  
  // Generate random material costs for each book
  return todaysBooks.map((book, index) => {
    const bookSeed = seed + index * 1000;
    
    // Each book requires 2-4 different materials
    const numMaterials = 2 + Math.floor(seededRandom(bookSeed) * 3);
    const shuffledMaterials = shuffleArray(AVAILABLE_MATERIALS, bookSeed);
    const selectedMaterials = shuffledMaterials.slice(0, numMaterials);
    
    const materialCosts: MaterialCost[] = selectedMaterials.map((material, matIndex) => {
      // Higher rarity books need more materials (10-50 for common, 20-100 for rare)
      const baseAmount = 10 + Math.floor(seededRandom(bookSeed + matIndex) * 40);
      const multiplier = index === 0 ? 1.5 : index === 1 ? 1.0 : 2.0;
      const quantity = Math.floor(baseAmount * multiplier);
      
      return {
        itemName: material,
        quantity
      };
    });
    
    return {
      ...book,
      materialCosts
    };
  });
}

export function getMaterialImage(itemName: string): string {
  const imageMap: Record<string, string> = {
    'Runestones': '/src/assets/runestones.png',
    'Pouch of Frost-Kissed Dust': '/src/assets/pouch.png',
    'Stick Pile': '/src/assets/stick-pile.png',
    'Crystal Shards': '/src/assets/crystal-shards.png',
    'Cloth Squares': '/src/assets/cloth-squares.png',
    'Herbs': '/src/assets/herb.png'
  };
  return imageMap[itemName] || '/src/assets/mystical-icon.png';
}
