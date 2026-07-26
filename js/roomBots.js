// Walking room bots — the live half of the `:npc` admin command.
//
// A bot is an Avatar (js/avatar.js) wearing a habbo-imaging figure, dropped on
// a tile by an admin and left to idle-wander around it. It renders through the
// normal unit pipeline (Game.drawUnit reads renderPos/action/frame/sprites),
// carries a floating name tag like a remote player, and — deliberately — does
// NOT block its tile: you walk straight through a bot, same as another Habbo.
//
// Bots are not props: they have no sprite sheet, so they can never live in
// room.props (Room blocks and the renderer would try to resolve furni art for
// them). They ride a parallel channel — Room.bots specs + these entities —
// and are split back out of saved layouts by rooms.js.
import { Avatar } from './avatar.js';
import { avatarSpritesFor } from './sprites.js';
import { botDef } from './botsData.js';
import { chatterFor, modeOf } from './botChatter.js';
import { tileToScreen } from './iso.js';
import { IMAGING_URL, DEFAULT_FIGURE } from './config.js';

const HEAD_PX = { 1: 104, 0.5: 52 }; // name-tag anchor above the head, by zoom
const BUBBLE_HEAD_PX = 104; // ChatOverlay.sayAs scales this by room.zoom itself
export const LEASH = 2; // max tiles a bot drifts from its home tile
const WANDER_MIN_MS = 2500;
const WANDER_SPREAD_MS = 4500;
const IDLE_CHANCE = 0.45; // ...and sometimes it just stands there

// Ambient chatter cadence. Per-bot timers are deliberately slow and widely
// spread, but they are NOT enough on their own: 33 bots in one room converge
// on "several ready at once" often enough to paper the screen with bubbles.
// BARK_COOLDOWN_MS is the room-wide floor between any two bot bubbles.
export const BARK_MIN_MS = 14000;
export const BARK_SPREAD_MS = 16000;
export const BARK_COOLDOWN_MS = 4500;

// ---- pure helpers (DOM-free, unit-tested in tests/roomBots.test.js) --------

// Strip a live bot spec down to the whitelisted persistence shape. Only the
// KEY travels: name/figure live in js/botsData.js.
export function serializeBot(spec) {
  return { id: 'bot', bot: spec.bot, x: spec.x, y: spec.y, dir: spec.dir ?? 4 };
}

// Split a saved layout array into furni props and bot specs. Bot entries with
// an unknown key (a definition removed since the save) are dropped rather than
// spawned as a blank avatar.
export function splitBots(entries) {
  const props = [];
  const bots = [];
  for (const e of entries || []) {
    if (e && e.id === 'bot') {
      if (botDef(e.bot)) bots.push({ bot: e.bot, x: e.x, y: e.y, dir: e.dir ?? 4 });
      continue;
    }
    props.push(e);
  }
  return { props, bots };
}

// One idle drift step for a bot: pick a random 4-neighbour tile that exists,
// isn't blocked, isn't a teleport pad, is within one height step, stays leashed
// to home and isn't occupied. Returns the tile, or null to stand still.
// `isOccupied(x, y)` is supplied by the caller (player, bots, remote players);
// `rnd` is injectable for deterministic tests.
export function wanderTarget(room, bot, isOccupied = () => false, rnd = Math.random) {
  const home = bot.home;
  const opts = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = bot.x + dx;
    const y = bot.y + dy;
    if (!room.tile(x, y) || room.isBlocked(x, y)) continue;
    if (room.teleportAt && room.teleportAt(x, y)) continue;
    if (Math.abs(room.heightAt(x, y) - room.heightAt(bot.x, bot.y)) > 1) continue;
    if (Math.abs(x - home.x) > LEASH || Math.abs(y - home.y) > LEASH) continue;
    if (isOccupied(x, y)) continue;
    opts.push({ x, y });
  }
  if (!opts.length) return null;
  return opts[Math.floor(rnd() * opts.length)];
}

