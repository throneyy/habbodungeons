import { WALK_MS, WALK_FRAME_MS } from './config.js';
import { rotationBetween, findPath, canStep } from './pathfinder.js';

// An entity that moves exactly like a Habbo: one tile per 500ms tick, facing
// computed with the classic rotation function, 4-frame walk cycle. Clicking a
// new target mid-step finishes the current step first, then re-paths — same
// as the real client.
export class Avatar {
  constructor(room, sprites, x, y, dir = 4) {
    this.room = room;
    this.sprites = sprites;
    this.x = x;
    this.y = y;
    this.z = room.heightAt(x, y) || 0;
    this.dir = dir;
    this.path = []; // remaining tiles to visit
    this.step = null; // the step in progress {fx,fy,fz,tx,ty,tz,start}
    this.pendingTarget = null; // retarget applied when the current step lands
    this.seat = null; // sit-flagged prop under us while seated (v31 chairs)
    this.attackUntil = 0; // melee strike (sword pose) runs until this timestamp
    this.shootUntil = 0; // archery draw (empty-hand reach pose) until this timestamp
  }

  get walking() {
    return !!this.step || this.path.length > 0;
  }

  // Base avatars are always "alive"; Unit overrides this with HP.
  get alive() {
    return true;
  }

  // Returns true if the avatar accepted the destination.
  walkTo(tx, ty) {
    if (this.step) {
      // Finish the tile we're stepping onto, then re-path from there.
      this.pendingTarget = { x: tx, y: ty };
      return true;
    }
    const path = findPath(this.room, this.x, this.y, tx, ty);
    if (!path || !path.length) return false;
    this.path = path;
    return true;
  }

  stop() {
    this.path = [];
    this.pendingTarget = null;
  }

  // Walk a pre-computed path (list of tiles, excluding the start). The battle
  // engine uses this so movement respects unit occupancy, which plain walkTo
  // pathfinding doesn't know about.
  followPath(path) {
    if (!path || !path.length) return false;
    this.path = path.slice();
    this.pendingTarget = null;
    return true;
  }

  update(now) {
    if (!this.step && this.path.length) this.beginStep(now);
    // Steps live on a fixed tick timeline (each starts exactly WALK_MS after
    // the previous), independent of render frame rate — like the server tick.
    // The loop consumes every tick that wall-clock time has completed, so a
    // throttled tab catches up instead of walking in slow motion.
    while (this.step && now - this.step.start >= WALK_MS) {
      const tickStart = this.step.start;
      this.x = this.step.tx;
      this.y = this.step.ty;
      this.z = this.step.tz;
      this.step = null;

      if (this.pendingTarget) {
        const { x, y } = this.pendingTarget;
        this.pendingTarget = null;
        this.path = findPath(this.room, this.x, this.y, x, y) || [];
      }
      if (this.path.length) this.beginStep(tickStart + WALK_MS);
    }
    // Settled and idle: the v31 client sits whoever occupies a chair tile —
    // snap to the chair's direction (non-diagonal dirs only) and hold 'sit'.
    if (!this.step && !this.path.length) {
      const seat = this.room.seatAt ? this.room.seatAt(this.x, this.y) : null;
      if (seat && this.seat !== seat) {
        this.seat = seat;
        this.dir = (seat.dir ?? 0) - ((seat.dir ?? 0) % 2); // 3 -> 2, 5 -> 4 ...
      } else if (!seat) {
        this.seat = null;
      }
    }
  }

  beginStep(now) {
    this.seat = null; // stand up the moment we start walking
    const next = this.path.shift();
    // Re-validate at step time — a blocker may have appeared (future monsters).
    if (!canStep(this.room, this.x, this.y, next.x, next.y)) {
      this.stop();
      return;
    }
    this.dir = rotationBetween(this.x, this.y, next.x, next.y) ?? this.dir;
    this.step = {
      fx: this.x,
      fy: this.y,
      fz: this.z,
      tx: next.x,
      ty: next.y,
      tz: this.room.heightAt(next.x, next.y),
      start: now,
    };
  }

  // Interpolated tile position for rendering (fractional coords).
  renderPos(now) {
    if (!this.step) return { x: this.x, y: this.y, z: this.z };
    const t = Math.max(0, Math.min(1, (now - this.step.start) / WALK_MS));
    const s = this.step;
    return {
      x: s.fx + (s.tx - s.fx) * t,
      y: s.fy + (s.ty - s.fy) * t,
      z: s.fz + (s.tz - s.fz) * t,
    };
  }

  action() {
    if (this.step) return 'wlk';
    const now = performance.now();
    if (this.shootUntil > now) return 'bow'; // archery draw (no sword)
    if (this.attackUntil > now) return 'atk'; // melee strike (sword cycle)
    return this.seat ? 'sit' : 'std';
  }

  // Raw 125ms animation tick — sprite sets wrap it to their own cycle length
  // (avatars: 4 walk frames; monsters: whatever the pet's rig defines).
  frame(now) {
    if (this.step || this.attackUntil > now || this.shootUntil > now)
      return Math.floor(now / WALK_FRAME_MS);
    return 0;
  }
}
