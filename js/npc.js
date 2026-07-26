// Minimal NPC system. An NPC's body is a furni prop placed via the room
// layout (so admins move NPCs exactly like furniture, and the renderer's
// multi-tile depth handling is reused wholesale); the NPCS registry below
// stamps identity onto matching props at build time — self-healing like
// SEATS / DUNGEON_GATES, so admin saves (which strip flags) come back wired
// and a layout that omits an NPC gets him back at his default spot.
//
// Tapping an NPC from an adjacent tile starts a dialogue (js/dialogue.js
// machine + js/dialogueData.js content): his lines appear as bot-style chat
// bubbles through ChatOverlay, player choices as buttons in a small bottom
// panel above the chat toolbar.
import { Dialogue } from './dialogue.js';
import { DIALOGUES } from './dialogueData.js';

// furni id -> NPC identity. `bubble` = px above the tile centre where speech
// bubbles anchor (the money tree is far taller than an avatar head).
export const NPCS = {
  neopets_c25_moneytree: {
    key: 'gatekeeper',
    name: 'The Gatekeeper',
    dialogue: 'gatekeeper',
    bubble: 196,
  },
};

// default placement per room, restored when a saved layout lacks the NPC.
// The Gatekeeper roots in the tavern row's open NE bay (matches the
// default layout in rooms.js).
export const NPC_DEFAULTS = {
  square: [{ id: 'neopets_c25_moneytree', x: 10, y: 1, dir: 0 }],
};

// Stamp p.npc onto every registered NPC prop. Footprints are derived by the
// Room itself (propFootprint), so a restored default only has to go in through
// addProp to get its tiles stamped and blocked.
export function wireNpcs(rooms) {
  for (const room of rooms) {
    for (const def of NPC_DEFAULTS[room.id] || []) {
      if (!room.props.some((p) => p.id === def.id)) room.addProp({ ...def });
    }
    for (const p of room.props) {
      const spec = NPCS[p.id];
      if (!spec) continue;
      p.npc = spec;
    }
  }
  return rooms;
}

const LINE_MS = 1400; // beat between an NPC's bubbles (roughly reading pace)

// Drives one conversation: NPC lines -> bot bubbles, choices -> button panel.
// One runner per explore session; start() is a no-op while a talk is live.
export class DialogueRunner {
  constructor(chat) {
    this.chat = chat;
    this.onSet = null; // set by main.js: ({ dungeon }) => aim the archway
    this.active = null; // { d, npc, timer }
    this.panel = document.createElement('div');
    this.panel.id = 'dialoguePanel';
    this.panel.classList.add('hidden');
    document.body.appendChild(this.panel);
  }

  // npcProp: the wired layout prop (p.npc = spec); z from the room so the
  // bubble rides the right floor height.
  start(npcProp, z = 0) {
    if (this.active) return;
    const spec = npcProp.npc;
    const script = spec && DIALOGUES[spec.dialogue];
    if (!script) return;
    this.active = {
      d: new Dialogue(script),
      npc: { name: spec.name, x: npcProp.x, y: npcProp.y, z, headPx: spec.bubble || 120 },
      timer: null,
    };
    this.step();
  }

  step() {
    const a = this.active;
    if (!a) return;
    const r = a.d.next();
    if (r.line) {
      this.chat.sayAs(r.line, a.npc);
      a.timer = setTimeout(() => this.step(), LINE_MS);
    } else if (r.choices) {
      this.showChoices(r.choices);
    } else {
      this.stop();
    }
  }

  showChoices(choices) {
    this.panel.innerHTML = '';
    choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.textContent = c.text;
      b.addEventListener('click', () => {
        const a = this.active;
        if (!a) return;
        this.panel.classList.add('hidden');
        const taken = a.d.choose(i);
        this.chat.say(c.text); // the player speaks their pick — real chat line
        // data-driven side effects (e.g. { dungeon } aims the square's arch)
        if (taken && taken.set && this.onSet) this.onSet(taken.set);
        a.timer = setTimeout(() => this.step(), 600);
      });
      this.panel.appendChild(b);
    });
    this.panel.classList.remove('hidden');
  }

  // end of script, room switch, or session teardown
  stop() {
    if (this.active && this.active.timer) clearTimeout(this.active.timer);
    this.active = null;
    this.panel.classList.add('hidden');
    this.panel.innerHTML = '';
  }

  destroy() {
    this.stop();
    this.panel.remove();
  }
}
