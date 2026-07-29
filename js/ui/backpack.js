// Backpack — the classic client's Backpack window, dressed onto the generic
// HabboWindow primitive (habboWindow.js): a teal-framed panel whose body is
// a scrolling .hw-grid of 46px .hw-socket wells (6 per row, the client's
// Backpack width) and whose fixed-height footer holds the selected item's
// .hw-detail card beside the run's .hw-gold, exactly the dressing described
// in habboWindow.js's own doc comment.
//
// Same data source as the Hand (hand.js): the active run save. Unequipped
// loot fills the grid; gear worn by the squad is listed too, dimmed
// (.is-worn), so a fully-equipped party doesn't open the Backpack and think
// their items vanished. Loose items sharing an id stack into one socket with
// a .hw-qty badge — the Backpack doesn't page like the Hand, it scrolls.
import { HabboWindow } from './habboWindow.js';
import { drawItemIcon } from './itemIcon.js';
import { ITEMS, RARITY, bonusText, anyItem, isConsumable } from '../items.js';
import { SAVE_KEY } from '../run.js';

const SOCKET = 36; // socket canvas size (px) — same as the Hand
const WIDTH = 340; // 6×46 sockets + gutters + scrollbar, per habboWindow.js
const BODY_HEIGHT = 214; // ~4 rows visible; the rest scrolls

export class Backpack {
  constructor() {
    this.win = null;
    this.gridEl = null;
    this.selectedKey = null; // `${itemId}:${wornBy||''}` of the selected socket
    // host hooks (main.js): equip/unequip a backpack item onto the run
    // leader, or drink/use a consumable — same contract as Hand's.
    this.onEquip = null; // (itemId) => bool
    this.onUnequip = null; // (slot) => bool
    this.onUse = null; // (itemId) => bool
  }

  // ---- run-save data --------------------------------------------------------

  // Everything the run owns: backpack loot first, then gear worn by the
  // squad (flagged wornBy, dimmed in the grid). Mirrors Hand.bag() minus the
  // safe-trading branch — trading still borrows the Hand itself.
  bag() {
    let run = null;
    try {
      run = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    } catch {
      /* corrupt save -> empty backpack */
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

  // Loose items sharing an id collapse into one socket (qty badge); each
  // worn item keeps its own socket since its "worn by" note is per-bearer.
  groupEntries(items) {
    const list = [];
    const byId = new Map();
    for (const entry of items) {
      if (entry.wornBy) {
        list.push({ ...entry, qty: 1 });
        continue;
      }
      const g = byId.get(entry.id);
      if (g) g.qty++;
      else {
        const rec = { id: entry.id, qty: 1 };
        byId.set(entry.id, rec);
        list.push(rec);
      }
    }
    return list;
  }

  // ---- open / close ---------------------------------------------------------

  toggle() {
    if (this.win && this.win.open) this.close();
    else this.open();
  }

  open() {
    if (this.win && this.win.open) return;
    if (!this.win) this.build();
    this.selectedKey = null;
    this.win.mount(document.body);
    this.render();
  }

  close() {
    if (this.win) this.win.close();
  }

  get isOpen() {
    return !!(this.win && this.win.open);
  }

  // ---- DOM --------------------------------------------------------------

  build() {
    this.win = new HabboWindow({
      title: 'Backpack',
      width: WIDTH,
      bodyHeight: BODY_HEIGHT,
      onClose: () => {
        this.selectedKey = null;
      },
    });
    this.gridEl = document.createElement('div');
    this.gridEl.className = 'hw-grid';
    this.win.setBody(this.gridEl);
  }

  render() {
    if (!this.win) return;
    const { items, gold } = this.bag();
    const list = this.groupEntries(items);
    this.gridEl.innerHTML = '';
    for (const entry of list) {
      const it = anyItem(entry.id);
      if (!it) continue;
      const key = `${entry.id}:${entry.wornBy || ''}`;
      const s = document.createElement('button');
      s.type = 'button';
      s.className =
        'hw-socket is-filled' +
        (entry.wornBy ? ' is-worn' : '') +
        (this.selectedKey === key ? ' is-selected' : '');
      s.title = `${it.name} · ${it.effectText || bonusText(entry.id)}${entry.wornBy ? ` · worn by ${entry.wornBy}` : ''}`;
      const cv = document.createElement('canvas');
      cv.width = SOCKET;
      cv.height = SOCKET;
      s.appendChild(cv);
      if (entry.qty > 1) {
        const qty = document.createElement('span');
        qty.className = 'hw-qty';
        qty.textContent = String(entry.qty);
        s.appendChild(qty);
      }
      s.addEventListener('click', () => this.pick(entry, key));
      this.gridEl.appendChild(s);
      if (it.icon) drawItemIcon(cv, it.icon);
    }
    this.renderFooter(list, items.length, gold);
  }

  pick(entry, key) {
    this.selectedKey = this.selectedKey === key ? null : key;
    this.render();
  }

  renderFooter(list, itemCount, gold) {
    const selected = list.find((e) => `${e.id}:${e.wornBy || ''}` === this.selectedKey);
    const detail = document.createElement('div');
    if (selected) {
      const it = anyItem(selected.id);
      const r = RARITY[it.rarity] || RARITY.common;
      const consumable = isConsumable(selected.id);
      detail.className = 'hw-detail';
      detail.innerHTML = `
        <div class="hw-detail-name" style="color:${r.color}">${it.name}</div>
        <div class="hw-detail-line">${r.name} ${consumable ? 'consumable' : it.slot} · ${it.effectText || bonusText(selected.id)}</div>
        <div class="hw-detail-blurb">${it.blurb || ''}${selected.wornBy ? ` · Worn by ${selected.wornBy}` : ''}</div>`;
    } else {
      detail.className = 'hw-detail is-empty';
      detail.textContent = itemCount
        ? `${itemCount} item${itemCount === 1 ? '' : 's'}`
        : 'Your backpack is empty';
    }

    const frag = document.createDocumentFragment();
    frag.appendChild(detail);

    if (selected) {
      const it = anyItem(selected.id);
      const consumable = isConsumable(selected.id);
      const act = document.createElement('button');
      act.type = 'button';
      act.className = 'hw-btn';
      if (consumable && this.onUse) {
        act.textContent = 'Use it';
        act.onclick = () => {
          if (this.onUse(selected.id)) {
            this.selectedKey = null;
            this.render();
          }
        };
        frag.appendChild(act);
      } else if (!selected.wornBy && this.onEquip) {
        act.textContent = 'Wear it';
        act.onclick = () => {
          if (this.onEquip(selected.id)) {
            this.selectedKey = null;
            this.render();
          }
        };
        frag.appendChild(act);
      } else if (selected.wornBy && selected.mine && this.onUnequip) {
        act.textContent = 'Take it off';
        act.onclick = () => {
          if (this.onUnequip(it.slot)) {
            this.selectedKey = null;
            this.render();
          }
        };
        frag.appendChild(act);
      }
    }

    const goldEl = document.createElement('span');
    goldEl.className = 'hw-gold';
    goldEl.textContent = gold != null ? `${gold} gold` : '';
    frag.appendChild(goldEl);

    this.win.setFooter(frag);
    this.win.footEl.classList.add('hw-footer--detail');
  }
}
