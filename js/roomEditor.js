import { propSprites } from './props.js';
import { propFootprint } from './room.js';
import { Identity } from './identity.js';
import { isSupabase, invokeFn } from './backend.js';
import { getSupabase } from './supabase.js';

// ---- admin session + layout persistence ------------------------------------
// The server prints an admin token on boot (data/admin-token.txt). Opening
// /#admin=<token> once stores it here; saves then carry it as a Bearer header.
const LS_TOKEN = 'habbo-dungeons-admin-token';

export const AdminApi = {
  // call at boot: pull a token out of the URL hash, keep it, scrub the URL.
  // Also watches hashchange — pasting /#admin=... into an already-open tab
  // only changes the hash and never re-runs boot code.
  captureToken() {
    const grab = () => {
      const m = location.hash.match(/admin=([\w-]+)/);
      if (m) {
        localStorage.setItem(LS_TOKEN, m[1]);
        history.replaceState(null, '', location.pathname + location.search);
      }
    };
    grab();
    window.addEventListener('hashchange', grab);
  },
  token() {
    return localStorage.getItem(LS_TOKEN) || '';
  },
  // What saves authenticate with: in Supabase mode it's the JWT (admin is
  // enforced by has_role RLS + the save-room-layout fn), so a non-empty marker
  // suppresses the paste-a-token hint. In local dev it's the pasted admin token
  // or the verified Habbo session credential (server.js accepts either).
  credential() {
    if (isSupabase()) return 'supabase-jwt';
    return this.token() || Identity.session() || '';
  },
  // { roomId: [prop,...] } -> save-room-layout edge fn (Supabase, admin-gated)
  // or POST /api/admin/layout (local Node dev, admin token required).
  async saveLayouts(layouts) {
    if (isSupabase()) {
      const json = await invokeFn('save-room-layout', { layouts });
      return json || { ok: false, reason: 'cloud unreachable' };
    }
    try {
      const res = await fetch('/api/admin/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.credential()}` },
        body: JSON.stringify({ layouts }),
      });
      return await res.json();
    } catch {
      return { ok: false, reason: 'server unreachable' };
    }
  },
  async loadLayouts() {
    if (isSupabase()) {
      try {
        const sb = await getSupabase();
        if (!sb) return {};
        const { data } = await sb.from('room_layouts').select('room_id, layout');
        const out = {};
        for (const row of data || []) out[row.room_id] = row.layout || [];
        return out;
      } catch {
        return {}; // offline -> default layouts
      }
    }
    try {
      const res = await fetch('/api/rooms/layout');
      const d = await res.json();
      return d.layouts || {};
    } catch {
      return {}; // static hosting / offline -> default layouts
    }
  },
};

// Strip a live prop down to the whitelisted persistence shape.
export function serializeProp(p) {
  const out = { id: p.id, x: p.x, y: p.y, dir: p.dir ?? 0 };
  if (p.walk === true) out.walk = true;
  if (p.gate === true) out.gate = true;
  if (p.front === true) out.front = true; // dominant: stacked in front (depth.js)
  if (p.teleport) out.teleport = { ...p.teleport }; // RP-arrow destination
  // `tiles` is deliberately NOT persisted: the footprint is derived from the
  // furni's own dims at load (room.js propFootprint). Saving it created a
  // second source of truth that went stale — 40 of 69 multi-tile placements
  // in the live layouts had their footprint transposed 90°.
  return out;
}

// Free Roam furni editor (admin-only, in-memory for now): click a prop and the
// native Shockwave-client "object displayer" infostand appears bottom-right —
// rebuilt from the decompiled r28/v31 client (Quackster/habbo_src:
// hh_room_ui "Room Object Displayer" + "Room Object Window Creator") that
// Havana revives: dark translucent stacked windows, #EEEEEE Volter text, the
// furni preview image, and the owner's move / rotate / pick up button row with
// the client's show/hide-actions toggle. Moving follows the Object Mover Class:
// the real item ghosts along valid tiles; over invalid tiles it swaps to a
// small preview picture stuck to the cursor (showSmallPic/showActualPic).
// Escape cancels. Wraps the explore controller's onTap instead of growing
// explore code.

