// Equipment, ported in spirit from v1's item catalog but rescaled to the M1
// tactics economy (atk ~9-13, def ~2-7, hp ~22-40), so a bonus of +2 is a real
// upgrade rather than v1's +20/+45 numbers. Three slots per unit:
// weapon / armor / trinket. Bonuses are summed into a unit's stats at battle
// instantiation (see run.js applyEquipment).
export const RARITY = {
  common: { name: 'Common', color: '#b8b0a0', weight: 50 },
  uncommon: { name: 'Uncommon', color: '#5fbf6a', weight: 28 },
  rare: { name: 'Rare', color: '#4f8fd0', weight: 15 },
  epic: { name: 'Epic', color: '#a05fd0', weight: 6 },
  legendary: { name: 'Legendary', color: '#f6c343', weight: 1 },
};

// id -> item. bonus keys map onto Unit.stats (maxHp, atk, def, spd, move).
// `icon` is a REAL extracted furni id (assets/props) whose art represents the
// item — mostly the fantasy `clothing_*` display-stand line — drawn into the
// Hand's sockets so inventory icons are authentic Habbo pixels, not
// procedural stand-ins.
export const ITEMS = {
  // ---- weapons (+atk) ----
  rusty_blade: { name: 'Rusty Blade', slot: 'weapon', rarity: 'common', bonus: { atk: 1 }, blurb: 'Chipped, but it bites.', icon: 'clothing_backkatana' },
  iron_sword: { name: 'Iron Sword', slot: 'weapon', rarity: 'uncommon', bonus: { atk: 2 }, blurb: 'Honest steel.', icon: 'clothing_fantasysword' },
  emberedge: { name: 'Emberedge', slot: 'weapon', rarity: 'uncommon', bonus: { atk: 2, spd: 1 }, blurb: 'A blade that never cools.', icon: 'br_phoenix' },
  frostbrand: { name: 'Frostbrand', slot: 'weapon', rarity: 'rare', bonus: { atk: 3 }, blurb: 'Rimed with eternal winter.', icon: 'vikings_weapon' },
  arcane_staff: { name: 'Arcane Staff', slot: 'weapon', rarity: 'rare', bonus: { atk: 3 }, blurb: 'Channels magical energy for devastating spells.', icon: 'clothing_fantasystaff' },
  ancient_staff: { name: 'Ancient Staff', slot: 'weapon', rarity: 'epic', bonus: { atk: 4 }, blurb: 'An ancient staff pulsing with arcane power.', icon: 'clothing_ultrafantasystaff' },
  kingslayer: { name: 'Kingslayer', slot: 'weapon', rarity: 'legendary', bonus: { atk: 5, spd: 1 }, blurb: 'It has tasted crowns.', icon: 'clothing_ultrafantasysword' },

  // ---- armor (+def, some +hp) ----
  padded_vest: { name: 'Padded Vest', slot: 'armor', rarity: 'common', bonus: { def: 1 }, blurb: 'Better than nothing.', figure: { ch: '3848-91' }, icon: 'clothing_rebelchest' },
  villager_tunic: { name: 'Villager Tunic', slot: 'armor', rarity: 'common', bonus: { def: 1 }, blurb: 'Smells faintly of hay.', figure: { ch: '215-82' }, icon: 'clothing_fantasyvillager' },
  body_bandage: { name: 'Body Bandage', slot: 'armor', rarity: 'common', bonus: { maxHp: 4 }, blurb: 'Holds you together. Literally.', figure: { ch: '215-92' }, icon: 'clothing_bandagedtorso' },
  iron_leg_armour: { name: 'Iron Leg Armour', slot: 'armor', rarity: 'common', bonus: { def: 1 }, blurb: 'Shin-deep in safety.', figure: { lg: '3449-92' }, icon: 'clothing_legarmour' },
  iron_helmet: { name: 'Iron Helmet', slot: 'armor', rarity: 'uncommon', bonus: { def: 2 }, blurb: 'Rings like a bell when struck.', figure: { ha: '6052-92' }, icon: 'clothing_herohelmet' },
  horned_helmet: { name: 'Horned Helmet', slot: 'armor', rarity: 'uncommon', bonus: { def: 1, atk: 1 }, blurb: 'Half protection, half intimidation.', figure: { ha: '6052-61' }, icon: 'clothing_badasshelmet' },
  fantasy_cape: { name: 'Fantasy Cape', slot: 'armor', rarity: 'rare', bonus: { def: 2, spd: 1 }, blurb: 'Billows even indoors.', figure: { cc: '3448-64' }, icon: 'clothing_fantasycape' },
  mushroom_cape: { name: 'Mushroom Cape', slot: 'armor', rarity: 'uncommon', bonus: { def: 1, maxHp: 4 }, blurb: 'Spongy, spotted, strangely sturdy.', figure: { cc: '3448-96' }, icon: 'clothing_r25_mushroomcape' },
  chainmail: { name: 'Chainmail', slot: 'armor', rarity: 'uncommon', bonus: { def: 2 }, blurb: 'Reassuringly heavy.', figure: { ch: '6051-92' }, icon: 'clothing_herochest' },
  fire_robes: { name: 'Fire Robes', slot: 'armor', rarity: 'uncommon', bonus: { def: 1, maxHp: 4 }, blurb: 'Enchanted robes infused with fire magic.', figure: { ch: '3848-96' }, icon: 'clothing_witchrobes' },
  wizard_robes: { name: 'Wizard Robes', slot: 'armor', rarity: 'rare', bonus: { def: 2, maxHp: 4 }, blurb: 'Ancient robes worn by powerful wizards.', figure: { ch: '6275-92' }, icon: 'easter_c20_lightprize4' },
  kingsguard_plate: { name: 'Kingsguard Plate', slot: 'armor', rarity: 'epic', bonus: { def: 4 }, blurb: 'Legendary armor forged for kings.', figure: { ch: '6051-92', lg: '3449-92', ha: '6052-92' }, icon: 'clothing_r22_princearmour' },
  adorned_cape: { name: 'Adorned Fantasy Cape', slot: 'armor', rarity: 'legendary', bonus: { def: 4, maxHp: 6 }, blurb: 'Woven for the end of a very long story.', figure: { cc: '3448-110' }, icon: 'clothing_ultrafantasycape' },

  // ---- trinkets (utility) ----
  comedy_mask: { name: 'Comedy Mask', slot: 'trinket', rarity: 'common', bonus: { spd: 1 }, blurb: 'Laugh first, dodge second.', icon: 'clothing_r19_comedymask' },
  tragedy_mask: { name: 'Tragedy Mask', slot: 'trinket', rarity: 'common', bonus: { def: 1 }, blurb: 'Grief makes a fine armor.', icon: 'clothing_r19_tragedymask' },
  semi_muttonchop: { name: 'Semi Muttonchop', slot: 'trinket', rarity: 'common', bonus: { def: 1 }, blurb: 'Half committed to the innkeeper life.', icon: 'clothing_mutton1' },
  greek_shield: { name: 'Ancient Greek Shield', slot: 'trinket', rarity: 'common', bonus: { def: 1 }, blurb: 'Come back with it, or on it.', icon: 'greek_c19_shield1' },
  head_bandage: { name: 'Head Bandage', slot: 'trinket', rarity: 'common', bonus: { maxHp: 4 }, blurb: 'A badge of lessons learned.', icon: 'clothing_bandagedhead' },
  bat_hat: { name: 'Vampire Bat Hat', slot: 'trinket', rarity: 'common', bonus: { atk: 1 }, blurb: 'It squeaks when you charge.', icon: 'clothing_r17_bathat' },
  swift_boots: { name: 'Swift Boots', slot: 'trinket', rarity: 'uncommon', bonus: { move: 1 }, blurb: 'Ground-eating stride.', icon: 'hween_c25_arrow' },
  archer_cap: { name: 'Archer Cap', slot: 'trinket', rarity: 'uncommon', bonus: { atk: 1, spd: 1 }, blurb: 'A feather for every bullseye.', icon: 'clothing_archerhat' },
  gold_band: { name: 'Fantasy Gold Band', slot: 'trinket', rarity: 'uncommon', bonus: { maxHp: 4, spd: 1 }, blurb: 'The crown\u2019s humbler cousin.', icon: 'clothing_fantasyheadpiece' },
  king_beard: { name: 'King Beard', slot: 'trinket', rarity: 'uncommon', bonus: { maxHp: 4, atk: 1 }, blurb: 'Braided by generations of stubborn kings.', icon: 'clothing_beard1' },
  full_muttonchop: { name: 'Full Muttonchop', slot: 'trinket', rarity: 'uncommon', bonus: { def: 1, maxHp: 4 }, blurb: 'Fully committed to the innkeeper life.', icon: 'clothing_mutton2' },
  plague_mask: { name: 'Plague Mask', slot: 'trinket', rarity: 'uncommon', bonus: { def: 1, maxHp: 4 }, blurb: 'The beak is stuffed with herbs.', icon: 'clothing_plaguemask' },
  dark_earth_pony: { name: 'Dark Earth Pony', slot: 'trinket', rarity: 'uncommon', bonus: { move: 1 }, blurb: 'Small, ominous, surprisingly fast.', icon: 'easter_c20_darkprize2' },
  vigor_charm: { name: 'Vigor Charm', slot: 'trinket', rarity: 'uncommon', bonus: { maxHp: 6 }, blurb: 'A steady heartbeat.', icon: 'clothing_fantasynecklace' },
  warding_amulet: { name: 'Warding Amulet', slot: 'trinket', rarity: 'rare', bonus: { def: 1, maxHp: 5 }, blurb: 'Turns aside ill fortune.', icon: 'clothing_ultrafantasynecklace' },
  witch_hat: { name: 'Witch Hat', slot: 'trinket', rarity: 'rare', bonus: { atk: 2, maxHp: 4 }, blurb: 'Pointed in every sense.', icon: 'clothing_witchhat2' },
  // the Easter 2020 light/dark prize lines: matched pairs, dark strikes, light shields
  dark_relic: { name: 'Dark Relic', slot: 'trinket', rarity: 'rare', bonus: { atk: 2, spd: 1 }, blurb: 'It remembers being worshipped.', icon: 'easter_c20_darkprize1' },
  light_jade_dragon: { name: 'Light Jade Dragon', slot: 'trinket', rarity: 'rare', bonus: { def: 2, maxHp: 4 }, blurb: 'Coiled calm, carved luck.', icon: 'easter_c20_lightprize2' },
  aegis_shield: { name: 'Polished Greek Shield', slot: 'trinket', rarity: 'rare', bonus: { def: 2, maxHp: 4 }, blurb: 'Mirror-bright; monsters hate that.', icon: 'greek_c19_shield2' },
  dark_crown: { name: 'Dark Crown', slot: 'trinket', rarity: 'rare', bonus: { atk: 2, def: 1 }, blurb: 'Free to take. Costly to wear.', icon: 'clothing_darkcrown' },
  star_circlet: { name: 'Star Circlet', slot: 'trinket', rarity: 'rare', bonus: { maxHp: 5, spd: 1 }, blurb: 'Seven stars, none of them yours.', icon: 'clothing_starcrown' },
  villain_horns: { name: 'Villainous Horns', slot: 'trinket', rarity: 'rare', bonus: { atk: 2, spd: 1 }, blurb: 'For when diplomacy is over.', icon: 'clothing_r22_villainhornsa' },
  medusa_hair: { name: 'Medusa Hair', slot: 'trinket', rarity: 'epic', bonus: { atk: 2, def: 2 }, blurb: 'Do not make eye contact.', icon: 'clothing_r19_medusa' },
  minotaur_horns: { name: 'Minotaur Horns', slot: 'trinket', rarity: 'epic', bonus: { atk: 3, maxHp: 4 }, blurb: 'The labyrinth remembers.', icon: 'clothing_r19_minotaurhorns' },
  faerie_wings: { name: 'Faerie Wings', slot: 'trinket', rarity: 'epic', bonus: { move: 1, spd: 2 }, blurb: 'Almost weightless. Almost.', icon: 'clothing_r25_illusenwings' },
  dark_monument: { name: 'Dark Master Monument', slot: 'trinket', rarity: 'epic', bonus: { atk: 3, spd: 1 }, blurb: 'A trophy from a war best forgotten.', icon: 'easter_c20_darkprize3' },
  light_protector: { name: 'Light Royal Protector', slot: 'trinket', rarity: 'epic', bonus: { def: 3, maxHp: 4 }, blurb: 'It stands watch so you can sleep.', icon: 'easter_c20_lightprize3' },
  gold_crown: { name: 'Fantasy Gold Crown', slot: 'trinket', rarity: 'epic', bonus: { def: 2, maxHp: 6 }, blurb: 'Rule wisely, duck quickly.', icon: 'clothing_ultrafantasyheadpiece' },
  silver_tiara: { name: 'Silver Tiara', slot: 'trinket', rarity: 'legendary', bonus: { def: 3, maxHp: 6 }, blurb: 'An elegant silver tiara fit for nobility.', icon: 'clothing_r17_hweencrown' },
  dark_imperial_crown: { name: 'Dark Imperial Crown', slot: 'trinket', rarity: 'legendary', bonus: { atk: 3, def: 2 }, blurb: 'Heavy is the head. Heavier is everyone else.', icon: 'easter_c20_darkprize4' },
};

