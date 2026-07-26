// The :furni spawner (admin chat command) — a classic 2006 catalogue-style
// window in the client's toolbar-silver chrome (Volter, black outlines, white
// pills). Lists every extracted prop from assets/props/index.json with lazy
// canvas thumbnails; clicking an item hands a brand-new prop straight to the
// room editor's Object Mover (rides the cursor, click a tile to drop, Escape
// puts it back on the shelf). Edits live in memory like the rest of the
// editor — Save Layout persists them.
import { propSprites } from './props.js';
import { propFootprint } from './room.js';
import { SEATS } from './config.js';

const THUMB = 64; // cell canvas size (px) — one full tile, so most furni draw 1:1
const POLL_MS = 250; // sprite-sheet readiness poll, matches roomEditor
const POLL_MAX = 20; // give up on broken sheets after ~5s

export class FurniCatalog {
  constructor(game, getEditor) {
    this.game = game;
    this.getEditor = getEditor; // () => RoomEditor (created lazily by main.js)
    this.el = null;
    this.index = null; // assets/props/index.json entries
  }

  toggle() {
    if (this.el && !this.el.classList.contains('hidden')) this.close();
    else this.open();
  }

  async open() {
    if (!this.el) this.build();
    this.el.classList.remove('hidden');
    if (!this.index) {
      try {
        const res = await fetch('/assets/props/index.json');
        this.index = res.ok ? await res.json() : [];
      } catch {
        this.index = [];
      }
      this.renderGrid('');
    }
    this.search.focus();
  }

  close() {
    this.unpreview();
    if (this.el) this.el.classList.add('hidden');
  }

