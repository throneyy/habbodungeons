import { Run, memberStats } from './run.js';
import { CONSUMABLES, ITEMS, bonusText, rarityOf, rollItem } from './items.js';
import { consumeFromRun, rosterTargets } from './consumableEffects.js';
import { bankRunLoot } from './stashApi.js';
import { EVENTS } from './events.js';
import { RunStore } from './runStore.js';

// What the camp's Revive button should say and whether it may be pressed.
//
// Pure and exported so the enable/disable rules are testable without a DOM:
// renderCampBody only paints what this returns.
//
// A revive is the ONLY way back from hp 0 — js/run.js commits to downed being
// permanent for the rest of the run, and there is deliberately no gold-priced
// revive to fall back on — so a disabled button has to say WHICH of the two
// requirements is missing. "Revive" greyed out with no reason reads as broken,
// and the player cannot tell whether to go hunting for a crystal or whether
// the game simply thinks nobody is hurt.
export function campReviveAction(run) {
  if (!run) return { enabled: false, label: 'Revive', itemId: null, member: null, reason: 'no run' };
  const itemId = run.reviveItem();
  const name = (itemId && CONSUMABLES[itemId] && CONSUMABLES[itemId].name) || 'Revival Crystal';
  const downed = run.downedSquad();
  if (!downed.length) {
    return { enabled: false, label: 'Revive (nobody is downed)', itemId, member: null, reason: 'nobody downed' };
  }
  if (!itemId) {
    return { enabled: false, label: `Revive (no ${name})`, itemId: null, member: null, reason: 'no item' };
  }
  // Names the hero who comes back, because the crystal revives the FIRST downed
  // member and a party can hold more than one corpse. `member` is that same
  // hero: the caller needs it to tell their PLAYER (co-op), and re-deriving it
  // after the fact would read the roster once the revive had already changed it.
  return { enabled: true, label: `Revive ${downed[0].name} (${name})`, itemId, member: downed[0], reason: 'ok' };
}

// Orchestrates a whole dungeon run: walks the node sequence, launches battles
// through the BattleController, and renders the between-battle screens (event,
// camp/equip, victory/defeat) into a center overlay. Saves after every step so
// the run survives a refresh.
export class RunController {
  constructor(game, battleController, dom) {
    this.game = game;
    this.bc = battleController;
    this.dom = dom; // { overlay, header, panel, onExit }
    this.run = null;
    this.selectedMember = null;
    this.coop = null; // CoopLeader when this run is a party descent (main.js)
  }

  // --------------------------------------------------------- lifecycle

  newRun(run) {
    this.run = run;
    run.onSave = (r, blob) => RunStore.push(r, blob); // mirror to cloud if signed in
    run.save();
    this.enterNode();
  }

  resume(run) {
    this.run = run;
    run.onSave = (r, blob) => RunStore.push(r, blob);
    if (run.outcome === 'won') return this.showVictory();
    if (run.outcome === 'lost' || run.isWiped()) return this.showDefeat();
    if (run.stage === 'camp') return this.showCamp(); // resumed between battles
    this.enterNode();
  }

  enterNode() {
    const node = this.run.node;
    if (this.run.outcome === 'won' || !node) return this.showVictory();
    if (node.type === 'battle') this.toBattle(node);
    else if (node.type === 'event') this.showEvent(node);
  }

  // Rebuild the shared avatar sprites so the leader visibly wears the armor
  // slot (figureWithArmor swaps the figure's clothing parts). Fire-and-forget:
  // sprites refresh in place when the imaging fetches land.
  syncArmor() {
    const leader = this.run && this.run.squad.find((m) => m.leader);
    if (leader && this.dom.onFigure) this.dom.onFigure(leader.equipment);
  }

  // ----------------------------------------------------------- battle

