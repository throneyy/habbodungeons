// The duel challenge window — the Safe Trading box's sparring partner
// (js/tradeWindow.js), built on exactly the same rails: an ask toast in the
// .party-prompt family, all state from the server (`duel-state` frames off the
// user:<id> mailbox), and a window that only ever sends intents
// (challenge/accept/decline/cancel) and re-renders whatever comes back.
//
// The handshake:
//   Duel (infostand) → duel-challenge → "X wants to duel you!" on their screen
//   → duel-accept    → both sides get the SAME starts_at and run the 3-2-1-GO
//                      off it (js/duelCountdown.js), so the ticks are in step
//   → 'duel ready'   → NO COMBAT YET. The arena is armed and either player can
//                      still back out (Cancel → duel-cancel).
import { duelPhase, clockOffset } from './duelCountdown.js';

const TICK_MS = 60; // overlay repaint cadence (the clock itself is absolute)

export class DuelUI {
  constructor(net, getName) {
    this.net = net;
    this.getName = getName;
    this.el = null; // the duel window
    this.prompt = null; // incoming challenge prompt
    this.state = null; // last duel-state frame
    this.skew = null; // ms to add to Date.now() for server time (see onState)
    this.timer = null; // countdown repaint loop
    // Fired ONCE when the countdown lands in 'ready' — main.js boots the
    // battle from there (js/duelBattle.js). Both clients reach this off the
    // same server anchor, so both boot at the same instant.
    this.onReady = null;
    this.readyFired = false;
    this.unsubs = [
      net.on('duel-asked', (m) => this.showAsk(m.from)),
      net.on('duel-state', (m) => this.onState(m)),
      net.on('duel-declined', (m) => this.onDeclined(m)),
      net.on('duel-cancelled', (m) => this.onCancelled(m)),
      net.on('duel-error', (m) => this.flash(m.reason)),
    ];
  }

  get open() {
    return !!this.el;
  }

  // Can a duel be started with this player right now? (infostand hook)
  canDuel() {
    return this.net.connected && !this.open;
  }

  // The infostand's Duel button: the server decides whether it lands (same
  // room, both free) — we just show the wait.
  ask(targetName) {
    this.net.send({ t: 'duel-challenge', name: targetName });
    this.flash(`Waiting for ${targetName}...`);
  }

  // ------------------------------------------------------------ incoming ask

  showAsk(from) {
    this.closePrompt();
    const el = document.createElement('div');
    el.className = 'party-prompt';
    el.innerHTML = `
      <div class="party-prompt-text"><b>${esc(from)}</b> wants to duel you!</div>
      <div class="party-prompt-btns">
        <button class="infostand-btn" data-act="yes">Duel</button>
        <button class="infostand-btn" data-act="no">Not now</button>
      </div>`;
    document.body.appendChild(el);
    this.prompt = el;
    el.addEventListener('click', (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (!act) return;
      this.closePrompt();
      if (act === 'yes') this.net.send({ t: 'duel-accept', from });
      else this.net.send({ t: 'duel-decline', from });
    });
    this.promptTimer = setTimeout(() => this.closePrompt(), 60000);
  }

  closePrompt() {
    clearTimeout(this.promptTimer);
    if (this.prompt) this.prompt.remove();
    this.prompt = null;
  }

  // a short-lived toast in the prompt slot (errors, waits, declines)
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

  onState(msg) {
    this.state = msg;
    // Pin this machine's clock to the server's, once per duel. Every tick from
    // here on reads server time, so a wrong (or deliberately advanced) local
    // clock can't move this screen's GO off the opponent's — which is the only
    // thing that makes the shared starts_at anchor worth anything.
    if (this.skew === null) this.skew = clockOffset(msg.serverNow, Date.now());
    if (!this.el) {
      this.closePrompt();
      this.build(msg.opponent);
    }
    this.render();
    this.startClock();
  }

  /** Server time, as this client best understands it. */
  now() {
    return Date.now() + (this.skew || 0);
  }

  onDeclined(msg) {
    this.close();
    this.flash(`${msg.name || 'They'} declined the duel.`);
  }

  onCancelled(msg) {
    this.close();
    this.flash(msg.reason || 'The duel was called off.');
  }

  cancel() {
    if (this.state) this.net.send({ t: 'duel-cancel' });
    this.close();
  }

  close() {
    this.stopClock();
    if (this.el) this.el.remove();
    this.el = null;
    this.state = null;
    this.skew = null; // the next duel measures its own offset
    this.readyFired = false;
  }

  // ------------------------------------------------------------ the window

  build(opponent) {
    const el = document.createElement('div');
    el.className = 'duel-window';
    el.innerHTML = `
      <div class="duel-titlebar"><span>Duel</span></div>
      <div class="duel-body">
        <div class="duel-foes">
          <span class="duel-foe">${esc(this.getName() || 'You')}</span>
          <span class="duel-vs">vs</span>
          <span class="duel-foe">${esc(opponent)}</span>
        </div>
        <div class="duel-count" data-count>3</div>
        <div class="duel-foot">
          <span class="duel-status">Get ready...</span>
          <span class="duel-actions"></span>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
  }

  // Repaint off the absolute (server-corrected) clock — never a local
  // "seconds remaining" counter, so a slow frame or a backgrounded tab can't
  // desync the two sides.
  startClock() {
    this.stopClock();
    this.timer = setInterval(() => this.render(), TICK_MS);
  }

  stopClock() {
    clearInterval(this.timer);
    this.timer = null;
  }

  render() {
    if (!this.el || !this.state) return;
    const st = this.state;
    const p = duelPhase(st, this.now());

    const count = this.el.querySelector('[data-count]');
    count.textContent = p.label;
    count.className = `duel-count duel-count--${p.phase}`;

    const status = this.el.querySelector('.duel-status');
    if (p.phase === 'ready') {
      status.textContent = `Duel ready — ${st.opponent} is facing you.`;
      status.className = 'duel-status lock';
      this.stopClock(); // the clock has nothing left to say: combat takes over
    } else {
      status.textContent = p.phase === 'go' ? 'GO!' : 'Get ready...';
      status.className = 'duel-status';
    }

    const actions = this.el.querySelector('.duel-actions');
    actions.innerHTML = '';
    const b = document.createElement('button');
    b.className = 'trade-btn'; // the shared white-pill footer button
    b.textContent = 'Cancel';
    b.onclick = () => this.cancel();
    actions.appendChild(b);

    // LAST, once this window is fully painted and needs nothing more from
    // itself: the handler boots the arena and closes this window (close()
    // nulls this.el), so anything after it would be reaching into a window
    // that no longer exists.
    if (p.phase === 'ready' && !this.readyFired) {
      this.readyFired = true;
      if (this.onReady) this.onReady(st);
    }
  }

  // Session teardown (leaving explore) — walking away calls it off server-side.
  detach() {
    this.closePrompt();
    if (this.state) this.net.send({ t: 'duel-cancel' });
    this.close();
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
