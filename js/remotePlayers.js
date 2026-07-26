// Remote players in Free Roam: every other verified Habbo in the room walks,
// sits and chats as a real Unit rendered through the normal pipeline.
//
// Movement replays the server's `moved` events through walkTo — the same A*
// on the same room model, so paths match closely; the server's committed tile
// is the truth on arrival. Seats fall out of the existing avatar logic (the
// unit settles on a seat tile and sits). Chat lines bubble through the same
// ChatOverlay as local speech.
import { Unit } from './units.js';
import { avatarSpritesFor } from './sprites.js';
import { tileToScreen } from './iso.js';
import { DEFAULT_FIGURE } from './config.js';

const HEAD_PX = { 1: 104, 0.5: 52 }; // bubble/name anchor above the head, by zoom

export class RemotePlayers {
  constructor(game, net) {
    this.game = game;
    this.net = net;
    this.chat = null; // set per explore session (main.js)
    this.units = new Map(); // lower-cased name -> Unit
    this.tags = new Map(); // lower-cased name -> DOM name tag
    this.layer = null; // name-tag layer (created on first attach)
    this.unsubs = [
      net.on('roster', (m) => this.onRoster(m)),
      net.on('enter', (m) => this.onEnter(m)),
      net.on('moved', (m) => this.onMoved(m)),
      net.on('chatted', (m) => this.onChatted(m)),
      net.on('left', (m) => this.onLeft(m)),
    ];
  }

  get active() {
    return !!this.layer;
  }

  // Start rendering remote players for the current explore session.
  attach() {
    if (!this.layer) {
      this.layer = document.createElement('div');
      this.layer.id = 'nameTagLayer';
      document.body.appendChild(this.layer);
    }
  }

  // Session teardown (leaving Free Roam for an overlay flow).
  detach() {
    this.clear();
    if (this.layer) {
      this.layer.remove();
      this.layer = null;
    }
    this.chat = null;
  }

  clear() {
    for (const u of this.units.values()) {
      const i = this.game.units.indexOf(u);
      if (i >= 0) this.game.units.splice(i, 1);
    }
    this.units.clear();
    for (const tag of this.tags.values()) tag.remove();
    this.tags.clear();
  }

  spawn(member) {
    if (!this.active || !this.game.room) return;
    const key = member.name.toLowerCase();
    if (this.units.has(key)) this.onLeft({ name: member.name });
    const room = this.game.room;
    const x = room.inBounds(member.x, member.y) ? member.x : room.spawn.x;
    const y = room.inBounds(member.x, member.y) ? member.y : room.spawn.y;
    // The real calling this player picked (js/classWeapons.js), now carried
    // over presence by SupabaseNet (_member()/track() in js/supabaseNet.js) —
    // was hardcoded to 'fighter' here for every remote player regardless of
    // their actual class, so a remote cleric always showed a sword instead of
    // their hammer/lantern. Falls back to 'fighter' only for payloads from
    // before this fix (or the local WS Net transport, which doesn't send
    // classId at all yet — a separate, narrower gap than the one fixed here).
    const classId = member.classId || 'fighter';
    const unit = new Unit(room, null, x, y, {
      team: 'player',
      classId,
      dir: member.dir ?? 4,
      name: member.name,
    });
    unit.stats = null; // explore: no HP bar
    unit.remote = true;
    // A member with no figure should not happen — shouldConnectNet (js/net.js)
    // now refuses to open a room connection without one — but presence is a
    // network payload, not a type-checked call, so guard it anyway: without
    // this fallback the unit is added to game.units and gets a name tag (it's
    // fully "there") while unit.sprites stays unset forever, so it never
    // draws a single pixel. Silently invisible, no error, nothing to debug.
    // Fall back to a renderable default figure and say so loudly.
    const figure = member.figure || DEFAULT_FIGURE;
    if (!member.figure) {
      console.warn(
        `[habbo-dungeons] remote player "${member.name}" entered with no figure — ` +
        'rendering the default figure instead of going invisible. This means their ' +
        'client connected to multiplayer without a linked Habbo figure (see ' +
        'shouldConnectNet in js/net.js).'
      );
    }
    unit.figure = figure; // infostand render
    unit.sprites = avatarSpritesFor(figure, room.zoom === 1 ? 'm' : 's', classId);
    this.game.addUnit(unit);
    this.units.set(key, unit);

    const tag = document.createElement('div');
    tag.className = 'name-tag';
    tag.textContent = member.name;
    this.layer.appendChild(tag);
    this.tags.set(key, tag);
  }