// When a bot should next consider speaking. Spread is wide on purpose: bots
// placed together (a whole cafe staff dropped in one go) would otherwise stay
// in lockstep, all firing into the same cooldown and mostly being swallowed.
export function nextBarkAt(now, rnd = Math.random) {
  return now + BARK_MIN_MS + rnd() * BARK_SPREAD_MS;
}

// A random idle line for a bot key, or null when that bot has nothing to say.
// ONLY the `speech` bucket: `response` and `unrecognised` are player-triggered
// and still carry unexpanded %drink% / %lowercaseDrink% template tokens, which
// would render literally in a bubble. The 11 bots in SILENT_BOTS have no
// CHATTER entry at all, so they land on the null here and never speak.
export function speechLine(key, rnd = Math.random) {
  const chatter = chatterFor(key);
  const lines = (chatter && chatter.speech) || [];
  if (!lines.length) return null;
  return lines[Math.floor(rnd() * lines.length)] || null;
}

// Should this bot speak on this frame? Returns the line to say, or null.
//
// `state` is the shared room-wide cooldown record ({ lastBarkAt }) — passing
// one object across every bot is what makes the global floor global. A bot
// whose own timer is ready but who loses the cooldown race is REscheduled
// rather than left hot, so it doesn't re-roll on every subsequent frame.
// `rnd` is injectable for deterministic tests, exactly like wanderTarget.
export function tryBark(bot, now, state, rnd = Math.random) {
  if (!bot || now < bot.nextBark) return null;
  bot.nextBark = nextBarkAt(now, rnd);
  if (now - (state.lastBarkAt ?? -Infinity) < BARK_COOLDOWN_MS) return null;
  const line = speechLine(bot.key, rnd);
  if (!line) return null;
  state.lastBarkAt = now;
  return line;
}

// ---- the entity -----------------------------------------------------------

export class RoomBot extends Avatar {
  constructor(room, sprites, spec, def) {
    super(room, sprites, spec.x, spec.y, spec.dir ?? 4);
    this.spec = spec; // the room.bots entry this entity mirrors
    this.key = def.key;
    this.name = def.name;
    this.figure = def.figure;
    this.motto = def.motto || '';
    this.carry = def.carry ?? null;
    this.home = { x: spec.x, y: spec.y };
    this.nextWander = 0;
    // Infinity for a silent bot (js/botChatter.js SILENT_BOTS): its timer can
    // never come due, so it is skipped before any roll is even attempted.
    this.nextBark = chatterFor(def.key) ? 0 : Infinity;
    this.stats = null; // no HP bar (Game.drawUnit skips stat-less entities)
    this.bot = true; // picking flag: this unit is a room bot
    // Game.drawToken (the default-Habbo stand-in) covers a bot while its
    // imaging PNGs load, or offline. It only reads unit.team, but other UI
    // reaches for unit.cls, and a throw mid-render kills the whole loop.
    this.cls = { color: '#8a8a8a', name: 'Bot' };
  }
}

// ---- the manager ----------------------------------------------------------

export class RoomBots {
  // opts: { isAdmin: () => bool, getEditor: () => RoomEditor|null,
  //         getChat: () => ChatOverlay|null }
  // getChat is a getter, not the overlay itself: main.js builds RoomBots before
  // the ChatOverlay exists.
  constructor(game, { isAdmin = () => false, getEditor = () => null, getChat = () => null } = {}) {
    this.game = game;
    this.isAdmin = isAdmin;
    this.getEditor = getEditor;
    this.getChat = getChat;
    // one shared cooldown record for the whole room — see tryBark
    this.barkState = { lastBarkAt: -Infinity };
    this.bots = []; // live RoomBot entities in the current room
    this.tags = new Map(); // RoomBot -> DOM name tag
    this.layer = null;
    this.placing = null; // { bot, spec } riding the cursor
    this.stand = null; // open infostand element
    this.prevOnFrame = null;
    this.wrapped = null;
    this.onKey = (e) => {
      if (e.key === 'Escape' && this.placing) this.cancelPlace();
    };
  }