  toBattle(node) {
    this.hideOverlay();
    this.dom.panel.classList.remove('hidden');
    this.updateHeader();
    this.syncArmor(); // leader's sprites wear the equipped armor in battle
    this.game.setController(this.bc);
    // seed makes the room dressing + encounter deterministic per save
    const room = node.makeRoom({ seed: this.run.seed });
    // Skyrim-style "location discovered": the chamber's name fades in/out at
    // the top on entry (this replaces the old rounded progress pill)
    if (this.dom.onDiscover && room.name) this.dom.onDiscover(room.name);
    const players = this.run.instantiateSquad(room, node.spawns);
    const enemies = node.makeEnemies(room, {
      seed: this.run.seed,
      battleNumber: this.run.battleNumber(),
      squadSize: this.run.livingSquad().length, // fights scale to who's left standing
    });
    const battle = this.bc.start(room, players, enemies, {
      objective: node.objective,
      onEnd: (res) => this.onBattleEnd(res, players),
      // positioning-gated treasure banks immediately (roguelike keep)
      onPickup: (spec) => {
        if (spec.gold) this.run.addGold(spec.gold);
        if (spec.item) this.run.addLoot(spec.item);
        this.run.save();
        this.updateHeader();
      },
    });
    // co-op: stream this battle to the party (members spectate/command)
    if (this.coop) this.coop.battleStarted({ battle, bc: this.bc, players, enemies, node, run: this.run });
  }

  onBattleEnd(result, players) {
    this.run.writeBack(players);
    this.run.save();
    if (result === 'lost' || this.run.isWiped()) {
      this.run.outcome = 'lost';
      this.run.save();
      // let the "Defeated..." banner sit for a beat, then the screen
      setTimeout(() => this.showDefeat(), 900);
      return;
    }
    // victory rewards, then camp
    const node = this.run.node;
    const loot = [];
    const chests = node.reward?.chests || 1;
    for (let i = 0; i < chests; i++) {
      const id = rollItem(this.run.battleNumber());
      this.run.addLoot(id);
      loot.push(id);
    }
    if (node.reward?.gold) this.run.addGold(node.reward.gold);
    this.run.stage = 'camp';
    this.run.save();
    // Rooms with an authored exit drop the classic RP arrow: walk the leader
    // onto it to leave for camp (refresh-safe — rewards are already saved).
    if (node.exit) {
      setTimeout(() => this.bc.showExit(node.exit, () => this.showCamp(loot, node.reward?.gold || 0)), 600);
      return;
    }
    setTimeout(() => this.showCamp(loot, node.reward?.gold || 0), 900);
  }

  // ------------------------------------------------------------- event

  showEvent(node) {
    if (this.coop) this.coop.screen('event');
    const ev = EVENTS[node.eventId] || EVENTS.shrine;
    this.updateHeader();
    this.showOverlay(`
      <div class="hd-landing" style="width:min(640px,96vw)">
        <div class="hd-card">
          <div class="hd-card-header">${ev.title}</div>
          <div class="hd-card-body">
            <p style="margin:0 0 14px">${ev.text}</p>
            <div class="choices"></div>
            <p class="result"></p>
          </div>
        </div>
      </div>`);
    const choices = this.dom.overlay.querySelector('.choices');
    const result = this.dom.overlay.querySelector('.result');
    ev.choices.forEach((c) => {
      const b = document.createElement('button');
      b.textContent = c.label;
      b.className = 'hd-btn hd-btn--white';
      b.addEventListener('click', () => {
        result.textContent = c.resolve(this.run);
        this.run.save();
        choices.innerHTML = '';
        this.updateHeader();
        const cont = document.createElement('button');
        cont.textContent = 'Continue ▸';
        cont.className = 'hd-btn hd-btn--green';
        cont.addEventListener('click', () => {
          this.run.advance();
          this.run.save();
          this.enterNode();
        });
        choices.appendChild(cont);
      });
      choices.appendChild(b);
    });
  }

  // ------------------------------------------------------------- camp

  showCamp(loot = [], gold = 0) {
    if (this.coop) this.coop.screen('camp');
    this.updateHeader();
    if (!this.selectedMember || !this.run.squad.find((m) => m.id === this.selectedMember && m.hp > 0)) {
      this.selectedMember = (this.run.livingSquad()[0] || {}).id || null;
    }
    const lootLine = loot.length
      ? `Loot: ${loot.map((id) => `<b style="color:${rarityOf(id).color}">${ITEMS[id].name}</b>`).join(', ')}${gold ? ` &nbsp;·&nbsp; +${gold} gold` : ''}`
      : 'The party makes camp.';
    const next = this.run.dungeon.nodes[this.run.nodeIndex + 1];
    const descendLabel = next ? (next.type === 'event' ? 'Move on ▸' : 'Descend ▸') : 'Leave the Dungeon ▸';

    this.showOverlay(`
      <div class="hd-landing" style="width:min(860px,96vw)">
        <div class="hd-card">
          <div class="hd-card-header">Camp</div>
          <div class="hd-card-body">
            <p style="margin:0 0 14px">${lootLine}</p>
            <div class="squad-grid"></div>
            <p style="margin:16px 0 8px"><b>Inventory</b> <span class="dim">· tap an item to equip the selected hero</span></p>
            <div class="inv"></div>
          </div>
        </div>
        <div class="camp-actions"></div>
      </div>`);
    this.renderCampBody();
  }