// Consumables: one-shot potions and curios that live in the backpack next to
// equipment but are USED, not worn. `effect` is applied by main.js
// (useConsumable): heal = leader, healAll = whole living squad, revive =
// first fallen member at half HP, xp = leader experience. Icons are real
// extracted furni (the fantasy potion line and friends).
export const CONSUMABLES = {
  health_potion: { name: 'Health Potion', rarity: 'common', effect: { kind: 'heal', n: 8 }, effectText: 'Restores 8 HP', blurb: 'Tastes like cherries. Mostly.', icon: 'fantasy_c22_redpotion' },
  grand_elixir: { name: 'Grand Elixir', rarity: 'rare', effect: { kind: 'heal', n: 999 }, effectText: 'Fully restores HP', blurb: 'The whole bottle, every drop.', icon: 'fantasy_c22_bluepotion' },
  witchs_brew: { name: "Witch's Brew", rarity: 'uncommon', effect: { kind: 'healAll', n: 5 }, effectText: 'Restores 5 HP to the whole party', blurb: 'Do not ask what floats in it.', icon: 'hween_c19_potions' },
  revival_crystal: { name: 'Revival Crystal', rarity: 'epic', effect: { kind: 'revive' }, effectText: 'Revives a fallen hero at half HP', blurb: 'It hums with a second chance.', icon: 'fantasy_c22_crystal' },
  rune_of_knowledge: { name: 'Rune of Knowledge', rarity: 'uncommon', effect: { kind: 'xp', n: 2 }, effectText: 'Grants 2 XP', blurb: 'The stone whispers old lessons.', icon: 'fantasy_c22_rune' },
  strength_tonic: { name: 'Strength Tonic', rarity: 'uncommon', effect: { kind: 'heal', n: 4 }, effectText: 'Restores 4 HP', blurb: 'Green, fizzy, and full of spinach.', icon: 'fantasy_c22_greenpotion' },
};