  // Wrap the explore controller's onTap: placement owns the tap first, then the
  // admin bot infostand; anything else falls through to walking.
  attach(controller) {
    if (this.wrapped === controller) return;
    this.wrapped = controller;
    const orig = controller.onTap.bind(controller);
    controller.onTap = (tile) => {
      if (!this.handleTap(tile)) orig(tile);
    };
  }

  // Returns true when the tap was consumed.
  handleTap(tile) {
    if (this.placing) {
      this.place(tile);
      return true;
    }
    const editor = this.getEditor();
    if (!this.isAdmin() || !editor || !editor.active) return false;
    const bot = this.botAt(tile.x, tile.y);
    if (!bot) {
      this.closeStand();
      return false;
    }
    this.openStand(bot);
    return true;
  }

  // ---- room lifecycle -----------------------------------------------------

  // Fresh room: setRoom already wiped game.units, so rebuild from the specs.
  onRoom(room) {
    this.clear();
    if (!this.layer) {
      this.layer = document.createElement('div');
      this.layer.id = 'botTagLayer';
      document.body.appendChild(this.layer);
    }
    for (const spec of room.bots || []) this.spawn(room, spec);
  }

  spawn(room, spec) {
    const def = botDef(spec.bot);
    if (!def) return null;
    // carry rides the sprite set: the bot holds its item while idling, walking
    // and sitting (js/sprites.js composes `wlk,crr=<id>` etc.)
    const sprites = avatarSpritesFor(def.figure, room.zoom === 1 ? 'm' : 's', 'fighter', def.carry ?? null);
    const bot = new RoomBot(room, sprites, spec, def);
    bot.nextWander = performance.now() + 1000 + Math.random() * 4000;
    // stagger the opening bark too, so a freshly loaded room doesn't open with
    // a queue of bots all talking at the cooldown's pace
    if (bot.nextBark !== Infinity) bot.nextBark = nextBarkAt(performance.now());
    this.game.addUnit(bot);
    this.bots.push(bot);
    const tag = document.createElement('div');
    tag.className = 'name-tag';
    tag.textContent = def.name;
    this.layer.appendChild(tag);
    this.tags.set(bot, tag);
    return bot;
  }

  clear() {
    for (const bot of this.bots) this.removeEntity(bot);
    this.bots = [];
  }

  removeEntity(bot) {
    const i = this.game.units.indexOf(bot);
    if (i >= 0) this.game.units.splice(i, 1);
    const tag = this.tags.get(bot);
    if (tag) tag.remove();
    this.tags.delete(bot);
  }

  // Session teardown (leaving Free Roam for an overlay flow).
  detach() {
    if (this.placing) this.cancelPlace();
    this.closeStand();
    this.clear();
    if (this.layer) {
      this.layer.remove();
      this.layer = null;
    }
  }

  botAt(x, y) {
    return this.bots.find((b) => b.x === x && b.y === y) || null;
  }

  // Everything that shouldn't be wandered onto: the player, other bots and
  // remote players. Bots don't block tiles, so this is a courtesy check only.
  occupancy(controller) {
    return (x, y) => {
      if (controller && controller.unit && controller.unit.x === x && controller.unit.y === y) return true;
      if (this.botAt(x, y)) return true;
      const remote = controller && controller.remote;
      return !!(remote && remote.unitAt && remote.unitAt(x, y));
    };
  }

  // Frame tick from the explore controller: drift the bots, keep tags glued.
  update(now, controller) {
    if (!this.layer || !this.game.room) return;
    const isOccupied = this.occupancy(controller);
    for (const bot of this.bots) {
      if (bot === (this.placing && this.placing.bot)) continue; // the cursor ghost
      this.wander(bot, now, isOccupied);
      this.bark(bot, now);
    }
    const zoom = this.game.room.zoom;
    const headPx = HEAD_PX[zoom] || 104;
    for (const [bot, tag] of this.tags) {
      const p = bot.renderPos(now);
      const c = tileToScreen(p.x, p.y, p.z, zoom);
      tag.style.left = `${Math.round(c.x + this.game.cam.x)}px`;
      tag.style.top = `${Math.round(c.y + this.game.cam.y - headPx - 2)}px`;
    }
  }

