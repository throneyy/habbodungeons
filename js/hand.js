// The Hand — the classic client's furni inventory container, rebuilt from the
// decompiled v31 Container Hand Class (hh_room_utils, Quackster/habbo_src):
//   - slides in from the top-right corner with the client's exact 9-frame
//     ease-out (pAnimLocs deltas, one per update tick)
//   - 9 item sockets per page ("room_hand_item_1..9"), paged with the
//     habbo_hand_buttons window pinned 5px into the top-right corner
//     (prev / close / next — close centred between the arrows, per the
//     setHandButtonsVisible layout math)
//   - clicking a socket selects the item (the client starts the Object
//     Mover; our loot isn't placeable furni, so we show its infostand-style
//     detail card instead)
// Data comes from the active run save: the backpack (unequipped loot).
// Equipped gear is worn by the squad, exactly like furni placed in the room.
import { ITEMS, RARITY, bonusText, anyItem, isConsumable } from './items.js';
import { SAVE_KEY } from './run.js';
import { propSprites } from './props.js';
import { drawItemIcon } from './ui/itemIcon.js';

// pAnimLocs from the Lingo source — per-frame [dx, dy] while opening
const ANIM = [[-54, 27], [-42, 21], [-36, 18], [-28, 14], [-22, 11], [-18, 9], [-12, 6], [-10, 5], [-8, 4]];
const TICK_MS = 40; // the client's update pulse (~25fps)
const PAGE = 9;
const SOCKET = 36; // socket canvas size (px)

export class Hand {
  constructor() {
    this.el = null;
    this.page = 0;
    this.selected = null; // index into bag
    this.anim = null; // running slide interval
    this.mode = 'closed'; // 'open' | 'closed' (pAnimMode)
    // host hooks (main.js): equip/unequip a backpack item onto the player
    // right here in the room — the classic "use it from the hand" gesture
    this.onEquip = null; // (itemId) => bool
    this.onUnequip = null; // (slot) => bool
    this.onUse = null; // (itemId) => bool — drink/use a consumable
    // Safe-trading mode (tradeWindow.js): while a trade is open the hand
    // becomes the stash container — it lists the server stash (minus what's
    // already on the table) and click/drag on a socket OFFERS the item into
    // the trade box instead of opening its detail card.
    this.trade = null; // { items: () => [ids], gold: () => n, offer: (id) => void }
    this.dragged = false; // a drag just ended — swallow the trailing click
  }

  // ---- run-save data ------------------------------------------------------

  // Everything the run owns: backpack loot first, then gear worn by the
  // squad (flagged wornBy — shown dimmed, like the client dims hand items
  // that are mid-trade). Without the worn gear a fully-equipped party would
  // open an empty hand and think their items were gone.
  bag() {
    if (this.trade) {
      return { items: this.trade.items().map((id) => ({ id })), gold: this.trade.gold() };
    }
    let run = null;
    try {
      run = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    } catch {
      /* corrupt save -> empty hand */
    }
    const items = [];
    if (run) {
      for (const id of run.inventory || []) items.push({ id });
      for (const m of run.squad || [])
        for (const id of Object.values(m.equipment || {}))
          if (id && ITEMS[id]) items.push({ id, wornBy: m.name, mine: !!m.leader });
    }
    return { items, gold: run ? run.gold : null };
  }

  // ---- open / close (the visualizer lifecycle) ----------------------------

  toggle() {
    if (this.mode === 'open') this.close();
    else this.open();
  }

  open() {
    if (this.mode === 'open') return;
    if (!this.el) this.build();
    this.mode = 'open';
    this.page = 0;
    this.selected = null;
    this.el.classList.remove('hidden');
    this.render();
    this.slide(1);
  }

  close() {
    if (this.mode !== 'open') return;
    this.mode = 'closed';
    this.hideDetail();
    this.unpreview();
    this.slide(-1, () => this.el.classList.add('hidden'));
  }

  // The client walks pAnimLocs one tick at a time (update); opening applies
  // the deltas, closing walks them back. We drive a transform to the same
  // rhythm: fully open = translate(0,0), fully closed = the summed deltas
  // undone (off the top-right corner).
  slide(dirn, done) {
    if (this.anim) clearInterval(this.anim);
    let frame = dirn > 0 ? 0 : ANIM.length;
    // cumulative offset at frame f (0 = fully closed)
    const at = (f) => {
      let x = 0;
      let y = 0;
      for (let i = f; i < ANIM.length; i++) {
        x -= ANIM[i][0];
        y -= ANIM[i][1];
      }
      return [x, y];
    };
    const apply = (f) => {
      const [x, y] = at(f);
      this.el.style.transform = `translate(${x}px, ${y}px)`;
    };
    apply(frame);
    this.anim = setInterval(() => {
      frame += dirn;
      apply(frame);
      if (frame <= 0 || frame >= ANIM.length) {
        clearInterval(this.anim);
        this.anim = null;
        if (done) done();
      }
    }, TICK_MS);
  }

