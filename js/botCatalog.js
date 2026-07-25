// The :npc spawner (admin chat command) — the bot counterpart to :furni, in
// the same 2006 catalogue chrome (it reuses the .furni-cat CSS family). Lists
// every walking room bot defined in js/botsData.js with a live habbo-imaging
// thumbnail; clicking one hands it to RoomBots.beginPlace — the bot rides the
// cursor until a tile is clicked (Escape puts it back on the shelf). Edits live
// in memory like the furni editor's; Save Layout persists them.
import { ROOM_BOTS } from './botsData.js';
import { avatarUrl } from './roomBots.js';

export class BotCatalog {
  // onPick: (def) => void — main.js wires it to roomBots.beginPlace
  constructor(onPick) {
    this.onPick = onPick;
    this.el = null;
  }

  toggle() {
    if (this.el && !this.el.classList.contains('hidden')) this.close();
    else this.open();
  }

  open() {
    if (!this.el) this.build();
    this.el.classList.remove('hidden');
    this.renderGrid('');
    this.search.focus();
  }

  close() {
    this.unpreview();
    if (this.el) this.el.classList.add('hidden');
  }

  build() {
    const el = document.createElement('div');
    el.className = 'furni-cat bot-cat';
    el.innerHTML = `
      <div class="furni-cat-head"><span>Bot Catalogue</span><button class="furni-cat-close" title="Close">&times;</button></div>
      <div class="furni-cat-sub">Click a bot, then click a tile to drop it. It wanders from there. Esc cancels.</div>
      <input class="furni-cat-search" type="text" placeholder="Search bots..." spellcheck="false" autocomplete="off" />
      <div class="furni-cat-grid"></div>
      <div class="furni-cat-foot"></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.grid = el.querySelector('.furni-cat-grid');
    this.search = el.querySelector('.furni-cat-search');
    this.foot = el.querySelector('.furni-cat-foot');
    el.querySelector('.furni-cat-close').onclick = () => this.close();
    this.search.addEventListener('input', () => this.renderGrid(this.search.value));
    this.dragify(el.querySelector('.furni-cat-head'));
  }

  renderGrid(query) {
    const q = query.trim().toLowerCase();
    const list = q
      ? ROOM_BOTS.filter(
          (b) =>
            b.key.toLowerCase().includes(q) ||
            b.name.toLowerCase().includes(q) ||
            (b.desc || '').toLowerCase().includes(q)
        )
      : ROOM_BOTS;
    this.unpreview();
    this.grid.innerHTML = '';
    for (const def of list) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'furni-cell bot-cell';
      cell.title = `${def.name} · ${def.desc || 'room bot'}`;
      const img = document.createElement('img');
      img.alt = def.name;
      img.loading = 'lazy'; // one imaging request per cell, only when scrolled in
      img.src = avatarUrl(def.figure, 2, 's');
      const label = document.createElement('span');
      label.className = 'fc-name';
      label.textContent = def.name;
      cell.append(img, label);
      cell.addEventListener('click', () => this.pick(def));
      cell.addEventListener('mouseenter', () => this.preview(cell, def));
      cell.addEventListener('mouseleave', () => this.unpreview());
      this.grid.appendChild(cell);
    }
    if (!list.length) this.grid.innerHTML = '<div class="furni-cat-empty">No bot by that name.</div>';
    this.foot.textContent = q ? `${list.length} of ${ROOM_BOTS.length} bots` : `${ROOM_BOTS.length} bots for hire`;
  }

  pick(def) {
    if (this.onPick) this.onPick(def);
    this.close();
  }

  // Full-size hover preview pinned beside the window — the infostand-family
  // dark panel the furni catalogue uses, with a size-m avatar render.
  preview(cell, def) {
    this.unpreview();
    const pop = document.createElement('div');
    pop.className = 'furni-cat-preview bot-cat-preview';
    const img = document.createElement('img');
    img.alt = def.name;
    img.src = avatarUrl(def.figure, 2, 'm');
    const cap = document.createElement('span');
    cap.textContent = `${def.name} · ${def.desc || 'room bot'}`;
    pop.append(img, cap);
    this.el.appendChild(pop);
    const wr = this.el.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();
    const pw = 80; // avatar render is ~64 wide + panel padding
    const left = wr.left - pw - 6 >= 0 ? -(pw + 6) : wr.width + 6;
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(0, Math.min(wr.height - 140, cr.top - wr.top))}px`;
    this.pop = pop;
  }

  unpreview() {
    if (this.pop) this.pop.remove();
    this.pop = null;
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
