import { TILE_W, TILE_H, Z_STEP, TILE_THICKNESS, AVATAR_FOOT_PAD, WALK_FRAME_MS } from './config.js';
import { tileToScreen, pointInDiamond } from './iso.js';
import { propSprites } from './props.js';
import { relaxDrawDepths } from './depth.js';
import { defaultAvatar } from './defaultAvatar.js';

// The offline/still-loading stand-in is the default Habbo (js/defaultAvatar.js):
// fetched once, from local art, the moment the renderer module loads.
defaultAvatar.load();

// Fallback-only recolour so an unrendered enemy still reads as hostile instead
// of joining a crowd of identical newbies. Multiplied over the baked art, the
// way the client recolours: shading survives, the hue doesn't.
const ENEMY_TINT = '#e0736a';

const COLORS = {
  topA: '#7c7364',
  topB: '#736a5c',
  sideSW: '#453d33',
  sideSE: '#584f44',
  line: 'rgba(18,14,10,0.35)',
};

// Renderer + input host. Draws a room and any number of Units (depth-sorted),
// plus tile overlays, and delegates input to a pluggable controller so the
// same engine powers both free-walk "explore" and tactics "battle" modes.
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0 };
    this.room = null;
    this.units = [];
    this.sprites = { m: null, s: null }; // shared habbo-imaging sprite sets
    this.drawList = [];
    this.hover = null;
    this.pointer = null;
    this.controller = null;
    // Tile overlays keyed by "x,y" -> css color, drawn on tile tops. `objective`
    // marks a persistent goal tile (reach/defend/escort) and is deliberately NOT
    // wiped by clearOverlays — it survives selection churn for the whole battle.
    this.overlays = { move: new Set(), target: new Set(), skill: new Set(), path: new Set(), objective: new Set() };
    this.fx = []; // transient combat effects: bursts, floaters, projectiles
    this.onFrame = null;
    this.viewW = 0;
    this.viewH = 0;

    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------------------------------------------------------------- setup

  setController(controller) {
    this.controller = controller;
    if (controller && controller.onAttach) controller.onAttach(this);
  }

  setRoom(room) {
    this.room = room;
    // room kit: palette recolors the procedural tiles, floor art skins the
    // tops, boundary walls frame the far edges (all DATA — see Room.kit)
    this.kit = room.kit || {};
    this.colors = { ...COLORS, ...(this.kit.palette || {}) };
    this.floorSprites = this.kit.floor ? propSprites(this.kit.floor) : null;
    this.buildDrawList();
    this.buildWallMap();
    this.units = [];
    // furni props declared on the room resolve to sprite sets here; `ref`
    // keeps the live room prop so runtime state (gate hidden) is honoured
    this.props = (room.props || []).map((p) => ({ ...p, ref: p, sprites: propSprites(p.id) }));
    this.clearOverlays();
    this.overlays.objective.clear(); // goal marker is per-battle, set by the controller
    this.hover = null;
    this.recenter();
    if (this.controller && this.controller.onRoom) this.controller.onRoom(room);
  }

  setSprites(sprites) {
    this.sprites = sprites;
    for (const u of this.units) if (u.useSprites) u.sprites = this.spritesFor();
  }

  spritesFor() {
    if (!this.room) return null;
    return this.room.zoom === 1 ? this.sprites.m : this.sprites.s;
  }

  addUnit(unit) {
    if (unit.useSprites) unit.sprites = this.spritesFor();
    this.units.push(unit);
    return unit;
  }

  clearUnits() {
    this.units = [];
  }

  clearOverlays() {
    this.overlays.move.clear();
    this.overlays.target.clear();
    this.overlays.skill.clear();
    this.overlays.path.clear();
  }

  buildDrawList() {
    const room = this.room;
    const list = [];
    for (let y = 0; y < room.h; y++) {
      for (let x = 0; x < room.w; x++) {
        const t = room.tile(x, y);
        if (!t) continue;
        list.push({ x, y, z: t.z, depth: x + y, stair: this.detectStair(x, y, t) });
      }
    }
    list.sort((a, b) => a.depth - b.depth || a.x - b.x);
    this.drawList = list;
  }

  // Which tiles carry a boundary wall: the FIRST floor tile of each row gets a
  // west face, of each column a north face (interior pits never wall up).
  buildWallMap() {
    this.rowMinX = new Map();
    this.colMinY = new Map();
    for (const t of this.drawList) {
      if (!this.rowMinX.has(t.y) || t.x < this.rowMinX.get(t.y)) this.rowMinX.set(t.y, t.x);
      if (!this.colMinY.has(t.x) || t.y < this.colMinY.get(t.x)) this.colMinY.set(t.x, t.y);
    }
  }

  detectStair(x, y, tile) {
    const room = this.room;
    const dirs = [
      { dx: 1, dy: 0, axis: 'x', sign: 1 },
      { dx: 0, dy: 1, axis: 'y', sign: 1 },
      { dx: -1, dy: 0, axis: 'x', sign: -1 },
      { dx: 0, dy: -1, axis: 'y', sign: -1 },
    ];
    const lower = dirs.filter((d) => {
      const n = room.tile(x + d.dx, y + d.dy);
      return n && tile.z - n.z === 1;
    });
    if (!lower.length) return null;
    // two perpendicular descents = a corner: steps wrap around it (like the
    // real client's corner stairs) instead of two runs colliding
    if (lower.length === 2 && lower[0].axis !== lower[1].axis) {
      return {
        corner: {
          sx: lower.find((d) => d.axis === 'x').sign,
          sy: lower.find((d) => d.axis === 'y').sign,
        },
      };
    }
    // otherwise prefer the face whose OPPOSITE neighbour is higher — a step
    // tile in a staircase descends away from the ground it climbs to
    const backed = lower.find((d) => {
      const b = room.tile(x - d.dx, y - d.dy);
      return b && b.z > tile.z;
    });
    const d = backed || lower[0];
    return { axis: d.axis, sign: d.sign };
  }

  // ---------------------------------------------------------------- input

  bindInput() {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      this.pointer = { sx: e.clientX, sy: e.clientY, cx: this.cam.x, cy: this.cam.y, pan: false };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      if (this.pointer) {
        const dx = e.clientX - this.pointer.sx;
        const dy = e.clientY - this.pointer.sy;
        if (this.pointer.pan || Math.hypot(dx, dy) > 5) {
          this.pointer.pan = true;
          this.cam.x = this.pointer.cx + dx;
          this.cam.y = this.pointer.cy + dy;
        }
      }
      const t = this.pick(e.clientX, e.clientY);
      this.hover = t;
      if (this.controller && this.controller.onHover) this.controller.onHover(t);
    });
    cv.addEventListener('pointerup', (e) => {
      const wasPan = this.pointer && this.pointer.pan;
      this.pointer = null;
      if (wasPan) return;
      const t = this.pick(e.clientX, e.clientY);
      if (!t || !this.controller) return;
      // double-tap: two taps on the SAME tile within 350ms (classic Habbo
      // "use" gesture — attack dummies, use furni). Controllers without an
      // onDoubleTap keep plain-tap behaviour for both clicks.
      const now = performance.now();
      const last = this.lastTap;
      this.lastTap = { x: t.x, y: t.y, t: now };
      if (
        this.controller.onDoubleTap &&
        last && last.x === t.x && last.y === t.y && now - last.t < 350
      ) {
        this.lastTap = null;
        this.controller.onDoubleTap(t);
        return;
      }
      if (this.controller.onTap) this.controller.onTap(t);
    });
    cv.addEventListener('pointerleave', () => {
      this.hover = null;
    });
  }

  pick(clientX, clientY) {
    if (!this.room) return null;
    const r = this.canvas.getBoundingClientRect();
    const px = clientX - r.left - this.cam.x;
    const py = clientY - r.top - this.cam.y;
    for (let i = this.drawList.length - 1; i >= 0; i--) {
      const t = this.drawList[i];
      const c = tileToScreen(t.x, t.y, t.z, this.room.zoom);
      if (pointInDiamond(px, py, c.x, c.y, this.room.zoom)) return t;
    }
    return null;
  }

  // ---------------------------------------------------------------- layout

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this.canvas.width = this.viewW * dpr;
    this.canvas.height = this.viewH * dpr;
    this.canvas.style.width = `${this.viewW}px`;
    this.canvas.style.height = `${this.viewH}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    if (this.room) this.recenter();
  }

  recenter() {
    const zoom = this.room.zoom;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const t of this.drawList) {
      const c = tileToScreen(t.x, t.y, t.z, zoom);
      minX = Math.min(minX, c.x - (TILE_W / 2) * zoom);
      maxX = Math.max(maxX, c.x + (TILE_W / 2) * zoom);
      minY = Math.min(minY, c.y - (TILE_H / 2) * zoom);
      maxY = Math.max(maxY, c.y + (TILE_H / 2) * zoom);
    }
    this.cam.x = this.viewW / 2 - (minX + maxX) / 2;
    this.cam.y = this.viewH / 2 - (minY + maxY) / 2;
  }

  // ---------------------------------------------------------------- render

  loop(now) {
    for (const u of this.units) {
      u.update(now);
      // Death sequence: play the 'ded' pose (monsters have real corpse art),
      // hold a beat, then fade. dying runs 0 -> 1 over the sequence.
      if (!u.alive && u.dyingStart == null) u.dyingStart = now;
      if (u.dyingStart != null) u.dying = (now - u.dyingStart) / 1400;
    }
    if (this.controller && this.controller.update) this.controller.update(now);
    this.fx = this.fx.filter((f) => now < f.start + f.dur);
    this.render(now);
    if (this.onFrame) this.onFrame(this, now);
    requestAnimationFrame((t) => this.loop(t));
  }

  // Queue a combat effect. Types (world tile coords, drawn camera-relative):
  //   burst: { x, y, z, color, dur }                    impact ring
  //   float: { x, y, z, text, color, dur }              rising damage/heal text
  //   proj:  { from, to, color, dur, sprite?, dir? } arced shot; with a ready
  //          sprite set + Habbo dir it draws directional art, else a glow dot
  // `start` defaults to now; pass performance.now() + delay to sequence.
  addFx(fx) {
    this.fx.push({ start: performance.now(), ...fx });
  }

  render(now) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.viewW, this.viewH);
    if (!this.room) return;

    ctx.save();
    ctx.translate(this.cam.x, this.cam.y);

    if (this.kit.walls) this.drawWalls();

    // Merge tiles + units + props into one depth-sorted pass. Every floor
    // tile joins the relaxation as a PASSIVE flat surface (groundZ = its
    // height): it keeps its scalar depth — so raised steps still occlude
    // whatever stands behind them — but units get raised above any flat
    // surface at or below their feet (depth.js), which is what used to clip
    // walkers' boots against the trailing tile mid-step.
    const items = [];
    const boxed = []; // tiles + props + units, box-relaxed (see depth.js)
    for (const u of this.units) {
      if (!u.alive && (u.dying == null || u.dying >= 1)) continue; // faded out
      const p = u.renderPos(now);
      const it = { depth: p.x + p.y, kind: 1, unit: u, p, z: p.z, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      items.push(it);
      boxed.push(it);
    }
    for (const t of this.drawList) {
      const it = {
        depth: t.depth, kind: 0, tile: t,
        x0: t.x, y0: t.y, x1: t.x, y1: t.y,
        groundZ: t.z, passive: true,
      };
      items.push(it);
      boxed.push(it);
    }
    for (const pr of this.props || []) {
      // multi-tile items sort by their DEEPEST tile so no tile of their own
      // footprint draws over the art (portcullis spanning a two-tile bridge)
      const tiles = pr.ref && pr.ref.tiles;
      const xs = tiles && tiles.length ? tiles.map((t) => t.x) : [pr.x];
      const ys = tiles && tiles.length ? tiles.map((t) => t.y) : [pr.y];
      const depths = tiles && tiles.length ? tiles.map((t) => t.x + t.y) : [pr.x + pr.y];
      const it = {
        depth: Math.max(...depths),
        kind: 1, prop: pr,
        x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys),
        front: !!(pr.ref && pr.ref.front),
        lift: !!(pr.ref && pr.ref.lift), // tabletop item: draws above the furni it rests on
      };
      // flat floor-covering prop (rug/decal you stand on): top surface is the
      // floor itself, so it obeys the same above-the-feet occlusion rule
      if (pr.ref && pr.ref.walk) it.groundZ = this.room.heightAt(pr.x, pr.y);
      items.push(it);
      boxed.push(it);
    }
    relaxDrawDepths(boxed);
    items.sort((a, b) => a.depth - b.depth || a.kind - b.kind);

    for (const it of items) {
      if (it.kind === 0) this.drawTile(it.tile);
      else if (it.prop) this.drawProp(it.prop);
      else this.drawUnit(it.unit, it.p, now);
    }

    this.drawFx(now);

    ctx.restore();
  }

  drawFx(now) {
    const { ctx } = this;
    const zoom = this.room.zoom;
    for (const f of this.fx) {
      const t = (now - f.start) / f.dur;
      if (t < 0 || t > 1) continue; // scheduled for later / expiring this frame
      ctx.save();
      if (f.type === 'burst') {
        const c = this.p(f.x, f.y, f.z);
        const r = (6 + 22 * t) * zoom;
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = 3 * zoom;
        ctx.strokeStyle = f.color || '#ffd9a0';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y - 14 * zoom, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        // spokes
        ctx.lineWidth = 2 * zoom;
        for (let i = 0; i < 4; i++) {
          const a = (Math.PI / 2) * i + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(c.x + Math.cos(a) * r * 0.5, c.y - 14 * zoom + Math.sin(a) * r * 0.3);
          ctx.lineTo(c.x + Math.cos(a) * r, c.y - 14 * zoom + Math.sin(a) * r * 0.55);
          ctx.stroke();
        }
      } else if (f.type === 'float') {
        const c = this.p(f.x, f.y, f.z);
        ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        ctx.font = `bold ${13 * zoom}px Tahoma`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const y = c.y - 44 * zoom - 26 * zoom * t;
        ctx.lineWidth = 3 * zoom;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(f.text, c.x, y);
        ctx.fillStyle = f.color || '#fff';
        ctx.fillText(f.text, c.x, y);
      } else if (f.type === 'proj') {
        const a = this.p(f.from.x, f.from.y, f.from.z);
        const b = this.p(f.to.x, f.to.y, f.to.z);
        const x = a.x + (b.x - a.x) * t;
        const arc = -26 * zoom * 4 * t * (1 - t); // parabolic lob
        const y = a.y + (b.y - a.y) * t + arc - 22 * zoom; // chest height
        const sprite = f.sprite && f.sprite.ready && f.sprite.get('std', f.dir ?? 2);
        if (sprite) {
          // real directional projectile art (e.g. the Firing Arrow furni)
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(
            sprite.img, sprite.x, sprite.y, sprite.w, sprite.h,
            Math.round(x - sprite.ax * zoom), Math.round(y - sprite.ay * zoom),
            Math.round(sprite.w * zoom), Math.round(sprite.h * zoom)
          );
        } else {
          ctx.fillStyle = f.color || '#ffe9b0';
          ctx.shadowColor = f.color || '#ffe9b0';
          ctx.shadowBlur = 8 * zoom;
          ctx.beginPath();
          ctx.arc(x, y, 3.2 * zoom, 0, Math.PI * 2);
          ctx.fill();
          // short trail
          const tx = a.x + (b.x - a.x) * Math.max(0, t - 0.08);
          const ty = a.y + (b.y - a.y) * Math.max(0, t - 0.08) - 26 * zoom * 4 * (t - 0.08) * (1 - (t - 0.08)) - 22 * zoom;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.arc(tx, ty, 2 * zoom, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  p(fx, fy, fz) {
    return tileToScreen(fx, fy, fz, this.room.zoom);
  }

  drawTile(t) {
    if (t.stair && t.stair.corner) this.drawCornerStairTile(t);
    else if (t.stair) this.drawStairTile(t);
    else {
      const zoom = this.room.zoom;
      const { x, y, z } = t;
      const N = this.p(x - 0.5, y - 0.5, z);
      const E = this.p(x + 0.5, y - 0.5, z);
      const S = this.p(x + 0.5, y + 0.5, z);
      const W = this.p(x - 0.5, y + 0.5, z);
      const depth = z * Z_STEP * zoom + TILE_THICKNESS * zoom;
      this.poly([W, S, { x: S.x, y: S.y + depth }, { x: W.x, y: W.y + depth }], this.colors.sideSW);
      this.poly([E, S, { x: S.x, y: S.y + depth }, { x: E.x, y: E.y + depth }], this.colors.sideSE);
      if (!this.drawFloorArt(t, [N, E, S, W])) {
        const top = (x + y) % 2 ? this.colors.topB : this.colors.topA;
        this.poly([N, E, S, W], shade(top, z * 6), this.colors.line);
      }
    }
    this.drawTileOverlay(t);
    this.drawEffectMarker(t);
    if (this.overlays.objective.has(`${t.x},${t.y}`)) this.drawObjectiveMarker(t);
    if (this.hover && this.hover.x === t.x && this.hover.y === t.y) this.drawCursor(t, this.hoverColor(t));
  }

  // Skin a flat tile top with the kit's real furni floor art. 2x2 floor items
  // tile seamlessly on grid parity: each tile clips its own diamond and draws
  // the quadrant of the art belonging to its position (at its own height, so
  // plateaus skin correctly too). Returns false when no art is ready.
  drawFloorArt(t, diamond) {
    const sp = this.floorSprites;
    if (!sp || !sp.ready) return false;
    const fr = sp.get(0, 0, this.room.zoom < 1); // small rooms: authentic 32 art
    if (!fr) return false;
    // small art is authored at half scale: at zoom 0.5 it draws 1:1 (crisp)
    const zoom = fr.small ? this.room.zoom * 2 : this.room.zoom;
    const { x, y, z } = t;
    const gx = x - (((x % 2) + 2) % 2); // 2x2 group origin (parity-anchored)
    const gy = y - (((y % 2) + 2) % 2);
    const o = this.p(gx, gy, z);
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    diamond.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
      fr.img, fr.x, fr.y, fr.w, fr.h,
      Math.round(o.x - fr.ax * zoom), Math.round(o.y - fr.ay * zoom),
      fr.w * zoom, fr.h * zoom
    );
    ctx.restore();
    return true;
  }

  // Classic room walls along the far boundary (drawn behind everything):
  // the first floor tile of each row raises a west face, of each column a
  // north face. Interior pits never trigger walls.
  drawWalls() {
    const H = this.kit.walls.height || 3.2;
    const cN = this.colors.wallN || '#38343f';
    const cW = this.colors.wallW || '#4a4653';
    const trim = this.colors.wallTrim || '#241f28';
    // one uniform top line across the whole room — walls behind plateaus rise
    // from the plateau top to the same ceiling, no notches
    const top = Math.max(...this.drawList.map((t) => t.z)) + H;
    for (const t of this.drawList) {
      const { x, y, z } = t;
      if (this.colMinY.get(x) === y) {
        const A = this.p(x - 0.5, y - 0.5, top);
        const B = this.p(x + 0.5, y - 0.5, top);
        this.poly([A, B, this.p(x + 0.5, y - 0.5, z), this.p(x - 0.5, y - 0.5, z)], cN, trim);
      }
      if (this.rowMinX.get(y) === x) {
        const A = this.p(x - 0.5, y - 0.5, top);
        const B = this.p(x - 0.5, y + 0.5, top);
        this.poly([A, B, this.p(x - 0.5, y + 0.5, z), this.p(x - 0.5, y - 0.5, z)], cW, trim);
      }
    }
  }

  // Subtle inset diamond on live gimmick tiles so the player can read them
  // (hazard red, switch cyan, treasure gold). Spent effects stop drawing.
  drawEffectMarker(t) {
    const room = this.room;
    if (!room.effectAt) return;
    const fx = room.effectAt(t.x, t.y);
    if (!fx || fx.spent) return;
    const color = { hazard: 'rgba(224,106,58,0.55)', switch: 'rgba(143,215,224,0.7)', treasure: 'rgba(246,195,67,0.7)' }[fx.kind];
    if (!color) return;
    const { ctx } = this;
    const zoom = room.zoom;
    const { x, y, z } = t;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 560));
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.lineWidth = 2 * zoom;
    ctx.strokeStyle = color;
    ctx.beginPath();
    [this.p(x, y - 0.28, z), this.p(x + 0.28, y, z), this.p(x, y + 0.28, z), this.p(x - 0.28, y, z)].forEach(
      (pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))
    );
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // Persistent gold goal flag for reach/defend/escort objectives. Pulses so it
  // reads under the other translucent overlays.
  drawObjectiveMarker(t) {
    const zoom = this.room.zoom;
    const { x, y, z } = t;
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 480));
    this.poly(
      [
        this.p(x - 0.5, y - 0.5, z),
        this.p(x + 0.5, y - 0.5, z),
        this.p(x + 0.5, y + 0.5, z),
        this.p(x - 0.5, y + 0.5, z),
      ],
      `rgba(246,195,67,${0.16 + 0.14 * pulse})`
    );
    const { ctx } = this;
    ctx.save();
    ctx.lineWidth = 2.5 * zoom;
    ctx.strokeStyle = `rgba(255,214,92,${pulse})`;
    ctx.setLineDash([6 * zoom, 4 * zoom]);
    ctx.beginPath();
    [this.p(x - 0.4, y - 0.4, z), this.p(x + 0.4, y - 0.4, z), this.p(x + 0.4, y + 0.4, z), this.p(x - 0.4, y + 0.4, z)].forEach(
      (pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))
    );
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // Translucent fills for move range / attack targets / planned path.
  drawTileOverlay(t) {
    const k = `${t.x},${t.y}`;
    let color = null;
    if (this.overlays.target.has(k)) color = 'rgba(224,66,66,0.42)';
    else if (this.overlays.skill.has(k)) color = 'rgba(95,191,106,0.42)';
    else if (this.overlays.path.has(k)) color = 'rgba(246,195,67,0.5)';
    else if (this.overlays.move.has(k)) color = 'rgba(74,150,220,0.34)';
    if (!color) return;
    const { x, y, z } = t;
    this.poly(
      [
        this.p(x - 0.5, y - 0.5, z),
        this.p(x + 0.5, y - 0.5, z),
        this.p(x + 0.5, y + 0.5, z),
        this.p(x - 0.5, y + 0.5, z),
      ],
      color
    );
  }

  hoverColor(t) {
    const k = `${t.x},${t.y}`;
    if (this.overlays.target.has(k)) return 'rgba(255,120,120,0.95)';
    if (this.overlays.skill.has(k)) return 'rgba(130,240,150,0.95)';
    return 'rgba(255,255,255,0.95)';
  }

  drawStairTile(t) {
    const zoom = this.room.zoom;
    const { x, y, z, stair } = t;
    const STEPS = 4;
    const rise = 1 / STEPS;
    const q = (u, v, zz) => this.p(x - 0.5 + u, y - 0.5 + v, zz);
    const topBase = (x + y) % 2 ? this.colors.topB : this.colors.topA;
    for (let i = 0; i < STEPS; i++) {
      let u0 = 0;
      let u1 = 1;
      let v0 = 0;
      let v1 = 1;
      let zi;
      if (stair.axis === 'x') {
        u0 = i / STEPS;
        u1 = (i + 1) / STEPS;
        zi = stair.sign === 1 ? z - i * rise : z - (STEPS - 1 - i) * rise;
      } else {
        v0 = i / STEPS;
        v1 = (i + 1) / STEPS;
        zi = stair.sign === 1 ? z - i * rise : z - (STEPS - 1 - i) * rise;
      }
      const sliceDepth = zi * Z_STEP * zoom + TILE_THICKNESS * zoom;
      if (stair.axis === 'x' || v1 === 1) {
        const a = q(u0, 1, zi);
        const b = q(u1, 1, zi);
        this.poly([a, b, { x: b.x, y: b.y + sliceDepth }, { x: a.x, y: a.y + sliceDepth }], this.colors.sideSW);
      }
      if (stair.axis === 'y' || u1 === 1) {
        const a = q(1, v0, zi);
        const b = q(1, v1, zi);
        this.poly([a, b, { x: b.x, y: b.y + sliceDepth }, { x: a.x, y: a.y + sliceDepth }], this.colors.sideSE);
      }
      this.poly(
        [q(u0, v0, zi), q(u1, v0, zi), q(u1, v1, zi), q(u0, v1, zi)],
        shade(topBase, z * 6 - (i % 2) * 5),
        this.colors.line
      );
      if (stair.sign === 1) {
        const drop = rise * Z_STEP * zoom;
        const a = stair.axis === 'x' ? q(u1, v0, zi) : q(u0, v1, zi);
        const b = q(u1, v1, zi);
        this.poly(
          [a, b, { x: b.x, y: b.y + drop }, { x: a.x, y: a.y + drop }],
          stair.axis === 'x' ? this.colors.sideSE : this.colors.sideSW
        );
      }
    }
  }

  // Corner stairs: when a plateau corner descends on two perpendicular sides,
  // the steps wrap the corner as concentric L-shaped bands (matching the real
  // client's corner stair pieces) instead of two straight runs colliding.
  // sx/sy give the descent direction on each axis (+1 = toward +x / +y).
  drawCornerStairTile(t) {
    const zoom = this.room.zoom;
    const { x, y, z } = t;
    const { sx, sy } = t.stair.corner;
    const STEPS = 4;
    const rise = 1 / STEPS;
    const q = (u, v, zz) => this.p(x - 0.5 + u, y - 0.5 + v, zz);
    // band coords: uu/vv measure distance from the HIGH corner along each axis
    const U = (uu) => (sx > 0 ? uu : 1 - uu);
    const V = (vv) => (sy > 0 ? vv : 1 - vv);
    const topBase = (x + y) % 2 ? this.colors.topB : this.colors.topA;
    // paint far bands first so nearer (screen-lower) bands overdraw correctly
    const bands = [0, 1, 2, 3]
      .map((k) => {
        const m1 = (k + 1) / STEPS;
        const zk = z - k * rise;
        return { k, m0: k / STEPS, m1, zk, far: q(U(m1), V(m1), zk).y };
      })
      .sort((a, b) => a.far - b.far);
    for (const { k, m0, m1, zk } of bands) {
      const depth = zk * Z_STEP * zoom + TILE_THICKNESS * zoom;
      const drop = (pt) => ({ x: pt.x, y: pt.y + depth });
      // riser faces. Toward the descent (+ sign) they sit at the band's outer
      // rim; on the high side the map edge shows the stepped profile instead.
      {
        const a = sx > 0 ? q(U(m1), V(0), zk) : q(1, V(m0), zk);
        const b = sx > 0 ? q(U(m1), V(m1), zk) : q(1, V(m1), zk);
        this.poly([a, b, drop(b), drop(a)], this.colors.sideSE);
      }
      {
        const a = sy > 0 ? q(U(0), V(m1), zk) : q(U(m0), 1, zk);
        const b = sy > 0 ? q(U(m1), V(m1), zk) : q(U(m1), 1, zk);
        this.poly([a, b, drop(b), drop(a)], this.colors.sideSW);
      }
      // the L-shaped band top (band 0 degenerates to the corner square)
      const pts = [
        q(U(m0), V(0), zk),
        q(U(m1), V(0), zk),
        q(U(m1), V(m1), zk),
        q(U(0), V(m1), zk),
        q(U(0), V(m0), zk),
        q(U(m0), V(m0), zk),
      ];
      this.poly(pts, shade(topBase, z * 6 - (k % 2) * 5), this.colors.line);
    }
  }

  drawCursor(t, stroke = 'rgba(255,255,255,0.95)') {
    const zoom = this.room.zoom;
    const { x, y, z } = t;
    const inset = 0.08;
    const pts = [
      this.p(x - 0.5 + inset, y - 0.5 + inset, z),
      this.p(x + 0.5 - inset, y - 0.5 + inset, z),
      this.p(x + 0.5 - inset, y + 0.5 - inset, z),
      this.p(x - 0.5 + inset, y + 0.5 - inset, z),
    ];
    const { ctx } = this;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.lineWidth = 5 * zoom;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();
    ctx.lineWidth = 3 * zoom;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
  }

  drawUnit(unit, ap, now) {
    const { ctx } = this;
    const zoom = this.room.zoom;
    const c = this.p(ap.x, ap.y, ap.z);

    // selection ring on the tile under the unit
    if (unit.selected) {
      this.drawCursor({ x: Math.round(ap.x), y: Math.round(ap.y), z: Math.round(ap.z) }, '#f6c343');
    }

    ctx.save();
    // death: hold the 'ded' pose for a beat, then fade the corpse out
    if (unit.dying != null) ctx.globalAlpha = Math.max(0, 1 - Math.max(0, unit.dying - 0.45) / 0.55);
    else if (unit.done) ctx.globalAlpha = 0.65; // dim units that have acted
    if (unit.ghost) ctx.globalAlpha *= unit.ghost; // spectral enemies (dungeon data)

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, (TILE_W / 2) * 0.42 * zoom, (TILE_H / 2) * 0.42 * zoom, 0, 0, Math.PI * 2);
    ctx.fill();

    // dead units show their corpse art; the raw 125ms tick drives every rig
    const act = unit.alive ? unit.action() : 'ded';
    const tick = unit.alive ? unit.frame(now) : Math.floor((now - unit.dyingStart) / WALK_FRAME_MS);
    // seated: lift the pose by the furni's sit height (the client's chair offset)
    const sitLift = act === 'sit' && unit.seat ? unit.seat.sit * Z_STEP * zoom : 0;
    const sp = unit.sprites;
    const fr = sp && sp.ready && sp.get(act, unit.dir, tick, zoom < 1); // small rooms: baked half-scale art
    if (fr && fr.img) {
      // packed monster frame: (ax, ay) anchors the frame to the tile centre.
      // baked half-scale twins draw at zoom*2 so their pre-halved rect lands
      // pixel-crisp 1:1 at zoom 0.5 (no nearest-neighbor blur)
      const fz = fr.small ? zoom * 2 : zoom;
      ctx.drawImage(
        fr.img, fr.x, fr.y, fr.w, fr.h,
        Math.round(c.x - fr.ax * fz),
        Math.round(c.y - (fr.ay - fr.foot) * fz - sitLift),
        fr.w * fz, fr.h * fz
      );
    } else if (fr) {
      // habbo-imaging avatar PNG (leader + humanoid enemies)
      const pad = AVATAR_FOOT_PAD[sp.size] || 0;
      ctx.drawImage(fr, Math.round(c.x - fr.width / 2), Math.round(c.y - fr.height + pad - sitLift));
    } else {
      this.drawToken(unit, c, zoom, act, tick, sitLift);
    }
    // Three-pass seat rendering: the seat's front cutout (armrests, throne
    // fronts, away-facing backrests — the layers the furni's visualization
    // XML authors above the sitter) redraws over the avatar, recreating the
    // client's layered z-order that the flattened base sheet loses.
    if (act === 'sit' && unit.seat) {
      const seatGp = (this.props || []).find((q) => q.ref === unit.seat);
      const ff = seatGp && seatGp.sprites && seatGp.sprites.ready && seatGp.sprites.front(seatGp.dir);
      if (ff) {
        const sc = this.p(seatGp.x, seatGp.y, this.room.heightAt(seatGp.x, seatGp.y));
        ctx.drawImage(
          ff.img, ff.x, ff.y, ff.w, ff.h,
          Math.round(sc.x - ff.ax * zoom),
          Math.round(sc.y - ff.ay * zoom),
          ff.w * zoom, ff.h * zoom
        );
      }
    }
    ctx.restore();

    if (unit.alive && unit.stats) this.drawHpBar(unit, c, zoom);
  }

  // A furni prop on its tile: authentic drop shadow first, then the item,
  // both anchored to the tile centre like monster frames.
  drawProp(pr) {
    const { ctx } = this;
    const sp = pr.sprites;
    if (!sp || !sp.ready) return;
    const small = this.room.zoom < 1; // prefer authentic size-32 art
    const ref = pr.ref || pr;
    if (ref.editHide) return; // mover over an invalid tile: small pic shows at the cursor instead
    let main;
    if (ref.open) {
      // opened gate: play the authentic rise transition once (125ms/tick),
      // then hold the open pose. Items without open art simply vanish.
      if (!sp.hasOpenState) return;
      if (!ref.openedAt) ref.openedAt = performance.now();
      const tick = Math.floor((performance.now() - ref.openedAt) / 125);
      main =
        tick < sp.transitionLen
          ? sp.transition(pr.dir, tick) || sp.get(pr.dir, 1, small)
          : sp.get(pr.dir, 1, small);
    } else {
      // ambient loop (torch flames, bonfires) on the authentic 125ms tick
      main =
        (sp.animTicks && sp.animFrame(pr.dir, Math.floor(performance.now() / 125), small)) ||
        sp.get(pr.dir, 0, small);
    }
    if (!main) return;
    // `lift` raises a prop off the floor by N tile-heights so tabletop items
    // (a platter on a table, a mug on the bar) sit on the surface instead of
    // clipping to the ground. Same unit as a chair's `sit`.
    const lift = ref.lift || 0;
    const c = this.p(pr.x, pr.y, this.room.heightAt(pr.x, pr.y) + lift);
    ctx.save();
    if (ref.editGhost) ctx.globalAlpha = 0.55; // room-editor move preview
    // hit wobble (training dummies): a decaying rock around the base anchor
    if (ref.hitAt) {
      const el = performance.now() - ref.hitAt;
      if (el >= 0 && el < 500) {
        const t = el / 500;
        ctx.translate(c.x, c.y);
        ctx.rotate(Math.sin(t * Math.PI * 4) * 0.14 * (1 - t));
        ctx.translate(-c.x, -c.y);
      } else if (el >= 500) {
        delete ref.hitAt;
      }
    }
    for (const fr of [sp.shadow(pr.dir, small), main]) {
      if (!fr) continue;
      // small (size-32) frames are authored at half scale — at zoom 0.5 they
      // draw 1:1, pixel-crisp; 64 frames keep scaling by the room zoom
      const zoom = fr.small ? this.room.zoom * 2 : this.room.zoom;
      ctx.drawImage(
        fr.img, fr.x, fr.y, fr.w, fr.h,
        Math.round(c.x - fr.ax * zoom),
        Math.round(c.y - fr.ay * zoom),
        fr.w * zoom, fr.h * zoom
      );
    }
    ctx.restore();
  }

  // Fallback avatar for anyone whose own art isn't up yet (or never will be:
  // offline, dead proxy, a remote member with no figure). It is the default
  // Habbo — baked local frames drawn exactly like a live habbo-imaging PNG:
  // centred on the tile, bottom edge lifted by the foot pad, 1:1 pixels (the
  // 's' sheet in half-scale rooms) so it never blurs or scales off-grid.
  drawToken(unit, c, zoom, act = 'std', tick = 0, sitLift = 0) {
    const size = zoom < 1 ? 's' : 'm';
    const tint = unit.team === 'enemy' ? ENEMY_TINT : null;
    const fr = defaultAvatar.get(act, unit.dir, tick, size, tint);
    if (!fr || !fr.img) return; // sheets still loading — the shadow holds the tile
    const pad = AVATAR_FOOT_PAD[size] || 0;
    this.ctx.drawImage(
      fr.img, fr.x, fr.y, fr.w, fr.h,
      Math.round(c.x - fr.w / 2),
      Math.round(c.y - fr.h + pad - sitLift),
      fr.w, fr.h
    );
  }

  drawHpBar(unit, c, zoom) {
    const { ctx } = this;
    const s = zoom;
    const w = 26 * s;
    const h = 4 * s;
    const top = c.y - 46 * s;
    const frac = Math.max(0, unit.stats.hp / unit.stats.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(c.x - w / 2 - 1, top - 1, w + 2, h + 2);
    // Team colours mean "me vs the monsters", which is wrong for a DUEL: both
    // fighters are people, and a spectator watching from the sidelines has no
    // side at all. Colour those by health instead — same reasoning as the
    // roster bars in js/battleController.js (hpTint).
    ctx.fillStyle = unit.duellist
      ? (frac > 0.5 ? '#57c060' : frac > 0.25 ? '#d98b0b' : '#d0453a')
      : (unit.team === 'enemy' ? '#d0453a' : '#57c060');
    ctx.fillRect(c.x - w / 2, top, w * frac, h);
    if (unit.selected || unit.team === 'player' || unit.duellist) {
      ctx.fillStyle = '#e8e0d0';
      ctx.font = `${8 * s}px Tahoma`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      // A duellist watched from the sidelines already carries a DOM name tag
      // (RemotePlayers), so repeating the name here just stacks two labels on
      // one head. Show the number only — the tag says who, this says how hurt.
      const label = unit.duellist ? `${unit.stats.hp}` : `${unit.name} · ${unit.stats.hp}`;
      ctx.fillText(label, c.x, top - 2 * s);
    }
  }

  poly(pts, fill, stroke) {
    const { ctx } = this;
    ctx.beginPath();
    pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}