  // ---- DOM ----------------------------------------------------------------

  build() {
    const el = document.createElement('div');
    el.className = 'hand hidden';
    el.innerHTML = `
      <div class="hand-buttons">
        <button class="hand-btn" data-go="-1" title="Previous page">&#9668;</button>
        <button class="hand-btn hand-btn-close" title="Close">&times;</button>
        <button class="hand-btn" data-go="1" title="Next page">&#9658;</button>
      </div>
      <div class="hand-board">
        <div class="hand-title">Hand</div>
        <div class="hand-hint hidden">Drag items into the trade box</div>
        <div class="hand-grid"></div>
        <div class="hand-foot"></div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.grid = el.querySelector('.hand-grid');
    this.foot = el.querySelector('.hand-foot');
    this.titleEl = el.querySelector('.hand-title');
    this.hintEl = el.querySelector('.hand-hint');
    el.querySelector('.hand-btn-close').addEventListener('click', () => this.close());
    el.querySelectorAll('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        const pages = Math.max(1, Math.ceil(this.bag().items.length / PAGE));
        this.page = (this.page + Number(b.dataset.go) + pages) % pages;
        this.selected = null;
        this.hideDetail();
        this.render();
      })
    );
    // 9 fixed sockets, like the client's room_hand_item_1..9 sprites
    for (let i = 0; i < PAGE; i++) {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'hand-socket';
      const cv = document.createElement('canvas');
      cv.width = 36;
      cv.height = 36;
      s.appendChild(cv);
      s.addEventListener('click', () => this.pick(i));
      s.addEventListener('pointerdown', (e) => this.dragStart(e, i));
      s.addEventListener('mouseenter', () => this.preview(i));
      s.addEventListener('mouseleave', () => this.unpreview());
      this.grid.appendChild(s);
    }
  }

  // Native-resolution hover preview — same treatment as the :furni catalogue:
  // the untouched furni art at 1:1 in a dark infostand-style panel pinned
  // beside the board, on whichever side has room.
  preview(i) {
    this.unpreview();
    const { items } = this.bag();
    const entry = items[this.page * PAGE + i];
    const it = entry && anyItem(entry.id);
    if (!it || !it.icon) return;
    const sp = propSprites(it.icon);
    if (!sp.ready) return; // socket poll will have warmed it; just skip early hovers
    const fr = sp.get(0) || sp.get(2) || sp.get(4);
    if (!fr) return;
    const pop = document.createElement('div');
    pop.className = 'hand-preview';
    const cv = document.createElement('canvas');
    cv.width = fr.w;
    cv.height = fr.h;
    cv.getContext('2d').drawImage(fr.img, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);
    const cap = document.createElement('span');
    cap.textContent = it.name;
    pop.append(cv, cap);
    this.el.appendChild(pop);
    const wr = this.el.getBoundingClientRect();
    const sr = this.grid.children[i].getBoundingClientRect();
    const pw = fr.w + 16;
    const left = wr.left - pw - 6 >= 0 ? -(pw + 6) : wr.width + 6;
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(0, Math.min(wr.height - fr.h - 30, sr.top - wr.top))}px`;
    this.pop = pop;
  }

  unpreview() {
    if (this.pop) this.pop.remove();
    this.pop = null;
  }

  // ---- safe-trading mode ---------------------------------------------------

  // The trade window opened: become the stash container (and slide open).
  enterTrade(spec) {
    this.trade = spec;
    this.page = 0;
    this.selected = null;
    if (this.mode !== 'open') this.open();
    else {
      this.hideDetail();
      this.render();
    }
  }

  // The trade ended (done or cancelled): back to the normal run-save hand.
  exitTrade() {
    if (!this.trade) return;
    this.trade = null;
    this.page = 0;
    if (this.mode === 'open') this.close();
  }