  wander(bot, now, isOccupied) {
    if (now < bot.nextWander || bot.step || bot.path.length) return;
    bot.nextWander = now + WANDER_MIN_MS + Math.random() * WANDER_SPREAD_MS;
    if (Math.random() < IDLE_CHANCE) return;
    const t = wanderTarget(this.game.room, bot, isOccupied);
    if (t) bot.walkTo(t.x, t.y);
  }

  // Ambient chatter: an idle `speech` line through the same NPC bubble path the
  // Gatekeeper uses, carrying the line's own shout/whisper mode.
  bark(bot, now) {
    const chat = this.getChat();
    if (!chat) return; // no overlay (headless / pre-boot) — don't burn the timer
    const line = tryBark(bot, now, this.barkState);
    if (!line) return;
    const p = bot.renderPos(now);
    chat.sayAs(line.text, { name: bot.name, x: p.x, y: p.y, z: p.z, headPx: BUBBLE_HEAD_PX }, modeOf(line));
  }

  // ---- placement (the Object Mover feel, for avatars) ---------------------

  // Catalogue pick (:npc): drop a live bot into the room and let it ride the
  // cursor until a tile is clicked. Escape returns it to the catalogue.
  beginPlace(def) {
    const room = this.game.room;
    if (!room || !def) return null;
    const editor = this.getEditor();
    if (editor && editor.moving) return null; // one cursor ghost at a time
    if (this.placing) this.cancelPlace();
    this.closeStand();
    const spec = { bot: def.key, x: room.spawn.x, y: room.spawn.y, dir: 4 };
    const bot = this.spawn(room, spec);
    if (!bot) return null;
    this.placing = { bot, spec, isNew: true };
    this.followCursor();
    document.addEventListener('keydown', this.onKey);
    return bot;
  }

  // Move an already-placed bot: same cursor ghost, but Escape restores it.
  move(bot) {
    const editor = this.getEditor();
    if (!bot || (editor && editor.moving)) return;
    if (this.placing) this.cancelPlace();
    this.closeStand();
    this.placing = { bot, spec: bot.spec, isNew: false, orig: { x: bot.x, y: bot.y } };
    this.followCursor();
    document.addEventListener('keydown', this.onKey);
  }

  // Chain game.onFrame (exactly as RoomEditor.startMove does) so the bot snaps
  // to whatever valid tile the cursor is over.
  followCursor() {
    this.prevOnFrame = this.game.onFrame;
    this.game.onFrame = (g, now) => {
      if (this.prevOnFrame) this.prevOnFrame(g, now);
      const h = this.game.hover;
      if (h && this.canDrop(h.x, h.y)) this.setPos(this.placing.bot, h.x, h.y);
    };
  }

  canDrop(x, y) {
    const room = this.game.room;
    return !!room.tile(x, y) && !room.isBlocked(x, y);
  }

  setPos(bot, x, y) {
    bot.stop();
    bot.step = null;
    bot.x = x;
    bot.y = y;
    bot.z = bot.room.heightAt(x, y) || 0;
  }

  // Commit the placement: the tile becomes the bot's home and its spec joins
  // room.bots (Save Layout persists it from there).
  place(tile) {
    const p = this.placing;
    if (!p || !this.canDrop(tile.x, tile.y)) return;
    this.setPos(p.bot, tile.x, tile.y);
    p.spec.x = tile.x;
    p.spec.y = tile.y;
    p.spec.dir = p.bot.dir;
    p.bot.home = { x: tile.x, y: tile.y };
    p.bot.nextWander = performance.now() + WANDER_MIN_MS;
    const room = this.game.room;
    if (!room.bots) room.bots = [];
    if (!room.bots.includes(p.spec)) room.bots.push(p.spec);
    this.endPlace();
  }

