// Origins-gated battle skill trees (M3 — the "your real Habbo matters" hook).
//
// In Habbo Hotel: Origins, Fishing and Gardening are real skills (levels 1–99).
// A linked player's fishing/gardening level is read from Bobba's public API
// (see server.js /api/habbo/skills) and unlocks the matching battle skills for
// their leader — the unit rendered as their actual Habbo avatar.
//
// Skill spec shape — a SUPERSET of the class skills in classes.js, so battle.js
// resolves both uniformly:
//   { id, name, tree, kind, target, range, radius, power, cost?, status?, buff?, blurb, req }
//     kind   : 'heal' | 'buff' | 'shield' | 'damage'
//     target : 'ally' | 'enemy' | 'self'
//     radius : 0 = single tile; N = Chebyshev blast around the target tile
//     cost   : MP spent to cast (battle.canAfford). OMITTED MEANS FREE — that
//              default is load-bearing: legacy and duel-only specs, and any
//              future skill, keep working unpriced, so only what is explicitly
//              costed is ever limited.
//     status : applied to enemies hit by a 'damage' skill, e.g. { rooted: 1 }
//     buff   : granted by a 'buff' skill, e.g. { atk: 5 }
//     req    : { skill: 'fishing' | 'gardening', level: N } — the unlock gate
//
// Unlock thresholds are spread across the 1–99 range so partial Origins progress
// unlocks a partial tree. They're deliberately tunable (balance is M5).
//
// Costs track the UNLOCK THRESHOLD rather than the power number, so grinding
// Origins buys reach rather than free power: the level-90 capstones cost 10–12,
// which even a Mage (18 MP) can afford exactly once.

export const SKILL_TREES = {
  water: {
    name: 'Water', gatedBy: 'fishing', color: '#3fa9d6',
    blurb: 'Fisherfolk magic: nets, tides, and the things below.',
    skills: [
      { id: 'net', name: 'Net', kind: 'damage', target: 'enemy', range: 3, radius: 0, power: 8, cost: 4, status: { rooted: 1 },
        blurb: 'Fling a weighted net: damages and roots a single foe.', req: { skill: 'fishing', level: 5 } },
      { id: 'foam_barrier', name: 'Foam Barrier', kind: 'shield', target: 'ally', range: 2, radius: 0, power: 12, cost: 5,
        blurb: 'A wall of foam shields an ally from the next blows.', req: { skill: 'fishing', level: 20 } },
      { id: 'tidal_wave', name: 'Tidal Wave', kind: 'damage', target: 'enemy', range: 3, radius: 1, power: 9, cost: 7,
        blurb: 'A crashing wave hits the target and everything around it.', req: { skill: 'fishing', level: 40 } },
      { id: 'whirlpool', name: 'Whirlpool', kind: 'damage', target: 'enemy', range: 3, radius: 1, power: 7, cost: 8, status: { rooted: 1 },
        blurb: 'A sucking vortex damages and roots a cluster of foes.', req: { skill: 'fishing', level: 65 } },
      { id: 'deep_sea_beast', name: 'Deep Sea Beast', kind: 'damage', target: 'enemy', range: 3, radius: 1, power: 14, cost: 12,
        blurb: 'Summon the leviathan: devastating area ruin.', req: { skill: 'fishing', level: 90 } },
    ],
  },
  nature: {
    name: 'Nature', gatedBy: 'gardening', color: '#5fbf6a',
    blurb: 'Gardener magic: growth, blessing, and creeping rot.',
    skills: [
      { id: 'sapling_barrier', name: 'Sapling Barrier', kind: 'shield', target: 'ally', range: 2, radius: 1, power: 8, cost: 4,
        blurb: 'Saplings spring up, shielding you and nearby allies.', req: { skill: 'gardening', level: 5 } },
      { id: 'life_wave', name: 'Life Wave', kind: 'heal', target: 'ally', range: 2, radius: 1, power: 10, cost: 6,
        blurb: 'A pulse of life heals allies around the target.', req: { skill: 'gardening', level: 20 } },
      { id: 'natures_blessing', name: "Nature's Blessing", kind: 'buff', target: 'ally', range: 2, radius: 1, power: 5, cost: 7, buff: { atk: 5 },
        blurb: 'Bless nearby allies: their next strikes hit harder.', req: { skill: 'gardening', level: 40 } },
      { id: 'decaying_flowers', name: 'Decaying Flowers', kind: 'damage', target: 'enemy', range: 3, radius: 1, power: 8, cost: 7,
        blurb: 'Rot blooms among foes, damaging a whole cluster.', req: { skill: 'gardening', level: 65 } },
      { id: 'thorns', name: 'Thorns', kind: 'damage', target: 'self', range: 0, radius: 1, power: 10, cost: 10,
        blurb: 'Erupting thorns gore every foe adjacent to you.', req: { skill: 'gardening', level: 90 } },
    ],
  },
};