  renderCampBody() {
    const run = this.run;
    const grid = this.dom.overlay.querySelector('.squad-grid');
    const inv = this.dom.overlay.querySelector('.inv');
    const actions = this.dom.overlay.querySelector('.camp-actions');
    grid.innerHTML = '';
    for (const m of run.squad) {
      const st = memberStats(m);
      const alive = m.hp > 0;
      const card = document.createElement('div');
      card.className = `card${m.id === this.selectedMember ? ' sel' : ''}${alive ? '' : ' downed'}`;
      const slots = ['weapon', 'armor', 'trinket']
        .map((s) => {
          const id = m.equipment[s];
          const txt = id ? ITEMS[id].name : '-';
          const col = id ? rarityOf(id).color : '#6b6152';
          return `<button class="slot" data-slot="${s}" data-member="${m.id}" title="${id ? 'Unequip' : s}" style="border-color:${col}"><span class="dim">${s}</span>${txt}</button>`;
        })
        .join('');
      card.innerHTML =
        `<div class="card-head"><b>${m.name}</b> <span class="dim">${st ? '' : ''}${m.classId} L${m.level}</span></div>` +
        `<div class="card-hp">${alive ? `${m.hp}/${st.maxHp} HP` : 'Downed'}</div>` +
        `<div class="card-stats dim">ATK ${st.atk} · DEF ${st.def} · SPD ${st.spd} · MOV ${st.move}</div>` +
        `<div class="slots">${slots}</div>`;
      card.addEventListener('click', (e) => {
        if (e.target.closest('.slot')) return; // slot handles its own click
        if (alive) {
          this.selectedMember = m.id;
          this.renderCampBody();
        }
      });
      grid.appendChild(card);
    }
    // slot unequip
    grid.querySelectorAll('.slot').forEach((btn) => {
      btn.addEventListener('click', () => {
        const { slot, member } = btn.dataset;
        const m = run.squad.find((s) => s.id === member);
        if (m && m.equipment[slot]) {
          run.unequip(member, slot);
          run.save();
          if (m.leader) this.syncArmor();
          this.renderCampBody();
        }
      });
    });
    // inventory
    inv.innerHTML = '';
    if (!run.inventory.length) inv.innerHTML = '<span class="dim">Empty</span>';
    run.inventory.forEach((id, i) => {
      const it = ITEMS[id];
      if (!it) return; // consumables live in the bag too; the Hand uses them
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.style.borderColor = rarityOf(id).color;
      chip.innerHTML = `<b>${it.name}</b><span class="dim"> ${it.slot} · ${bonusText(id)}</span>`;
      chip.addEventListener('click', () => {
        if (this.selectedMember) {
          run.equip(this.selectedMember, id);
          run.save();
          const m = run.squad.find((s) => s.id === this.selectedMember);
          if (m && m.leader) this.syncArmor();
          this.renderCampBody();
        }
      });
      inv.appendChild(chip);
    });
    // actions: rest + descend
    actions.innerHTML = '';
    const rest = document.createElement('button');
    rest.className = 'hd-btn hd-btn--white';
    rest.textContent = `Rest (heal 40%, ${run.restCost()}g)`;
    rest.disabled = !run.canRest();
    rest.addEventListener('click', () => {
      run.rest();
      run.save();
      this.renderCampBody();
    });
    actions.appendChild(rest);

    // Revive: the out-of-battle half of the revive path. The effect itself runs
    // through consumeFromRun + rosterTargets — the SAME resolver the Hand and
    // the backpack use (js/consumableEffects.js) — so the crystal means exactly
    // one thing wherever it is cracked, and the inventory spend + save stay in
    // the one place that already does them. This screen only decides when the
    // button is live; it does not know what reviving is.
    //
    // It lives here at all because the Hand is a BATTLE toolbar that is torn
    // down with the battle (leaveRunChrome in js/main.js), which left a player
    // holding a crystal at camp with no way to spend it.
    const revive = document.createElement('button');
    revive.className = 'hd-btn hd-btn--white';
    const rv = campReviveAction(run);
    revive.textContent = rv.label;
    revive.disabled = !rv.enabled;
    revive.addEventListener('click', () => {
      if (!consumeFromRun(run, rv.itemId, rosterTargets(run))) return; // refused: item untouched
      // In a party descent the revived hero belongs to somebody ELSE's screen:
      // the leader owns the Run and just healed a roster row locally, while that
      // player's client is still holding the corpse from the battle just fought.
      // Tell them (js/coopBattle.js rosterRevived).
      if (this.coop) this.coop.rosterRevived(rv.member);
      this.renderCampBody();
    });
    actions.appendChild(revive);

    const descend = document.createElement('button');
    descend.className = 'hd-btn hd-btn--green';
    const next = run.dungeon.nodes[run.nodeIndex + 1];
    descend.textContent = next ? (next.type === 'event' ? 'Move on ▸' : 'Descend ▸') : 'Leave the Dungeon ▸';
    descend.addEventListener('click', () => {
      run.stage = 'battle';
      run.advance();
      run.save();
      this.enterNode();
    });
    actions.appendChild(descend);

    this.updateHeader();
  }