  build() {
    const el = document.createElement('div');
    el.className = 'furni-cat';
    el.innerHTML = `
      <div class="furni-cat-head"><span>Furni Catalogue</span><button class="furni-cat-close" title="Close">&times;</button></div>
      <div class="furni-cat-sub">Hey, big spender! Click a furni, then click a tile to drop it. Esc cancels.</div>
      <input class="furni-cat-search" type="text" placeholder="Search furni..." spellcheck="false" autocomplete="off" />
      <div class="furni-cat-grid"><div class="furni-cat-empty">Stocking the shelves...</div></div>
      <div class="furni-cat-foot"></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.grid = el.querySelector('.furni-cat-grid');
    this.search = el.querySelector('.furni-cat-search');
    this.foot = el.querySelector('.furni-cat-foot');
    el.querySelector('.furni-cat-close').onclick = () => this.close();
    this.search.addEventListener('input', () => this.renderGrid(this.search.value));
    this.dragify(el.querySelector('.furni-cat-head'));
    // thumbnails resolve lazily — each cell loads its sheet on first scroll-in
    this.obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          this.obs.unobserve(e.target);
          this.thumb(e.target);
        }
      },
      { root: this.grid, rootMargin: '96px' }
    );
  }

  renderGrid(query) {
    const q = query.trim().toLowerCase();
    const list = q
      ? this.index.filter((e) =>
          e.id.toLowerCase().includes(q) ||
          (e.name || '').toLowerCase().includes(q) ||
          (e.line || '').toLowerCase().includes(q)
        )
      : this.index;
    this.obs.disconnect();
    this.unpreview();
    this.grid.innerHTML = '';
    for (const entry of list) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'furni-cell';
      cell.dataset.id = entry.id;
      cell.dataset.dir = entry.dirs && entry.dirs.length ? entry.dirs[0] : 0;
      cell.title = `${entry.name || entry.id} · ${entry.dims || '1x1'}`;
      const cv = document.createElement('canvas');
      cv.width = THUMB;
      cv.height = THUMB;
      const label = document.createElement('span');
      label.className = 'fc-name';
      label.textContent = entry.name || entry.id;
      cell.append(cv, label);
      cell.addEventListener('click', () => this.spawn(entry));
      cell.addEventListener('mouseenter', () => this.preview(cell));
      cell.addEventListener('mouseleave', () => this.unpreview());
      this.grid.appendChild(cell);
      this.obs.observe(cell);
    }
    if (!list.length) this.grid.innerHTML = '<div class="furni-cat-empty">Nothing on that shelf.</div>';
    this.foot.textContent = q ? `${list.length} of ${this.index.length} furni` : `${this.index.length} furni in stock`;
  }

  // Draw the item's default view into the cell canvas once its sheet loads.
  // Pixel-art rule: NEVER scale by a fraction — fractional nearest-neighbour
  // resampling scrunches lines unevenly. Art that fits draws 1:1; art that
  // doesn't downscales by an exact integer divisor (1/2, 1/3…), which drops
  // every Nth pixel uniformly and keeps the art readable.
  thumb(cell, tries = 0) {
    if (!cell.isConnected) return; // grid re-rendered under us
    const sp = propSprites(cell.dataset.id);
    if (!sp.ready) {
      if (tries < POLL_MAX) setTimeout(() => this.thumb(cell, tries + 1), POLL_MS);
      return;
    }
    const fr = sp.get(Number(cell.dataset.dir) || 0);
    if (!fr) return;
    const cv = cell.querySelector('canvas');
    const ctx = cv.getContext('2d');
    const div = Math.max(1, Math.ceil(Math.max(fr.w / THUMB, fr.h / THUMB)));
    const w = Math.max(1, Math.floor(fr.w / div));
    const h = Math.max(1, Math.floor(fr.h / div));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fr.img, fr.x, fr.y, fr.w, fr.h, Math.round((THUMB - w) / 2), THUMB - h, w, h);
    if (div > 1) cell.dataset.scaled = '1'; // hover preview shows the real art
  }

  // Native-resolution hover preview — the infostand-style dark panel pinned
  // beside the catalogue, showing the untouched pixel art at 1:1.
  preview(cell) {
    this.unpreview();
    const sp = propSprites(cell.dataset.id);
    if (!sp.ready) return;
    const fr = sp.get(Number(cell.dataset.dir) || 0);
    if (!fr) return;
    const pop = document.createElement('div');
    pop.className = 'furni-cat-preview';
    const cv = document.createElement('canvas');
    cv.width = fr.w;
    cv.height = fr.h;
    cv.getContext('2d').drawImage(fr.img, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);
    const cap = document.createElement('span');
    cap.textContent = cell.title;
    pop.append(cv, cap);
    this.el.appendChild(pop);
    // pin beside whichever edge of the window has room, vertically on the cell
    const wr = this.el.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();
    const pw = fr.w + 16;
    const left = wr.left - pw - 6 >= 0 ? -(pw + 6) : wr.width + 6;
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(0, Math.min(wr.height - fr.h - 30, cr.top - wr.top))}px`;
    this.pop = pop;
  }

  unpreview() {
    if (this.pop) this.pop.remove();
    this.pop = null;
  }

  // Build the prop spec exactly like rooms.js would author it (sit height from
  // SEATS, footprint derived by propFootprint) and hand it to the editor's
  // Object Mover.
  spawn(entry) {
    const editor = this.getEditor();
    const room = this.game.room;
    if (!editor || !room) return;
    const dir = entry.dirs && entry.dirs.length ? entry.dirs[0] : 0;
    const spec = { id: entry.id, x: room.spawn.x, y: room.spawn.y, dir };
    if (SEATS[entry.id] != null) spec.sit = SEATS[entry.id];
    if (entry.id === 'rp_arrow') spec.walk = true; // arrows are floor decals
    spec.tiles = propFootprint(spec);
    editor.spawnNew(spec);
  }

  // classic draggable window: grab the title strip, the frame follows
  dragify(handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = this.el.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      this.el.style.right = 'auto';
      const move = (ev) => {
        this.el.style.left = `${Math.max(0, Math.min(window.innerWidth - r.width, ev.clientX - dx))}px`;
        this.el.style.top = `${Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - dy))}px`;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }
}