// Anything a backpack can hold: equipment or consumable.
export function anyItem(id) {
  return ITEMS[id] || CONSUMABLES[id] || null;
}

export function isConsumable(id) {
  return !!CONSUMABLES[id];
}

export function item(id) {
  return ITEMS[id] ? { id, ...ITEMS[id] } : null;
}

export function rarityOf(id) {
  return RARITY[anyItem(id)?.rarity] || RARITY.common;
}

// Human-readable bonus string, e.g. "+2 ATK, +4 HP".
export function bonusText(id) {
  const b = ITEMS[id]?.bonus || {};
  const label = { atk: 'ATK', def: 'DEF', maxHp: 'HP', spd: 'SPD', move: 'MOV' };
  return Object.entries(b)
    .map(([k, v]) => `+${v} ${label[k] || k.toUpperCase()}`)
    .join(', ');
}

// Sum equipment bonuses (array of item ids) into a single bonus object.
export function sumBonuses(ids = []) {
  const total = { maxHp: 0, atk: 0, def: 0, spd: 0, move: 0 };
  for (const id of ids) {
    const b = ITEMS[id]?.bonus;
    if (!b) continue;
    for (const k of Object.keys(b)) total[k] = (total[k] || 0) + b[k];
  }
  return total;
}

// Dress a habbo-imaging figure string in equipped armor: the armor item's
// part overrides (ch/lg/ha...) replace the base figure's same-type parts, so
// the avatar visibly WEARS what's in the armor slot. Non-armor equipment and
// missing items leave the figure untouched.
export function figureWithArmor(baseFigure, equipment = {}) {
  const fig = ITEMS[equipment.armor]?.figure;
  if (!fig) return baseFigure;
  const parts = new Map(baseFigure.split('.').filter(Boolean).map((p) => [p.split('-')[0], p]));
  for (const [type, spec] of Object.entries(fig)) parts.set(type, `${type}-${spec}`);
  return [...parts.values()].join('.');
}

// Weighted random pick of a rarity, biased toward better loot as `depth`
// (battle number, 1-based) increases. rng() defaults to Math.random.
export function rollRarity(depth = 1, rng = Math.random) {
  const boost = 1 + (depth - 1) * 0.6; // deeper battles tilt toward rarity
  const entries = Object.entries(RARITY).map(([key, r], i) => {
    const rarityRank = i; // common=0 ... legendary=4
    const w = r.weight * (rarityRank === 0 ? 1 : boost ** rarityRank * 0.15 + 1);
    return { key, w };
  });
  const total = entries.reduce((s, e) => s + e.w, 0);
  let x = rng() * total;
  for (const e of entries) {
    if ((x -= e.w) <= 0) return e.key;
  }
  return 'common';
}

// Roll a concrete item id of a depth-appropriate rarity.
export function rollItem(depth = 1, rng = Math.random) {
  const rarity = rollRarity(depth, rng);
  let pool = Object.keys(ITEMS).filter((id) => ITEMS[id].rarity === rarity);
  if (!pool.length) pool = Object.keys(ITEMS);
  return pool[Math.floor(rng() * pool.length)];
}