  // Pointer-drag from a socket into the trade box: past a small threshold a
  // ghost of the item follows the cursor; dropping it over the "You offer"
  // grid offers the item (release anywhere else just cancels).
  dragStart(e, i) {
    if (!this.trade) return;
    const { items } = this.bag();
    const entry = items[this.page * PAGE + i];
    if (!entry) return;
    const srcCanvas = this.grid.children[i].querySelector('canvas');
    const startX = e.clientX;
    const startY = e.clientY;
    let ghost = null;
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
        this.dragged = true;
        this.unpreview();
        ghost = document.createElement('canvas');
        ghost.width = srcCanvas.width;
        ghost.height = srcCanvas.height;
        ghost.getContext('2d').drawImage(srcCanvas, 0, 0);
        ghost.className = 'hand-drag-ghost';
        document.body.appendChild(ghost);
      }
      if (ghost) {
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
      }
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!ghost) return;
      ghost.remove();
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      if (under && under.closest('.trade-pane--you')) this.trade.offer(entry.id);
      setTimeout(() => (this.dragged = false), 0); // outlive the click event
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  render() {
    this.unpreview(); // sockets may change under a hovering cursor
    const { items, gold } = this.bag();
    if (this.titleEl) this.titleEl.textContent = this.trade ? 'Your stash' : 'Hand';
    if (this.hintEl) this.hintEl.classList.toggle('hidden', !this.trade);
    const start = this.page * PAGE;
    const sockets = this.grid.children;
    for (let i = 0; i < PAGE; i++) {
      const s = sockets[i];
      const entry = items[start + i];
      const it = entry && anyItem(entry.id);
      s.classList.toggle('filled', !!it);
      s.classList.toggle('worn', !!(entry && entry.wornBy));
      s.classList.toggle('selected', this.selected === start + i);
      s.title = it
        ? `${it.name} · ${it.effectText || bonusText(entry.id)}${entry.wornBy ? ` · worn by ${entry.wornBy}` : ''}${this.trade ? ' · drag into the trade box' : ''}`
        : '';
      s.dataset.item = it ? entry.id : '';
      const cv = s.querySelector('canvas');
      cv.getContext('2d').clearRect(0, 0, SOCKET, SOCKET);
      cv.dataset.icon = it && it.icon ? it.icon : ''; // stops any in-flight poll
      if (it && it.icon) drawItemIcon(cv, it.icon);
    }
    const pages = Math.max(1, Math.ceil(items.length / PAGE));
    this.foot.textContent =
      (items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : this.trade ? 'Your stash is empty' : 'Your hand is empty') +
      (pages > 1 ? ` · ${this.page + 1}/${pages}` : '') +
      (gold != null ? ` · ${gold} gold` : '');
  }

  // ---- item detail (our stand-in for "start placing") ---------------------

  pick(i) {
    if (this.dragged) return; // the pointer just finished a drag, not a click
    const { items } = this.bag();
    const idx = this.page * PAGE + i;
    const entry = items[idx];
    if (!entry || !anyItem(entry.id)) return;
    // trading: a socket click offers the item straight into the trade box
    if (this.trade) {
      this.trade.offer(entry.id);
      return;
    }
    const id = entry.id;
    this.selected = this.selected === idx ? null : idx;
    this.render();
    if (this.selected == null) return this.hideDetail();
    const it = anyItem(id);
    const r = RARITY[it.rarity] || RARITY.common;
    if (!this.detail) {
      this.detail = document.createElement('div');
      this.detail.className = 'hand-detail';
      this.el.appendChild(this.detail);
    }
    const consumable = isConsumable(id);
    this.detail.innerHTML = `
      <div class="hand-detail-name" style="color:${r.color}">${it.name}</div>
      <div class="hand-detail-line">${r.name} ${consumable ? 'consumable' : it.slot} · ${it.effectText || bonusText(id)}</div>
      <div class="hand-detail-blurb">${it.blurb || ''}</div>
      <div class="hand-detail-hint">${entry.wornBy ? `Worn by ${entry.wornBy}` : ''}</div>`;
    // wear it right here: equip from the hand (you), take off worn gear (yours)
    const act = document.createElement('button');
    act.type = 'button';
    act.className = 'hand-detail-btn';
    if (consumable && this.onUse) {
      act.textContent = 'Use it';
      act.onclick = () => {
        if (this.onUse(id)) {
          this.hideDetail();
          this.render();
        } else {
          // effect would be wasted (full HP, nobody fallen) — keep the item
          this.detail.querySelector('.hand-detail-hint').textContent = 'No effect right now; saved for later';
        }
      };
      this.detail.appendChild(act);
    } else if (!entry.wornBy && this.onEquip) {
      act.textContent = 'Wear it';
      act.onclick = () => {
        if (this.onEquip(id)) {
          this.hideDetail();
          this.render();
        }
      };
      this.detail.appendChild(act);
    } else if (entry.wornBy && entry.mine && this.onUnequip) {
      act.textContent = 'Take it off';
      act.onclick = () => {
        if (this.onUnequip(it.slot)) {
          this.hideDetail();
          this.render();
        }
      };
      this.detail.appendChild(act);
    }
    this.detail.classList.remove('hidden');
  }

  hideDetail() {
    if (this.detail) this.detail.classList.add('hidden');
    this.selected = null;
  }
}