  cancelPlace() {
    const p = this.placing;
    if (!p) return;
    if (p.isNew) {
      this.endPlace();
      this.removeEntity(p.bot);
      this.bots = this.bots.filter((b) => b !== p.bot);
      return;
    }
    this.setPos(p.bot, p.orig.x, p.orig.y);
    this.endPlace();
  }

  endPlace() {
    this.game.onFrame = this.prevOnFrame || null;
    this.prevOnFrame = null;
    this.placing = null;
    document.removeEventListener('keydown', this.onKey);
  }

  // ---- rotate / pick up ---------------------------------------------------

  rotate(bot) {
    bot.stop();
    bot.dir = (bot.dir + 2) % 8; // cardinal dirs only, like a seated avatar
    bot.spec.dir = bot.dir;
    this.renderStandPreview();
  }

  pickUp(bot) {
    const room = this.game.room;
    if (room && room.bots) room.bots = room.bots.filter((s) => s !== bot.spec);
    this.removeEntity(bot);
    this.bots = this.bots.filter((b) => b !== bot);
    if (this.placing && this.placing.bot === bot) this.endPlace();
    this.closeStand();
  }

  // ---- infostand ----------------------------------------------------------

  // The human branch of the object displayer (js/humanInfostand.js family) with
  // the owner's action row: Move / Rotate / Pick up.
  openStand(bot) {
    this.closeStand();
    const el = document.createElement('div');
    el.className = 'infostand infostand--human infostand--bot';
    el.innerHTML = `
      <div class="infostand-info">
        <div class="infostand-name"><span>${escapeHtml(bot.name)}</span><button class="infostand-close" title="Close">&times;</button></div>
        <div class="infostand-preview infostand-preview--human"><img alt="${escapeHtml(bot.name)}" src="${avatarUrl(bot.figure, bot.dir, 'm', bot.carry)}" /></div>
        <div class="infostand-desc infostand-motto">${escapeHtml(bot.motto) || '&nbsp;'}</div>
        <div class="infostand-desc">bot &middot; wanders within ${LEASH} tiles of (${bot.home.x}, ${bot.home.y})</div>
      </div>
      <div class="infostand-actions">
        <div class="infostand-buttons">
          <button class="infostand-btn" data-act="move">Move</button>
          <button class="infostand-btn" data-act="rotate">Rotate</button>
          <button class="infostand-btn" data-act="pickup">Pick up</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.stand = { el, bot };
    el.querySelector('.infostand-close').onclick = () => this.closeStand();
    el.querySelector('.infostand-buttons').addEventListener('click', (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (!act) return;
      if (act === 'move') {
        this.closeStand();
        this.move(bot);
      } else if (act === 'rotate') this.rotate(bot);
      else if (act === 'pickup') this.pickUp(bot);
    });
  }

  renderStandPreview() {
    if (!this.stand) return;
    const img = this.stand.el.querySelector('.infostand-preview--human img');
    if (img) img.src = avatarUrl(this.stand.bot.figure, this.stand.bot.dir, 'm', this.stand.bot.carry);
  }

  closeStand() {
    if (this.stand) this.stand.el.remove();
    this.stand = null;
  }
}

// full-body habbo-imaging render for the infostand / catalogue preview.
// `carry` (a js/handItems.js id) swaps the plain stand for the carry pose, so a
// bot previews holding the same drink it holds in the room.
export function avatarUrl(figure, dir = 4, size = 'm', carry = null) {
  const p = new URLSearchParams({
    figure: figure || DEFAULT_FIGURE, // never an empty figure — render the default Habbo
    action: carry == null ? 'std' : `crr=${carry}`,
    direction: String(dir),
    head_direction: String(dir),
    size,
    img_format: 'png',
  });
  return `${IMAGING_URL}?${p}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
