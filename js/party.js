// Party formation UI (Free Roam): the invite prompt and the roster chip
// strip docked above the chat toolbar.
//
// Server truth lives in server/presence.js — this renders the `party`
// roster broadcasts and sends invite/accept/decline/party-leave/disband.
// The Invite entry point is the human infostand's button (humanInfostand.js).
import { IMAGING_URL, DEFAULT_FIGURE } from './config.js';

const PARTY_MAX = 4;

// A member with no figure shows the default Habbo's head, never an empty chip.
function headUrl(figure) {
  const p = new URLSearchParams({
    figure: figure || DEFAULT_FIGURE,
    action: 'std',
    direction: '2',
    head_direction: '2',
    headonly: '1',
    size: 's',
    img_format: 'png',
  });
  return `${IMAGING_URL}?${p}`;
}

export class PartyUI {
  constructor(net, getName) {
    this.net = net;
    this.getName = getName; // () => my Habbo name
    this.state = null; // { leader, members: [{name, figure}] } | null
    this.strip = null; // roster chip strip (visible while in a party)
    this.prompt = null; // pending invite prompt
    this.onParty = null; // (state) => hook for descent wiring (main.js)
    this.unsubs = [
      net.on('invited', (m) => this.showInvite(m.from)),
      net.on('party', (m) => this.onState(m)),
      net.on('declined', (m) => this.notice(`${m.name} declined the invite.`)),
      net.on('net-error', (m) => this.onNetError(m)),
      net.on('close', () => this.onState({ leader: null, members: [] })),
    ];
  }

  // A party/trade send the server refused (HTTP 200 + { ok:false, reason } —
  // see SupabaseNet.send). Surface the server's own wording rather than a
  // generic failure, and undo the infostand's optimistic 'Invited…' state so
  // the button isn't dead until the panel is reopened.
  onNetError({ t, reason }) {
    this.notice(reason);
    if (t === 'invite') this.resetInviteButton();
  }

  // humanInfostand.js flips its own button the instant it's clicked; only the
  // network answer knows whether that was warranted.
  resetInviteButton() {
    const btn = document.querySelector('.infostand--human [data-act="invite"]');
    if (!btn) return;
    btn.textContent = 'Invite to Party';
    btn.disabled = !this.canInvite();
  }

  get inParty() {
    return !!this.state;
  }

  get isLeader() {
    return !!this.state && this.state.leader.toLowerCase() === String(this.getName() || '').toLowerCase();
  }

  // The infostand asks: can I invite this player right now?
  canInvite() {
    if (!this.net.connected) return false;
    if (!this.state) return true; // partyless — the invite founds the party
    return this.isLeader && this.state.members.length < PARTY_MAX;
  }

  invite(name) {
    this.net.send({ t: 'invite', name });
  }

  onState(msg) {
    this.state = msg.leader ? { leader: msg.leader, members: msg.members } : null;
    if (this.onParty) this.onParty(this.state);
    this.render();
  }

  // ------------------------------------------------------------ invite prompt

  showInvite(from) {
    this.closePrompt();
    const el = document.createElement('div');
    el.className = 'party-prompt';
    el.innerHTML = `
      <div class="party-prompt-text"><b>${escapeHtml(from)}</b> invites you to a party!</div>
      <div class="party-prompt-btns">
        <button class="infostand-btn" data-act="accept">Accept</button>
        <button class="infostand-btn" data-act="decline">Decline</button>
      </div>`;
    document.body.appendChild(el);
    this.prompt = el;
    el.addEventListener('click', (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (!act) return;
      this.net.send({ t: act, from });
      this.closePrompt();
    });
    // invites lapse server-side after 60s; fold the prompt in step
    this.promptTimer = setTimeout(() => this.closePrompt(), 60000);
  }

  closePrompt() {
    clearTimeout(this.promptTimer);
    if (this.prompt) this.prompt.remove();
    this.prompt = null;
  }

  // a short-lived line in the prompt slot (declines, drops)
  notice(text) {
    this.closePrompt();
    const el = document.createElement('div');
    el.className = 'party-prompt party-prompt--notice';
    el.innerHTML = `<div class="party-prompt-text">${escapeHtml(text)}</div>`;
    document.body.appendChild(el);
    this.prompt = el;
    this.promptTimer = setTimeout(() => this.closePrompt(), 4000);
  }

  // ------------------------------------------------------------- chip strip

  render() {
    if (!this.state) {
      if (this.strip) this.strip.remove();
      this.strip = null;
      return;
    }
    if (!this.strip) {
      this.strip = document.createElement('div');
      this.strip.id = 'partyStrip';
      document.body.appendChild(this.strip);
    }
    const me = String(this.getName() || '').toLowerCase();
    const chips = this.state.members
      .map((m) => {
        const lead = m.name.toLowerCase() === this.state.leader.toLowerCase();
        const self = m.name.toLowerCase() === me;
        return `<div class="party-chip${self ? ' me' : ''}" title="${escapeHtml(m.name)}${lead ? ' (leader)' : ''}">
          ${lead ? '<span class="party-crown">★</span>' : ''}
          <img alt="${escapeHtml(m.name)}" src="${headUrl(m.figure)}" />
          <span class="party-chip-name">${escapeHtml(m.name)}</span>
        </div>`;
      })
      .join('');
    this.strip.innerHTML = `
      <span class="party-label">Party</span>${chips}
      <button class="party-leave infostand-btn">${this.isLeader ? 'Disband' : 'Leave'}</button>`;
    this.strip.querySelector('.party-leave').onclick = () => {
      this.net.send({ t: this.isLeader ? 'disband' : 'party-leave' });
    };
  }

  // Session teardown (leaving Free Roam for an overlay flow). The party
  // itself survives on the server — chips come back on the next render.
  detach() {
    this.closePrompt();
    if (this.strip) this.strip.remove();
    this.strip = null;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
