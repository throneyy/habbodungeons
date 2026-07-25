import { tileToScreen } from './iso.js';

// Habbo-style room chat, local-only, modelled on nitro-react's chat widgets:
// bubbles spawn just above the speaker's head at the spot where they spoke,
// never overlap (new arrivals shove the stack upward), and the whole field
// drifts up on a slow interval until each bubble leaves the top of the view.
// No fading — exactly like the real client. DOM-based so Volter stays crisp.
const DRIFT_MS = 5000; // one upward shift per tick (client uses ~4-6s)
const DRIFT_PX = 15; // pixels per shift
const BUBBLE_GAP = 4; // minimum space between stacked bubbles
const HEAD_OFFSET = { 1: 104, 0.5: 52 }; // avatar head height by room zoom

export class ChatOverlay {
  // getUnit: () => Unit — re-read on send so room switches (which spawn a
  // fresh unit) never anchor bubbles to a dead reference.
  constructor(game, getUnit, getName) {
    this.game = game;
    this.getUnit = getUnit;
    this.getName = getName;
    this.onCommand = null; // (text) => bool — ':cmd' hook; true = consumed, no bubble
    this.onSay = null; // (text, mode) — multiplayer hook: broadcast spoken lines
    this.bubbles = []; // { el, x, top, height }

    this.layer = document.createElement('div');
    this.layer.id = 'chatLayer';

    // bottom toolbar strip with the chat field (classic client's gray bar).
    // The mode selector is real: Say / Shout / Whisper restyle the bubble
    // exactly like the client (normal / bold / italic-gray).
    this.toolbar = document.createElement('div');
    this.toolbar.id = 'chatToolbar';
    this.mode = document.createElement('select');
    this.mode.className = 'chat-say';
    for (const m of ['Say', 'Shout', 'Whisper']) {
      const o = document.createElement('option');
      o.value = m.toLowerCase();
      o.textContent = m;
      this.mode.appendChild(o);
    }
    // picking a mode hands focus straight back to the field
    this.mode.addEventListener('change', () => this.input.focus());
    // classic pill: the mode dropdown lives INSIDE the white rounded field
    this.bar = document.createElement('form');
    this.bar.appendChild(this.mode);
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.maxLength = 100;
    this.input.placeholder = 'Click here to chat...';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.bar.appendChild(this.input);
    this.toolbar.appendChild(this.bar);

    this.bar.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      // command hook (":admin" etc.): handled lines are swallowed, not said
      if (text && !(this.onCommand && this.onCommand(text))) this.say(text, this.mode.value);
      this.input.value = '';
    });
    // Shift+Enter shouts regardless of the selected mode (client shortcut).
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        const text = this.input.value.trim();
        if (text) this.say(text, 'shout');
        this.input.value = '';
      }
    });
    // Typing anywhere in the room routes into the chat field (real-client
    // behaviour): first printable key focuses it, Enter submits via the form.
    this.onKeydown = (e) => {
      // never steal focus from another text control (e.g. the :furni search)
      const tag = (document.activeElement || {}).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) this.input.focus();
    };
    document.addEventListener('keydown', this.onKeydown);

    document.body.append(this.layer, this.toolbar);
    this.input.focus();
    this.drift = setInterval(() => this.driftTick(), DRIFT_MS);
  }

  say(text, mode = 'say') {
    // classic client behaviour: ':commands' the client understands are eaten;
    // anything else (or anyone unauthorised) just says the text out loud
    if (text.startsWith(':') && this.onCommand && this.onCommand(text)) return;
    const unit = this.getUnit();
    const room = this.game.room;
    if (!unit || !room) return;
    const p = unit.renderPos(performance.now());
    this.bubble(text, this.getName(), p, HEAD_OFFSET[room.zoom] || 104, mode);
    if (this.onSay) this.onSay(text, mode);
  }

  // Bot-style line from a non-player speaker (NPCs — see npc.js):
  // speaker = { name, x, y, z, headPx } — headPx is how far above the tile
  // centre the bubble anchors (a money tree is taller than an avatar).
  sayAs(text, speaker) {
    const room = this.game.room;
    if (!room) return;
    const headPx = (speaker.headPx || 104) * room.zoom;
    this.bubble(text, speaker.name, speaker, headPx, 'bot');
  }

  bubble(text, speakerName, pos, headPx, mode) {
    const room = this.game.room;
    const c = tileToScreen(pos.x, pos.y, pos.z, room.zoom);
    const x = Math.round(c.x + this.game.cam.x);
    const headY = Math.round(c.y + this.game.cam.y - headPx);

    const el = document.createElement('div');
    el.className = `chat-bubble chat-bubble--${mode}`;
    const name = document.createElement('b');
    name.textContent = speakerName + ': ';
    const msg = document.createElement('span');
    msg.className = 'chat-msg';
    msg.textContent = text;
    el.append(name, msg);
    this.layer.appendChild(el);

    const height = el.offsetHeight;
    // clamp inside the view like the real client: edge speakers still get a
    // fully visible bubble
    const half = el.offsetWidth / 2;
    const cx = Math.max(half + 4, Math.min(window.innerWidth - half - 4, x));
    const b = { el, x: cx, top: headY - 6 - height, height };
    this.place(b);

    // the new bubble owns the spot above the head; older bubbles that overlap
    // it (or each other after a push) cascade upward, bottom-to-top
    const older = [...this.bubbles].sort((m, n) => n.top - m.top); // lowest first
    let ceiling = b.top;
    for (const o of older) {
      if (o.top + o.height + BUBBLE_GAP > ceiling) {
        o.top = ceiling - BUBBLE_GAP - o.height;
        this.place(o);
      }
      ceiling = Math.min(ceiling, o.top);
    }
    this.bubbles.push(b);
  }

  place(b) {
    b.el.style.left = `${b.x}px`;
    b.el.style.top = `${Math.round(b.top)}px`;
  }

  // The slow upward march: every bubble rises one notch; a bubble is culled
  // only once it has fully drifted above the top of the room view.
  driftTick() {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.top -= DRIFT_PX;
      if (b.top + b.height < 0) {
        b.el.remove();
        this.bubbles.splice(i, 1);
      } else {
        this.place(b);
      }
    }
  }

  // wipe all bubbles (room switch — the client clears chat between rooms)
  clear() {
    for (const b of this.bubbles) b.el.remove();
    this.bubbles = [];
  }

  destroy() {
    clearInterval(this.drift);
    document.removeEventListener('keydown', this.onKeydown);
    this.layer.remove();
    this.toolbar.remove();
    this.bubbles = [];
  }
}
