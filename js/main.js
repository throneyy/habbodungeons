import { buildRooms } from './rooms.js';
import { Game } from './game.js';
import { AvatarSprites } from './sprites.js';
import { fetchOriginsUser } from './habboApi.js';
import { DEFAULT_FIGURE } from './config.js';
import { CLASSES } from './classes.js';
import { ExploreController } from './exploreController.js';
import { BattleController } from './battleController.js';
import { RunController } from './runController.js';
import { Run, makeMember, memberStats, SAVE_KEY } from './run.js';
import { buildDungeon, DUNGEONS, DUNGEON_ID } from './dungeon.js';
import { pickEvents } from './events.js';
import { Identity, Auth } from './identity.js';
import { RunStore } from './runStore.js';
import { SKILL_TREES, nextUnlocks } from './skills.js';
import { ChatOverlay } from './chat.js';
import { RoomEditor, AdminApi, serializeProp } from './roomEditor.js';
import { FurniCatalog } from './furniCatalog.js';
import { RoomBots, serializeBot } from './roomBots.js';
import { BotCatalog } from './botCatalog.js';
import { ROOM_BOTS } from './botsData.js';
import { ADMIN_NAMES } from './config.js';
import { figureWithArmor, CONSUMABLES, ITEMS, RARITY } from './items.js';
import { consumeFromRun, rosterTargets, battleTargets } from './consumableEffects.js';
import { propSprites } from './props.js';
import { clothingPoof } from './clothingPoof.js';
import { ClothingCatalog } from './clothingCatalog.js';
import { ConsumablesCatalog } from './consumablesCatalog.js';
import { RoomMusic } from './music.js';
import { attachToolbarIcons, attachAdminPanel, getHand } from './toolbarIcons.js';
import { DialogueRunner } from './npc.js';
import { GATE_HINT } from './dialogueData.js';
import { net, shouldConnectNet } from './net.js';
import { RemotePlayers } from './remotePlayers.js';
import { HumanInfostand } from './humanInfostand.js';
import { PartyUI } from './party.js';
import { CoopLeader, CoopMember } from './coopBattle.js';
import { TradeUI } from './tradeWindow.js';
import { showRoomDiscovery } from './roomBanner.js';
import { openDailyReward } from './dailyRewardOverlay.js';
import { applyReward } from './dailyReward.js';
import { mountDailyDock } from './dailyRewardDock.js';


const $ = (id) => document.getElementById(id);
const overlay = $('overlay');
const header = $('runHeader');
const panel = $('panel');
const game = new Game($('game'));

// ---- shared avatar figure --------------------------------------------------
let figure = DEFAULT_FIGURE;
let figureLabel = 'Not signed in';
const savedId = Identity.get();
if (savedId && savedId.figure) {
  figure = savedId.figure;
  figureLabel = identityLabel(savedId);
}
async function loadFigure(fig) {
  // The class you're playing decides which weapon your own avatar carries
  // (js/classWeapons.js) — fighter/sword when no calling is picked yet.
  const classId = Identity.classId() || 'fighter';
  const [m, s] = await Promise.all([
    new AvatarSprites(fig, 'm', classId).load(),
    new AvatarSprites(fig, 's', classId).load(),
  ]);
  game.setSprites({ m, s });
}
loadFigure(figure);

// Minimal HTML escaping for user-sourced strings (names, mottos, blurbs).
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Website loading indicator: the pixel "loading Habbos" GIF beside a status
// line. Decorative image (alt="") + role=status so screen readers announce the
// text. Used only for website fetches (search / verify / sync / cloud), never
// the in-game client. `center` stacks it for empty card bodies.
const LOADING_GIF = 'assets/ui/loading-habbos.gif';
function loadingHtml(text, center = false) {
  return `<div class="hd-loading${center ? ' hd-loading--center' : ''}" role="status"><img src="${LOADING_GIF}" alt="" /><span>${esc(text)}</span></div>`;
}

// A one-line summary of the linked identity for the title screen.
function identityLabel(id) {
  if (!id || !id.name) {
    const c = id && id.classId && CLASSES[id.classId];
    return c ? `Not signed in · ${c.name}` : 'Not signed in';
  }
  let s = `Playing as ${id.name}`;
  if (id.classId && CLASSES[id.classId]) s += ` · ${CLASSES[id.classId].name}`;
  if (id.verifiedAt) s += ' ✓';
  if (id.fishingLevel != null || id.gardeningLevel != null) {
    s += ` · 🎣 ${id.fishingLevel || 0} · 🌱 ${id.gardeningLevel || 0}`;
    const n = (id.unlockedSkills || []).length;
    if (n) s += ` · ${n} Origins skill${n === 1 ? '' : 's'}`;
  }
  return s;
}

// ---- controllers -----------------------------------------------------------
const battle = new BattleController({ banner: $('banner'), actions: $('actions'), roster: $('roster'), log: $('log') });
const explore = new ExploreController((s) => ($('exploreStatus').textContent = s));
const run = new RunController(game, battle, {
  // win or lose, leaving a run drops you back in the tavern
  overlay, header, panel, onExit: () => {
    coopLeader = null; // a finished descent released the party stream
    leaveRunChrome(); // battle chat + toolbar fold with the run
    startExplore();
  },
  // Skyrim-style "location discovered" ribbon on entering each dungeon chamber
  onDiscover: (name) => showRoomDiscovery(name),
  // hd-ui wallpaper for the between-battle screens (event/camp/end)
  skin: () => skinOverlay(), unskin: () => unskinOverlay(),
  // leader armor -> avatar clothing: reload the shared sprites dressed in the
  // equipped armor's figure parts (no-op figure changes still cache-hit)
  onFigure: (equipment) => loadFigure(figureWithArmor(figure, equipment)),
});

function hideAll() {
  overlay.classList.add('hidden');
  header.classList.add('hidden');
  panel.classList.add('hidden');
  $('exploreBar').classList.add('hidden');
  unskinOverlay();
}

// habbo-ui skin for the fullscreen overlay — every screen wears it now.
// (inline background because #overlay's ID-specificity shorthand beats .hd-page;
// inline alignment because #overlay centers, but skinned screens scroll from the top)
function skinOverlay() {
  overlay.classList.add('hd-page', 'hd-ui');
  overlay.style.background = "#071c49 url('assets/ui/bg-tile.png') repeat fixed";
  overlay.style.alignItems = 'flex-start';
  overlay.style.overflow = 'auto';
}
function unskinOverlay() {
  overlay.classList.remove('hd-page', 'hd-ui');
  overlay.style.background = '';
  overlay.style.alignItems = '';
  overlay.style.overflow = '';
}

// ---- title -----------------------------------------------------------------
// Ribbon art wells for the dungeon project cards (habbofont.net generator).
const DUNGEON_RIBBONS = {
  dungeon: 'assets/ui/logos/the-dungeon-ribbon.gif',
  realms: 'assets/ui/logos/trials-of-the-realms-ribbon.gif',
};

// Full-body avatar render for a linked/loaded Habbo name; empty for guests.
function avatarImgHtml() {
  const name = (Identity.get() || {}).name;
  if (!name) return '';
  const url = `https://img.franklyorigins.net/habbo-imaging/avatarimage?habbo=${encodeURIComponent(name)}&hotel=com&action=wav&shadow=true&cb=5`;
  return `<img src="${url}" alt="${name}" style="image-rendering:pixelated" />`;
}

// Read-only peek at the current save for the Records card; zeros without one.
function titleRecords() {
  const r = Run.hasSave() ? Run.load(buildDungeon) : null;
  if (!r) return { descent: 'None underway', battles: 0, gold: 0, heroes: 0 };
  let battles = 0;
  for (let i = 0; i < r.nodeIndex && i < r.dungeon.nodes.length; i++) {
    if (r.dungeon.nodes[i].type === 'battle') battles++;
  }
  return {
    descent: r.dungeon.name || '-',
    battles,
    gold: r.gold,
    heroes: r.squad.filter((m) => m.hp > 0).length,
  };
}

// Landing feature grid: the game's real hooks, one card each (structure
// adapted from habbodungeons.com's landing; skin stays hd-ui).
const FEATURES = [
  ['Tactics Battles', 'Turn-based fights on isometric Habbo rooms. High ground hits harder, furni is cover, and melee beats ranged beats magic.'],
  ['Your Real Habbo', 'Sign in as your Habbo Origins character. No password: a one-time motto code proves the account is yours, verified against your live profile.'],
  ['Origins Skills', 'Your live Fishing and Gardening levels unlock the Water and Nature skill trees your avatar wields in battle.'],
  ['Legendary Loot', 'Weapons, armor and trinkets from Rusty Blade to Kingslayer. Equip at camp; armor even dresses your avatar.'],
];

