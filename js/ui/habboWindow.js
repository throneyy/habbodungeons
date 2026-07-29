// HabboWindow — the v31 Shockwave client's standard window, as a reusable
// primitive: teal dithered title bar (title + outlined ✕), an OPTIONAL tab
// strip whose active cap fuses into the panel below, a scrollable body slot
// and an OPTIONAL footer slot.
//
// It is deliberately dumb chrome: it owns the frame, the tabs and the slots,
// never the contents. Callers fill `win.body` with whatever the container is
// (item grid, list, form) and listen to onTab / onClose. All of the look is
// pure CSS (.hw* in css/style.css) — no image assets, Volter 9px crispified
// like .hand-board and .infostand.
//
// Usage:
//   const win = new HabboWindow({
//     title: 'Backpack',
//     tabs: ['Consumables', 'Items'],
//     bodyHeight: 168,
//     onTab: (tab, i) => render(i),
//     onClose: () => …,
//   });
//   win.setBody('<div class="hw-grid">…</div>');
//   win.setFooter('<div class="hw-detail">…</div><span class="hw-gold">…</span>');
//   win.mount(document.body);

// Normalise a tab entry: 'Items' or { id, label } -> { id, label }
function toTab(tab, i) {
  if (typeof tab === 'string') return { id: tab, label: tab };
  return { id: tab.id ?? String(i), label: tab.label ?? String(tab.id ?? i) };
}

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

// Fill a slot with either an HTML string or a live node.
function fill(host, content) {
  host.textContent = '';
  if (content == null) return;
  if (content instanceof Node) host.appendChild(content);
  else host.innerHTML = String(content);
}

export class HabboWindow {
  // opts:
  //   title       string — title bar caption
  //   tabs        array of 'Label' | { id, label } (omit/[] for a plain window)
  //   activeTab   index or tab id (default 0)
  //   closable    show the ✕ (default true)
  //   width       px width of the panel's inner face (default 340, the
  //               client's Backpack width: 6×46 sockets + gutters + scrollbar)
  //   bodyHeight  px height of the scrollable body — omit to hug content
  //   className   extra class(es) on the root element
  //   onTab       (tab, index) => void — fires on user tab clicks only
  //   onClose     () => void — fires after close() detaches the window
  constructor(opts = {}) {
    const {
      title = '',
      tabs = [],
      activeTab = 0,
      closable = true,
      width = 340,
      bodyHeight = null,
      className = '',
    } = opts;

    this.onTab = opts.onTab || null;
    this.onClose = opts.onClose || null;
    this.tabs = [];
    this.activeIndex = 0;

    const el = document.createElement('div');
    el.className = `hw${className ? ` ${className}` : ''}`;
    el.innerHTML = `
      <div class="hw-titlebar">
        <span class="hw-title"></span>
        ${closable ? '<button type="button" class="hw-close" aria-label="Close"></button>' : ''}
      </div>
      <div class="hw-tabs" role="tablist"></div>
      <div class="hw-panel">
        <div class="hw-body"></div>
      </div>`;

    this.el = el;
    this.titleEl = el.querySelector('.hw-title');
    this.tabsEl = el.querySelector('.hw-tabs');
    this.panelEl = el.querySelector('.hw-panel');
    this.bodyEl = el.querySelector('.hw-body');
    this.footEl = null;

    // The width option sizes the panel face; the frame adds its 9px margins.
    if (width != null) this.panelEl.style.width = `${width}px`;
    if (bodyHeight != null) this.bodyEl.style.height = `${bodyHeight}px`;

    this.setTitle(title);
    this.setTabs(tabs, activeTab);

    const closeBtn = el.querySelector('.hw-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    // One delegated listener survives every setTabs() rebuild.
    this.tabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.hw-tab');
      if (!btn || btn.classList.contains('is-active')) return;
      const i = Number(btn.dataset.index);
      this.selectTab(i);
      if (this.onTab) this.onTab(this.tabs[i], i);
    });
  }

  // ---- slots --------------------------------------------------------------

  // The scrollable body element — fill it directly for fine-grained updates.
  get body() {
    return this.bodyEl;
  }

  setTitle(title) {
    this.titleEl.textContent = title;
    return this;
  }

  setBody(content) {
    fill(this.bodyEl, content);
    return this;
  }

  // Pass null to drop the footer entirely (the panel closes up behind it).
  setFooter(content) {
    if (content == null) {
      if (this.footEl) this.footEl.remove();
      this.footEl = null;
      return this;
    }
    if (!this.footEl) {
      this.footEl = document.createElement('div');
      this.footEl.className = 'hw-footer';
      this.panelEl.appendChild(this.footEl);
    }
    fill(this.footEl, content);
    return this;
  }

  // ---- tabs ---------------------------------------------------------------

  // Rebuild the strip. An empty list makes this a plain (untabbed) window:
  // the strip is hidden and the panel gets its top corners back.
  setTabs(tabs = [], active = 0) {
    this.tabs = tabs.map(toTab);
    this.el.classList.toggle('hw--tabbed', this.tabs.length > 0);
    this.tabsEl.classList.toggle('hidden', this.tabs.length === 0);
    this.tabsEl.innerHTML = this.tabs
      .map(
        (t, i) =>
          `<button type="button" class="hw-tab" role="tab" data-index="${i}" data-id="${esc(t.id)}">${esc(t.label)}</button>`,
      )
      .join('');
    this.selectTab(active);
    return this;
  }

  // Activate a tab by index or id. Silent: does NOT fire onTab (that is for
  // user clicks), so hosts can sync the strip without re-entering render.
  selectTab(which) {
    const i =
      typeof which === 'number' ? which : this.tabs.findIndex((t) => t.id === which);
    this.activeIndex = Math.max(0, Math.min(this.tabs.length - 1, i < 0 ? 0 : i));
    [...this.tabsEl.children].forEach((btn, n) => {
      const on = n === this.activeIndex;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    return this;
  }

  get activeTab() {
    return this.tabs[this.activeIndex] || null;
  }

  // ---- lifecycle ----------------------------------------------------------

  mount(parent = document.body) {
    parent.appendChild(this.el);
    return this;
  }

  get open() {
    return !!this.el.parentNode;
  }

  close() {
    if (!this.open) return this;
    this.el.remove();
    if (this.onClose) this.onClose();
    return this;
  }
}
