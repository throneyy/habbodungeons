// Classic-client toolbar icons: the v31 Shockwave cutouts (assets/ui/icons/)
// docked at the right end of the chat bar. This is the REGULAR-USER row —
// no admin buttons here:
//
//   console    -> friends list (add/remove friends, stored per browser)
//   navigator  -> press-to-reveal room list pop-over (jump between rooms)
//   inventory  -> your dungeon loot (equipment + backpack of the active run)
//   help       -> controls cheat-sheet pop-over
//   hotel      -> back to the menu (hotel view door = leaving the room)
//
// Admin tools (Edit Room / Save Layout) live in a separate slide-up panel
// summoned by typing :admin in chat (see attachAdminPanel) — commands, not
// buttons, exactly like the old client's staff tooling.
import { Hand } from './hand.js';

const ICON = (n) => `assets/ui/icons/${n}.gif`;
const LS_FRIENDS = 'habbo-dungeons-friends';

// Friends list storage — shared with the human infostand's Add Friend button
// (humanInfostand.js) so both write the same console list.
export function friendsList() {
  try {
    return JSON.parse(localStorage.getItem(LS_FRIENDS) || '[]');
  } catch {
    return [];
  }
}
export function isFriend(name) {
  return friendsList().some((f) => f.toLowerCase() === String(name).toLowerCase());
}
export function addFriend(name) {
  if (!name || isFriend(name)) return false;
  localStorage.setItem(LS_FRIENDS, JSON.stringify([...friendsList(), String(name)]));
  return true;
}

// The one Hand instance (created with the toolbar) — the trade window flips
// it into stash mode so items can be dragged into the trade box.
let sharedHand = null;
export function getHand() {
  return sharedHand;
}

export function attachToolbarIcons({ toolbar, rooms, currentRoomId, onHelp, onHandEmpty, onEquip, onUnequip, onUse, showNav = true, onMenu = null }) {
  if (!toolbar || toolbar.querySelector('.toolbar-icons')) return null;
  const $ = (id) => document.getElementById(id);
  const wrap = document.createElement('div');
  wrap.className = 'toolbar-icons';
  toolbar.appendChild(wrap);
  // keep the volume knob at the very right edge, after the icons
  const music = toolbar.querySelector('.music-ctl');
  if (music) toolbar.appendChild(music);

  const pops = [];
  const mkPop = (cls, title) => {
    const popWrap = document.createElement('div');
    popWrap.className = 'tb-pop-wrap';
    wrap.appendChild(popWrap);
    const pop = document.createElement('div');
    pop.className = `tb-pop ${cls}`;
    pop.innerHTML = `<div class="tb-pop-title">${title}</div><div class="tb-pop-body"></div>`;
    popWrap.appendChild(pop);
    pops.push(popWrap);
    return { popWrap, body: pop.querySelector('.tb-pop-body') };
  };
  const mkIcon = (name, title, parent, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tb-icon';
    b.title = title;
    b.innerHTML = `<img src="${ICON(name)}" alt="${title}">`;
    b.addEventListener('click', onClick);
    (parent || wrap).appendChild(b);
    return b;
  };
  const toggle = (popWrap) => {
    const open = popWrap.classList.contains('open');
    pops.forEach((p) => p.classList.remove('open'));
    if (!open) popWrap.classList.add('open');
  };

  // ---- console: friends list ----------------------------------------------
  const con = mkPop('console-pop', 'Console');
  const renderFriends = () => {
    const friends = friendsList();
    con.body.innerHTML = friends.length
      ? friends
          .map(
            (f) =>
              `<div class="friend-row"><span>${f}</span><button class="friend-del" data-name="${f}" title="Remove">&times;</button></div>`
          )
          .join('')
      : '<div class="tb-dim">No friends yet. Add one below!</div>';
    const form = document.createElement('form');
    form.className = 'friend-add';
    form.innerHTML = `<input maxlength="24" placeholder="Habbo name..." /><button type="submit">Add</button>`;
    con.body.appendChild(form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = form.querySelector('input').value.trim();
      if (!name || friends.some((f) => f.toLowerCase() === name.toLowerCase())) return;
      localStorage.setItem(LS_FRIENDS, JSON.stringify([...friends, name]));
      renderFriends();
    });
    con.body.querySelectorAll('.friend-del').forEach((b) =>
      b.addEventListener('click', () => {
        localStorage.setItem(
          LS_FRIENDS,
          JSON.stringify(friends.filter((f) => f !== b.dataset.name))
        );
        renderFriends();
      })
    );
  };
  con.popWrap.appendChild(
    mkIcon('console', 'Console — friends', con.popWrap, () => {
      renderFriends();
      toggle(con.popWrap);
    })
  );

  // ---- navigator: room list (hidden in battle — the run walks the rooms) --
  if (showNav) {
    const nav = mkPop('nav-pop', 'Navigator');
    const renderRooms = () => {
      nav.body.innerHTML = '';
      rooms().forEach((r, i) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'nav-room';
        item.textContent = r.name;
        if (r.id === currentRoomId()) item.classList.add('here');
        item.addEventListener('click', () => {
          const proxy = document.querySelector(`#exploreBar button[data-room="${i}"]`);
          if (proxy) proxy.click();
          nav.popWrap.classList.remove('open');
        });
        nav.body.appendChild(item);
      });
    };
    nav.popWrap.appendChild(
      mkIcon('navigator', 'Navigator', nav.popWrap, () => {
        renderRooms();
        toggle(nav.popWrap);
      })
    );
  }

  // ---- inventory: the Hand ------------------------------------------------
  // Not a pop-over: the native container (hand.js) slides in from the
  // top-right corner, exactly like the Shockwave client's furni hand.
  const hand = new Hand();
  sharedHand = hand; // the Safe-trading window borrows it as the stash box
  hand.onEquip = onEquip || null;
  hand.onUnequip = onUnequip || null;
  hand.onUse = onUse || null;
  mkIcon('inventory', 'Inventory — dungeon loot', wrap, () => {
    pops.forEach((p) => p.classList.remove('open'));
    // opening an empty hand: give the host a chance to stock it first
    // (main.js seeds the admin demo kit here), then render as usual
    if (onHandEmpty && hand.mode !== 'open' && !hand.bag().items.length) onHandEmpty();
    hand.toggle();
  });

  // ---- help ----------------------------------------------------------------
  const help = mkPop('help-pop', 'Help');
  help.body.innerHTML = onHelp ? onHelp() : '';
  help.popWrap.appendChild(
    mkIcon('help', 'Help', help.popWrap, () => toggle(help.popWrap))
  );

  // ---- hotel view: leave the room -----------------------------------------
  mkIcon('hotel', 'Back to menu', wrap, onMenu || (() => $('exploreMenu').click()));

  // click-away folds any open pop-over
  document.addEventListener('pointerdown', (e) => {
    if (!wrap.contains(e.target)) pops.forEach((p) => p.classList.remove('open'));
  });
  return wrap;
}