function showTitle() {
  hideAll();
  overlay.classList.remove('hidden');
  skinOverlay();
  const unskin = unskinOverlay;
  // "Battles today": honest local read — the current save's cleared battles,
  // but only when it was last touched today.
  const rec = titleRecords();
  const savedToday = (() => {
    const raw = localStorage.getItem(SAVE_KEY);
    try {
      const at = raw && JSON.parse(raw).savedAt;
      return at && new Date(at).toDateString() === new Date().toDateString();
    } catch {
      return false;
    }
  })();
  const battlesToday =
    savedToday && rec.battles > 0
      ? `🏆 <b>${rec.battles}</b> battle${rec.battles === 1 ? '' : 's'} cleared today in <b>${rec.descent}</b>`
      : '🏆 No battles today yet!';
  const projectCards = DUNGEONS.map((d) => {
    // Real node counts from the dungeon registry, shown as badges on each card.
    const nodes = buildDungeon(d.id, {})?.nodes || [];
    const battles = nodes.filter((n) => n.type === 'battle').length;
    const events = nodes.filter((n) => n.type === 'event').length;
    const boss = nodes.some((n) => n.boss);
    return `
      <div class="hd-landing-col hd-card">
        <div class="hd-card-well">
          ${DUNGEON_RIBBONS[d.id]
            ? `<img class="hd-logo-img" src="${DUNGEON_RIBBONS[d.id]}" alt="${d.name}" />`
            : `<span class="hd-logo">${d.name}</span>`}
        </div>
        <div class="hd-card-body">
          <p style="margin:0 0 10px">${d.sub || ''}</p>
          <p style="margin:0 0 14px">
            <span class="hd-badge hd-badge--yellow">${battles} battles</span>
            <span class="hd-badge hd-badge--yellow">${events} events</span>
            ${boss ? '<span class="hd-badge hd-badge--yellow">boss fight</span>' : ''}
          </p>
          <button class="hd-btn hd-btn--green" data-dungeon="${d.id}">Begin Descent ▸</button>
        </div>
      </div>`;
  }).join('');
  overlay.innerHTML = `
    <div class="hd-landing">
      <div class="hd-card">
        <div class="hd-card-body" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px 18px">
          <a id="navHome" title="Home" style="cursor:pointer"><img class="hd-logo-img" src="assets/ui/logos/habbo-dungeons-ribbon.gif" alt="HABBO DUNGEONS" /></a>
          <nav style="display:flex;flex-wrap:wrap;gap:8px">
            <button id="navMonsters" class="hd-btn">Monsters</button>
            <button id="navDungeons" class="hd-btn">Dungeons</button>
            <button id="navInventory" class="hd-btn">Inventory</button>
            <button id="navDashboard" class="hd-btn ${Identity.isVerified() ? '' : 'hd-btn--green'}">${Identity.isVerified() ? 'Dashboard' : 'Login'}</button>
          </nav>
        </div>
      </div>
      <div class="hd-card">
        <div class="hd-card-body">
          <form id="searchForm" style="display:flex;flex-wrap:wrap;gap:8px;margin:0">
            <input id="searchName" type="text" class="hd-input" placeholder="Search adventurers by Habbo username" aria-label="Search adventurers by Habbo username" autocomplete="off" spellcheck="false" style="flex:1 1 220px" />
            <button type="submit" class="hd-btn hd-btn--green">Search</button>
          </form>
          <div id="searchResult"></div>
        </div>
      </div>
      <div class="hd-card">
        <div class="hd-card-body" style="text-align:center" id="battlesToday">${battlesToday}</div>
      </div>
      <div class="hd-card">
        <div class="hd-card-body" style="text-align:center">
          <img class="hd-logo-img hd-logo-img--center" src="assets/ui/logos/habbo-dungeons-club.gif" alt="HABBO DUNGEONS" />
          <p style="margin:10px 0 0" class="dim">Turn-based tactics for your Habbo Origins avatar</p>
          <!-- div, not <p>: .hd-ui p carries the #crispify filter, which snaps the
               buttons' 30%-alpha drop shadows to 0 and renders them flat -->
          <div style="margin:14px 0 0;display:flex;justify-content:center;flex-wrap:wrap;gap:10px">
            <button id="btnPlay" class="hd-btn hd-btn--green" style="font-size:18px;padding:8px 26px">Start Your Adventure ▸</button>
            <button id="btnBrowse" class="hd-btn hd-btn--white">Browse Dungeons</button>
          </div>
          <p style="margin:8px 0 0;font-size:9px" class="dim">Step into the tavern. The Gatekeeper in the square opens the way down.</p>
        </div>
      </div>
      <div class="hd-landing-row">
        ${FEATURES.map(
          ([t, d]) => `
        <div class="hd-card" style="flex:1 1 220px;min-width:0">
          <div class="hd-card-header">${t}</div>
          <div class="hd-card-body"><p style="margin:0">${d}</p></div>
        </div>`
        ).join('')}
      </div>
      <div class="hd-card">
        <div class="hd-card-header">How to Play</div>
        <div class="hd-card-body" style="display:flex;flex-wrap:wrap;gap:18px">
          <div style="flex:1 1 220px;min-width:0">
            <p style="margin:0 0 6px"><b>1 · Sign in with Habbo</b></p>
            <p class="dim" style="margin:0">Put a one-time code in your Habbo Origins motto and the server verifies the account is yours. You fight as your real avatar.</p>
          </div>
          <div style="flex:1 1 220px;min-width:0">
            <p style="margin:0 0 6px"><b>2 · Choose your calling</b></p>
            <p class="dim" style="margin:0">Pick the class you lead as, then step through the Gatekeeper's arch in the town square.</p>
          </div>
          <div style="flex:1 1 220px;min-width:0">
            <p style="margin:0 0 6px"><b>3 · Battle, loot, camp</b></p>
            <p class="dim" style="margin:0">Clear tactics battles, pick your path at choice events, and equip loot at camp. A party wipe ends the run.</p>
          </div>
        </div>
      </div>
      <div class="hd-landing-row" id="dungeonCards">${projectCards}</div>
      <div class="hd-footer">
        <p style="margin:0 0 6px"><a id="btnExplore">Free Roam · wander the halls of the keep</a></p>
        <p style="margin:0">Habbo Dungeons is a fan project and is not affiliated with, endorsed or sponsored by Habbo or Sulake Oy.</p>
      </div>
    </div>`;

  // No guest play: every way into the world requires a verified Habbo.
  // Signed-out attempts route to the Login gate (the dashboard's sign-in card).
  const requireSignIn = (fn) => () => {
    if (Identity.isVerified()) return fn();
    acct._msg = 'Sign in with your Habbo Origins character first.';
    showDashboard();
  };
  overlay.querySelectorAll('[data-dungeon]').forEach((b) =>
    b.addEventListener(
      'click',
      requireSignIn(() => {
        dungeonPick = b.dataset.dungeon;
        unskin();
        showSquadBuilder();
      })
    )
  );
  const goExplore = requireSignIn(() => {
    unskin();
    startExplore();
  });
  $('btnPlay').addEventListener('click', goExplore);
  $('btnExplore').addEventListener('click', goExplore);
  $('navHome').addEventListener('click', showTitle);
  $('navDashboard').addEventListener('click', showDashboard);
  $('navInventory').addEventListener('click', showInventory);
  $('navMonsters').addEventListener('click', showMonsters);
  const scrollToDungeons = () => $('dungeonCards').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('navDungeons').addEventListener('click', scrollToDungeons);
  $('btnBrowse').addEventListener('click', scrollToDungeons);
  $('searchForm').addEventListener('submit', onSearchAdventurer);
}

// Look up any adventurer's live Origins profile (read-only; not sign-in).
async function onSearchAdventurer(e) {
  e.preventDefault();
  const name = $('searchName').value.trim();
  const out = $('searchResult');
  if (!name) return;
  out.innerHTML = loadingHtml(`Searching for ${name}...`);
  try {
    const u = await fetchOriginsUser(name);
    const img = `https://img.franklyorigins.net/habbo-imaging/avatarimage?habbo=${encodeURIComponent(u.name)}&hotel=com&action=wav&shadow=true&cb=5`;
    out.innerHTML = `
      <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-top:14px">
        <img src="${img}" alt="${esc(u.name)}" style="image-rendering:pixelated" />
        <div style="flex:1 1 220px;min-width:0">
          <div class="hd-pill"><span>Adventurer</span><span class="hd-pill-value">${esc(u.name)}</span></div>
          ${u.motto ? `<div class="hd-pill"><span>Motto</span><span class="hd-pill-value">${esc(u.motto)}</span></div>` : ''}
          ${u.currentLevel != null ? `<div class="hd-pill"><span>Origins level</span><span class="hd-pill-value">${u.currentLevel}</span></div>` : ''}
          <div class="hd-pill"><span>Status</span><span class="hd-pill-value">${u.online ? 'Online' : 'Offline'}</span></div>
        </div>
      </div>`;
  } catch (err) {
    out.innerHTML = `<p class="dim" style="margin:12px 0 0">Couldn't find "${esc(name)}": ${esc(err.message)}</p>`;
  }
}

// ---- calling (class) picker ------------------------------------------------
// One chip per class, single-select, persisted on the identity: the calling
// chosen at hero creation is the class "You" leads every descent as.
function classChip(id, on) {
  const c = CLASSES[id];
  const skill = c.skill ? ` · ${c.skill.name}` : '';
  const stats = `HP ${c.maxHp} · ATK ${c.atk} · DEF ${c.def} · SPD ${c.spd} · MOV ${c.move} · RNG ${c.range}`;
  return `<button type="button" class="hd-class${on ? ' on' : ''}" data-class="${id}" style="--cc:${c.color}" title="${stats} ${c.blurb}">
    <b>${c.name}</b><span>${c.archetype}${skill}</span>
  </button>`;
}

function renderCallingRow(el, onPick) {
  if (!el) return;
  const cur = Identity.classId() || 'fighter';
  el.innerHTML = Object.keys(CLASSES).map((id) => classChip(id, id === cur)).join('');
  el.querySelectorAll('[data-class]').forEach((b) =>
    b.addEventListener('click', () => {
      Identity.setClass(b.dataset.class);
      renderCallingRow(el, onPick);
      if (onPick) onPick(b.dataset.class);
    })
  );
}

// ---- sign in (motto-code verification) -------------------------------------
// The ONLY way in: no guest play, no unverified quick-load. A player proves
// they own a Habbo Origins character by putting a one-time code in its motto;
// the server checks the live profile (Identity.verify). Shared by the landing
// card, the dashboard gate, and the Habbo Account screen's link box.
function renderSignIn(box, onDone) {
  const id = Identity.get() || {};
  const showCode = acct.code && acct.name;
  box.innerHTML = `
    <p style="margin:0 0 10px">Sign in with your <b>Habbo: Origins</b> character. No password: put a one-time code in your motto and the server verifies the account is yours.</p>
    <div class="field-row">
      <input id="linkName" class="hd-input" style="flex:1;min-width:160px" placeholder="Your Habbo Origins name" aria-label="Habbo Origins name" value="${esc(acct.name || id.name || '')}" spellcheck="false" autocomplete="off" ${showCode ? 'disabled' : ''} />
      ${showCode ? '' : '<button id="genCode" class="hd-btn hd-btn--green">Sign In</button>'}
    </div>
    ${
      showCode
        ? `<div class="code-block">
             <p class="info">Go to <b>origins.habbo.com</b> and add this code anywhere in your <b>motto</b>, then press Verify:</p>
             <div class="code">${acct.code}</div>
             <div class="field-row">
               <button id="doVerify" class="hd-btn hd-btn--green">I've set my motto - Verify</button>
               <button id="cancelCode" class="hd-btn hd-btn--white">Cancel</button>
             </div>
           </div>`
        : ''
    }
    <p class="result" id="linkMsg">${acct._msg || ''}</p>`;
  acct._msg = '';
  if ($('genCode'))
    $('genCode').addEventListener('click', () => {
      const v = $('linkName').value.trim();
      if (!v) return ($('linkMsg').textContent = 'Enter your Habbo name first.');
      acct.name = v;
      acct.code = Identity.makeCode();
      renderSignIn(box, onDone);
    });
  if ($('cancelCode'))
    $('cancelCode').addEventListener('click', () => {
      acct.code = null;
      renderSignIn(box, onDone);
    });
  if ($('doVerify'))
    $('doVerify').addEventListener('click', async () => {
      const msg = $('linkMsg');
      msg.innerHTML = loadingHtml('Checking your motto...');
      const r = await Identity.verify(acct.name, acct.code);
      if (r.ok) {
        acct.code = null;
        figure = Identity.figure() || figure;
        figureLabel = identityLabel(Identity.get());
        await loadFigure(figure);
        onDone();
      } else {
        msg.textContent = r.reason + (r.motto != null ? ` (motto reads: "${r.motto || '-'}")` : '');
      }
    });
}

// Sign out: drop the identity (runs and saves stay local) and return to the
// landing page's signed-out state.
async function signOut() {
  Identity.clear();
  acct = { name: '', code: null, email: '', otpSent: false };
  figure = DEFAULT_FIGURE;
  figureLabel = identityLabel(null);
  await loadFigure(figure);
  showTitle();
}

// ---- player dashboard ------------------------------------------------------
// The hero's page, adapted from habbodungeons.com/dashboard: identity, stats,
// expedition records, inventory and Origins skill trees, all from real local
// state (Identity + the current run save). Rendered in the same hd-ui skin as
// the landing screen.
const SLOT_LABELS = { weapon: 'Weapon', armor: 'Armor', trinket: 'Trinket' };
const BONUS_LABELS = { maxHp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD', move: 'MOV' };

function bonusText(item) {
  return Object.entries(item.bonus || {})
    .map(([k, v]) => `+${v} ${BONUS_LABELS[k] || k.toUpperCase()}`)
    .join(' ');
}

// Draw an item's REAL furni art (ITEMS[id].icon -> assets/props) into a canvas,
// the same lazy sheet-poll the in-game :furni catalogue uses. Pixel-art rule:
// integer-divisor downscale only, never fractional. Mirrors Hand.drawIcon.
const INV_ICON = 56;
function drawItemIcon(cv, iconId, tries = 0) {
  if (!cv.isConnected || cv.dataset.icon !== iconId) return; // card re-rendered under us
  const sp = propSprites(iconId);
  if (!sp.ready) {
    if (tries < 40) setTimeout(() => drawItemIcon(cv, iconId, tries + 1), 60);
    return;
  }
  const fr = sp.get(0) || sp.get(2) || sp.get(4);
  if (!fr) return;
  const ctx = cv.getContext('2d');
  const div = Math.max(1, Math.ceil(Math.max(fr.w / INV_ICON, fr.h / INV_ICON)));
  const w = Math.max(1, Math.floor(fr.w / div));
  const h = Math.max(1, Math.floor(fr.h / div));
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, INV_ICON, INV_ICON);
  ctx.drawImage(fr.img, fr.x, fr.y, fr.w, fr.h, Math.round((INV_ICON - w) / 2), Math.round((INV_ICON - h) / 2), w, h);
}

// Warm every inventory-card canvas within a container after it's in the DOM.
function renderInvIcons(root) {
  root.querySelectorAll('canvas[data-icon]').forEach((cv) => {
    if (cv.dataset.icon) drawItemIcon(cv, cv.dataset.icon);
  });
}