  // ------------------------------------------------------------- end

  showVictory() {
    if (this.coop) {
      this.coop.descentOver('won', this.coopShares());
      this.coop = null;
    }
    // run exit: unspent loot + gold bank into the persistent server stash
    bankRunLoot(this.run.inventory, this.run.gold);
    Run.clearSave();
    RunStore.clear();
    const survivors = this.run.livingSquad().map((m) => m.name).join(', ') || 'no one';
    this.showOverlay(`
      <div class="hd-landing" style="width:min(560px,96vw)">
        <div class="hd-card">
          <div class="hd-card-header" style="background:var(--hd-green)">The Dungeon is yours</div>
          <div class="hd-card-body">
            <p style="margin:0">The Dread Knight's hold is broken. Survivors: ${survivors}. Gold: ${this.run.gold}.</p>
          </div>
        </div>
        <div class="camp-actions"></div>
      </div>`);
    this.endButton('New Run ▸');
  }

  showDefeat() {
    if (this.coop) {
      this.coop.descentOver('lost', this.coopShares());
      this.coop = null;
    }
    // defeat still banks the backpack — the keep takes your run, not your stash
    bankRunLoot(this.run.inventory, this.run.gold);
    Run.clearSave();
    RunStore.clear();
    this.showOverlay(`
      <div class="hd-landing" style="width:min(560px,96vw)">
        <div class="hd-card">
          <div class="hd-card-header" style="background:var(--hd-red)">The dark takes you</div>
          <div class="hd-card-body">
            <p style="margin:0">Your party falls in the Dungeon. The dungeon reclaims the dark.</p>
          </div>
        </div>
        <div class="camp-actions"></div>
      </div>`);
    this.endButton('Try Again ▸');
  }

  // Per-member loot share at descent end: gold split evenly across the
  // players (leader included), each member's unit progress echoed back.
  coopShares() {
    if (!this.coop || !this.run) return null;
    const members = this.coop.readyMembers();
    const cut = Math.floor(this.run.gold / (members.length + 1));
    const shares = {};
    for (const m of members) {
      const rosterM = this.run.squad.find((s) => s.name === m.name);
      shares[m.name.toLowerCase()] = {
        gold: cut,
        xp: rosterM ? rosterM.xp : 0,
        level: rosterM ? rosterM.level : 1,
        name: m.name,
      };
    }
    return shares;
  }

  endButton(label) {
    const b = document.createElement('button');
    b.className = 'hd-btn hd-btn--green';
    b.textContent = label;
    b.addEventListener('click', () => this.dom.onExit && this.dom.onExit());
    this.dom.overlay.querySelector('.camp-actions').appendChild(b);
  }

  // ------------------------------------------------------------- ui utils

  updateHeader() {
    // The rounded progress pill is retired: the Skyrim-style discovery ribbon
    // (fired on battle entry — see toBattle) now announces where you are.
    // Keep the old header slot empty and hidden so nothing rounded shows.
    if (!this.dom.header) return;
    this.dom.header.innerHTML = '';
    this.dom.header.classList.add('hidden');
  }

  showOverlay(html) {
    this.dom.panel.classList.add('hidden');
    if (this.dom.skin) this.dom.skin(); // hd-ui wallpaper + Volter
    this.dom.overlay.innerHTML = html;
    this.dom.overlay.classList.remove('hidden');
  }
  hideOverlay() {
    this.dom.overlay.classList.add('hidden');
    this.dom.overlay.innerHTML = '';
    if (this.dom.unskin) this.dom.unskin();
  }
}
