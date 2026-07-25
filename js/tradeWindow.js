// The Safe Trading window — the classic client's trade box: blue title bar,
// the partner's offers on the left, yours on the right (item-ID badges over
// filled sockets), an "agrees" checkbox under each pane, "Add items to box."
// in the footer and Cancel bottom-right.
//
// Items come from the HAND: opening a trade flips the Hand (hand.js) into
// stash mode, and you click or DRAG items from it into the "You offer" box.
// Clicking an offered item takes it back.
//
// All state is server truth (server/trade.js `trade-state` frames): this
// window only sends intents (offer/retract/accept/confirm/cancel) and
// re-renders whatever comes back — including the anti-scam reset, where any
// offer change clears both agree marks. After both agree, the backend's
// second lock unlocks: a Confirm button seals the swap atomically.
import { anyItem, bonusText, rarityOf } from './items.js';
import { propSprites } from './props.js';
import { fetchStash } from './stashApi.js';

const SOCKET = 36; // socket canvas size (px) — same as the Hand
const POLL_MS = 250;
const POLL_MAX = 20;
const MIN_CELLS = 6; // 3×2 wells, like the classic box

export class TradeUI {
  constructor(net, getName) {
    this.net = net;
    this.getName = getName;
    this.getHand = null; // set by main.js: () => the toolbar's Hand instance
    this.el = null; // the trade window
    this.prompt = null; // incoming ask prompt
    this.state = null; // last trade-state frame
    this.stash = null; // my server stash { gold, items }
    this.unsubs = [
      net.on('trade-asked', (m) => this.showAsk(m.from)),
      net.on('trade-state', (m) => this.onState(m)),
      net.on('trade-done', (m) => this.onDone(m)),
      net.on('trade-cancelled', (m) => this.onCancelled(m)),
      net.on('trade-error', (m) => this.flash(m.reason)),
    ];
  }

  get open() {
    return !!this.el;
  }

  // Can a trade be started with this player right now? (infostand hook)
  canTrade() {
    return this.net.connected && !this.open;
  }

  // The infostand's Trade button: ask the partner (session opens when they
  // open back — server/trade.js `open`).
  ask(partnerName) {
    this.net.send({ t: 'trade-open', name: partnerName });
    this.flash(`Waiting for ${partnerName}...`);
  }

  // ------------------------------------------------------------ incoming ask

  showAsk(from) {
    this.closePrompt();
    const el = document.createElement('div');
    el.className = 'party-prompt';
    el.innerHTML = `
      <div class="party-prompt-text"><b>${esc(from)}</b> wants to trade with you!</div>
      <div class="party-prompt-btns">
        <button class="infostand-btn" data-act="yes">Trade</button>
        <button class="infostand-btn" data-act="no">Not now</button>
      </div>`;
    document.body.appendChild(el);
    this.prompt = el;
    el.addEventListener('click', (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (!act) return;
      this.closePrompt();
      if (act === 'yes') this.net.send({ t: 'trade-open', name: from });
    });
    this.promptTimer = setTimeout(() => this.closePrompt(), 60000);
  }

  closePrompt() {
    clearTimeout(this.promptTimer);
    if (this.prompt) this.prompt.remove();
    this.prompt = null;
  }

  // a short-lived toast in the prompt slot (errors, waits, cancels)
  flash(text) {
    this.closePrompt();
    const el = document.createElement('div');
    el.className = 'party-prompt party-prompt--notice';
    el.innerHTML = `<div class="party-prompt-text">${esc(text)}</div>`;
    document.body.appendChild(el);
    this.prompt = el;
    this.promptTimer = setTimeout(() => this.closePrompt(), 3500);
  }

  // ------------------------------------------------------------ session

  async onState(msg) {
    this.state = msg;
    if (!this.el) {
      this.closePrompt();
      this.build(msg.partner);
      this.stash = (await fetchStash()) || { gold: 0, items: [] };
      // the Hand becomes the stash box: click/drag items into the trade
      this.hand = this.getHand ? this.getHand() : null;
      if (this.hand) {
        this.hand.enterTrade({
          items: () => this.availableItems(),
          gold: () => (this.stash ? this.stash.gold : 0),
          offer: (id) => this.net.send({ t: 'trade-offer', item: id }),
        });
      }
    }
    this.render();
    if (this.hand && this.hand.trade) this.hand.render(); // offers moved on/off the table
  }

  // my stash minus what's already on the table (multiset subtraction)
  availableItems() {
    if (!this.stash || !this.state) return [];
    const onTable = [...this.state.you.offer];
    return this.stash.items.filter((id) => {
      const i = onTable.indexOf(id);
      if (i >= 0) {
        onTable.splice(i, 1);
        return false;
      }
      return true;
    });
  }

  onDone(msg) {
    this.stash = msg.stash;
    if (this.el) {
      const foot = this.el.querySelector('.trade-status');
      foot.textContent = 'Trade completed!';
      foot.classList.add('good');
      this.el.querySelector('.trade-actions').innerHTML = '';
      setTimeout(() => this.close(), 1600);
    }
    this.flash('Trade completed!');
  }

  onCancelled(msg) {
    this.close();
    this.flash(msg.reason || 'The trade was cancelled.');
  }

  cancel() {
    if (this.state) this.net.send({ t: 'trade-cancel' });
    this.close();
  }

  close() {
    if (this.el) this.el.remove();
    this.el = null;
    this.state = null;
    if (this.hand) this.hand.exitTrade();
    this.hand = null;
  }

  // ------------------------------------------------------------ the window

