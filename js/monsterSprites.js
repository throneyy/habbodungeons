import { AvatarSprites } from './sprites.js';
import { bakeHalf } from './props.js';

// Monster sprite sets extracted from real Habbo pet SWFs by tools/extract-pets.js
// (assets/monsters/{id}/sheet.png + data.json). Mirrors the AvatarSprites
// contract the renderer expects — .ready and .get(action, dir, frame) — but
// returns packed-sheet frame descriptors {img, x, y, w, h, ax, ay} where
// (ax, ay) anchors the frame to the tile centre.
//
// Theming is data: an optional CSS-colour tint (multiplied over the sheet,
// like the client's recolours) comes from the dungeon's enemy specs.
const BASE = '/assets/monsters'; // absolute — the viewer page lives under /tools/

// engine action -> extracted pet posture
const ACTION_MAP = { std: 'std', wlk: 'mv', ded: 'ded' };

export class MonsterSprites {
  constructor(id, opts = {}) {
    this.id = id;
    this.tint = opts.tint || null; // multiply — shades light art (gray cat)
    this.recolor = opts.recolor || null; // hue/sat swap, keeps shading — re-hues bold art (a recolored dragon)
    this.ready = false;
    this.data = null;
    this.sheet = null;
    this._small = new Map(); // lazy half-scale bakes for zoom-0.5 rooms
  }

  load() {
    const dataReq = fetch(`${BASE}/${this.id}/data.json`).then((r) => {
      if (!r.ok) throw new Error(`no monster data for ${this.id}`);
      return r.json();
    });
    const imgReq = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `${BASE}/${this.id}/sheet.png`;
    });
    return Promise.all([dataReq, imgReq])
      .then(([data, img]) => {
        this.data = data;
        if (this.recolor) this.sheet = tintSheet(img, this.recolor, 'color');
        else if (this.tint) this.sheet = tintSheet(img, this.tint, 'multiply');
        else this.sheet = img;
        this.ready = true;
        return this;
      })
      .catch(() => this); // stays not-ready -> renderer keeps the class token
  }

  // frame is the raw 125ms tick index (unbounded); each action's own length
  // and frameRepeat decide the cycle. 'ded' plays once and holds.
  // `small` (zoom-0.5 rooms) = draw crisp half-scale art: the build-baked
  // 's_…' twin when present, else a lazy smoothed half-bake of the 64 frame.
  // Marked small:true (anchor + foot pre-halved) so it draws 1:1, not blurred.
  get(action, dir, frame = 0, small = false) {
    if (!this.ready) return null;
    let act = ACTION_MAP[action] || 'std';
    if (!this.data.actions[act]) act = 'std';
    const spec = this.data.actions[act];
    if (!spec) return null;
    let idx = Math.floor(frame / (spec.repeat || 1));
    idx = act === 'ded' ? Math.min(idx, spec.frames - 1) : idx % spec.frames;
    const f = this.data.frames;
    const foot = this.data.foot || 0;
    if (small) {
      const s =
        f[`s_${act}_${dir}_${idx}`] || f[`s_${act}_${dir}_0`] || f[`s_${act}_2_${idx}`] || f[`s_${act}_2_0`];
      if (s) return { img: this.sheet, ...s, foot: foot / 2, small: true };
    }
    const rect =
      f[`${act}_${dir}_${idx}`] || f[`${act}_${dir}_0`] || f[`${act}_2_${idx}`] || f[`${act}_2_0`];
    if (!rect) return null;
    if (small) return { ...bakeHalf(this.sheet, rect, this._small), foot: foot / 2 };
    return { img: this.sheet, ...rect, foot };
  }
}

// Tint a sheet while keeping its alpha. 'multiply' darkens/shades light art;
// 'color' adopts the fill's hue+saturation but keeps the art's luminance —
// a full recolour (red dragon -> blue dragon) like the client's palettes.
function tintSheet(img, tint, mode) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = mode;
  g.fillStyle = tint;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(img, 0, 0);
  return c;
}

