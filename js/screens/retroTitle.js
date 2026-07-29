// ---- retro title screen ----------------------------------------------------
// The 2006 habbo.com portal layout, as the game's real title screen.
//
// ONE JOB: build the DOM. This module holds no game logic, imports no game
// state and decides nothing — every value it shows and every action it fires
// arrives through `deps`. main.js owns the gating (sign-in, navigation); this
// owns the markup. Styling lives in css/retro-landing.css.
//
// Structure and measurements come from docs/habbo-2006-layout.md, which is now
// the only reference: the standalone retro-landing.html draft this was lifted
// from has been deleted, so there is no second copy of the layout to drift.
//
// IDS ARE CONTRACT. #btnPlay is the entrance 7 e2e suites use to reach Free Roam
// (tests/e2e/lib.mjs enterFreeRoam), and the nav/search ids are wired by
// showTitle(). Renaming any of them breaks the suite or a way into the game.

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

// Shipped runtime icons, baked from Habbo's own hh_human_item.swf by
// tools/bake-weapon-icons.py — one per class, keyed by the class id.
const WEAPON_ICON = (id) => `assets/ui/weapons/${id}.png`;

// Real shipped milestones, dated from their own ROADMAP.md DONE stamps.
const NEWS = [
  ['07/02/26', 'Trials of the Realms opens',
   'A second descent alongside The Dungeon: four realm-gates, four trials, one objective type each. Forest, ruin, mead hall, and a bog boss.'],
  ['07/02/26', 'Room kits dress every battle',
   'Rooms now carry a kit as pure data: a real furni floor tiled across every tile top, a matching palette for stairs and sides, and classic boundary walls.'],
  ['07/02/26', 'Objectives beyond eliminate',
   'Battles can ask you to slay a tagged boss, survive a set number of turns, reach a tile, or defend one. The banner tracks progress live.'],
  ['07/02/26', 'Real Habbo monsters and props',
   'Enemies are authentic Habbo pet rigs and catalogue-dressed avatars. Fantasy Village furni blocks movement and arrows, so furni is cover now.'],
  ['07/02/26', 'Your Origins levels unlock skills',
   'Link your account with a motto code, then sync. Fishing and Gardening levels open the Water and Nature battle trees for your linked avatar.'],
  ['07/01/26', 'Battle engine core',
   'The tactics layer lands: move ranges, line of sight, the class triangle, height advantage, and the turn phase engine.'],
];

function toolbarHtml({ verified, name, records }) {
  const who = verified && name ? esc(name) : 'Signed out';
  return `
    <div class="rl-toolbar rl-band">
      <div class="rl-toolbar-set">
        <span>Habbo Dungeons</span>
        <span class="rl-dot">Origins server online</span>
      </div>
      <div class="rl-toolbar-set">
        <span>Gold <b>${records.gold}</b></span>
        <span>Heroes <b>${records.heroes}</b></span>
        <span>${who}</span>
      </div>
    </div>`;
}

function heroHtml({ verified }) {
  return `
    <header class="rl-hero">
      <img class="rl-hero-art" src="assets/ui/hero/jungle-room.png" alt="" width="688" height="473" />
      <div class="rl-masthead rl-band">
        <div class="rl-masthead-copy">
          <h1 style="margin:0">
            <a id="navHome" title="Home" style="cursor:pointer">
              <img src="assets/ui/logos/habbo-dungeons-club.gif" alt="Habbo Dungeons" width="501" height="61" />
            </a>
          </h1>
          <p class="rl-tagline">A turn-based tactics game where you fight as your real Habbo avatar on real Habbo rooms.</p>
          <div class="rl-masthead-actions">
            <button type="button" id="navDashboard" class="hd-btn ${verified ? 'hd-btn--white' : 'hd-btn--white'}">${verified ? 'Dashboard' : 'Sign in with Habbo'}</button>
            <button type="button" id="btnPlay" class="hd-btn hd-btn--green">Start Your Adventure</button>
          </div>
        </div>
      </div>
    </header>`;
}