// id -> spec (with a `tree` tag added), flattened for lookup.
export const ALL_TREE_SKILLS = {};
for (const [treeId, tree] of Object.entries(SKILL_TREES)) {
  for (const s of tree.skills) {
    s.tree = treeId;
    ALL_TREE_SKILLS[s.id] = s;
  }
}

// Which tree-skill ids are unlocked at the given Origins skill levels.
// Returned in tree/level order (Water then Nature, each ascending) for display.
export function unlockedTreeSkills(fishingLevel = 0, gardeningLevel = 0) {
  const levels = { fishing: fishingLevel || 0, gardening: gardeningLevel || 0 };
  const ids = [];
  for (const s of Object.values(ALL_TREE_SKILLS)) {
    if ((levels[s.req.skill] || 0) >= s.req.level) ids.push(s.id);
  }
  return ids;
}

// Resolve an array of skill ids to their specs (unknown ids dropped).
export function treeSkillSpecs(ids = []) {
  return ids.map((id) => ALL_TREE_SKILLS[id]).filter(Boolean);
}

// ---- how a skill reads in the HUD ------------------------------------------

// A spec -> the copy the battle panel shows when you pick that skill.
//
// DERIVED FROM THE SPEC, never hand-written per skill: the numbers a player
// reads are the same fields battle.js resolves against, so a re-tune cannot
// leave the description lying. Only the flavour line (`blurb`) is authored,
// and it is optional — the class skills in classes.js have none.
//
// Works for both spec families (tree skills here, class skills in classes.js);
// battle.js already resolves them uniformly, so the UI must too.
//
// Returns { effect, facts[], notes[] }:
//   effect  one sentence: what pressing this does, with its real numbers
//   facts   the short stat chips (range, area, price)
//   notes   the rules that are invisible until they bite you (armor pierce,
//           root, the targeting exclusions that hide a button)
export function describeSkill(skill) {
  if (!skill) return null;
  const radius = skill.radius || 0;
  const area = `${radius * 2 + 1}x${radius * 2 + 1}`;
  const power = skill.power || 0;
  const self = skill.target === 'self';

  let effect = '';
  const notes = [];
  if (skill.kind === 'damage') {
    if (self) effect = `Hits every foe in the ${area} around you for ${power}.`;
    else if (radius) effect = `Hits the foe you pick, plus everything in the ${area} around them, for ${power}.`;
    else effect = `Hits one foe for ${power}.`;
    // computeSkillDamage: power - floor(def/2). A player who reads only "8
    // damage" cannot tell why the skill beats an autoattack on an armored foe.
    notes.push('Magic damage: ignores half the target armor.');
    if (skill.status && skill.status.rooted) {
      notes.push(`Roots them: no moving on their next ${skill.status.rooted > 1 ? `${skill.status.rooted} turns` : 'turn'}.`);
    }
  } else if (skill.kind === 'heal') {
    effect = radius
      ? `Heals every ally in the ${area} around the one you pick for ${power}.`
      : `Heals one ally for ${power}.`;
    // skillTargets drops full-HP allies from a SINGLE-target heal, so the
    // button quietly refuses a target the player can plainly see.
    if (!radius) notes.push('Cannot be spent on an ally already at full HP.');
  } else if (skill.kind === 'shield') {
    effect = radius
      ? `Gives every ally in the ${area} a shield that soaks ${power} damage.`
      : `Gives one ally a shield that soaks ${power} damage.`;
    notes.push('Soaks damage before HP, and adds to a shield already up.');
  } else if (skill.kind === 'buff') {
    const amt = (skill.buff && skill.buff.atk) || power;
    effect = radius
      ? `Gives every ally in the ${area} +${amt} ATK on their next attack.`
      : `Gives one ally +${amt} ATK on their next attack.`;
    notes.push('Does not stack: the strongest buff on a hero wins.');
    if (!radius) notes.push('Cannot target yourself, or an ally already buffed.');
  }

  const facts = [];
  facts.push(self ? 'Centered on you' : `Range ${skill.range}`);
  if (radius) facts.push(`${area} area`);
  facts.push(skill.cost ? `${skill.cost} MP` : 'Free');
  return { effect, facts, notes };
}

// The same description as one plain line, for a button tooltip.
export function skillTooltip(skill) {
  const d = describeSkill(skill);
  if (!d) return '';
  return [`${skill.name} · ${d.facts.join(' · ')}`, d.effect, ...d.notes].join('\n');
}

// The next locked skill in each tree for the given levels — for "X to go" UI.
export function nextUnlocks(fishingLevel = 0, gardeningLevel = 0) {
  const levels = { fishing: fishingLevel || 0, gardening: gardeningLevel || 0 };
  const out = {};
  for (const [treeId, tree] of Object.entries(SKILL_TREES)) {
    const next = tree.skills.find((s) => (levels[s.req.skill] || 0) < s.req.level);
    out[treeId] = next ? { skill: next, need: next.req.level - (levels[tree.gatedBy] || 0) } : null;
  }
  return out;
}