// One inventory card: rarity-rimmed, rarity-titled, with real furni art.
// `slot` labels an equipped card; empty slots render a dashed placeholder.
// One detailed inventory card (adapted from habbodungeons.com's item cards):
// real furni art beside the name, a type/rarity meta row (plus an Equipped
// badge when worn), the stat line, and the item's italic description.
function invCardHtml(it, { type, equipped = false } = {}) {
  const rc = RARITY[it.rarity] || RARITY.common;
  const glow = hexToGlow(rc.color);
  const style = `--hd-rarity:${rc.color};--hd-rarity-ink:${rc.color};--hd-rarity-glow:${glow}`;
  const stat = it.bonus ? bonusText(it) : it.effectText || '';
  return `<div class="hd-inv-card" style="${style}">
    <canvas class="hd-inv-card-art" width="${INV_ICON}" height="${INV_ICON}" data-icon="${esc(it.icon || '')}" role="img" aria-label="${esc(it.name)}"></canvas>
    <div class="hd-inv-card-body">
      <span class="hd-inv-card-name">${esc(it.name)}</span>
      <span class="hd-inv-card-meta">
        <span>${esc(type)}</span>
        <span class="hd-inv-card-rarity">${rc.name}</span>
        ${equipped ? '<span class="hd-inv-equipped">✓ Equipped</span>' : ''}
      </span>
      ${stat ? `<span class="hd-inv-card-stat">${stat}</span>` : ''}
      ${it.blurb ? `<span class="hd-inv-card-blurb">${esc(it.blurb)}</span>` : ''}
    </div>
  </div>`;
}

// A titled section panel (its own hd-card) holding a grid of item cards, like
// theirs' Weapons / Consumables / Other panels. Returns '' when empty.
function invSectionHtml(title, cards) {
  if (!cards.length) return '';
  return `<div class="hd-card hd-inv-section">
    <div class="hd-card-header">${title}</div>
    <div class="hd-card-body">
      <div class="hd-inv-cards">${cards.join('')}</div>
    </div>
  </div>`;
}