// The 39px tab strip. Icons are the capture's own 21x21 navi_icons.
function navHtml() {
  const tabs = [
    ['navHome2', 'home.gif', 'Home', true],
    ['navDungeons', 'hotel.gif', 'Dungeons', false],
    ['navCallings', 'fun.gif', 'Callings', false],
    ['navMonsters', 'games.gif', 'Monsters', false],
    ['navInventory', 'community.gif', 'Inventory', false],
    ['navSignIn', 'help.gif', 'Sign In', false],
  ];
  return `
    <nav class="rl-navbar" aria-label="Primary">
      <ul>
        ${tabs
          .map(
            ([id, icon, label, cur]) => `<li><a class="rl-tab" id="${id}" href="#main"${cur ? ' aria-current="page"' : ''}>
              <img src="assets/ui/navi/${icon}" alt="" width="21" height="21" />${label}</a></li>`,
          )
          .join('')}
      </ul>
    </nav>`;
}

function signInCardHtml({ verified, name }) {
  if (verified) {
    return `
      <section class="hd-card" id="signin" aria-labelledby="h-signin">
        <h2 class="hd-card-header" id="h-signin">Signed In</h2>
        <div class="hd-card-body rl-body">
          <div class="hd-pill"><span>Habbo</span><span class="hd-pill-value">${esc(name)}</span></div>
          <p class="rl-note">Verified against your live Origins profile. You fight as this avatar.</p>
          <div class="rl-actions">
            <button type="button" id="btnDashboard2" class="hd-btn">Open dashboard</button>
          </div>
        </div>
      </section>`;
  }
  return `
    <section class="hd-card" id="signin" aria-labelledby="h-signin">
      <h2 class="hd-card-header" id="h-signin">Sign In</h2>
      <div class="hd-card-body rl-body">
        <p><b>Habbo: Origins</b> character, no password.</p>
        <p class="rl-note">We give you a one-time code. Put it anywhere in your motto at origins.habbo.com, then press Verify. The server checks it against your live profile.</p>
        <div class="rl-actions">
          <button type="button" id="btnSignIn" class="hd-btn hd-btn--green">Sign in with Habbo</button>
        </div>
      </div>
    </section>`;
}

// Read-only peek at the current save. Honest zeros when there is none.
function recordsCardHtml({ records }) {
  const none = !records.hasSave;
  return `
    <section class="hd-card rl-tint-darkest" id="records" aria-labelledby="h-records">
      <h2 class="hd-card-header" id="h-records">Expedition Records</h2>
      <div class="hd-card-body rl-body">
        <div class="hd-pill"><span>Descent</span><span class="hd-pill-value">${esc(records.descent)}</span></div>
        <div class="hd-pill"><span>Battles cleared</span><span class="hd-pill-value">${records.battles}</span></div>
        <div class="hd-pill"><span>Gold carried</span><span class="hd-pill-value">${records.gold}</span></div>
        <div class="hd-pill"><span>Heroes standing</span><span class="hd-pill-value">${records.heroes}</span></div>
        ${none ? '<p class="rl-note">No run saved on this browser yet. Records fill in once a descent is underway.</p>' : ''}
        <div class="rl-actions">
          <button type="button" id="btnContinue" class="hd-btn ${none ? 'hd-btn--disabled' : 'hd-btn--green'}"${none ? ' disabled' : ''}>Continue Run</button>
        </div>
      </div>
    </section>`;
}

