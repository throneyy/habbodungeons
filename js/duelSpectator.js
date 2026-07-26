// Watching somebody else's duel.
//
// Duels are fought in place (js/duelBattle.js), so a fight happens in the middle
// of a room full of people. Until now those people saw nothing: two avatars
// standing perfectly still while, on the duellists' own screens, they traded
// blows. Every frame of the fight was already arriving on the bystander's socket
// — the duel stream rides the ROOM channel — and was being dropped as "not
// addressed to me". This turns those frames into something to look at.
//
// THIS IS A RENDERER, AND ONLY A RENDERER.
//
// It listens on `duel-watch`, which js/supabaseNet.js synthesises for frames
// addressed to SOMEBODY ELSE. That is a different event from `duel-relay`, and
// the difference is the entire security argument:
//
//   duel-relay   frames addressed to me. DuelHost and DuelGuest listen here,
//                behind from-guards that drop anything not from the other
//                duellist. This is the command path. Untouched.
//   duel-watch   frames addressed to someone else. ONLY this file listens, and
//                all it does is pose avatars, pop damage numbers and move an HP
//                bar. Nothing here can send, and nothing that can execute a
//                command is subscribed to it.
//
// So a spectator cannot interfere by construction, not by a check that could be
// forgotten: the frames they receive arrive on an event no command handler is
// listening to, and this class has no send path of any kind.
//
// It renders through the SAME channel critter combat already uses — RemotePlayers
// .playStrike for the attack pose, damageFx for the impact ring and the floating
// number — because that pattern is proven to stay in sync across clients
// (tests/e2e/critterStrikeSync.e2e.mjs) and a second animation path would drift
// from it.
import { damageFx } from './exploreController.js';

// Long enough to outlive a stalled duel, short enough that a crashed host does
// not leave two avatars wearing swords forever.
const STALE_MS = 90000;

export class DuelSpectator {
  // net: shared Net; game: renderer; remote: RemotePlayers (the avatars)
  constructor(net, game, remote) {
    this.net = net;
    this.game = game;
    this.remote = remote;
    this.unsubs = [];
    // cid ('p0'/'e0') -> the duellist's Habbo name. Learned from the start
    // frame; without it an fx frame is just two opaque ids.
    this.names = new Map();
    this.fighters = []; // [nameA, nameB], in start-frame order
    this.hp = new Map(); // lower(name) -> { hp, maxHp }
    this.roomId = null;
    this.watching = false;
    this.lastFrameAt = 0;
    this.sweep = null;
  }

  attach() {
    this.detach();
    this.unsubs = [this.net.on('duel-watch', (m) => this.onFrame(m))];
    // A duel that ends with its host's tab closed sends no 'end' frame. Sweep
    // rather than leaving the room permanently dressed for a fight.
    this.sweep = setInterval(() => {
      if (this.watching && performance.now() - this.lastFrameAt > STALE_MS) this.stop();
    }, 5000);
  }

  detach() {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    clearInterval(this.sweep);
    this.sweep = null;
    this.stop();
  }

  /** The avatar for a duellist, if they are in this room and visible to us. */
  unitFor(name) {
    if (!name || !this.remote) return null;
    return this.remote.units.get(String(name).toLowerCase()) || null;
  }

  unitForCid(cid) {
    return this.unitFor(this.names.get(cid));
  }

  onFrame(msg) {
    const d = (msg && msg.data) || {};
    this.lastFrameAt = performance.now();
    if (d.k === 'start') return this.onStart(d, msg.from);
    if (!this.watching) return; // mid-duel arrival: wait for a start/phase pair
    if (d.k === 'fx') return this.onFx(d);
    if (d.k === 'phase') return this.onPhase(d);
    if (d.k === 'end') return this.stop();
  }

  /** A duel began in this room. Learn who is fighting and dress them for it. */
  onStart(d, from) {
    // Only duels in the room we are actually standing in. The room channel is
    // per-room so this should always hold; it is asserted rather than assumed
    // because a stale frame would otherwise put HP bars on nobody.
    const here = this.game.room && this.game.room.id;
    if (d.roomId && here && d.roomId !== here) return;
    this.stop(); // any previous fight is over as far as we are concerned

    this.names.clear();
    this.hp.clear();
    this.fighters = [];
    for (const u of d.units || []) {
      if (!u || !u.cid || !u.name) continue;
      this.names.set(u.cid, u.name);
      this.fighters.push(u.name);
      const stats = u.stats || {};
      this.hp.set(u.name.toLowerCase(), {
        hp: stats.hp != null ? stats.hp : null,
        maxHp: stats.maxHp != null ? stats.maxHp : null,
      });
    }
    // The host names itself in `opponent` (it is the opponent FROM the guest's
    // side); `from` is the same player. Either way both fighters are already in
    // the units list, so this is only a sanity net for a malformed frame.
    if (this.fighters.length !== 2) {
      this.names.clear();
      this.hp.clear();
      this.fighters = [];
      return;
    }
    this.roomId = d.roomId || here;
    this.watching = true;
    this.applyBars();
    this.markTags(true);
  }