// Admin tooling lives behind chat commands, not toolbar buttons. Typing
// :admin toggles a slide-up panel (Edit Room / Save Layout proxies); :edit
// and :save fire those straight away. Returns true when the text was a
// handled command (the chat should swallow it instead of speaking it).
export function attachAdminPanel({ isAdmin }) {
  const $ = (id) => document.getElementById(id);
  let panel = null;

  const closePanel = () => {
    if (panel) panel.remove();
    panel = null;
  };
  const openPanel = () => {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'adminPanel';
    panel.innerHTML = `
      <div class="tb-pop-title">Admin</div>
      <button type="button" data-cmd="edit">Edit Room</button>
      <button type="button" data-cmd="save">Save Layout</button>
      <button type="button" data-cmd="close" class="tb-dim">Close (:admin)</button>`;
    document.body.appendChild(panel);
    const sync = () => {
      panel
        .querySelector('[data-cmd="edit"]')
        .classList.toggle('active', $('editRoom').classList.contains('active'));
    };
    panel.addEventListener('click', (e) => {
      const cmd = e.target.dataset && e.target.dataset.cmd;
      if (cmd === 'edit') {
        $('editRoom').click();
        sync();
      } else if (cmd === 'save') {
        $('saveRoom').click();
      } else if (cmd === 'close') {
        closePanel();
      }
    });
    sync();
  };

  return {
    // ChatOverlay calls this with every submitted line
    command(text) {
      if (!text.startsWith(':')) return false;
      const cmd = text.slice(1).trim().toLowerCase();
      if (!['admin', 'edit', 'save'].includes(cmd)) return false;
      if (!isAdmin()) return true; // swallow silently for non-admins
      if (cmd === 'admin') (panel ? closePanel : openPanel)();
      else if (cmd === 'edit') $('editRoom').click();
      else if (cmd === 'save') $('saveRoom').click();
      return true;
    },
    destroy: closePanel,
  };
}