// Every class from js/classes.js, with its real colour, archetype and blurb.
function callingsCardHtml({ classes, classId }) {
  const cur = classId || 'fighter';
  const sel = classes.find((c) => c.id === cur) || classes[0];
  return `
    <section class="hd-card rl-tint-darker" id="callings" aria-labelledby="h-callings">
      <h2 class="hd-card-header" id="h-callings">Choose Your Calling</h2>
      <div class="hd-card-body rl-body">
        <p class="rl-note" id="calling-help">The class you lead as when a descent begins. Melee beats ranged, ranged beats magic, magic beats melee. Support sits outside the triangle.</p>
        <div class="rl-callings" role="group" aria-labelledby="calling-selected" aria-describedby="calling-help">
          ${classes
            .map(
              (c) => `<button type="button" class="rl-calling" data-class="${c.id}" style="--cc:${c.color}"
                aria-pressed="${c.id === cur}" title="${esc(c.name)} · ${esc(c.archetype)}"
                aria-label="${esc(c.name)}, ${esc(c.archetype)}" data-blurb="${esc(c.name)}: ${esc(c.blurb)}">
                <img src="${WEAPON_ICON(c.id)}" alt="" />
              </button>`,
            )
            .join('')}
        </div>
        <p class="rl-selected" id="calling-selected" aria-live="polite">${esc(sel.name)}: ${esc(sel.blurb)}</p>
      </div>
    </section>`;
}

// The dungeon registry, with each entry's real room list and node counts.
function dungeonsCardHtml({ dungeons }) {
  return `
    <section class="hd-card" id="dungeonCards" aria-labelledby="h-dungeons">
      <h2 class="hd-card-header" id="h-dungeons">Choose a Descent</h2>
      <div class="hd-card-body rl-body">
        ${dungeons
          .map(
            (d, i) => `
          ${i ? '<div class="rl-rule"></div>' : ''}
          <div class="rl-entry">
            <h3>${esc(d.name)}</h3>
            ${d.sub ? `<p class="rl-note">${esc(d.sub)}</p>` : ''}
            <div class="rl-rooms">
              ${d.rooms
                .map(
                  (r) =>
                    `<span class="hd-badge${r.boss ? ' hd-badge--yellow' : ''}">${esc(r.name)}</span>`,
                )
                .join('')}
            </div>
            <p class="rl-note">
              <span class="hd-badge hd-badge--yellow">${d.battles} battles</span>
              <span class="hd-badge hd-badge--yellow">${d.events} events</span>
            </p>
            <div class="rl-actions">
              <button type="button" class="hd-btn hd-btn--green" data-dungeon="${d.id}">Begin Descent</button>
            </div>
          </div>`,
          )
          .join('')}
        <p class="rl-note">Yellow marks the boss room.</p>
      </div>
    </section>`;
}

function newsCardHtml() {
  return `
    <section class="hd-card" aria-labelledby="h-news">
      <h2 class="hd-card-header" id="h-news">What&rsquo;s New</h2>
      <div class="hd-card-body rl-body">
        <ul class="rl-news">
          ${NEWS.map(
            ([date, title, body]) => `<li>
            <p class="rl-date">[${date}]</p>
            <h3>${esc(title)}</h3>
            <p>${esc(body)}</p>
          </li>`,
          ).join('')}
        </ul>
      </div>
    </section>`;
}

function searchCardHtml() {
  return `
    <section class="hd-card" aria-labelledby="h-search">
      <h2 class="hd-card-header" id="h-search">Find an Adventurer</h2>
      <div class="hd-card-body rl-body">
        <form id="searchForm" class="rl-search">
          <input id="searchName" type="text" class="hd-input" placeholder="Habbo username"
            aria-label="Search adventurers by Habbo username" autocomplete="off" spellcheck="false" />
          <button type="submit" class="hd-btn hd-btn--green">Search</button>
        </form>
        <div id="searchResult"></div>
      </div>
    </section>`;
}

