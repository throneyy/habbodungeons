// Dialogue content — DATA only (the machine is js/dialogue.js, the NPC layer
// js/npc.js). Keep lines short: they render as classic chat bubbles.
// A choice may carry `set: { dungeon: <id> }` — the DialogueRunner reports it
// (main.js aims the square's archway at that dungeon).
export const DIALOGUES = {
  // The Gatekeeper — the old money tree rooted beside the square's archway.
  // Coins hang in his branches; nobody remembers who planted the first one.
  // The arch opens only where he tells it: your choice here IS the descent
  // the archway loads.
  gatekeeper: {
    start: 'greet',
    nodes: {
      greet: {
        lines: [
          'Hm? Oh. A living one.',
          'I am the Gatekeeper. The arch beside me opens nowhere until I tell it otherwise. Where will you go?',
        ],
        choices: [
          { text: 'The old keep below.', next: 'keep', set: { dungeon: 'dungeon' } },
          { text: 'The realm trials.', next: 'realms', set: { dungeon: 'realms' } },
          { text: "You're... a tree.", next: 'tree' },
        ],
      },
      keep: {
        lines: [
          'The dark under this square, then. The garrison down there stopped being polite about visitors some time ago.',
          'The arch is listening. Step through when your nerve is where you left it.',
        ],
      },
      realms: {
        lines: [
          'Four doors, four lands, and a witch at the bottom of it all. Bold.',
          'The arch is listening. Step through, and try to come back whole.',
        ],
      },
      tree: {
        lines: [
          "A tree that pays attention is worth ten soldiers who don't.",
          'The coins? Folk keep planting them in my branches. I keep growing. Neither of us asks why.',
        ],
        choices: [
          { text: 'The old keep below.', next: 'keep', set: { dungeon: 'dungeon' } },
          { text: 'The realm trials.', next: 'realms', set: { dungeon: 'realms' } },
        ],
      },
    },
  },
};

// What the Gatekeeper calls out when someone steps into the arch without
// telling him a destination first (main.js, gate trigger).
// note: keep em-dashes out of chat lines — the Volter bitmap font renders them as ♫
export const GATE_HINT = 'The arch answers to me, not to boots. Come speak first. Tell me where you would go.';
