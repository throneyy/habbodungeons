// The human Object Displayer — the v31 client's hh_room_ui "Room Object
// Displayer" human branch, rebuilt in the same .infostand CSS family as the
// furni infostand (roomEditor.js): bold name, full-body habbo-imaging render
// (dir 4), motto line, then the action row — Invite to Party / Add Friend /
// Trade (stubbed). Tapping any player in Free Roam opens it; tapping yourself
// opens the self view (no invite).
import { IMAGING_URL } from './config.js';
import { isSupabase, invokeFn } from './backend.js';
import { addFriend, isFriend } from './toolbarIcons.js';

// full-body render, standing, facing the camera (dir 4) — the client's
// room_obj_disp_avatar member
function avatarUrl(figure) {
  const p = new URLSearchParams({
    figure: figure || '',
    action: 'std',
    direction: '4',
    head_direction: '4',
    size: 'm',
    img_format: 'png',
  });
  return `${IMAGING_URL}?${p}`;
}

export class HumanInfostand {
  constructor() {
    this.el = null;
    this.onInvite = null; // set by party.js: (name) => send the invite
    this.canInvite = () => false; // party.js: invites possible right now?
    this.onTrade = null; // set by main.js: (name) => open a trade ask
    this.canTrade = () => false; // tradeWindow.js: trading possible right now?
  }

  get openFor() {
    return this.el ? this.el.dataset.player : null;
  }

  // player: { name, figure, self } — self view hides the invite button.
  open(player) {
    this.close();
    const el = document.createElement('div');
    el.className = 'infostand infostand--human';
    el.dataset.player = player.name;
    const inviteOk = !player.self && !!this.onInvite && this.canInvite(player.name);
    const tradeOk = !player.self && !!this.onTrade && this.canTrade(player.name);
    const friended = isFriend(player.name);
    el.innerHTML = `
      <div class="infostand-info">
        <div class="infostand-name"><span>${escapeHtml(player.name)}</span><button class="infostand-close" title="Close">&times;</button></div>
        <div class="infostand-preview infostand-preview--human">
          ${player.figure ? `<img alt="${escapeHtml(player.name)}" src="${avatarUrl(player.figure)}" />` : ''}
        </div>
        <div class="infostand-desc infostand-motto">${player.self ? 'This is you!' : '&nbsp;'}</div>
      </div>
      <div class="infostand-actions">
        <div class="infostand-buttons">
          ${player.self ? '' : `<button class="infostand-btn" data-act="invite" ${inviteOk ? '' : 'disabled'}>Invite to Party</button>`}
          ${player.self ? '' : `<button class="infostand-btn" data-act="friend" ${friended ? 'disabled' : ''}>${friended ? 'Friends ✓' : 'Add Friend'}</button>`}
          <button class="infostand-btn" data-act="trade" ${tradeOk ? '' : 'disabled'} ${tradeOk ? '' : 'title="You cannot trade right now"'}>Trade</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.querySelector('.infostand-close').onclick = () => this.close();
    el.querySelector('.infostand-buttons').addEventListener('click', (e) => {
      const act = e.target.dataset && e.target.dataset.act;
      if (!act || e.target.disabled) return;
      if (act === 'friend') {
        addFriend(player.name);
        e.target.disabled = true;
        e.target.textContent = 'Friends ✓';
      } else if (act === 'invite' && this.onInvite) {
        this.onInvite(player.name);
        e.target.disabled = true;
        e.target.textContent = 'Invited…';
      } else if (act === 'trade' && this.onTrade) {
        this.onTrade(player.name);
        this.close(); // the ask toast / trade window takes over
      }
    });
    if (!player.self) this.loadMotto(player.name);
  }

  // The motto isn't in the presence roster — fetch it from the Origins
  // profile (proxied, cached upstream). Best-effort: blank line on failure.
  async loadMotto(name) {
    try {
      let json;
      if (isSupabase()) {
        json = await invokeFn('fetch-habbo-profile', { name });
      } else {
        const res = await fetch(`/api/origins/users?name=${encodeURIComponent(name)}`);
        json = await res.json();
      }
      const motto = json && typeof json.motto === 'string' ? json.motto : '';
      const line = this.el && this.el.querySelector('.infostand-motto');
      if (line && this.openFor === name) line.textContent = motto || '\u00a0';
    } catch {
      /* offline / unknown name — keep the blank line */
    }
  }

  close() {
    if (this.el) this.el.remove();
    this.el = null;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