  build(partner) {
    const el = document.createElement('div');
    el.className = 'trade-window';
    el.innerHTML = `
      <div class="trade-titlebar"><span>Safe trading</span></div>
      <div class="trade-body">
        <div class="trade-panes">
          <div class="trade-pane trade-pane--them">
            <div class="trade-pane-head">${esc(partner)} offers:</div>
            <div class="trade-grid" data-side="them"></div>
            <label class="trade-agree"><input type="checkbox" disabled data-mark="them"> <span>${esc(partner)} agrees</span></label>
          </div>
          <div class="trade-pane trade-pane--you">
            <div class="trade-pane-head">You offer:</div>
            <div class="trade-grid" data-side="you"></div>
            <label class="trade-agree"><input type="checkbox" data-agree data-mark="you"> <span>You agree</span></label>
          </div>
        </div>
        <div class="trade-foot">
          <span class="trade-status">Add items to box.</span>
          <span class="trade-actions"></span>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    // your agree checkbox = the backend's accept (one-way until offers change)
    el.querySelector('[data-agree]').addEventListener('change', (e) => {
      if (e.target.checked) this.net.send({ t: 'trade-accept' });
      else e.target.checked = true; // un-agreeing isn't a thing; offers reset it
    });
    // clicking an item in YOUR box takes it back off the table
    el.addEventListener('click', (e) => {
      const cell = e.target.closest('.trade-socket');
      if (!cell || !cell.dataset.item) return;
      if (cell.closest('.trade-grid').dataset.side === 'you') {
        this.net.send({ t: 'trade-retract', item: cell.dataset.item });
      }
    });
  }

  render() {
    if (!this.el || !this.state) return;
    const st = this.state;

    this.fillGrid('you', st.you.offer, 'Click to take back');
    this.fillGrid('them', st.them.offer, '');

    // agree checkboxes — the anti-scam reset unticks both when offers change
    const you = this.el.querySelector('[data-mark="you"]');
    const them = this.el.querySelector('[data-mark="them"]');
    you.checked = st.you.accepted;
    you.disabled = st.you.accepted; // one-way; an offer change re-enables it
    them.checked = st.them.accepted;
    them.nextElementSibling.textContent = `${st.partner} agrees${st.them.confirmed ? ' ✓' : ''}`;
    you.nextElementSibling.textContent = `You agree${st.you.confirmed ? ' ✓' : ''}`;

    // footer: status text + the second lock (Confirm) once both agree
    const status = this.el.querySelector('.trade-status');
    const actions = this.el.querySelector('.trade-actions');
    actions.innerHTML = '';
    const btn = (label, fn, cls = '') => {
      const b = document.createElement('button');
      b.className = `trade-btn ${cls}`;
      b.textContent = label;
      b.onclick = fn;
      actions.appendChild(b);
      return b;
    };
    if (st.stage === 'confirm') {
      status.textContent = st.you.confirmed
        ? `Waiting for ${st.partner} to confirm...`
        : 'Both agree! Confirm to seal the trade.';
      status.className = 'trade-status lock';
      if (!st.you.confirmed) btn('Confirm', () => this.net.send({ t: 'trade-confirm' }), 'trade-btn--confirm');
    } else {
      status.textContent = st.you.accepted ? `Waiting for ${st.partner}...` : 'Add items to box.';
      status.className = 'trade-status';
    }
    btn('Cancel', () => this.cancel());
  }

  fillGrid(side, items, hint) {
    const grid = this.el.querySelector(`[data-side="${side}"]`);
    grid.innerHTML = '';
    const cells = Math.max(MIN_CELLS, Math.ceil(items.length / 3) * 3);
    for (let i = 0; i < cells; i++) {
      const id = items[i];
      const it = id && anyItem(id);
      const cell = document.createElement('div');
      cell.className = 'trade-cell';
      const sock = document.createElement('div');
      sock.className = `trade-socket${it ? ' filled' : ''}`;
      if (it) {
        // the classic box shows the item's type ID over each filled socket
        const badge = document.createElement('span');
        badge.className = 'trade-badge';
        badge.textContent = badgeId(id);
        cell.appendChild(badge);
        sock.dataset.item = id;
        sock.title = `${it.name} (${rarityOf(id).name}) · ${it.effectText || bonusText(id)}${hint ? ` · ${hint}` : ''}`;
        const cv = document.createElement('canvas');
        cv.width = SOCKET;
        cv.height = SOCKET;
        cv.dataset.icon = it.icon || '';
        sock.appendChild(cv);
        if (it.icon) drawIcon(cv, it.icon);
      }
      cell.appendChild(sock);
      grid.appendChild(cell);
    }
  }

  // Session teardown (leaving explore) — walking away cancels server-side too.
  detach() {
    this.closePrompt();
    this.close();
  }
}

// The classic box numbers every offered item with its furni type ID; our
// items aren't furni, so a stable two-digit hash of the item id stands in.
function badgeId(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 10 + (h % 90);
}

// Socket icon: the item's real furni art, same lazy sheet-poll as the Hand.
function drawIcon(cv, iconId, tries = 0) {
  if (!cv.isConnected && tries > 0) return;
  if (cv.dataset.icon !== iconId) return;
  const sp = propSprites(iconId);
  if (!sp.ready) {
    if (tries < POLL_MAX) setTimeout(() => drawIcon(cv, iconId, tries + 1), POLL_MS);
    return;
  }
  const fr = sp.get(0) || sp.get(2) || sp.get(4);
  if (!fr) return;
  const ctx = cv.getContext('2d');
  const div = Math.max(1, Math.ceil(Math.max(fr.w / SOCKET, fr.h / SOCKET)));
  const w = Math.max(1, Math.floor(fr.w / div));
  const h = Math.max(1, Math.floor(fr.h / div));
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, SOCKET, SOCKET);
  ctx.drawImage(fr.img, fr.x, fr.y, fr.w, fr.h, Math.round((SOCKET - w) / 2), SOCKET - h, w, h);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