// ---- furni monsters ---------------------------------------------------------
// Creature/statue furni from assets/props (the wiki line importer) cast as
// foes. The art is static: no walk cycle (they glide between tiles) and no
// corpse pose (the engine's dying fade retires them). Furni ship 1-4 of the
// 8 engine directions, so a unit's facing snaps to the nearest available view.
const PROP_BASE = '/assets/props';

// nearest available direction by circular distance; ties keep list order
export function nearestDir(avail, dir) {
  let best = null;
  let bd = Infinity;
  for (const a of avail) {
    const d = Math.min((a - dir + 8) % 8, (dir - a + 8) % 8);
    if (d < bd) {
      bd = d;
      best = a;
    }
  }
  return best;
}

export class FurniSprites {
  constructor(id, opts = {}) {
    this.id = id;
    this.kind = 'furni'; // distinguishes from pet rigs for tools (manual)
    this.tint = opts.tint || null;
    this.recolor = opts.recolor || null;
    this.foot = opts.foot || 0; // per-look nudge if an item sits off its tile
    this.ready = false;
    this.data = null;
    this.sheet = null;
    this._small = new Map(); // lazy half-scale bakes for zoom-0.5 rooms
  }

  load() {
    const dataReq = fetch(`${PROP_BASE}/${this.id}/data.json`).then((r) => {
      if (!r.ok) throw new Error(`no prop data for ${this.id}`);
      return r.json();
    });
    const imgReq = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `${PROP_BASE}/${this.id}/sheet.png`;
    });
    return Promise.all([dataReq, imgReq])
      .then(([data, img]) => {
        this.data = data;
        if (this.recolor) this.sheet = tintSheet(img, this.recolor, 'color');
        else if (this.tint) this.sheet = tintSheet(img, this.tint, 'multiply');
        else this.sheet = img;
        this.ready = true;
        return this;
      })
      .catch(() => this); // stays not-ready -> renderer keeps the class token
  }

  // every action shows the composed view (std/wlk/ded alike — statues don't
  // walk). `_frame` is ignored (static art); `small` (zoom-0.5 rooms) draws
  // crisp half-scale: authentic size-32 art if baked, else a lazy half-bake.
  get(action, dir, _frame = 0, small = false) {
    if (!this.ready) return null;
    const d = nearestDir(this.data.dirs, dir);
    if (d == null) return null;
    if (small) {
      const s = this.data.frames[`s32_d${d}`];
      if (s) return { img: this.sheet, ...s, foot: this.foot / 2, small: true };
    }
    const rect = this.data.frames[`d${d}`];
    if (!rect) return null;
    if (small) return { ...bakeHalf(this.sheet, rect, this._small), foot: this.foot / 2 };
    return { img: this.sheet, ...rect, foot: this.foot };
  }
}

// ---- registries (sprite sets load once, shared across battles) -------------

const monsterCache = new Map();
export function monsterSprites(id, opts = {}) {
  const key = `${id}|${opts.tint || ''}|${opts.recolor || ''}`;
  if (!monsterCache.has(key)) {
    const ms = new MonsterSprites(id, opts);
    ms.load();
    monsterCache.set(key, ms);
  }
  return monsterCache.get(key);
}

const furniCache = new Map();
export function furniSprites(id, opts = {}) {
  const key = `${id}|${opts.tint || ''}|${opts.recolor || ''}|${opts.foot || 0}`;
  if (!furniCache.has(key)) {
    const fs = new FurniSprites(id, opts);
    fs.load();
    furniCache.set(key, fs);
  }
  return furniCache.get(key);
}

// Humanoid enemies are real Habbo avatars (habbo-imaging), same as the leader.
const figureCache = new Map();
export function figureSprites(figure, size = 'm') {
  const key = `${figure}|${size}`;
  if (!figureCache.has(key)) {
    const sp = new AvatarSprites(figure, size);
    // fire-and-forget; outside a browser (tests) Image is missing — stay not-ready
    Promise.resolve()
      .then(() => sp.load())
      .catch(() => {});
    figureCache.set(key, sp);
  }
  return figureCache.get(key);
}