// A leaderboard panel. `source` is credited in the panel itself, not just in
// the footer: the numbers are somebody else's work and the reader deserves to
// know whose, and where to go for the full board.
function boardCardHtml(key, title, blurb, source) {
  return `
    <section class="hd-card rl-tint-darker" aria-labelledby="h-${key}">
      <h2 class="hd-card-header" id="h-${key}">${esc(title)}</h2>
      <div class="hd-card-body rl-body">
        <p class="rl-note">${esc(blurb)}</p>
        <div data-board="${key}" aria-live="polite">
          <p class="rl-note" data-state="loading">Loading rankings&hellip;</p>
        </div>
        <p class="rl-note" data-synced="${key}"></p>
        <p class="rl-note rl-credit">Data from <a href="https://${esc(source)}" target="_blank" rel="noopener noreferrer">${esc(source)}</a></p>
      </div>
    </section>`;
}

/**
 * Build the title screen.
 *
 * @param {object} deps
 * @param {boolean} deps.verified        Identity.isVerified()
 * @param {string}  deps.name            linked Habbo name, if any
 * @param {string}  deps.classId         Identity.classId()
 * @param {object}  deps.records         { descent, battles, gold, heroes, hasSave }
 * @param {Array}   deps.dungeons        [{ id, name, sub, rooms:[{name,boss}], battles, events }]
 * @param {Array}   deps.classes         [{ id, name, color, archetype, blurb }]
 * @param {object}  deps.on              callbacks, see wiring below
 * @param {Function} deps.loadBoard      (key) => Promise<{rows,syncedAt}>, may reject
 * @returns {HTMLElement} the screen root, fully wired
 */
