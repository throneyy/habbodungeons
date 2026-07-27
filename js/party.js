// Party formation UI (Free Roam): the invite prompt and the roster panel
// pinned to the right edge of the stage.
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

  // ----------------------------------------------------------- roster panel

  // The roster reads top-to-bottom on the right edge: PARTY header, one row
  // per member, then the single destructive action at the bottom. It was a
  // horizontal strip above the chat toolbar, which capped a name at 80px of
  // ellipsis and had nowhere to put per-member state. A column gives each
  // member a full-width row, so the name gets real room and the health bar
  // this reserves has somewhere to live.
  //
  // The element keeps id="partyStrip": tests/e2e/partyInviteError.e2e.mjs
  // waits on that selector to prove the roster rendered, and that suite is
  // owned by chore/test-harness. Renaming it here would break another
  // worktree's green test to no benefit.
  render() {
    if (!this.state) {
      if (this.strip) this.strip.remove();
      this.strip = null;
      return;
    }
    if (!this.strip) {
      this.strip = document.createElement('div');
      this.strip.id = 'partyStrip';
      // A labelled region, not an anonymous div: this is a live roster that
      // appears and changes on its own, so it needs a name in the a11y tree.
      this.strip.setAttribute('role', 'region');
      this.strip.setAttribute('aria-label', 'Party roster');
      document.body.appendChild(this.strip);
    }
    const me = String(this.getName() || '').toLowerCase();
    const rows = this.state.members
      .map((m) => {
        const lead = m.name.toLowerCase() === this.state.leader.toLowerCase();
        const self = m.name.toLowerCase() === me;
        return `<li class="party-row${self ? ' me' : ''}">
          <span class="party-row-head">
            <img alt="" src="${headUrl(m.figure)}" />
            ${lead ? '<span class="party-crown" aria-hidden="true">★</span>' : ''}
          </span>
          <span class="party-row-main">
            <span class="party-row-name">${escapeHtml(m.name)}${lead ? '<span class="party-sr"> (leader)</span>' : ''}</span>
            <span class="party-hp" aria-hidden="true"><span class="party-hp-track"></span></span>
          </span>
        </li>`;
      })
      .join('');
    // .party-hp is an EMPTY reserved slot, deliberately. HP is not plumbed to
    // the roster yet, so it renders an unfilled track and is aria-hidden --
    // a bar drawn at some invented width would be a lie about a stat the
    // server never sent. Give it a fill element when real HP arrives.
    this.strip.innerHTML = `
      <h2 class="party-title">Party</h2>
      <ul class="party-list">${rows}</ul>
      <button class="party-leave infostand-btn">${this.isLeader ? 'Disband' : 'Leave'}</button>`;
    this.strip.querySelector('.party-leave').onclick = () => {
      this.net.send({ t: this.isLeader ? 'disband' : 'party-leave' });
    };
    // A head that fails to load (imaging down, or offline) would otherwise
    // draw the browser's broken-image glyph in every row. Hide the img and
    // let the empty socket behind it show through. Bound here rather than as
    // an inline onerror= so no member-supplied string is ever parsed as code.
    for (const img of this.strip.querySelectorAll('.party-row-head img')) {
      img.addEventListener('error', () => img.classList.add('is-missing'));
    }
  }

  // Session teardown (leaving Free Roam for an overlay flow). The party
  // itself survives on the server — the roster comes back on the next render.
  detach() {
    this.closePrompt();
    if (this.strip) this.strip.remove();
    this.strip = null;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