const footprint = (p) => propFootprint(p);

export class RoomEditor {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.stand = null; // open infostand: { el, ref, gp, canvas }
    this.moving = null; // { gp, ref, offs, orig } while a move is in flight
    this.showActions = true; // client pShowActions (the »/« toggle)
    this.onKey = (e) => {
      if (e.key === 'Escape' && this.moving) this.cancelMove();
    };
  }

  // Wrap a controller's onTap: edit-mode taps are handled here, everything
  // else falls through to the original handler (walking).
  attach(controller) {
    if (this.wrapped === controller) return;
    this.wrapped = controller;
    const orig = controller.onTap.bind(controller);
    controller.onTap = (tile) => {
      if (!this.handleTap(tile)) orig(tile);
    };
  }

  enable() {
    this.active = true;
    document.addEventListener('keydown', this.onKey);
  }

  disable() {
    this.closeStand();
    if (this.moving) this.cancelMove();
    this.active = false;
    document.removeEventListener('keydown', this.onKey);
  }

  // Returns true when the tap was consumed by the editor.
  handleTap(tile) {
    // an in-flight move (including a :furni catalogue spawn while the editor
    // itself is off) always owns the next tap
    if (this.moving) {
      this.placeMove(tile);
      return true;
    }
    if (!this.active) return false;
    const room = this.game.room;
    const ref = room.props.find((p) => footprint(p).some((t) => t.x === tile.x && t.y === tile.y));
    if (!ref) {
      this.closeStand(); // clicking the room deselects (hideObjectInfo)
      return false; // plain floor: let the tap walk
    }
    this.openStand(ref);
    return true;
  }

  // ------------------------------------------------------------ infostand
  // The object displayer stack for furni: obj_disp_furni.window (name /
  // preview image / desc + close) over obj_disp_actions_furni.window (the
  // move·rotate·pick button row behind the actions toggle).

  openStand(ref) {
    this.closeStand();
    const gp = this.game.props.find((p) => p.ref === ref);
    const el = document.createElement('div');
    el.className = 'infostand';
    const name = ref.id.replace(/_/g, ' ');
    const tiles = footprint(ref);
    const w = new Set(tiles.map((t) => t.x)).size;
    const h = new Set(tiles.map((t) => t.y)).size;
    el.innerHTML = `
      <div class="infostand-info">
        <div class="infostand-name"><span>${name}</span><button class="infostand-close" title="Close">&times;</button></div>
        <div class="infostand-preview"><canvas></canvas></div>
        <div class="infostand-desc">${w}&times;${h}${ref.sit ? ' &middot; seat' : ref.walk ? '' : ' &middot; blocks walking'}</div>
      </div>
      <div class="infostand-actions">
        <div class="infostand-buttons">
          <button class="infostand-btn" data-act="move">Move</button>
          <button class="infostand-btn" data-act="rotate">Rotate</button>
          <button class="infostand-btn" data-act="pickup">Pick up</button>
          <button class="infostand-btn${ref.front ? ' active' : ''}" data-act="front">To front</button>
        </div>
        <button class="infostand-toggle"></button>
      </div>`;
    document.body.appendChild(el);
    this.stand = { el, ref, gp, canvas: el.querySelector('canvas') };
    this.renderPreview();
    this.syncActionsToggle();
    el.querySelector('.infostand-close').onclick = () => this.closeStand();
    el.querySelector('.infostand-toggle').onclick = () => {
      this.showActions = !this.showActions; // showHideActions -> refreshView
      this.syncActionsToggle();
    };
    el.querySelector('.infostand-buttons').addEventListener('click', (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (!act) return;
      if (act === 'move' && !this.moving) this.startMove(ref, gp);
      else if (act === 'rotate') this.rotate(ref, gp);
      else if (act === 'pickup') this.pickUp(ref, gp);
      else if (act === 'front') {
        // dominant furniture: force it to stack in front within its depth
        // band (see depth.js) — the escape hatch for art that still fights
        ref.front = !ref.front;
        e.target.classList.toggle('active', !!ref.front);
      }
    });
  }

  // client scaleButtonWindow + the roomnfo_ext arrow: « open, » closed
  syncActionsToggle() {
    if (!this.stand) return;
    const el = this.stand.el;
    el.querySelector('.infostand-buttons').classList.toggle('hidden', !this.showActions);
    el.querySelector('.infostand-toggle').textContent = this.showActions
      ? 'Hide actions \u00ab'
      : 'Show actions \u00bb';
  }

  // furni preview fed into room_obj_disp_avatar: the item's current view
  renderPreview() {
    if (!this.stand) return;
    const { ref, gp, canvas } = this.stand;
    const sp = gp && gp.sprites;
    const fr = sp && sp.ready ? sp.get(ref.dir) : null;
    if (!fr) {
      if (sp && !sp.ready) setTimeout(() => this.renderPreview(), 250); // still loading
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = '';
    canvas.width = fr.w;
    canvas.height = fr.h;
    canvas.getContext('2d').drawImage(fr.img, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);
  }

  closeStand() {
    if (this.stand) this.stand.el.remove();
    this.stand = null;
  }

  // ---------------------------------------------------------------- move

  // Catalogue spawn (:furni): drop a brand-new prop into the live room and
  // hand it straight to the Object Mover — it ghosts along the cursor until a
  // tile is clicked. Escape on a never-placed item returns it to the shop
  // (removed) instead of restoring an original spot it never had.
  spawnNew(spec) {
    if (this.moving) this.cancelMove();
    const room = this.game.room;
    const ref = { ...spec };
    room.props.push(ref);
    room.stampFootprint(ref); // never blocked yet — startMove takes it as a ghost
    const gp = { ...ref, ref, sprites: propSprites(ref.id) };
    this.game.props.push(gp);
    // Escape-to-cancel needs the key handler even with the editor toggled off
    document.addEventListener('keydown', this.onKey);
    this.startMove(ref, gp);
    this.moving.isNew = true;
    return ref;
  }

  startMove(ref, gp) {
    const room = this.game.room;
    if (!ref.walk && !ref.sit) for (const t of footprint(ref)) room.unblock(t.x, t.y);
    this.moving = {
      gp,
      ref,
      offs: footprint(ref).map((t) => ({ dx: t.x - ref.x, dy: t.y - ref.y })),
      orig: { x: ref.x, y: ref.y },
    };
    ref.editGhost = true;
    this.makeSmallPic();
    // Object Mover update(): on a droppable tile the real item ghosts along
    // (showActualPic); anywhere else the item hides and the small preview
    // picture rides the cursor instead (showSmallPic).
    this.prevOnFrame = this.game.onFrame;
    this.game.onFrame = (g, now) => {
      if (this.prevOnFrame) this.prevOnFrame(g, now);
      const h = this.game.hover;
      const ok = h && this.canDrop(h.x, h.y);
      if (ok) this.setPos(h.x, h.y);
      ref.editHide = !ok;
      if (this.smallPic) this.smallPic.style.display = ok ? 'none' : '';
    };
  }

  // the client's small preview member: item view at half size, ink 36 blend 60
  makeSmallPic() {
    const m = this.moving;
    const sp = m.gp && m.gp.sprites;
    const fr = sp && sp.ready ? sp.get(m.ref.dir) : null;
    if (!fr) return;
    const cv = document.createElement('canvas');
    cv.className = 'furni-move-pic';
    cv.width = fr.w;
    cv.height = fr.h;
    cv.style.width = `${Math.round(fr.w / 2)}px`;
    cv.getContext('2d').drawImage(fr.img, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);
    cv.style.display = 'none';
    document.body.appendChild(cv);
    this.smallPic = cv;
    this.onPicMove = (e) => {
      cv.style.left = `${e.clientX - Math.round(fr.w / 4)}px`;
      cv.style.top = `${e.clientY - Math.round(fr.h / 4)}px`;
    };
    window.addEventListener('pointermove', this.onPicMove);
  }

  setPos(x, y) {
    const m = this.moving;
    if (!m) return;
    m.ref.x = m.gp.x = x;
    m.ref.y = m.gp.y = y;
    m.gp.tiles = m.ref.tiles = propFootprint(m.ref); // follows x/y/dir, always
  }

  canDrop(x, y) {
    const room = this.game.room;
    return this.moving.offs.every((o) => {
      const t = room.tile(x + o.dx, y + o.dy);
      return t && !room.isBlocked(x + o.dx, y + o.dy);
    });
  }

  placeMove(tile) {
    if (!this.canDrop(tile.x, tile.y)) return; // invalid spot: keep the ghost up
    this.setPos(tile.x, tile.y);
    this.finishMove();
  }

  cancelMove() {
    const m = this.moving;
    if (m.isNew) {
      // a spawn that never landed: tidy the move state, then remove the item
      this.finishMove();
      this.pickUp(m.ref, m.gp);
      return;
    }
    this.setPos(m.orig.x, m.orig.y); // re-derives the footprint from the old spot
    this.finishMove();
  }

  finishMove() {
    const m = this.moving;
    const room = this.game.room;
    if (!m.ref.walk && !m.ref.sit) for (const t of footprint(m.ref)) room.block(t.x, t.y, m.ref);
    room.restack(); // dropped on (or off) a table: altitudes shift for real
    delete m.ref.editGhost;
    delete m.ref.editHide;
    if (this.smallPic) {
      this.smallPic.remove();
      this.smallPic = null;
      window.removeEventListener('pointermove', this.onPicMove);
    }
    this.game.onFrame = this.prevOnFrame || null;
    this.moving = null;
    // spawnNew added the key handler outside enable(); give it back
    if (!this.active) document.removeEventListener('keydown', this.onKey);
  }

  // ------------------------------------------------------- rotate / pick up

  rotate(ref, gp) {
    const dirs = gp && gp.sprites && gp.sprites.ready ? gp.sprites.data.dirs : null;
    if (!dirs || dirs.length < 2) return;
    const prev = ref.dir;
    const next = dirs[(dirs.indexOf(ref.dir) + 1) % dirs.length];
    const room = this.game.room;
    const solid = !ref.walk && !ref.sit;
    // dirs 2/6 swap the dims, so an asymmetric footprint MOVES on rotate —
    // release the old tiles before re-deriving or the blockers go stale (and,
    // mid-move, so does the Object Mover's drop test)
    if (solid && !this.moving) for (const t of footprint(ref)) room.unblock(t.x, t.y);
    ref.dir = next;
    if (gp) gp.dir = next;
    if (prev % 4 !== next % 4) {
      const tiles = room.stampFootprint(ref);
      if (gp) gp.tiles = tiles;
      if (this.moving) this.moving.offs = tiles.map((t) => ({ dx: t.x - ref.x, dy: t.y - ref.y }));
    }
    if (solid && !this.moving) for (const t of footprint(ref)) room.block(t.x, t.y, ref);
    room.restack(); // a rotated support covers different tiles, so stacks move
    this.renderPreview(); // activeObjectsUpdated -> refreshView
    if (this.moving && this.smallPic) {
      // rotating mid-move: rebuild the cursor pic in the new direction
      this.smallPic.remove();
      this.smallPic = null;
      window.removeEventListener('pointermove', this.onPicMove);
      this.makeSmallPic();
    }
  }

  pickUp(ref, gp) {
    const room = this.game.room;
    if (!ref.walk && !ref.sit) for (const t of footprint(ref)) room.unblock(t.x, t.y);
    room.props = room.props.filter((p) => p !== ref);
    this.game.props = this.game.props.filter((p) => p !== gp);
    this.closeStand(); // client clears the display list on ADDSTRIPITEM
  }
}
