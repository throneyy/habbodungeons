import { memberStats } from './run.js';
import { rollItem, ITEMS } from './items.js';

// Hand-authored map events — the demoted story system. Between battles the run
// stops at one of these: a short scene with 2-3 choices that nudge the run
// (heal, loot, gold, risk). Each choice's resolve(run, rng) mutates the run and
// returns a line of result text for the UI. Deterministic RNG is injectable so
// tests are stable.
export const EVENTS = {
  shrine: {
    id: 'shrine',
    title: 'The Silent Shrine',
    text: 'A cracked shrine hums with faint warmth beneath the dust. Something here still listens.',
    choices: [
      {
        label: 'Pray for mending',
        resolve: (run) => {
          let healed = 0;
          for (const m of run.livingSquad()) {
            const max = memberStats(m).maxHp;
            const before = m.hp;
            m.hp = Math.min(max, m.hp + Math.ceil(max * 0.35));
            healed += m.hp - before;
          }
          return `Warmth floods the party — restored ${healed} HP across the squad.`;
        },
      },
      {
        label: 'Pry loose its offerings',
        resolve: (run, rng = Math.random) => {
          run.addGold(30);
          const victim = pickLiving(run, rng);
          let hurt = 0;
          if (victim) {
            hurt = Math.min(victim.hp - 1, 8);
            if (hurt > 0) victim.hp -= hurt;
          }
          return `You take 30 gold from the shrine. It bites back — ${victim ? `${victim.name} loses ${hurt} HP.` : 'but the party is untouched.'}`;
        },
      },
      { label: 'Leave it be', resolve: () => 'You bow your head and move on. Nothing ventured.' },
    ],
  },

  cache: {
    id: 'cache',
    title: 'Abandoned Cache',
    text: 'A supply crate lies half-buried in the rubble, its lock long shattered.',
    choices: [
      {
        label: 'Take the supplies',
        resolve: (run, rng = Math.random) => {
          const id = rollItem(run.battleNumber(), rng);
          run.addLoot(id);
          return `You find ${ITEMS[id].name}.`;
        },
      },
      {
        label: 'Sell it for scrap',
        resolve: (run) => {
          run.addGold(20);
          return 'You haul the crate off for 20 gold.';
        },
      },
    ],
  },

  wanderer: {
    id: 'wanderer',
    title: 'The Wounded Wanderer',
    text: 'A stranger slumps against the crumbling wall, clutching a small pouch. They eye your party warily.',
    choices: [
      {
        label: 'Share your supplies',
        resolve: (run, rng = Math.random) => {
          // kindness rewarded: they gift an item before staggering off
          const id = rollItem(run.battleNumber(), rng);
          run.addLoot(id);
          return `Grateful, the wanderer presses ${ITEMS[id].name} into your hands and limps away.`;
        },
      },
      {
        label: 'Take the pouch',
        resolve: (run) => {
          run.addGold(40);
          return 'You take the pouch — 40 gold. The wanderer says nothing.';
        },
      },
      { label: 'Walk past', resolve: () => 'You leave the stranger to the dark.' },
    ],
  },
};

function pickLiving(run, rng = Math.random) {
  const living = run.livingSquad();
  return living.length ? living[Math.floor(rng() * living.length)] : null;
}

// Choose distinct events for the run's event slots. Returns nodeIndex -> id.
export function pickEvents(eventNodeIndices, rng = Math.random) {
  const ids = Object.keys(EVENTS);
  const shuffled = ids
    .map((id) => ({ id, k: rng() }))
    .sort((a, b) => a.k - b.k)
    .map((e) => e.id);
  const picks = {};
  eventNodeIndices.forEach((idx, i) => (picks[idx] = shuffled[i % shuffled.length]));
  return picks;
}
