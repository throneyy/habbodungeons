// The :consumables window (admin chat command) — the potion shelf, sibling of
// :clothing. Lists every consumable in the game (CONSUMABLES table) in the
// shared catalogue chrome, each cell showing the item's real furni art with a
// native-res hover preview. Click a potion to drop it in your backpack; use
// it from the Hand ("Use it").
import { CONSUMABLES, RARITY } from './items.js';
import { propSprites } from './props.js';

const CELL = 64;
const POLL_MS = 250;
const POLL_MAX = 20;

export class ConsumablesCatalog {
  // onTake: (itemId) => bool — grant the item to the run's backpack
  constructor(onTake) {
    this.onTake = onTake;
    this.el = null;
  }

  toggle() {
    if (this.el && !this.el.classList.contains('hidden')) this.close();
    else this.open();
  }

  open() {
    if (!this.el) this.build();
    this.el.classList.remove('hidden');
    this.render();
  }

  close() {
    if (this.el) {
      this.unpreview();
      this.el.classList.add('hidden');
    }
  }

  build() {
    const el = document.createElement('div');
    el.className = 'furni-cat clothing-cat';
    el.innerHTML = `
      <div class="furni-cat-head"><span>Potions &amp; Curios</span><button class="furni-cat-close" title="Close">&times;</button></div>
      <div class="furni-cat-sub">One sip each. Click to pocket it, then use it from your Hand.</div>
      <div class="furni-cat-grid"></div>
      <div class="furni-cat-foot"></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.grid = el.querySelector('.furni-cat-grid');
    this.foot = el.querySelector('.furni-cat-foot');
    el.querySelector('.furni-cat-close').onclick = () => this.close();
    el.querySelector('.furni-cat-head').addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      el.style.right = 'auto';
      const move = (ev) => {
        el.style.left = `${Math.max(0, Math.min(window.innerWidth - r.width, ev.clientX - dx))}px`;
        el.style.top = `${Math.max(0, Math.min(window.innerHeight - 60, ev.clientY - dy))}px`;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  render() {
    this.grid.innerHTML = '';
    const ids = Object.keys(CONSUMABLES);
    for (const id of ids) {
      const it = CONSUMABLES[id];
      const r = RARITY[it.rarity] || RARITY.common;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'furni-cell';
      cell.title = `${it.name} · ${r.name} · ${it.effectText}`;
      const cv = document.createElement('canvas');
      cv.width = CELL;
      cv.height = CELL;
      cv.dataset.icon = it.icon || '';
      const label = document.createElement('span');
      label.className = 'fc-name';
      label.style.color = r.color;
      label.textContent = it.name;
      cell.append(cv, label);
      cell.addEventListener('click', () => {
        if (this.onTake && this.onTake(id)) this.foot.textContent = `${it.name} tucked into your backpack`;
      });
      cell.addEventListener('mouseenter', () => this.preview(cell, it));
      cell.addEventListener('mouseleave', () => this.unpreview());
      this.grid.appendChild(cell);
      if (it.icon) this.drawIcon(cv, it.icon);
    }
    this.foot.textContent = `${ids.length} concoctions on the shelf`;
  }

  // real furni art, integer-scaled — same rules as the other catalogues
  drawIcon(cv, iconId, tries = 0) {
    if (!cv.isConnected || cv.dataset.icon !== iconId) return;
    const sp = propSprites(iconId);
    if (!sp.ready) {
      if (tries < POLL_MAX) setTimeout(() => this.drawIcon(cv, iconId, tries + 1), POLL_MS);
      return;
    }
    const fr = sp.get(0) || sp.get(2) || sp.get(4);
    if (!fr) return;
    const ctx = cv.getContext('2d');
    const div = Math.max(1, Math.ceil(Math.max(fr.w / CELL, fr.h / CELL)));
    const w = Math.max(1, Math.floor(fr.w / div));
    const h = Math.max(1, Math.floor(fr.h / div));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fr.img, fr.x, fr.y, fr.w, fr.h, Math.round((CELL - w) / 2), CELL - h, w, h);
  }

  preview(cell, it) {
    this.unpreview();
    if (!it.icon) return;
    const sp = propSprites(it.icon);
    if (!sp.ready) return;
    const fr = sp.get(0) || sp.get(2) || sp.get(4);
    if (!fr) return;
    const pop = document.createElement('div');
    pop.className = 'furni-cat-preview';
    const cv = document.createElement('canvas');
    cv.width = fr.w;
    cv.height = fr.h;
    cv.getContext('2d').drawImage(fr.img, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);
    const cap = document.createElement('span');
    cap.textContent = `${it.name} · ${it.effectText}`;
    pop.append(cv, cap);
    this.el.appendChild(pop);
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
}