  /** Turn boundary: the authoritative snapshot of both fighters. */
  onPhase(d) {
    for (const s of d.units || []) {
      const name = this.names.get(s.cid);
      if (!name) continue;
      this.hp.set(name.toLowerCase(), { hp: s.hp, maxHp: s.maxHp });
      const u = this.unitFor(name);
      if (!u) continue;
      // Positions come from the host, exactly as they do for the duellists'
      // own replicas. A fighter who walked mid-duel should be seen to.
      if (s.x != null && s.y != null && (u.x !== s.x || u.y !== s.y)) {
        u.stop();
        u.x = s.x;
        u.y = s.y;
        u.z = u.room.heightAt(s.x, s.y) || 0;
      }
      if (s.dir != null) u.dir = s.dir;
    }
    this.applyBars();
  }

  /** A blow landed. Pose the attacker, wound the target, pop the number. */
  onFx(d) {
    const attacker = this.unitForCid(d.attacker || d.caster);
    const targetName = this.names.get(d.target);
    const target = this.unitFor(targetName);

    // The attack pose, through RemotePlayers' own strike path — the same one a
    // critter swing drives.
    if (attacker && this.remote) {
      this.remote.playStrike(this.names.get(d.attacker || d.caster), d.aDir);
    }

    // The authoritative HP echo rides on the fx frame (serializeFx -> tHp), so
    // a spectator's bar never drifts from the fighters' own screens: it is not
    // recomputed here, it is copied.
    if (targetName && d.tHp != null) {
      const prev = this.hp.get(targetName.toLowerCase()) || {};
      this.hp.set(targetName.toLowerCase(), { hp: d.tHp, maxHp: prev.maxHp ?? null });
    }

    if (target && d.dmg != null && d.dmg > 0) {
      const z = this.game.room ? this.game.room.heightAt(target.x, target.y) : 0;
      damageFx(this.game, target.x, target.y, z, d.dmg, !!d.crit);
    }
    this.applyBars();
  }

  /** Push the HP we have been told about onto the avatars, so the renderer
   *  draws a bar over each fighter (game.drawHpBar keys off unit.stats). */
  applyBars() {
    for (const name of this.fighters) {
      const u = this.unitFor(name);
      const h = this.hp.get(String(name).toLowerCase());
      if (!u || !h || h.hp == null || !h.maxHp) continue;
      u.stats = { ...(u.stats || {}), hp: Math.max(0, h.hp), maxHp: h.maxHp };
      // Both fighters are PEOPLE, so neither bar may be drawn in monster red
      // (game.drawHpBar colours by team otherwise) — same reasoning as the
      // roster fix in js/battleController.js.
      u.duellist = true;
    }
  }

  /** The "these two are fighting" cue: a crossed-swords badge on the name tag,
   *  which is the one label a bystander is already reading. */
  markTags(on) {
    if (!this.remote) return;
    for (const name of this.fighters) {
      const tag = this.remote.tags.get(String(name).toLowerCase());
      if (!tag) continue;
      if (on) {
        tag.classList.add('name-tag--duel');
        if (!tag.dataset.duelName) tag.dataset.duelName = tag.textContent;
        tag.textContent = `\u2694 ${tag.dataset.duelName}`;
      } else {
        tag.classList.remove('name-tag--duel');
        if (tag.dataset.duelName) tag.textContent = tag.dataset.duelName;
        delete tag.dataset.duelName;
      }
    }
  }

  /** The fight is over (or went quiet): give the room its ordinary avatars
   *  back. Explore units carry no stats, which is what suppresses the HP bar. */
  stop() {
    if (this.fighters.length) {
      this.markTags(false);
      for (const name of this.fighters) {
        const u = this.unitFor(name);
        if (!u) continue;
        u.stats = null; // explore: no HP bar
        u.duellist = false;
      }
    }
    this.watching = false;
    this.fighters = [];
    this.names.clear();
    this.hp.clear();
    this.roomId = null;
  }

  /** Is this player one of the two we are watching fight? Used to keep the
   *  infostand (Trade / Duel / Invite) off a duellist: a spectator watches, and
   *  is never offered an action against someone mid-fight. */
  isFighting(name) {
    if (!this.watching || !name) return false;
    const want = String(name).toLowerCase();
    return this.fighters.some((n) => String(n).toLowerCase() === want);
  }

  /** What this client believes each fighter's HP is \u2014 the very numbers
   *  applyBars draws. Read by tests/e2e/duelLive.e2e.mjs. */
  readout() {
    const out = {};
    for (const name of this.fighters) {
      const h = this.hp.get(String(name).toLowerCase());
      out[name] = h ? h.hp : null;
    }
    return out;
  }
}