export function renderRetroTitle(deps) {
  const {
    verified = false,
    name = '',
    classId = null,
    records = { descent: 'None', battles: 0, gold: 0, heroes: 0, hasSave: false },
    dungeons = [],
    classes = [],
    on = {},
    loadBoard = null,
  } = deps || {};

  const root = document.createElement('div');
  root.className = 'rl-screen';
  root.innerHTML = `
    <div class="rl-page">
      ${toolbarHtml({ verified, name, records })}
      ${heroHtml({ verified })}
      ${navHtml()}
      <div class="rl-headline rl-band">
        <h2>Home</h2>
        <p class="rl-crumbs">Habbo Dungeons &rsaquo; Home</p>
      </div>
      <div class="rl-slab">
        <div class="rl-grid">
          <aside class="rl-col rl-col--left" aria-label="Account, records and calling">
            ${signInCardHtml({ verified, name })}
            ${recordsCardHtml({ records })}
            ${callingsCardHtml({ classes, classId })}
          </aside>
          <main class="rl-col rl-col--lead" id="main">
            ${dungeonsCardHtml({ dungeons })}
            ${newsCardHtml()}
          </main>
          <aside class="rl-col rl-col--right" id="skills" aria-label="Daily skill leaderboards">
            ${searchCardHtml()}
            ${boardCardHtml('fishing', "Today's Top Anglers", 'Most fishing XP gained across Habbo Origins today. Fishing unlocks the Water skill tree.', 'habbofishing.com')}
            ${boardCardHtml('gardening', "Today's Top Gardeners", 'Most gardening XP gained across Habbo Origins today. Gardening unlocks the Nature skill tree.', 'habbogardening.com')}
          </aside>
        </div>
      </div>
      <footer class="rl-footer rl-band">
        <p><a id="btnExplore" style="cursor:pointer">Free Roam &middot; wander the halls of the keep</a></p>
        <p>Habbo Dungeons is a fan project and is not affiliated with, endorsed or sponsored by Habbo or Sulake Oy.</p>
      </footer>
    </div>`;

  // ---- wiring ----
  const q = (sel) => root.querySelector(sel);
  const bind = (sel, ev, fn) => {
    const el = q(sel);
    if (el && fn) el.addEventListener(ev, fn);
  };

  // Every entrance to the world. #btnPlay is the one 7 e2e suites use.
  bind('#btnPlay', 'click', on.explore);
  bind('#btnExplore', 'click', on.explore);
  bind('#btnContinue', 'click', on.continueRun || on.explore);

  bind('#navHome', 'click', on.home);
  bind('#navHome2', 'click', on.home);
  bind('#navDashboard', 'click', on.dashboard);
  bind('#btnDashboard2', 'click', on.dashboard);
  bind('#btnSignIn', 'click', on.dashboard);
  bind('#navSignIn', 'click', on.dashboard);
  bind('#navInventory', 'click', on.inventory);
  bind('#navMonsters', 'click', on.monsters);

  // in-page jumps: scroll rather than navigate
  const jump = (sel) => (e) => {
    e.preventDefault();
    const t = q(sel);
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  bind('#navDungeons', 'click', jump('#dungeonCards'));
  bind('#navCallings', 'click', jump('#callings'));

  root.querySelectorAll('[data-dungeon]').forEach((b) =>
    b.addEventListener('click', () => on.beginDescent && on.beginDescent(b.dataset.dungeon)),
  );

  // calling picker: single-select, persisted by the caller
  const callings = q('.rl-callings');
  if (callings) {
    callings.addEventListener('click', (e) => {
      const btn = e.target.closest('.rl-calling');
      if (!btn) return;
      callings.querySelectorAll('.rl-calling').forEach((b) =>
        b.setAttribute('aria-pressed', String(b === btn)),
      );
      const out = q('#calling-selected');
      if (out) out.textContent = btn.dataset.blurb;
      if (on.pickClass) on.pickClass(btn.dataset.class);
    });
  }

  bind('#searchForm', 'submit', on.search);

  if (loadBoard) {
    for (const key of ['fishing', 'gardening']) mountBoard(root, key, loadBoard);
  }

  return root;
}

// Leaderboards fill in after paint; a failure states why rather than spinning.
async function mountBoard(root, key, loadBoard) {
  const host = root.querySelector(`[data-board="${key}"]`);
  const stamp = root.querySelector(`[data-synced="${key}"]`);
  if (!host) return;
  const note = (t) => {
    host.innerHTML = `<p class="rl-note">${esc(t)}</p>`;
  };

  let res;
  try {
    res = await loadBoard(key);
  } catch (err) {
    note(
      err && err.offline
        ? 'Rankings need a connection. You look offline, so this board is unavailable. The rest of the page still works.'
        : 'Could not load rankings just now. Refresh to try again.',
    );
    return;
  }

  const rows = (res && res.rows) || [];
  if (!rows.length) {
    note('No one has gained XP in this skill yet today. Check back after the hotel wakes up.');
    return;
  }
  // rank comes from the source board, NOT the array index: it is their ranking
  // to state, and a dropped row must not silently renumber the ones below it.
  host.innerHTML = rows
    .map(
      (r) =>
        `<div class="hd-pill"><span class="rl-rank">${Number(r.rank) || 0}</span>` +
        `<span class="rl-who">${esc(r.username)}</span>` +
        `<span class="hd-pill-value">+${xpLabel(r.xpGained)}</span></div>`,
    )
    .join('');

  if (stamp) {
    const today = res.stats && res.stats.today;
    const avg = res.stats && res.stats.avgXp;
    const parts = [];
    if (today != null) parts.push(`${today.toLocaleString('en-US')} active today`);
    if (avg != null) parts.push(`${avg.toLocaleString('en-US')} XP average`);
    // A stale board is showing its last good rows because the source is
    // unreachable. Say so rather than let old numbers read as current ones.
    if (res.fetchedAt) {
      parts.push(`${res.stale ? 'source down, rows from' : 'updated'} ${agoLabel(res.fetchedAt)}`);
    }
    stamp.textContent = parts.join(' \u00b7 ');
  }
}

// 6,558,300 -> "6.56M". The daily gains run to eight digits and the pill is a
// fixed-width column, so full numbers would wrap or clip the name beside them.
export function xpLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0 XP';
  if (v >= 1e6) return `${(v / 1e6).toFixed(2).replace(/\.?0+$/, '')}M XP`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}K XP`;
  return `${v} XP`;
}

export function agoLabel(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