  onRoster(msg) {
    if (!this.active || !this.game.room || msg.room !== this.game.room.id) return;
    this.clear();
    for (const m of msg.members || []) this.spawn(m);
  }

  onEnter(msg) {
    if (msg && msg.member) this.spawn(msg.member);
  }

  onMoved(msg) {
    const u = this.units.get((msg.name || '').toLowerCase());
    if (!u) return;
    if (!u.walkTo(msg.x, msg.y)) {
      // local divergence (path crossed a moving unit etc.): snap to the
      // committed tile — the server's position is the truth
      u.stop();
      u.x = msg.x;
      u.y = msg.y;
      u.z = u.room.heightAt(msg.x, msg.y) || 0;
    }
  }

  onChatted(msg) {
    const u = this.units.get((msg.name || '').toLowerCase());
    if (!u || !this.chat || !this.game.room) return;
    const p = u.renderPos(performance.now());
    const headPx = HEAD_PX[this.game.room.zoom] || 104;
    this.chat.bubble(msg.text, msg.name, p, headPx, msg.mode || 'say');
  }

  onLeft(msg) {
    const key = (msg.name || '').toLowerCase();
    const u = this.units.get(key);
    if (u) {
      const i = this.game.units.indexOf(u);
      if (i >= 0) this.game.units.splice(i, 1);
      this.units.delete(key);
    }
    const tag = this.tags.get(key);
    if (tag) {
      tag.remove();
      this.tags.delete(key);
    }
  }

  // The remote unit standing on (x,y), if any — infostand picking.
  unitAt(x, y) {
    for (const u of this.units.values()) {
      if (u.x === x && u.y === y) return u;
    }
    return null;
  }

  // Wrap the local explore unit so every accepted walk reports its
  // destination once (walkTo is the single choke point for explore moves).
  //
  // Also broadcasts the unit's ACTUAL spawn tile right away, rather than
  // waiting for its first voluntary step: SupabaseNet.pos starts at its
  // class default (0,0) and is only ever updated by move(), so anyone who
  // joins a room and just stands there — even for the brief window before
  // their first walk — was presence-broadcasting world tile (0,0) to every
  // other client. In a room where (0,0) sits behind scene geometry, that
  // reads as a name tag with no visible body: the avatar is legitimately
  // depth-occluded by a prop at the wrong, never-updated position, while the
  // DOM name tag (never depth-tested) stays fully visible regardless.
  // Confirmed live via tests/e2e/depthOcclusionConfirm.e2e.mjs.
  bindLocalUnit(unit) {
    if (!unit || unit._netBound) return;
    unit._netBound = true;
    const orig = unit.walkTo.bind(unit);
    unit.walkTo = (x, y) => {
      const ok = orig(x, y);
      if (ok) this.net.move(x, y);
      return ok;
    };
    this.net.move(unit.x, unit.y); // real spawn tile, not the (0,0) default
  }

  // Called from the explore controller's frame update: keep name tags glued
  // above remote heads (camera pans and walk interpolation included).
  update(now) {
    if (!this.active || !this.game.room) return;
    const zoom = this.game.room.zoom;
    const headPx = HEAD_PX[zoom] || 104;
    for (const [key, u] of this.units) {
      const tag = this.tags.get(key);
      if (!tag) continue;
      const p = u.renderPos(now);
      const c = tileToScreen(p.x, p.y, p.z, zoom);
      tag.style.left = `${Math.round(c.x + this.game.cam.x)}px`;
      tag.style.top = `${Math.round(c.y + this.game.cam.y - headPx - 2)}px`;
    }
  }
}