// Rarity hex -> a soft glow colour (the card's box-shadow tint).
function hexToGlow(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 'transparent';
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.55)`;
}

// The Inventory page body, adapted from habbodungeons.com's format: a Player
// Stats panel, then one titled panel per item type (Weapons / Armor /
// Trinkets / Consumables), each a grid of detailed cards. Equipped gear is
// tagged. Loadout is run-scoped, so an empty state stands in for no descent.
// Returns a string of stacked hd-card panels (not wrapped in a single card).
function inventoryPanelsHtml(r, leader, rec) {
  if (!r) {
    return `<div class="hd-card hd-inv-section">
      <div class="hd-card-header">Inventory</div>
      <div class="hd-card-body"><p class="hd-inv-empty-note">No descent underway. Loot, gear and gold live inside a run; begin a descent to start collecting.</p></div>
    </div>`;
  }

  // Player Stats panel (leader's effective line + gold), like their inventory
  // page's stats panel.
  const statsPanel = leader
    ? (() => {
        const s = memberStats(leader);
        const cls = CLASSES[leader.classId] || {};
        const pills = [
          ['Level', leader.level],
          ['HP', `${leader.hp} / ${s.maxHp}`],
          ['ATK', s.atk],
          ['DEF', s.def],
          ['SPD', s.spd],
          ['Gold', rec.gold],
        ]
          .map(([k, v]) => `<div class="hd-pill"><span>${k}</span><span class="hd-pill-value">${v}</span></div>`)
          .join('');
        return `<div class="hd-card hd-inv-section">
          <div class="hd-card-header">Player Stats</div>
          <div class="hd-card-body">
            <div class="hd-inv-stat-pills">${pills}</div>
            <p class="dim" style="margin:12px 0 0;font-size:11px">Your leader in ${esc(rec.descent)}, fighting as ${esc(cls.name || 'their calling')} with equipment counted.</p>
          </div>
        </div>`;
      })()
    : '';

  // Bucket every item (equipped gear + satchel) by type. Equipped ids come
  // from the leader's three slots; everything else is loose in the run bag.
  const equippedIds = leader ? Object.values(leader.equipment).filter(Boolean) : [];
  const buckets = { weapon: [], armor: [], trinket: [], consumable: [] };
  const push = (id, equipped) => {
    const it = ITEMS[id];
    if (it) return buckets[it.slot]?.push(invCardHtml(it, { type: SLOT_LABELS[it.slot], equipped }));
    const c = CONSUMABLES[id];
    if (c) buckets.consumable.push(invCardHtml(c, { type: 'Consumable' }));
  };
  equippedIds.forEach((id) => push(id, true));
  r.inventory.forEach((id) => push(id, false));

  const sections =
    invSectionHtml('Weapons', buckets.weapon) +
    invSectionHtml('Armor', buckets.armor) +
    invSectionHtml('Trinkets', buckets.trinket) +
    invSectionHtml('Consumables', buckets.consumable);

  return (
    statsPanel +
    (sections ||
      `<div class="hd-card hd-inv-section">
        <div class="hd-card-header">Inventory</div>
        <div class="hd-card-body"><p class="hd-inv-empty-note">Empty. Battles and events drop loot as you descend.</p></div>
      </div>`)
  );
}

function showDashboard() {
  hideAll();
  overlay.classList.remove('hidden');
  skinOverlay();
  const unskin = unskinOverlay;
  const id = Identity.get() || {};

  // Signed-out gate: the dashboard is your hero's page, and heroes are real
  // verified Habbos only. Same flow as the landing card.
  if (!Identity.isVerified()) {
    overlay.innerHTML = `
      <div class="hd-landing" style="width:min(640px,96vw)">
        <div class="hd-card">
          <div class="hd-card-body" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px 18px">
            <img class="hd-logo-img" src="assets/ui/logos/player-dashboard-ribbon.gif" alt="PLAYER DASHBOARD" />
            <button id="dashBack" class="hd-btn hd-btn--white">← Landing</button>
          </div>
        </div>
        <div class="hd-card">
          <div class="hd-card-header">Sign In with Habbo</div>
          <div class="hd-card-body" id="signInBody"></div>
        </div>
        <div class="hd-footer">
          <p style="margin:0">Habbo Dungeons is a fan project and is not affiliated with, endorsed or sponsored by Habbo or Sulake Oy.</p>
        </div>
      </div>`;
    $('dashBack').addEventListener('click', showTitle);
    renderSignIn($('signInBody'), showDashboard);
    return;
  }

  // A live run (if any) only feeds the stat/record readouts — there is no
  // resume/continue from here; you begin fresh or descend in the world.
  const rec = titleRecords();
  const r = Run.hasSave() ? Run.load(buildDungeon) : null;
  const leader = r ? r.squad.find((m) => m.leader) : null;

  // Player Stats, adapted from habbodungeons.com's dashboard: a big Level
  // block, an HP meter, then chunky big-number stat blocks. Reads the live run
  // leader (equipment + levels included) or the chosen calling's base line.
  const statBlocksHtml = () => {
    const cls = CLASSES[(leader && leader.classId) || Identity.classId() || 'fighter'];
    const s = leader
      ? memberStats(leader)
      : { maxHp: cls.maxHp, atk: cls.atk, def: cls.def, spd: cls.spd, move: cls.move, range: cls.range };
    const level = leader ? leader.level : 1;
    const hp = leader ? leader.hp : s.maxHp;
    const pct = Math.max(0, Math.min(100, Math.round((hp / s.maxHp) * 100)));
    const blocks = [
      ['ATK', s.atk, ''],
      ['DEF', s.def, ' hd-statblock--blue'],
      ['SPD', s.spd, ''],
      ['MOV', s.move, ' hd-statblock--blue'],
      ['RNG', s.range, ''],
    ]
      .map(
        ([k, v, mod]) =>
          `<div class="hd-statblock${mod}"><div class="hd-statblock-label">${k}</div><div class="hd-statblock-value">${v}</div></div>`
      )
      .join('');
    return `
      <div class="hd-stat-lead">
        <div class="hd-stat-big">
          <div class="hd-stat-big-label">Level</div>
          <div class="hd-stat-big-value">${level}</div>
        </div>
        <div>
          <div class="hd-hpbar-label"><span>HP</span><span>${hp} / ${s.maxHp}</span></div>
          <div class="hd-hpbar"><div class="hd-hpbar-fill" style="width:${pct}%"></div></div>
        </div>
      </div>
      <div class="hd-statgrid">${blocks}</div>`;
  };
  const statSourceText = () => {
    const cls = CLASSES[(leader && leader.classId) || Identity.classId() || 'fighter'];
    return leader
      ? `Your leader in ${rec.descent}, fighting as ${cls.name} with equipment counted.`
      : `Base line for your calling, ${cls.name}. Levels and equipment apply during a descent.`;
  };

  const currentClass = CLASSES[Identity.classId() || 'fighter'];
  const archetypeName = { melee: 'Melee', ranged: 'Ranged', magic: 'Magic', support: 'Support' };

  overlay.innerHTML = `
    <div class="hd-landing">
      <div class="hd-card">
        <div class="hd-card-body" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px 18px">
          <img class="hd-logo-img" src="assets/ui/logos/player-dashboard-ribbon.gif" alt="PLAYER DASHBOARD" />
          <nav style="display:flex;flex-wrap:wrap;gap:8px">
            <button id="dashBack" class="hd-btn hd-btn--white">← Landing</button>
            <button id="dashInventory" class="hd-btn">Inventory</button>
            <button id="dashAccount" class="hd-btn">Habbo Account</button>
            <button id="dashPlay" class="hd-btn hd-btn--green">Start Your Adventure ▸</button>
          </nav>
        </div>
      </div>
      <div class="hd-card">
        <div class="hd-card-header">Player Identity</div>
        <div class="hd-card-body">
          <div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
            <div id="acctAvatar">${avatarImgHtml()}</div>
            <div style="flex:1 1 220px;min-width:0">
              <div class="hd-pill"><span>Habbo name</span><span class="hd-pill-value">${esc(id.name)}</span></div>
              ${id.motto ? `<div class="hd-pill"><span>Motto</span><span class="hd-pill-value">${esc(id.motto)}</span></div>` : ''}
              <div class="hd-pill"><span>Habbo link</span><span class="hd-pill-value">Verified</span></div>
              <div class="hd-pill"><span>Origins levels</span><span class="hd-pill-value">${
                id.syncedAt ? `Fishing ${id.fishingLevel || 0} · Gardening ${id.gardeningLevel || 0}` : 'Not synced'
              }</span></div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;flex:0 0 auto">
              <button id="dashInvOpen" class="hd-btn">Open Inventory ▸</button>
              <button id="dashSkills" class="hd-btn">View Skills ▸</button>
              <button id="dashAccount2" class="hd-btn hd-btn--white">Habbo Account</button>
              <button id="dashSignOut" class="hd-btn hd-btn--white">Sign out</button>
            </div>
          </div>
        </div>
      </div>
      <div class="hd-card">
        <div class="hd-card-header">Class &amp; Role</div>
        <div class="hd-card-body">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
            <div>
              <h3 style="margin:0;font-size:20px;color:${currentClass.color}">${currentClass.name}</h3>
              <p class="dim" style="margin:2px 0 0">Archetype: ${archetypeName[currentClass.archetype] || currentClass.archetype}</p>
            </div>
            <p id="charInfo" class="dim" style="margin:0;font-size:11px;text-align:right">${figureLabel}</p>
          </div>
          <p style="margin:10px 0;font-style:italic;border-left:4px solid ${currentClass.color};padding:6px 0 6px 12px;color:#665f49">${esc(currentClass.blurb)}</p>
          <p style="margin:12px 0 8px"><b>Change calling</b> <span class="dim">· the class you lead as when a descent begins</span></p>
          <div class="hd-class-row" id="callingRow"></div>
        </div>
      </div>
      <div class="hd-card">
        <div class="hd-card-header">Player Stats</div>
        <div class="hd-card-body">
          <div id="statBlocks">${statBlocksHtml()}</div>
          <p id="statSource" class="dim" style="margin:12px 0 0;font-size:11px">${statSourceText()}</p>
        </div>
      </div>
      <div class="hd-card">
        <div class="hd-card-header">Expedition Records</div>
        <div class="hd-card-body">
          <div class="hd-inv-stat-pills">
            <div class="hd-pill"><span>Current descent</span><span class="hd-pill-value">${rec.descent}</span></div>
            <div class="hd-pill"><span>Battles cleared</span><span class="hd-pill-value">${rec.battles}</span></div>
            <div class="hd-pill"><span>Gold carried</span><span class="hd-pill-value">${rec.gold}</span></div>
            <div class="hd-pill"><span>Heroes standing</span><span class="hd-pill-value">${rec.heroes}</span></div>
          </div>
        </div>
      </div>
      <div class="hd-landing-row">
        <div class="hd-landing-col hd-card">
          <div class="hd-card-header">Join Adventure</div>
          <div class="hd-card-body hd-action-body">
            <p>Descend solo as your avatar through the Gatekeeper&rsquo;s arch.</p>
            <button id="dashBegin" class="hd-btn hd-btn--green">Begin a Descent ▸</button>
          </div>
        </div>
        <div class="hd-landing-col hd-card">
          <div class="hd-card-header">Loot &amp; Inventory</div>
          <div class="hd-card-body hd-action-body">
            <p>Review your leader&rsquo;s gear, satchel loot and consumables by rarity.</p>
            <button id="dashInvOpen2" class="hd-btn hd-btn--green">Open Inventory ▸</button>
          </div>
        </div>
        <div class="hd-landing-col hd-card">
          <div class="hd-card-header">Skill Trees</div>
          <div class="hd-card-body hd-action-body">
            <p>Your Water and Nature battle skills, unlocked from real Origins levels.</p>
            <button id="dashSkills2" class="hd-btn hd-btn--green">View Skills ▸</button>
          </div>
        </div>
      </div>
      <div class="hd-card" id="skillTreesCard">
        <div class="hd-card-header">Origins Skill Trees</div>
        <div class="hd-card-body">
          <p style="margin:0 0 12px">Water and Nature battle skills unlock from <b>${esc(id.name)}</b>'s real Fishing and Gardening levels.${
            id.syncedAt ? '' : ' Sync them from the Habbo Account screen.'
          }</p>${skillTreesHtml(id)}
        </div>
      </div>
      <div class="hd-footer">
        <p style="margin:0">Habbo Dungeons is a fan project and is not affiliated with, endorsed or sponsored by Habbo or Sulake Oy.</p>
      </div>
    </div>`;

  const openAccount = () => {
    unskin();
    showAccount();
  };
  const openSkills = () =>
    $('skillTreesCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('dashBack').addEventListener('click', showTitle);
  $('dashInventory').addEventListener('click', showInventory);
  $('dashInvOpen').addEventListener('click', showInventory);
  $('dashInvOpen2').addEventListener('click', showInventory);
  $('dashSkills').addEventListener('click', openSkills);
  $('dashSkills2').addEventListener('click', openSkills);
  $('dashAccount').addEventListener('click', openAccount);
  $('dashAccount2').addEventListener('click', openAccount);
  $('dashPlay').addEventListener('click', () => {
    unskin();
    startExplore();
  });
  $('dashBegin').addEventListener('click', () => {
    unskin();
    showSquadBuilder();
  });
  $('dashSignOut').addEventListener('click', signOut);
  // Changing calling updates the Class panel header, blurb and base stats, so
  // re-render the whole dashboard (cheap; no run in progress changes) — and
  // reload the avatar sprites so the new class's weapon shows immediately.
  renderCallingRow($('callingRow'), () => {
    figureLabel = identityLabel(Identity.get());
    loadFigure(figure);
    if (!leader) return showDashboard();
    $('charInfo').textContent = figureLabel;
    $('statBlocks').innerHTML = statBlocksHtml();
    $('statSource').textContent = statSourceText();
  });
}

// ---- inventory (standalone page) -------------------------------------------
// Its own top-level view, like habbodungeons.com's /inventory page (nav:
// Monsters / Dungeons / Inventory / Login). The same rarity-card grid that
// used to live in the dashboard, now on its own route. Player gear is
// account-specific, so it shares the dashboard's sign-in gate when signed out.
function showInventory() {
  hideAll();
  overlay.classList.remove('hidden');
  skinOverlay();
  const unskin = unskinOverlay;

  if (!Identity.isVerified()) {
    overlay.innerHTML = `
      <div class="hd-landing" style="width:min(640px,96vw)">
        <div class="hd-card">
          <div class="hd-card-body" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px 18px">
            <img class="hd-logo-img" src="assets/ui/logos/inventory-ribbon.gif" alt="INVENTORY" />
            <button id="invBack" class="hd-btn hd-btn--white">← Landing</button>
          </div>
        </div>
        <div class="hd-card">
          <div class="hd-card-header">Inventory · Sign In with Habbo</div>
          <div class="hd-card-body" id="signInBody"></div>
        </div>
        <div class="hd-footer">
          <p style="margin:0">Habbo Dungeons is a fan project and is not affiliated with, endorsed or sponsored by Habbo or Sulake Oy.</p>
        </div>
      </div>`;
    $('invBack').addEventListener('click', showTitle);
    renderSignIn($('signInBody'), showInventory);
    return;
  }

  const rec = titleRecords();
  const r = Run.hasSave() ? Run.load(buildDungeon) : null;
  const leader = r ? r.squad.find((m) => m.leader) : null;

  overlay.innerHTML = `
    <div class="hd-landing">
      <div class="hd-card">
        <div class="hd-card-body" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px 18px">
          <img class="hd-logo-img" src="assets/ui/logos/inventory-ribbon.gif" alt="INVENTORY" />
          <nav style="display:flex;flex-wrap:wrap;gap:8px">
            <button id="invBack" class="hd-btn hd-btn--white">← Landing</button>
            <button id="invMonsters" class="hd-btn">Monsters</button>
            <button id="invDungeons" class="hd-btn">Dungeons</button>
            <button id="invDashboard" class="hd-btn">Dashboard</button>
          </nav>
        </div>
      </div>
      ${inventoryPanelsHtml(r, leader, rec)}
      <div class="hd-footer">
        <p style="margin:0">Habbo Dungeons is a fan project and is not affiliated with, endorsed or sponsored by Habbo or Sulake Oy.</p>
      </div>
    </div>`;

  $('invBack').addEventListener('click', showTitle);
  $('invMonsters').addEventListener('click', showMonsters);
  $('invDungeons').addEventListener('click', () => {
    showTitle();
    const cards = $('dungeonCards');
    if (cards) cards.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('invDashboard').addEventListener('click', showDashboard);
  renderInvIcons(overlay); // warm the inventory cards' furni art
}

// ---- monsters (bestiary view) ----------------------------------------------
// Consumer-facing bestiary, its own top-level overlay in the hd-landing/hd-card
// style (nav: Dungeons / Inventory / Login). A stub for now: it reads the live
// encounter data straight from the game (same DUNGEONS + Unit source that
// tools/build-manual.js walks) and lists every distinct foe with its level
// range and where it's fought. The rich static Monster Manual (manual.html)
// stays the backend admin tool, untouched.
function collectMonsters() {
  const seen = new Map();
  for (const meta of DUNGEONS) {
    const dungeon = buildDungeon(meta.id);
    if (!dungeon) continue;
    let battleNo = 0;
    for (const node of dungeon.nodes) {
      if (node.type !== 'battle') continue;
      battleNo++;
      const room = node.makeRoom();
      const enemies = node.makeEnemies(room);
      const nodeBossLevel = node.boss ? Math.max(...enemies.map((u) => u.level)) : -1;
      for (const u of enemies) {
        const entry =
          seen.get(u.name) ||
          { name: u.name, cls: u.cls, levels: new Set(), battles: new Set(), boss: false };
        entry.levels.add(u.level);
        entry.battles.add(`${dungeon.name} · Battle ${battleNo}`);
        if (node.boss && u.level === nodeBossLevel) entry.boss = true;
        seen.set(u.name, entry);
      }
    }
  }
  return [...seen.values()]
    .map((e) => {
      const levels = [...e.levels].sort((a, b) => a - b);
      return {
        ...e,
        levelLabel: levels.length > 1 ? `Lv ${levels[0]}–${levels[levels.length - 1]}` : `Lv ${levels[0]}`,
        battleLabel: [...e.battles].sort().join(' · '),
      };
    })
    .sort((a, b) => a.boss - b.boss || a.name.localeCompare(b.name));
}

function showMonsters() {
  hideAll();
  overlay.classList.remove('hidden');
  skinOverlay();

  const monsters = collectMonsters();
  const rows = monsters
    .map(
      (m) => `
      <div class="hd-card" style="flex:1 1 220px;min-width:0">
        <div class="hd-card-body">
          <p style="margin:0 0 6px"><b>${esc(m.name)}</b>${m.boss ? ' <span class="hd-badge hd-badge--yellow">BOSS</span>' : ''}</p>
          <p class="dim" style="margin:0 0 8px">${esc(m.levelLabel)} · ${esc(m.cls.name)} · ${esc(m.cls.archetype)}</p>
          <p class="dim" style="margin:0;font-size:9px">${esc(m.battleLabel)}</p>
        </div>
      </div>`
    )
    .join('');

  overlay.innerHTML = `
    <div class="hd-landing">
      <div class="hd-card">
        <div class="hd-card-body" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px 18px">
          <img class="hd-logo-img" src="https://habbofont.net/font/habbo_ribbon/monsters.gif" alt="MONSTERS" onerror="this.outerHTML='<span class=\'hd-logo\'>Monsters</span>'" />
          <nav style="display:flex;flex-wrap:wrap;gap:8px">
            <button id="monBack" class="hd-btn hd-btn--white">← Landing</button>
            <button id="monDungeons" class="hd-btn">Dungeons</button>
            <button id="monInventory" class="hd-btn">Inventory</button>
          </nav>
        </div>
      </div>
      <div class="hd-card">
        <div class="hd-card-header">The Bestiary</div>
        <div class="hd-card-body">
          <p style="margin:0">Every foe stalking the depths, pulled live from the dungeon data. <b>${monsters.length}</b> creatures catalogued.</p>
        </div>
      </div>
      <div class="hd-landing-row">${rows}</div>
      <div class="hd-footer">
        <p style="margin:0">Habbo Dungeons is a fan project and is not affiliated with, endorsed or sponsored by Habbo or Sulake Oy.</p>
      </div>
    </div>`;

  $('monBack').addEventListener('click', showTitle);
  $('monInventory').addEventListener('click', showInventory);
  $('monDungeons').addEventListener('click', () => {
    showTitle();
    const cards = $('dungeonCards');
    if (cards) cards.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ---- Habbo account (link + skill sync + optional cloud) --------------------
let acct = { name: '', code: null, email: '', otpSent: false };

function showAccount() {
  hideAll();
  overlay.classList.remove('hidden');
  skinOverlay();
  renderAccount();
}

// Build the shell + the offline-capable boxes synchronously; the cloud box is
// filled asynchronously so a slow/absent CDN never stalls the screen.
function renderAccount() {
  const id = Identity.get() || {};
  overlay.innerHTML = `
    <div class="hd-landing" style="width:min(760px,96vw)">
      <div class="hd-card">
        <div class="hd-card-header">Habbo Account</div>
        <div class="hd-card-body">
          <p style="margin:0">Fight as your real <b>Habbo: Origins</b> avatar and turn your Fishing &amp; Gardening levels into battle skills. Linking works offline; signing in also saves your runs to the cloud.</p>
        </div>
      </div>
      <div class="hd-card">
        <div class="hd-card-header">1 · Link your Habbo</div>
        <div class="hd-card-body" id="linkBox"></div>
      </div>
      <div class="hd-card">
        <div class="hd-card-header">2 · Origins skills</div>
        <div class="hd-card-body" id="skillBox"></div>
      </div>
      <div class="hd-card">
        <div class="hd-card-header">3 · Cloud save · optional</div>
        <div class="hd-card-body" id="cloudBox">${loadingHtml('Checking...')}</div>
      </div>
      <div style="display:flex;justify-content:flex-end"><button id="acctBack" class="hd-btn hd-btn--white">← Back</button></div>
    </div>`;
  renderLinkBox(id);
  renderSkillBox(id);
  refreshCloudBox();
  const backToTitle = () => {
    figureLabel = identityLabel(Identity.get());
    showTitle();
  };
  $('acctBack').addEventListener('click', backToTitle);
}

function renderLinkBox(id) {
  const box = $('linkBox');
  if (id.verifiedAt) {
    box.innerHTML = `
      <p class="acct-ok">✓ Signed in as <b>${esc(id.name)}</b></p>
      <p class="info dim">Motto verified. Your avatar fights as this Habbo.</p>
      <button id="relink" class="hd-btn hd-btn--white">Change / re-link</button>`;
    $('relink').addEventListener('click', () => {
      acct.code = null;
      acct.name = id.name || '';
      const cleared = { ...Identity.get() };
      delete cleared.verifiedAt;
      localStorage.setItem('habbo-dungeons-identity', JSON.stringify(cleared));
      renderAccount();
    });
    return;
  }
  renderSignIn(box, renderAccount);
}

// The Water/Nature tree grid, shared by the Account screen and the Dashboard.
function skillTreesHtml(id) {
  const unlocked = new Set(id.unlockedSkills || []);
  const synced = id.syncedAt;
  const next = nextUnlocks(id.fishingLevel || 0, id.gardeningLevel || 0);
  const trees = Object.entries(SKILL_TREES)
    .map(([treeId, tree]) => {
      const lvl = treeId === 'water' ? id.fishingLevel : id.gardeningLevel;
      const rows = tree.skills
        .map((s) => {
          const on = unlocked.has(s.id);
          return `<div class="skill-item ${on ? 'on' : 'off'}">
              <span class="sk-name">${on ? '◆' : '◇'} ${s.name}</span>
              <span class="sk-req">${on ? 'unlocked' : `${tree.gatedBy} ${s.req.level}`}</span>
            </div>`;
        })
        .join('');
      const goal = next[treeId] ? `<p class="info dim">Next: <b>${next[treeId].skill.name}</b> at ${tree.gatedBy} ${next[treeId].skill.req.level} (${next[treeId].need} to go)</p>` : '<p class="info dim">All unlocked - master angler/gardener!</p>';
      return `<div class="tree" style="border-color:${tree.color}">
          <div class="tree-head" style="color:${tree.color}">${tree.name} <span class="dim">· ${tree.gatedBy} ${synced ? lvl ?? 0 : '-'}</span></div>
          ${rows}${synced ? goal : ''}
        </div>`;
    })
    .join('');
  return `<div class="trees">${trees}</div>`;
}

function renderSkillBox(id) {
  const box = $('skillBox');
  if (!id.name) {
    box.innerHTML = '<p class="info dim">Link (or quick-load) a Habbo above, then sync to read your Fishing &amp; Gardening levels.</p>';
    return;
  }
  const synced = id.syncedAt;
  box.innerHTML = `
    <div class="field-row">
      <button id="doSync" class="hd-btn hd-btn--green">${synced ? 'Re-sync from Habbo' : 'Sync skills from Habbo'}</button>
      <span class="info dim">${synced ? `Last synced ${new Date(synced).toLocaleString()}` : 'Reads Fishing/Gardening via Bobba.'}</span>
    </div>
    <p class="result" id="syncMsg"></p>
    ${skillTreesHtml(id)}`;
  $('doSync').addEventListener('click', async () => {
    const msg = $('syncMsg');
    msg.innerHTML = loadingHtml('Syncing from Habbo...');
    const r = await Identity.sync();
    if (r.ok) {
      await loadFigure(Identity.figure());
      renderAccount();
    } else {
      msg.textContent = r.reason;
    }
  });
}

async function refreshCloudBox() {
  const box = $('cloudBox');
  if (!box) return;
  const available = await Auth.available().catch(() => false);
  if (!available) {
    box.innerHTML = '<p class="info dim">Cloud unavailable (offline). Your progress is saved locally.</p>';
    return;
  }
  const user = await Auth.user().catch(() => null);
  if (user) {
    box.innerHTML = `
      <p class="acct-ok">☁ Signed in as <b>${user.email || 'your account'}</b></p>
      <p class="info dim">Your linked Habbo, skills and runs sync to the cloud.</p>
      <button id="signOut" class="hd-btn hd-btn--white">Sign out</button>`;
    $('signOut').addEventListener('click', async () => {
      await Auth.signOut();
      renderAccount();
    });
    return;
  }
  box.innerHTML = `
    <div class="field-row">
      <input id="email" class="hd-input" style="flex:1;min-width:160px" type="email" placeholder="you@email.com" value="${acct.email || ''}" ${acct.otpSent ? 'disabled' : ''} />
      ${acct.otpSent ? '' : '<button id="sendOtp" class="hd-btn hd-btn--green">Email me a code</button>'}
    </div>
    ${
      acct.otpSent
        ? `<div class="field-row">
             <input id="otp" class="hd-input" style="flex:1;min-width:120px" placeholder="6-digit code" inputmode="numeric" />
             <button id="verifyOtp" class="hd-btn hd-btn--green">Verify</button>
             <button id="cancelOtp" class="hd-btn hd-btn--white">Cancel</button>
           </div>`
        : ''
    }
    <p class="result" id="cloudMsg"></p>`;
  if ($('sendOtp'))
    $('sendOtp').addEventListener('click', async () => {
      const email = $('email').value.trim();
      const msg = $('cloudMsg');
      if (!email) return (msg.textContent = 'Enter your email.');
      msg.innerHTML = loadingHtml('Sending...');
      const r = await Auth.signIn(email);
      if (r.ok) {
        acct.email = email;
        acct.otpSent = true;
        refreshCloudBox();
        $('cloudMsg').textContent = 'Check your email for a 6-digit code.';
      } else msg.textContent = r.reason;
    });
  if ($('cancelOtp'))
    $('cancelOtp').addEventListener('click', () => {
      acct.otpSent = false;
      refreshCloudBox();
    });
  if ($('verifyOtp'))
    $('verifyOtp').addEventListener('click', async () => {
      const msg = $('cloudMsg');
      msg.innerHTML = loadingHtml('Verifying...');
      const r = await Auth.verifyOtp(acct.email, $('otp').value);
      if (r.ok) {
        acct.otpSent = false;
        await Identity.loadFromCloud().catch(() => {});
        await Identity.mirror().catch(() => {});
        await RunStore.hydrateFromCloud().catch(() => {});
        await loadFigure(Identity.figure() || figure);
        renderAccount();
      } else msg.textContent = r.reason;
    });
}

// ---- squad builder ---------------------------------------------------------
// "You" always leads as the calling registered on the landing page.
//
// You descend as your own avatar. The ONLY other heroes are real players who
// join your co-op party — there are no AI companions/bots.
// Two modes:
//   fromGate=true  — entered by walking through the square's arch (the gate
//                    chose the dungeon).
//   fromGate=false — dashboard / landing "Begin a Descent": pick a dungeon,
//                    then descend (solo, or with real co-op party members).
let dungeonPick = DUNGEON_ID; // which dungeon the new run descends into

function showSquadBuilder(fromGate = false) {
  hideAll();
  overlay.classList.remove('hidden');
  skinOverlay();
  const unskin = unskinOverlay;
  const meta = DUNGEONS.find((d) => d.id === dungeonPick) || DUNGEONS[0];
  overlay.innerHTML = `
    <div class="hd-landing" style="width:min(860px,96vw)">
      <div class="hd-card">
        <div class="hd-card-header">${fromGate ? meta.name : 'Begin a descent'}</div>
        <div class="hd-card-body">
          <div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
            <div>${avatarImgHtml()}</div>
            <div style="flex:1 1 280px;min-width:0">
              <p style="margin:0 0 8px">${fromGate ? `${meta.sub}. ` : ''}<b>You</b> descend as your avatar, fighting as your calling:</p>
              <div class="hd-class-row" id="builderCalling"></div>
            </div>
          </div>
          ${fromGate && coopLeader ? `
          <p style="margin:16px 0 8px"><b>Party</b> <span class="dim">· real players you invited are being asked to join this descent</span></p>
          <div id="partySlots" style="display:flex;flex-wrap:wrap;gap:8px"></div>
          <p style="margin:16px 0 0" id="squadLine"></p>` : fromGate ? '' : `
          <p style="margin:16px 0 8px"><b>Descent</b></p>
          <div class="hd-landing-row" id="dungeonRow"></div>
          <p style="margin:16px 0 0" id="squadLine"></p>`}
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button id="btnBack" class="hd-btn hd-btn--white">← Back</button>
        <button id="btnBegin" class="hd-btn hd-btn--green">Begin Descent ▸</button>
      </div>
    </div>`;
  const rerender = () => {
    loadFigure(figure); // picking a calling swaps the avatar's weapon art too
    renderCallingRow($('builderCalling'), rerender);
    renderDungeonRow();
    renderPartySlots();
    renderSquadLine();
  };
  rerender();
  if (coopLeader) coopLeader.onRoster = () => {
    renderPartySlots();
    renderSquadLine();
  };
  $('btnBack').addEventListener('click', () => {
    unskin();
    if (coopLeader) {
      coopLeader.descentOver('lost'); // members waiting on us get released
      coopLeader = null;
    }
    (fromGate ? startExplore : showTitle)();
  });
  $('btnBegin').addEventListener('click', () => {
    unskin();
    beginRun();
  });
}

// The dungeon picker: one green-when-chosen button per registry entry.
function renderDungeonRow() {
  const row = $('dungeonRow');
  if (!row) return;
  row.innerHTML = DUNGEONS.map((d) => {
    const on = d.id === dungeonPick;
    return `<button type="button" class="hd-btn ${on ? 'hd-btn--green' : 'hd-btn--white'}" data-dungeon="${d.id}"
      style="flex:1 1 240px;flex-direction:column;align-items:flex-start;gap:2px">
      <b>${on ? '◉ ' : '○ '}${d.name}</b><span style="font-weight:normal;font-size:9px">${d.sub || ''}</span>
    </button>`;
  }).join('');
  row.querySelectorAll('[data-dungeon]').forEach((b) =>
    b.addEventListener('click', () => {
      dungeonPick = b.dataset.dungeon;
      renderDungeonRow();
    })
  );
}

// Live party slots on the leader's gate builder: confirms tick in as acks land.
function renderPartySlots() {
  const box = $('partySlots');
  if (!box || !coopLeader) return;
  const slots = [...coopLeader.members.values()].map((m) => {
    const status =
      m.status === 'ready'
        ? `Ready ✓ · ${(CLASSES[m.classId] || {}).name || m.classId}`
        : m.status === 'declined'
          ? 'Not coming ✗'
          : 'Waiting…';
    return `<div class="hd-pill" style="flex:0 1 auto;gap:10px"><span>${m.name}</span><span class="hd-pill-value">${status}</span></div>`;
  });
  box.innerHTML = slots.join('') || '<span class="dim">No party members</span>';
}

// The squad line: you plus any REAL players who've joined your co-op party.
// No AI companions — you descend as your own avatar.
function renderSquadLine() {
  const line = $('squadLine');
  if (!line) return;
  const leader = Identity.classId() || 'fighter';
  const partyNames = coopLeader ? coopLeader.readyMembers().map((m) => ` · ${m.name}`) : [];
  line.innerHTML = `<b>Party:</b> ★ You (${CLASSES[leader].name})${partyNames.join('')}`;
}

function beginRun() {
  const leader = Identity.classId() || 'fighter';
  const ready = coopLeader ? coopLeader.readyMembers() : [];
  // You descend as your own avatar. The only other heroes are REAL players who
  // joined your party (co-op) — never AI companions/bots.
  const squad = [
    makeMember(leader, coopLeader ? myName() || 'You' : 'You', { leader: true }),
    ...ready.map((m) => makeMember(m.classId, m.name)),
  ];
  const meta = DUNGEONS.find((d) => d.id === dungeonPick) || DUNGEONS[0];
  const eventPicks = pickEvents(meta.eventNodeIndices);
  const dungeon = buildDungeon(meta.id, eventPicks);
  const r = new Run({ squad, dungeon, eventPicks, unlockedSkills: Identity.unlockedSkills() });
  // XP hunted in the wilds while no run was live: the leader sets out seasoned
  const wildXp = Number(localStorage.getItem(LS_WILD_XP) || 0);
  if (wildXp > 0) {
    grantMemberXp(r.squad.find((m) => m.leader) || r.squad[0], wildXp);
    localStorage.removeItem(LS_WILD_XP);
  }
  if (coopLeader) {
    // bind roster members to their owning players (command authority + figures)
    for (const m of ready) {
      const rosterM = r.squad.find((s) => s.name === m.name);
      if (rosterM) coopLeader.setOwner(rosterM.id, m.name, m.figure);
    }
    const lead = r.squad.find((s) => s.leader);
    coopLeader.setOwner(lead.id, myName(), figure);
    run.coop = coopLeader;
  }
  startRunChrome();
  run.newRun(r);
}

// ---- battle chrome ----------------------------------------------------------
// The classic chat bar + bottom-right toolbar icons live in battles too:
// bubbles anchor to your leader unit, the Hand serves the run's backpack,
// and potions heal the LIVE squad mid-fight.
let runChat = null;

function battleLeaderUnit() {
  const b = battle.battle;
  if (!b) return null;
  const alive = b.units.filter((u) => u.team === 'player' && u.alive);
  return alive.find((u) => u.useSprites) || alive[0] || null;
}

// Equip/unequip through the Hand mid-run: mutate the LIVE run (a stale
// localStorage load would be clobbered by the controller's next save), then
// redress the avatar. Gear applies from the next battle — same as camp.
function equipFromBattleHand(mutate) {
  const r = run.run;
  if (!r) return false;
  const leader = r.squad.find((m) => m.leader) || r.squad[0];
  if (!leader || !mutate(r, leader)) return false;
  r.save();
  run.syncArmor();
  return true;
}

// Consumables mid-battle act on the LIVE units — a potion that only touched
// the roster would be overwritten by writeBack when the battle ends. The
// effect itself is resolved in js/consumableEffects.js; this only picks which
// targets it runs against.
function useBattleItem(itemId) {
  const r = run.run;
  const b = battle.battle;
  if (!r || !CONSUMABLES[itemId]) return false;
  const inBattle = b && (b.phase === 'player' || b.phase === 'enemy');
  if (!inBattle) return useConsumable(itemId, r); // between rooms: roster-level
  if (!consumeFromRun(r, itemId, battleTargets(r, b))) return false;
  battle.render(); // roster hp bars update immediately
  return true;
}

function startRunChrome() {
  if (runChat) return;
  runChat = new ChatOverlay(game, battleLeaderUnit, () => (Identity.get() || {}).name || 'Guest');
  // the speaker + volume slider docks right of the chat input, same as Free
  // Roam; battle rooms play only their AUTHORED ambience (music.js tracks)
  music.attach(runChat.toolbar);
  battle.onRoom = (room) => {
    if (runChat && room) music.setRoom(room.id, { authoredOnly: true });
  };
  if (game.room) music.setRoom(game.room.id, { authoredOnly: true });
  attachToolbarIcons({
    toolbar: runChat.toolbar,
    showNav: false, // the run walks its own rooms — no navigator underground
    rooms: () => [],
    currentRoomId: () => (game.room ? game.room.id : ''),
    onHelp: () =>
      `<div class="help-line">Tap a hero, then a blue tile to move</div>
       <div class="help-line">Tap a red foe to attack; green allies for skills</div>
       <div class="help-line">High ground hits harder; furni blocks arrows</div>
       <div class="help-line">Won? Walk onto the arrow to move on</div>`,
    onEquip: (itemId) => equipFromBattleHand((r, leader) => r.equip(leader.id, itemId)),
    onUnequip: (slot) => equipFromBattleHand((r, leader) => r.unequip(leader.id, slot)),
    onUse: (itemId) => useBattleItem(itemId),
    onMenu: () => {
      // back to the title — the run is saved, Continue picks it back up
      leaveRunChrome();
      showTitle();
    },
  });
}

function leaveRunChrome() {
  if (!runChat) return;
  battle.onRoom = null; // release the ambience hook (class default is a no-op)
  music.stop(); // (music-ctl DOM folds with the toolbar; re-attach rebuilds it)
  const hand = getHand();
  if (hand && hand.el) hand.el.remove(); // the battle Hand dies with its toolbar
  runChat.destroy();
  runChat = null;
}

// ---- explore testbed -------------------------------------------------------
let exploreRooms = null;
let chat = null;
const remote = new RemotePlayers(game, net); // multiplayer presence (verified players)

// Multiplayer status chip in the explore bar. Silent when everything works;
// warns loudly when the player is Habbo-linked but has no Supabase auth session
// (Realtime needs an email OTP sign-in — without it you're invisible to others).
function updateMpStatus() {
  const el = document.getElementById('mpStatus');
  if (!el) return;
  const id = Identity.get();
  if (!id || !id.name) { el.textContent = ''; el.style.color = ''; return; }
  if (!net.active) {
    el.textContent = '⚠ Multiplayer offline - retrying';
    el.style.color = '#ffb84d';
    el.style.cursor = 'pointer';
    el.onclick = () => { Auth.ensureSession().finally(() => { net.connect(id); updateMpStatus(); }); };
    return;
  }
  if (!net.connected) {
    el.textContent = '… connecting to multiplayer';
    el.style.color = '#9ecbff';
    el.onclick = null;
    return;
  }
  el.textContent = '● Multiplayer connected';
  el.style.color = '#7bd88f';
  el.onclick = null;
}
net.on('open', () => {
  // Land the room join once the async connect finishes. On spawn, net.connect()
  // is deferred behind Auth.ensureSession(), so net.active is still false when
  // startExplore's `if (net.active) net.join(...)` runs and the join is skipped.
  // Re-join here so the room Realtime channel (presence/movement/chat) is always
  // created. Idempotent: skip when we're already on this room so a reconnect
  // doesn't tear the channel down and rebuild it.
  if (game.room && net.room !== game.room.id) net.join(game.room.id);
  updateMpStatus();
});
net.on('close', updateMpStatus);
// Retry once the async _open() finishes (auth.getUser is awaited): the
// initial call above runs before net.active flips.
setTimeout(updateMpStatus, 1500);
const infostand = new HumanInfostand(); // tap a player → the human object displayer
const party = new PartyUI(net, () => (Identity.get() || {}).name || ''); // roster chips + invites
infostand.onInvite = (name) => party.invite(name);
infostand.canInvite = () => party.canInvite();
const tradeUI = new TradeUI(net, () => (Identity.get() || {}).name || ''); // the Safe Trading window
tradeUI.getHand = getHand; // the Hand doubles as the stash box during a trade
infostand.onTrade = (name) => tradeUI.ask(name);
infostand.canTrade = () => tradeUI.canTrade();

// ---- co-op descents ---------------------------------------------------------
// Leader: hosts the run — CoopLeader streams the battle to the party.
// Member: CoopMember replays the leader's stream and sends unit commands.
let coopLeader = null;
const myName = () => (Identity.get() || {}).name || '';
const coopMember = new CoopMember(
  net,
  game,
  { banner: $('banner'), actions: $('actions'), roster: $('roster'), log: $('log') },
  myName
);

// A party leader opened the way down: native-style confirm (30s window).
net.on('descend', (m) => {
  if (!chat) return; // only while in Free Roam
  const meta = DUNGEONS.find((d) => d.id === m.dungeon);
  const el = document.createElement('div');
  el.className = 'party-prompt';
  el.innerHTML = `
    <div class="party-prompt-text"><b>${m.from}</b> is descending into <b>${meta ? meta.name : m.dungeon}</b>!</div>
    <div class="party-prompt-btns">
      <button class="infostand-btn" data-act="join">Join the descent</button>
      <button class="infostand-btn" data-act="stay">Stay</button>
    </div>`;
  document.body.appendChild(el);
  const fold = () => el.remove();
  const timer = setTimeout(fold, 30000); // silence = dropped from this descent
  el.addEventListener('click', (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    clearTimeout(timer);
    fold();
    if (act === 'stay') {
      coopMember.decline();
      return;
    }
    leaveExplore();
    hideAll();
    coopMember.activate(m.from, memberUi());
  });
});

// Screen hooks the member replica drives (waiting rooms, battles, exits).
function memberUi() {
  return {
    classId: Identity.classId() || 'fighter',
    figure,
    waiting: (html) => {
      hideAll();
      overlay.classList.remove('hidden');
      skinOverlay();
      overlay.innerHTML = `
        <div class="hd-landing" style="width:min(560px,96vw)">
          <div class="hd-card">
            <div class="hd-card-header">Co-op descent</div>
            <div class="hd-card-body"><p style="margin:0">${html}</p></div>
          </div>
          <div class="camp-actions"><button id="coopLeave" class="hd-btn hd-btn--white">Leave the descent</button></div>
        </div>`;
      $('coopLeave').addEventListener('click', () => coopMember.exit('You left the descent.'));
    },
    battleReady: (battleName) => {
      hideAll();
      startRunChrome(); // members chat from the battle line too
      panel.classList.remove('hidden');
      // Skyrim-style discovery ribbon (replaces the old rounded co-op pill)
      showRoomDiscovery(battleName || 'Battle');
    },
    exit: (reason, share) => showCoopEnd(reason, share),
    promote: (ctx) => promoteToLeader(ctx),
  };
}

// Descent over (victory, defeat, leader lost, or walked out): the member's
// share is banked, then back to Free Roam.
function showCoopEnd(reason, share) {
  if (share && share.gold) bankCoopShare(share);
  leaveRunChrome();
  hideAll();
  overlay.classList.remove('hidden');
  skinOverlay();
  const shareLine = share
    ? `<p style="margin:10px 0 0">Your share: <b>${share.gold} gold</b>${share.level > 1 ? ` · reached level ${share.level}` : ''}</p>`
    : '';
  overlay.innerHTML = `
    <div class="hd-landing" style="width:min(560px,96vw)">
      <div class="hd-card">
        <div class="hd-card-header">Co-op descent</div>
        <div class="hd-card-body"><p style="margin:0">${reason}</p>${shareLine}</div>
      </div>
      <div class="camp-actions"><button id="coopDone" class="hd-btn hd-btn--green">Back to the square ▸</button></div>
    </div>`;
  $('coopDone').addEventListener('click', () => {
    unskinOverlay();
    startExplore();
  });
}

// ---- wild XP (the Mirkwood hunt) -------------------------------------------
// Killing the wood's critters trickles XP to your hero: straight onto the
// active run's leader when one exists, otherwise into a local pot the next
// run's leader starts with (same pattern as the co-op gold pot).
const LS_WILD_XP = 'habbo-dungeons-wild-xp';

// Roster-level XP with the same level curve as Unit.gainXp (level*20 per).
function grantMemberXp(m, n) {
  m.xp += n;
  while (m.xp >= m.level * 20) {
    m.xp -= m.level * 20;
    m.level++;
  }
}

function bankWildXp(n) {
  const r = Run.hasSave() ? Run.load(buildDungeon) : null;
  if (r) {
    const leader = r.squad.find((m) => m.leader) || r.squad[0];
    grantMemberXp(leader, n);
    r.save();
    return;
  }
  const pot = Number(localStorage.getItem(LS_WILD_XP) || 0) + n;
  localStorage.setItem(LS_WILD_XP, String(pot));
}

// The member's cut lands in their own run save (active run gold), or waits
// in a local pot the next run picks up.
const LS_COOP_POT = 'habbo-dungeons-coop-gold';
function bankCoopShare(share) {
  const r = Run.hasSave() ? Run.load(buildDungeon) : null;
  if (r) {
    r.addGold(share.gold);
    r.save();
    return;
  }
  const pot = Number(localStorage.getItem(LS_COOP_POT) || 0) + share.gold;
  localStorage.setItem(LS_COOP_POT, String(pot));
}

// Daily-wheel payout: grant a resolved reward to the active run (gold/item/xp),
// or bank it into the same pots the next run picks up when no run is live
// (mirrors bankWildXp / bankCoopShare). Returns a short summary for the popup.
function bankReward(resolved) {
  const r = Run.hasSave() ? Run.load(buildDungeon) : null;
  if (r) {
    const summary = applyReward(resolved, r);
    r.save();
    return summary;
  }
  // no active run: stash gold/xp into their pots; items wait in an item pot
  if (resolved.kind === 'gold') {
    const pot = Number(localStorage.getItem(LS_COOP_POT) || 0) + resolved.amt;
    localStorage.setItem(LS_COOP_POT, String(pot));
    return `+${resolved.amt} gold (waiting for your next run)`;
  }
  if (resolved.kind === 'xp') {
    const pot = Number(localStorage.getItem(LS_WILD_XP) || 0) + resolved.amt;
    localStorage.setItem(LS_WILD_XP, String(pot));
    return `+${resolved.amt} XP (waiting for your next run)`;
  }
  // item pot: a simple id list the next run's satchel absorbs
  const LS_ITEM_POT = 'habbo-dungeons-daily-items';
  let ids = [];
  try {
    ids = JSON.parse(localStorage.getItem(LS_ITEM_POT) || '[]');
  } catch {
    ids = [];
  }
  ids.push(resolved.itemId);
  localStorage.setItem(LS_ITEM_POT, JSON.stringify(ids));
  return `${ITEMS[resolved.itemId] ? ITEMS[resolved.itemId].name : resolved.itemId} (waiting for your next run)`;
}

// Open the daily-rewards wheel popup (from the Gatekeeper choice, the bottom-
// right dock, or __debug). One modal at a time; re-opening while it's up is a
// no-op. On close, the dock refreshes so its "ready" badge clears after a claim.
let dailyHandle = null;
let dailyDock = null;
async function openDailyWheel() {
  if (dailyHandle) return dailyHandle;
  try {
    dailyHandle = await openDailyReward({
      applyPayout: bankReward,
      onClose: () => {
        dailyHandle = null;
        if (dailyDock) dailyDock.refresh();
      },
    });
    return dailyHandle;
  } catch (e) {
    dailyHandle = null; // asset load failed; never block play
    return null;
  }
}

// The crown landed on this client mid-battle: adopt the replica into the
// real battle controller and stream authority from here.
function promoteToLeader({ battle: engine, byCid }) {
  const present = new Set(((party.state && party.state.members) || []).map((m) => m.name.toLowerCase()));
  for (const u of byCid.values()) {
    if (u.owner && !present.has(u.owner.toLowerCase())) u.owner = null; // departed → AI
  }
  game.setController(battle);
  battle.adopt(engine);
  engine.onEnd = (result) => {
    setTimeout(
      () => showCoopEnd(result === 'won' ? 'Victory! The battle is won.' : 'The battle is lost.', null),
      1200
    );
  };
  const lead = new CoopLeader(net, myName);
  lead.adoptBattle({ battle: engine, bc: battle, byCid });
  battle.appendLog('(you are now the battle leader)');
  return lead;
}

// The player on display walked out of the room: fold their infostand.
net.on('left', (m) => {
  if (infostand.openFor === m.name) infostand.close();
});

// Admin edited furniture while we're in-room: refetch layouts and rebuild the
// current room in place (same code path as a room switch), keeping our tile.
net.on('layout', async () => {
  if (!chat || !game.room) return; // only during a live explore session
  const curId = game.room.id;
  const stand = explore.unit ? { x: explore.unit.x, y: explore.unit.y, dir: explore.unit.dir } : null;
  exploreRooms = buildRooms(await AdminApi.loadLayouts());
  const target = exploreRooms.find((r) => r.id === curId) || exploreRooms[0];
  const prev = { spawn: target.spawn, dir: target.spawnDir };
  if (stand && !target.isBlocked(stand.x, stand.y)) {
    target.spawn = { x: stand.x, y: stand.y };
    target.spawnDir = stand.dir;
  }
  remote.clear();
  game.setRoom(target);
  target.spawn = prev.spawn;
  target.spawnDir = prev.dir;
  if (net.active) net.join(target.id);
});
let editor = null;
let furniCat = null; // :furni catalogue window (admins)
let botCat = null; // :npc bot catalogue window (admins)
let roomBots = null; // walking room bots (RoomBots manager)
let clothingCat = null; // :clothing wardrobe window (admins)
let consumablesCat = null; // :consumables potion shelf (admins)
let npcTalk = null; // DialogueRunner — one per explore session
let adminPanel = null; // chat-command admin tooling (:admin)
let gateDest = null; // dungeon id the Gatekeeper aimed the archway at
const music = new RoomMusic(); // room ambience + toolbar volume control
window.music = music; // console/debug access (pairs with window.game)

function isRoomAdmin() {
  const name = (Identity.get() || {}).name;
  return !!name && ADMIN_NAMES.some((n) => n.toLowerCase() === name.toLowerCase());
}

// Use (drink/crack/read) a consumable from the backpack: apply its effect to
// the run, consume it, save. Returns false when the effect would be wasted
// (full HP, nobody fallen) so the item isn't burned for nothing.
function useConsumable(itemId, rr = null) {
  const r = rr || (Run.hasSave() ? Run.load(buildDungeon) : null);
  if (!r) return false;
  return consumeFromRun(r, itemId, rosterTargets(r));
}

// Apply an equip/unequip to the run's leader (the player), then poof: white
// clouds burst over the avatar and the outfit swaps behind them. `mutate`
// returns whether the run actually changed (Run.equip/unequip semantics).
function equipFromHand(mutate) {
  const r = Run.hasSave() ? Run.load(buildDungeon) : null;
  if (!r) return false;
  const leader = r.squad.find((m) => m.leader) || r.squad[0];
  if (!leader || !mutate(r, leader)) return false;
  r.save();
  const unit = explore.unit;
  if (unit) {
    clothingPoof(
      () => {
        // game.p is pre-camera (render translates by cam); add it for CSS px
        const p = unit.renderPos(performance.now());
        const c = game.p(p.x, p.y, p.z);
        return { x: c.x + game.cam.x, y: c.y + game.cam.y };
      },
      () => loadFigure(figureWithArmor(figure, leader.equipment))
    );
  } else {
    loadFigure(figureWithArmor(figure, leader.equipment));
  }
  return true;
}

// :bag (admins): runs are roguelike — runController clears the save (and with
// it all loot) the moment a run ends, so an ended run leaves the inventory
// window empty. This seeds a realistic mid-descent save — a level-3 party two
// nodes into The Dungeon with battle-worn gear — or, if a run IS active, just
// tops up its backpack. Demo kit only; a real run overwrites it on next save.
const DEMO_BAG = ['rusty_blade', 'emberedge', 'frostbrand', 'padded_vest', 'fire_robes', 'warding_amulet'];
function seedBag() {
  let r = Run.hasSave() ? Run.load(buildDungeon) : null;
  if (!r) {
    const name = (Identity.get() || {}).name || 'You';
    r = new Run({
      squad: [
        makeMember('fighter', name, { leader: true, level: 3, xp: 6, equipment: { weapon: 'iron_sword', armor: 'chainmail' } }),
        makeMember('cleric', null, { level: 2, xp: 3, equipment: { trinket: 'vigor_charm' } }),
        makeMember('rogue', null, { level: 2, xp: 1, equipment: { trinket: 'swift_boots' } }),
      ],
      dungeon: buildDungeon('dungeon'),
      eventPicks: {},
      unlockedSkills: [],
    });
    r.nodeIndex = 2; // past the first battle + event — a believable mid-run
    r.gold = 85;
  }
  for (const id of DEMO_BAG) if (!r.inventory.includes(id)) r.inventory.push(id);
  if (!r.gold) r.gold = 85;
  r.save();
}

// Tear down explore-session chrome (chat, music, editor) before leaving the
// room world for an overlay flow (a gate, the debug menu).
function leaveExplore() {
  infostand.close();
  tradeUI.detach();
  party.detach();
  remote.detach();
  net.leaveRoom();
  updateMpStatus();
  if (furniCat) furniCat.close();
  if (botCat) botCat.close();
  if (roomBots) roomBots.detach();
  if (clothingCat) clothingCat.close();
  if (consumablesCat) consumablesCat.close();
  if (editor) editor.disable();
  if (npcTalk) {
    npcTalk.destroy();
    npcTalk = null;
  }
  if (chat) {
    chat.destroy();
    chat = null;
  }
  if (adminPanel) {
    adminPanel.destroy();
    adminPanel = null;
  }
  if (dailyDock) {
    dailyDock.destroy();
    dailyDock = null;
  }
  music.stop();
}

async function startExplore() {
  hideAll();
  leaveRunChrome(); // battle chrome never follows you into the square
  leaveExplore(); // re-entry safe: never stack chat overlays / music players
  // #exploreBar stays hidden: its buttons remain the wired source of truth,
  // but the visible controls are the classic toolbar icons (bottom right)
  // admin-arranged furniture from the server (falls back to defaults offline)
  exploreRooms = buildRooms(await AdminApi.loadLayouts());
  game.setController(explore);
  // Skyrim-style "location discovered": fade the room name in/out on each entry
  explore.onDiscover = (name) => showRoomDiscovery(name);
  // multiplayer presence: verified players connect to the hub and appear to
  // each other; guests stay solo-local (exactly today's game)
  explore.remote = remote;
  // wildlife combat is client-simulated: replay other players' swings against
  // our own copy of the critter they hit (RemotePlayers plays their pose)
  remote.onStrike = (m) => explore.onRemoteStrike(m);
  remote.attach();
  // walking room bots (:npc): wired BEFORE the first setRoom so the opening
  // room spawns its saved bots (explore.onRoom drives RoomBots.onRoom)
  if (!roomBots)
    roomBots = new RoomBots(game, {
      isAdmin: isRoomAdmin,
      getEditor: () => editor,
      // a getter, not the overlay: `chat` is built further down this same boot
      // path, so it is still null at this point
      getChat: () => chat,
    });
  explore.bots = roomBots;
  // tap a player (or yourself) → the human object displayer bottom-right
  explore.onPlayerTap = (unit) => {
    const self = unit === explore.unit;
    infostand.open({
      name: self ? (Identity.get() || {}).name || 'Guest' : unit.name,
      figure: self ? figure : unit.figure,
      self,
    });
  };
  const myId = Identity.get();
  if (shouldConnectNet(myId)) {
    // Mint an anonymous Supabase session (if needed) so Realtime works without
    // requiring the player to sign in with email. The Habbo motto link is the
    // player identity; the anon JWT is just the transport credential.
    Auth.ensureSession().finally(() => {
      net.connect(myId);
      updateMpStatus();
    });
  }
  game.setRoom(exploreRooms[0]);
  // Record the room now, even though connect() is deferred behind ensureSession():
  // net.join() stores the room and the connection lands it once open (SupabaseNet
  // _open re-joins this.room; the ws Net re-sends join on socket open). Gate on
  // shouldConnectNet (not net.active, which is still false pre-connect) so the
  // join isn't skipped on spawn — while guests, who never connect, don't set a
  // phantom room. This is what makes presence/movement/chat come alive.
  if (shouldConnectNet(myId)) net.join(game.room.id);
  updateMpStatus();
  party.render(); // party survives overlay flows — chips come straight back
  gateDest = null; // each explore session starts with a closed arch
  // RP-arrow teleports: stepping on an arrow switches to its target room
  // (optionally at a custom landing tile via teleport.x/y). The dungeon
  // ARCHWAY reuses the same trigger with { gate: true }: it only opens after
  // the Gatekeeper aimed it (a dialogue choice set gateDest) — otherwise he
  // calls you over instead.
  explore.onTeleport = (tp, fromRoom) => {
    if (tp.gate) {
      // don't re-fire while the avatar stands in the arch (overlay or hint)
      if (explore.unit) explore.suppressTile = `${explore.unit.x},${explore.unit.y}`;
      if (!gateDest) {
        // no destination chosen: the Gatekeeper pipes up from his tile
        const keeper = game.room.props.find((p) => p.npc);
        if (keeper && chat) {
          chat.sayAs(GATE_HINT, {
            name: keeper.npc.name, x: keeper.x, y: keeper.y,
            z: game.room.heightAt(keeper.x, keeper.y), headPx: keeper.npc.bubble,
          });
        }
        return;
      }
      dungeonPick = DUNGEONS.some((d) => d.id === gateDest) ? gateDest : DUNGEON_ID;
      // party descents: the leader opens the way and the party is asked along
      if (party.inParty) {
        if (!party.isLeader) {
          party.notice('Only the party leader can open the descent.');
          return;
        }
        coopLeader = new CoopLeader(net, myName);
        coopLeader.announce(party.state, dungeonPick);
      }
      leaveExplore();
      showSquadBuilder(true);
      return;
    }
    const target = exploreRooms.find((r) => r.id === tp.room);
    if (!target) return;
    // Landing tile: explicit x/y wins; otherwise land ON the paired arrow in
    // the target room (the one teleporting back here) — so when an admin
    // MOVES an arrow, the landing point moves with it automatically.
    let land = tp.x != null && tp.y != null ? { x: tp.x, y: tp.y, dir: tp.dir } : null;
    if (!land) {
      const pair = target.props.find((p) => p.teleport && p.teleport.room === fromRoom);
      if (pair) land = { x: pair.x, y: pair.y, dir: tp.dir ?? pair.dir };
    }
    // switch rooms without permanently moving the room's spawn (setRoom ->
    // onRoom reads spawn synchronously, then we restore)
    const prev = { spawn: target.spawn, dir: target.spawnDir };
    if (land) {
      target.spawn = { x: land.x, y: land.y };
      if (land.dir != null) target.spawnDir = land.dir;
    }
    // arriving ON a teleport must not bounce straight back (classic Habbo:
    // the pad only fires again after you step off and back on)
    explore.suppressTile = land ? `${land.x},${land.y}` : null;
    if (npcTalk) npcTalk.stop(); // conversations don't follow you through doors
    infostand.close(); // the displayed player stayed behind
    remote.clear(); // fresh room, fresh roster (the join below repopulates it)
    game.setRoom(target);
    target.spawn = prev.spawn;
    target.spawnDir = prev.dir;
    if (net.active) net.join(target.id);
    music.setRoom(target.id); // ambience follows you through the arrow
  };
  // local-only room chat; the unit getter survives room switches (each
  // setRoom spawns a fresh explore unit)
  chat = new ChatOverlay(game, () => explore.unit, () => (Identity.get() || {}).name || 'Guest');
  remote.chat = chat; // remote `chatted` lines bubble through the same overlay
  chat.onSay = (text, mode) => net.chat(text, mode); // and ours broadcast out
  // NPC dialogues: tap the Gatekeeper → his lines bubble up bot-style,
  // your replies are buttons in the small panel above the chat bar
  npcTalk = new DialogueRunner(chat);
  explore.onNpcTalk = (npc) => npcTalk.start(npc, game.room.heightAt(npc.x, npc.y));
  // the Mirkwood hunt: felled critters trickle XP to your hero
  explore.onKill = (spec) => bankWildXp(spec.xp);
  // a Gatekeeper choice aims the archway at its dungeon
  npcTalk.onSet = (s) => {
    if (s.dungeon) gateDest = s.dungeon;
    // the Gatekeeper's "spin the wheel" choice opens the daily-rewards popup
    if (s.openWheel) openDailyWheel();
  };
  // room ambience: auto-plays per room (10% until the user moves the slider);
  // the speaker + press-to-reveal volume slider docks right of the chat input
  music.attach(document.getElementById('chatToolbar'));
  music.setRoom(game.room.id);
  // classic client toolbar: v31 icons bottom-right of the chat bar
  // (regular-user row: console/friends · navigator · inventory · help · menu)
  attachToolbarIcons({
    toolbar: document.getElementById('chatToolbar'),
    rooms: () => exploreRooms,
    currentRoomId: () => game.room.id,
    onHelp: () =>
      `<div class="help-line">Click the floor to walk</div>
       <div class="help-line">Walk onto a chair to sit · arrows teleport</div>
       <div class="help-line">Double-click the training dummy to attack</div>
       <div class="help-line">Hunt the Mirkwood's critters for a little XP</div>
       <div class="help-line">Speaker (right) sets the room music volume</div>${
         isRoomAdmin() ? '<div class="help-line">Admin: type :admin in chat</div>' : ''
       }`,
    // admins never open an empty hand: stock the demo quester kit on demand
    // (same seeding as :bag), so the container always has something to show
    onHandEmpty: () => {
      if (!isRoomAdmin()) return false;
      seedBag();
      return true;
    },
    // wear items straight from the hand, mid-room: the run updates, the
    // avatar vanishes behind the classic clothing-change clouds, and comes
    // out dressed (armor carries figure parts; other slots just equip)
    onEquip: (itemId) => equipFromHand((r, leader) => r.equip(leader.id, itemId)),
    onUnequip: (slot) => equipFromHand((r, leader) => r.unequip(leader.id, slot)),
    onUse: (itemId) => useConsumable(itemId),
  });
  // the always-visible "Daily Spin" dock (bottom-right): pulses an alert badge
  // while today's spin is unclaimed, opens the same wheel popup as the Gatekeeper
  dailyDock = mountDailyDock({ onOpen: openDailyWheel });
  // admin tooling: chat commands, no buttons — :admin panel, :edit, :save,
  // and :furni (the catalogue-style spawner window)
  adminPanel = attachAdminPanel({ isAdmin: isRoomAdmin });
  // furni editor (admins only): wraps explore's onTap, edits live in memory
  if (!editor) editor = new RoomEditor(game);
  editor.attach(explore);
  if (!furniCat) furniCat = new FurniCatalog(game, () => editor);
  // bot taps/placement get first refusal on a tap (attached after the editor,
  // so this wrapper sits outermost), then fall through to furni, then walking
  roomBots.attach(explore);
  chat.onCommand = (text) => {
    const cmd = text.trim().toLowerCase();
    if (cmd === ':furni') {
      if (!isRoomAdmin()) return true; // swallow silently, like :admin
      furniCat.toggle();
      return true;
    }
    if (cmd === ':npc') {
      if (!isRoomAdmin()) return true;
      if (!botCat) botCat = new BotCatalog((def) => roomBots.beginPlace(def));
      botCat.toggle();
      return true;
    }
    if (cmd === ':bag') {
      if (!isRoomAdmin()) return true;
      seedBag();
      // pop the inventory open so the seeded bag is immediately visible
      const icon = document.querySelector('.tb-icon[title^="Inventory"]');
      if (icon) icon.click();
      return true;
    }
    if (cmd === ':consumables') {
      if (!isRoomAdmin()) return true;
      // the potion shelf: click grants the consumable to the backpack
      if (!consumablesCat)
        consumablesCat = new ConsumablesCatalog((itemId) => {
          if (!Run.hasSave()) seedBag();
          const r = Run.load(buildDungeon);
          if (!r) return false;
          r.inventory.push(itemId);
          r.save();
          return true;
        });
      consumablesCat.toggle();
      return true;
    }
    if (cmd === ':clothing') {
      if (!isRoomAdmin()) return true;
      // the wardrobe: every obtainable item; clicking grants it to the run
      // (fresh save seeded if none) and wears it behind the cloud poof
      if (!clothingCat)
        clothingCat = new ClothingCatalog((itemId) => {
          if (!Run.hasSave()) seedBag();
          return equipFromHand((r, leader) => {
            if (!r.inventory.includes(itemId)) r.inventory.push(itemId); // obtain
            return r.equip(leader.id, itemId);
          });
        });
      clothingCat.toggle();
      return true;
    }
    return adminPanel.command(text);
  };
  const editBtn = $('editRoom');
  editBtn.classList.toggle('hidden', !isRoomAdmin());
  editBtn.classList.remove('active');
  editBtn.onclick = () => {
    const on = editBtn.classList.toggle('active');
    if (on) editor.enable();
    else editor.disable();
  };
  const saveBtn = $('saveRoom');
  saveBtn.classList.toggle('hidden', !isRoomAdmin());
  saveBtn.textContent = 'Save Layout';
  saveBtn.onclick = async () => {
    saveBtn.textContent = 'Saving...';
    const layouts = {};
    // bots ride the same array as furni (split back out on load by rooms.js)
    for (const r of exploreRooms)
      layouts[r.id] = [...r.props.map(serializeProp), ...(r.bots || []).map(serializeBot)];
    const res = await AdminApi.saveLayouts(layouts);
    const reason = res.reason === 'admin only'
      ? 'sign in and re-link throney'
      : res.reason || 'error';
    saveBtn.textContent = res.ok ? 'Saved ✓' : `Failed: ${reason}`;
    if (!res.ok && !AdminApi.credential()) {
      // browser never captured the boot token: point at the one-time unlock
      // (own element: the walk status line would overwrite exploreStatus)
      let hint = $('adminHint');
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'adminHint';
        hint.className = 'info dim';
        document.body.appendChild(hint); // toast above the toolbar
      }
      hint.textContent =
        'No admin credential — link your Habbo account (admin name) via the landing page, or open /#admin=<token> once (token is printed on server boot / data/admin-token.txt)';
      setTimeout(() => hint.remove(), 10000);
    }
    setTimeout(() => (saveBtn.textContent = 'Save Layout'), 2500);
  };
  $('exploreBar').querySelectorAll('button[data-room]').forEach((b) =>
    b.onclick = () => {
      chat.clear(); // fresh room, fresh chat (client behaviour)
      editor.disable();
      editBtn.classList.remove('active');
      remote.clear();
      game.setRoom(exploreRooms[Number(b.dataset.room)]);
      if (net.active) net.join(game.room.id);
      music.setRoom(game.room.id);
    }
  );
  // back out of the world to the landing page
  const menuBtn = $('exploreMenu');
  menuBtn.classList.remove('hidden');
  menuBtn.onclick = () => {
    leaveExplore();
    showTitle();
  };
}

// ---- boot ------------------------------------------------------------------
AdminApi.captureToken(); // /#admin=<token> unlocks layout saving on this browser
// Migration: you play as your own avatar, never with AI companions. Older
// builds could save a run seeded with bot party members; drop any such stale
// multi-member save so it can't resurface in the dashboard or a resumed battle.
if (Run.hasSave()) {
  const stale = Run.load(buildDungeon);
  if (stale && stale.squad && stale.squad.length > 1) Run.clearSave();
}
// Boot to the landing page; Play steps into the tavern (the world's real
// entrance — dungeons open through the Gatekeeper's arch in the square).
showTitle();
// If signed in and the cloud holds a newer run than local storage, pull it down
// so dashboard records reflect it. Best-effort; never blocks offline play.
RunStore.hydrateFromCloud()
  .then((changed) => {
    if (changed && overlay.querySelector('.hd-landing')) showTitle(); // still on the title - refresh it
  })
  .catch(() => {});

window.game = game;
window.run = run;
window.__debug = {
  Run, buildDungeon, makeMember, memberStats, Identity, Auth, RunStore,
  // exercise the PRODUCT gate flow without walking the square (tests)
  gateBuilder: (dungeonId) => {
    if (dungeonId) dungeonPick = dungeonId;
    // mirror the archway flow: a party leader also summons the party
    if (party.inParty && party.isLeader) {
      coopLeader = new CoopLeader(net, myName);
      coopLeader.announce(party.state, dungeonPick);
      leaveExplore();
    }
    showSquadBuilder(true);
  },
  // multiplayer handles (presence e2e drives these directly)
  explore, net, remote, party, coopMember, tradeUI,
  // walking room bots + the furni editor (:npc / :furni e2e drive these)
  roomBots: () => roomBots,
  botDefs: () => ROOM_BOTS,
  editor: () => editor,
  coopLeader: () => coopLeader,
  // daily-rewards wheel (e2e drives the open/spin/claim/block flow)
  openDailyWheel,
};
