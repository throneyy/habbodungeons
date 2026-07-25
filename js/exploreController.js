import { Unit } from './units.js';
import { rotationBetween } from './pathfinder.js';
import { furniSprites, monsterSprites } from './monsterSprites.js';
import { PROJ_SPRITE } from './battleController.js';
import { Identity } from './identity.js';

const ATTACK_MS = 600; // attack jab duration (grab-reach pose)
const IMPACT_MS = 250; // swing wind-up before the hit lands

// a prop's occupied tiles (multi-tile furni declare them, 1×1 default)
const footprint = (p) => (p.tiles && p.tiles.length ? p.tiles : [{ x: p.x, y: p.y }]);

// the footprint tile closest to (x,y) — what the avatar actually turns toward
function nearestTileOf(prop, x, y) {
  let best = prop;
  let bd = Infinity;
  for (const t of footprint(prop)) {
    const d = Math.max(Math.abs(t.x - x), Math.abs(t.y - y));
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

// Free-walk sandbox: one avatar, click a tile to walk (the original movement
// demo). Kept around as a movement testbed alongside battle mode.
export class ExploreController {
  constructor(onStatus) {
    this.onStatus = onStatus || (() => {});
    this.game = null;
    this.unit = null;
    this.onTeleport = null; // set by main.js: (teleport, fromRoomId) => switch room
    this.suppressTile = null; // 'x,y' just teleported onto: no immediate re-fire
    this.pendingHit = null; // hittable prop to attack once we're beside it
    this.pendingFace = null; // hittable prop to turn toward once we're beside it
    this.pendingTalk = null; // NPC prop to address once we're beside it
    this.onNpcTalk = null; // set by main.js: (npcProp) => start its dialogue
    this.remote = null; // RemotePlayers — multiplayer presence (main.js wires it)
    this.bots = null; // RoomBots — walking room bots (main.js wires it)
    this.onPlayerTap = null; // set by main.js: (unit) => open the human infostand
    // Huntable wildlife (room.critters DATA — the Mirkwood): harmless, low-XP
    // creatures that respawn. They never fight back.
    this.critters = []; // live critter Units in the current room
    this.respawns = []; // { spec, tile, at } — queued rebirths
    this.strikes = []; // { unit, at, dmg, crit } — damage landing at impact
    this.pendingHunt = null; // critter to strike once we walk up to it
    this.onKill = null; // set by main.js: (spec) => bank the XP
    this.onDiscover = null; // set by main.js: (roomName) => Skyrim discovery banner
  }

  onAttach(game) {
    this.game = game;
  }

  onRoom(room) {
    // Skyrim-style "location discovered": fade the room's name in/out on entry
    if (this.onDiscover && room && room.name) this.onDiscover(room.name);
    this.unit = this.game.addUnit(
      new Unit(room, null, room.spawn.x, room.spawn.y, {
        team: 'player',
        classId: Identity.classId() || 'fighter', // your calling — drives its weapon art
        useSprites: true,
        dir: room.spawnDir,
      })
    );
    this.unit.stats = null; // no HP bar in explore
    // multiplayer: accepted walks report their destination to the hub
    if (this.remote) this.remote.bindLocalUnit(this.unit);
    // walking room bots: same deal — respawn them from the room's specs
    if (this.bots) this.bots.onRoom(room);
    // wildlife: fresh room, fresh population (setRoom cleared the old units)
    this.critters = [];
    this.respawns = [];
    this.strikes = [];
    this.pendingHunt = null;
    for (const spec of room.critters || [])
      for (const tile of spec.spawns) this.spawnCritter(spec, tile);
  }

  // ---- wildlife -------------------------------------------------------------

  spawnCritter(spec, tile) {
    const room = this.game.room;
    const u = new Unit(room, null, tile.x, tile.y, {
      team: 'critter', classId: 'ranger', name: spec.name,
      dir: [0, 2, 4, 6][Math.floor(Math.random() * 4)],
    });
    // tiny prey stats: just an HP pool for the bar — they never attack
    u.stats = { maxHp: spec.hp, hp: spec.hp, atk: 0, def: 0, spd: 0, move: 0, range: 1, min: 0 };
    u.sprites = monsterSprites(spec.look.pet, { tint: spec.look.tint, recolor: spec.look.recolor });
    u.critter = { spec, home: tile, nextWander: performance.now() + 1000 + Math.random() * 4000 };
    this.game.addUnit(u);
    this.critters.push(u);
    return u;
  }

  critterAt(x, y) {
    return this.critters.find((u) => u.alive && u.x === x && u.y === y) || null;
  }

  // Walk up and swing at a critter (double-tap gesture, like the dummy).
  hunt(critter) {
    this.pendingHit = null;
    this.pendingFace = null;
    this.pendingTalk = null;
    if (this.isBeside(critter)) this.strike(critter);
    else {
      const spot = this.nearestBesideTile(critter);
      if (spot) {
        this.pendingHunt = critter;
        this.unit.walkTo(spot.x, spot.y);
      }
    }
  }

  // The swing itself: attack pose now, damage lands at impact (update()).
  strike(critter) {
    const u = this.unit;
    const now = performance.now();
    if (u.attackUntil > now || u.step) return; // mid-swing / mid-step
    if (!critter.alive) return;
    this.face(critter);
    u.attackUntil = now + ATTACK_MS;
    const dmg = 4 + Math.floor(Math.random() * 6);
    const crit = Math.random() < 0.15;
    this.strikes.push({ unit: critter, at: now + IMPACT_MS, dmg: crit ? dmg * 2 : dmg, crit });
  }

  // Impact: apply the wound, pop the classic feedback, queue the respawn
  // (and the XP trickle) when the creature falls.
  landStrike(s) {
    const c = s.unit;
    if (!c.alive) return;
    c.takeDamage(s.dmg);
    const z = this.game.room.heightAt(c.x, c.y);
    this.game.addFx({ type: 'burst', x: c.x, y: c.y, z, color: s.crit ? '#f6c343' : '#ffd9a0', dur: 340 });
    this.game.addFx({
      type: 'float', x: c.x, y: c.y, z,
      text: s.crit ? `${s.dmg}!` : String(s.dmg), color: s.crit ? '#f6c343' : '#fff', dur: 800,
    });
    if (!c.alive) {
      const spec = c.critter.spec;
      this.game.addFx({
        type: 'float', x: c.x, y: c.y, z, text: `+${spec.xp} xp`, color: '#9fe38a', dur: 1100, start: performance.now() + 350,
      });
      this.respawns.push({
        spec, tile: c.critter.home,
        at: performance.now() + spec.respawnMs + Math.random() * 3000,
      });
      this.critters = this.critters.filter((u) => u !== c);
      if (this.onKill) this.onKill(spec);
    }
  }

  // Idle drift: a living critter occasionally ambles one tile — the wood
  // feels inhabited, and grazers wander back toward home so they never stray.
  wander(c, now) {
    if (now < c.critter.nextWander || c.step || (c.path || []).length) return;
    c.critter.nextWander = now + 2500 + Math.random() * 5000;
    if (Math.random() < 0.45) return; // sometimes just stand and graze
    const room = this.game.room;
    const home = c.critter.home;
    const opts = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (!room.tile(x, y) || room.isBlocked(x, y)) continue;
      if (room.teleportAt && room.teleportAt(x, y)) continue;
      if (Math.abs(room.heightAt(x, y) - room.heightAt(c.x, c.y)) > 1) continue;
      if (Math.abs(x - home.x) > 2 || Math.abs(y - home.y) > 2) continue; // leashed to home
      if (this.critterAt(x, y)) continue;
      if (this.unit && this.unit.x === x && this.unit.y === y) continue;
      opts.push({ x, y });
    }
    if (opts.length) {
      const t = opts[Math.floor(Math.random() * opts.length)];
      c.walkTo(t.x, t.y);
    }
  }

  // single tap on a dummy: approach it and turn to face it (the classic
  // select/inspect gesture) — the swing itself is on double-tap
  onTap(tile) {
    if (!this.unit) return;
    const room = this.game.room;
    // other players first: tap = open their infostand (self included)
    if (this.onPlayerTap) {
      const target =
        this.remote && this.remote.unitAt(tile.x, tile.y)
          ? this.remote.unitAt(tile.x, tile.y)
          : this.unit.x === tile.x && this.unit.y === tile.y
            ? this.unit
            : null;
      if (target) {
        this.onPlayerTap(target);
        return;
      }
    }
    // wildlife: single tap = the inspect gesture (walk up and face it)
    const critter = this.critterAt(tile.x, tile.y);
    if (critter) {
      this.pendingHit = null;
      this.pendingHunt = null;
      if (this.isBeside(critter)) this.face(critter);
      else {
        const spot = this.nearestBesideTile(critter);
        if (spot) {
          this.pendingFace = critter;
          this.unit.walkTo(spot.x, spot.y);
        }
      }
      return;
    }
    // NPCs: tap = walk up, face them, talk (same approach gesture as dummies)
    const npc = room.npcAt ? room.npcAt(tile.x, tile.y) : null;
    if (npc) {
      this.pendingHit = null;
      this.pendingFace = null;
      if (this.isBeside(npc)) this.talk(npc);
      else {
        const spot = this.nearestBesideTile(npc);
        if (spot) {
          this.pendingTalk = npc;
          this.unit.walkTo(spot.x, spot.y);
        }
      }
      return;
    }
    const hit = room.hittableAt ? room.hittableAt(tile.x, tile.y) : null;
    if (hit) {
      this.pendingHit = null;
      if (this.isBeside(hit)) this.face(hit);
      else {
        const spot = this.nearestBesideTile(hit);
        if (spot) {
          this.pendingFace = hit;
          this.unit.walkTo(spot.x, spot.y);
        }
      }
      return;
    }
    // archery target: single tap just draws your aim (face it, no walk)
    const rng = room.shootableAt ? room.shootableAt(tile.x, tile.y) : null;
    if (rng) {
      this.face(rng);
      return;
    }
    if (!room.isBlocked(tile.x, tile.y)) this.unit.walkTo(tile.x, tile.y);
  }

  // double tap on a dummy/target: the attack follows through — melee walks
  // beside first; archery looses the arrow from wherever you stand
  onDoubleTap(tile) {
    if (!this.unit) return;
    const room = this.game.room;
    // wildlife: double tap = the kill gesture (walk up and swing)
    const critter = this.critterAt(tile.x, tile.y);
    if (critter) {
      this.hunt(critter);
      return;
    }
    const rng = room.shootableAt ? room.shootableAt(tile.x, tile.y) : null;
    if (rng) {
      this.shoot(rng);
      return;
    }
    const hit = room.hittableAt ? room.hittableAt(tile.x, tile.y) : null;
    if (!hit) {
      this.onTap(tile); // double-tapping floor just walks
      return;
    }
    this.pendingFace = null;
    if (this.isBeside(hit)) this.attack(hit);
    else {
      const spot = this.nearestBesideTile(hit);
      if (spot) {
        this.pendingHit = hit;
        this.unit.walkTo(spot.x, spot.y);
      }
    }
  }

  // face the NPC and hand off to the dialogue layer (main.js)
  talk(npc) {
    this.face(npc);
    if (this.onNpcTalk) this.onNpcTalk(npc);
  }

  // turn toward the prop (avatar POV — body + head face the nearest tile of it)
  face(prop) {
    const t = nearestTileOf(prop, this.unit.x, this.unit.y);
    const dir = rotationBetween(this.unit.x, this.unit.y, t.x, t.y);
    if (dir != null) this.unit.dir = dir;
  }

  // adjacency against the prop's whole footprint (2×2 NPCs, long tables…)
  isBeside(prop) {
    return footprint(prop).some(
      (t) => Math.abs(this.unit.x - t.x) <= 1 && Math.abs(this.unit.y - t.y) <= 1
    );
  }

  // closest walkable tile of the ring around the prop's footprint. Teleport
  // pads are excluded: walking up to an NPC must never park you inside the
  // arch (standing there suppresses its trigger — you'd have to step off and
  // back on to descend).
  nearestBesideTile(prop) {
    const room = this.game.room;
    let best = null;
    for (const ft of footprint(prop)) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = ft.x + dx;
          const y = ft.y + dy;
          if (!room.tile(x, y) || room.isBlocked(x, y)) continue;
          if (room.teleportAt && room.teleportAt(x, y)) continue;
          const d = Math.max(Math.abs(x - this.unit.x), Math.abs(y - this.unit.y));
          if (!best || d < best.d) best = { x, y, d };
        }
      }
    }
    return best;
  }

  // Archery: loose the Firing Arrow at a target from where you stand — the
  // battle rangers' projectile arc, then the same wobble + damage feedback.
  shoot(prop) {
    const u = this.unit;
    const now = performance.now();
    if (u.attackUntil > now || u.shootUntil > now || u.step) return; // busy
    this.face(prop);
    u.shootUntil = now + ATTACK_MS; // draw pose (empty hand), never the sword
    const room = this.game.room;
    const t = nearestTileOf(prop, u.x, u.y);
    const dist = Math.max(Math.abs(u.x - t.x), Math.abs(u.y - t.y), 1);
    const flightMs = 130 + dist * 55; // battle rangers' flight timing
    const from = { x: u.x, y: u.y, z: u.z ?? room.heightAt(u.x, u.y) };
    const to = { x: t.x, y: t.y, z: room.heightAt(t.x, t.y) };
    this.game.addFx({
      type: 'proj', from, to, dur: flightMs,
      sprite: furniSprites(PROJ_SPRITE.ranged),
      dir: rotationBetween(u.x, u.y, t.x, t.y),
    });
    const impact = now + flightMs;
    prop.hitAt = impact; // the target board wobbles when the arrow lands
    const dmg = 3 + Math.floor(Math.random() * 15);
    const crit = Math.random() < 0.15; // bullseye!
    this.game.addFx({
      type: 'burst', ...to, color: crit ? '#f6c343' : '#ffd9a0', dur: 340, start: impact,
    });
    this.game.addFx({
      type: 'float', ...to,
      text: crit ? `${dmg * 2}!` : String(dmg),
      color: crit ? '#f6c343' : '#fff', dur: 800, start: impact,
    });
  }

  // The dummy swing: face it, hold the wave pose, wobble the prop at impact
  // and pop a damage floater — classic training-dummy feedback.
  attack(prop) {
    const u = this.unit;
    const now = performance.now();
    if (u.attackUntil > now) return; // mid-swing already
    this.face(prop); // POV snaps to the dummy with every swing
    u.attackUntil = now + ATTACK_MS;
    prop.hitAt = now + IMPACT_MS; // drawProp wobbles from this timestamp
    const dmg = 3 + Math.floor(Math.random() * 15);
    const crit = Math.random() < 0.15;
    const z = this.game.room.heightAt(prop.x, prop.y);
    this.game.addFx({
      type: 'burst', x: prop.x, y: prop.y, z,
      color: crit ? '#f6c343' : '#ffd9a0', dur: 340, start: now + IMPACT_MS,
    });
    this.game.addFx({
      type: 'float', x: prop.x, y: prop.y, z,
      text: crit ? `${dmg * 2}!` : String(dmg),
      color: crit ? '#f6c343' : '#fff', dur: 800, start: now + IMPACT_MS,
    });
  }

  onHover() {}

  update(now) {
    // multiplayer: keep remote name tags glued above heads every frame
    if (this.remote) this.remote.update(now ?? performance.now());
    const nowMs = now ?? performance.now();
    // room bots: idle wander + their own name tags
    if (this.bots) this.bots.update(nowMs, this);
    // wildlife: land queued strikes at impact, respawn the fallen, drift the rest
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      if (nowMs >= this.strikes[i].at) this.landStrike(this.strikes.splice(i, 1)[0]);
    }
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (nowMs < r.at) continue;
      // hold the rebirth while the home tile is stood on (player or critter)
      const occupied =
        (this.unit && this.unit.x === r.tile.x && this.unit.y === r.tile.y) || this.critterAt(r.tile.x, r.tile.y);
      if (occupied) {
        r.at = nowMs + 1500;
        continue;
      }
      this.respawns.splice(i, 1);
      this.spawnCritter(r.spec, r.tile);
    }
    for (const c of this.critters) if (c.alive) this.wander(c, nowMs);
    // queued dummy/NPC actions: fire as soon as we arrive beside the target
    if (this.unit && !this.unit.step && !(this.unit.path || []).length) {
      if (this.pendingTalk) {
        const target = this.pendingTalk;
        this.pendingTalk = null;
        if (this.isBeside(target)) this.talk(target);
      } else if (this.pendingHunt) {
        const target = this.pendingHunt;
        this.pendingHunt = null;
        if (target.alive && this.isBeside(target)) this.strike(target);
      } else if (this.pendingHit) {
        const target = this.pendingHit;
        this.pendingHit = null;
        if (this.isBeside(target)) this.attack(target);
      } else if (this.pendingFace) {
        const target = this.pendingFace;
        this.pendingFace = null;
        if (this.isBeside(target)) this.face(target);
      }
    }
    // RP-arrow teleports: stepping onto a teleport decal moves the avatar to
    // the target room the moment the step lands (even mid-path, like the
    // classic arrows). Arriving ON a pad sets suppressTile so it only fires
    // again after stepping off and back on.
    if (this.unit && this.onTeleport && this.game.room.teleportAt) {
      const u = this.unit;
      if (!u.step) {
        const key = `${u.x},${u.y}`;
        const tp = this.game.room.teleportAt(u.x, u.y);
        if (!tp || key !== this.suppressTile) this.suppressTile = null;
        if (tp && !this.suppressTile) {
          this.onTeleport({ ...tp.teleport }, this.game.room.id);
          return;
        }
      }
    }
    if (this.onStatus && this.unit) {
      const u = this.unit;
      this.onStatus(
        `${u.walking ? 'Walking' : u.seat ? 'Sitting' : 'Standing'} at (${u.x}, ${u.y}) h${u.z} dir ${u.dir}` +
          (this.game.hover ? ` · hover (${this.game.hover.x}, ${this.game.hover.y}) h${this.game.hover.z}` : '')
      );
    }
  }
}
