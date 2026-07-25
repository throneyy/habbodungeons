// Furni prop sprite sets extracted from real Habbo furni SWFs by
// tools/extract-furni.js (assets/props/{id}/sheet.png + data.json).
// Props are static: one composed view per direction the item defines,
// plus the item's authentic drop shadow when it ships one.
const BASE = '/assets/props';

// Public-room-scale (zoom 0.5) crisp small furni, on demand. Battle rooms and
// the square render at zoom 1 (the 64 art); the Mirkwood and any future
// large room render at 0.5, where drawImage would nearest-neighbor the 64
// frame down to half size and read as blur. The build pipeline bakes
// authentic size-32 art into `s32_…`/`s_…` frames when the SWF ships it —
// but so the LARGE-ROOM BUILD never depends on a prop having been
// re-extracted, this bakes a smoothed half-scale twin of ANY 64 frame the
// first time it's needed and caches it. Result: every furni/pet/floor auto-
// downsizes crisply in a big room, no manual step. Keyed by sheet position so
// each distinct frame bakes exactly once per sprite set.
export function bakeHalf(sheet, rect, cache) {
  const key = `${rect.x},${rect.y}`;
  let f = cache.get(key);
  if (f) return f;
  const w = Math.max(1, Math.ceil(rect.w / 2));
  const h = Math.max(1, Math.ceil(rect.h / 2));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = true; // bilinear downscale, not the room's nearest-neighbor
  g.imageSmoothingQuality = 'high';
  g.drawImage(sheet, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
  f = { img: cv, x: 0, y: 0, w, h, ax: rect.ax / 2, ay: rect.ay / 2, small: true };
  cache.set(key, f);
  return f;
}

export class PropSprites {
  constructor(id) {
    this.id = id;
    this.ready = false;
    this.data = null;
    this.sheet = null;
    this._small = new Map(); // lazy half-scale bakes for zoom-0.5 rooms
  }

  load() {
    const dataReq = fetch(`${BASE}/${this.id}/data.json`).then((r) => {
      if (!r.ok) throw new Error(`no prop data for ${this.id}`);
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
        this.sheet = img;
        this.ready = true;
        return this;
      })
      .catch(() => this); // stays not-ready -> renderer draws nothing
  }

  // main view for a direction (falls back to the item's first defined one).
  // state 1 = the item's open pose (gates/doors), when the extraction has it.
  // `small` (zoom-0.5 rooms) = draw crisp half-scale art: authentic baked
  // size-32 art when the SWF shipped it, else a lazy smoothed half-bake of
  // the 64 frame. Either way the frame carries small:true so the renderer
  // draws it 1:1 instead of nearest-neighbor downscaling (which blurs).
  get(dir = 0, state = 0, small = false) {
    if (!this.ready) return null;
    const f = this.data.frames;
    const d0 = this.data.dirs[0];
    if (small) {
      const s =
        (state === 1 && (f[`s32_s1_d${dir}`] || f[`s32_s1_d${d0}`])) || f[`s32_d${dir}`] || f[`s32_d${d0}`];
      if (s) return { img: this.sheet, ...s, small: true };
    }
    const rect =
      (state === 1 && (f[`s1_d${dir}`] || f[`s1_d${d0}`])) || f[`d${dir}`] || f[`d${d0}`];
    if (!rect) return null;
    return small ? bakeHalf(this.sheet, rect, this._small) : { img: this.sheet, ...rect };
  }

  // how many 125ms ticks the open-transition runs (0 = none extracted)
  get transitionLen() {
    return (this.ready && this.data.transition) || 0;
  }

  // one tick of the play-once open transition (state 100 in the client)
  transition(dir = 0, tick = 0) {
    if (!this.ready) return null;
    const f = this.data.frames;
    const rect = f[`t${tick}_d${dir}`] || f[`t${tick}_d${this.data.dirs[0]}`];
    return rect ? { img: this.sheet, ...rect } : null;
  }

  // does this item ship a distinct open pose?
  get hasOpenState() {
    return !!(this.ready && this.data.states && this.data.states.includes(1));
  }

  // ambient loop (flames, wisps): total ticks of the resting animation
  get animTicks() {
    return (this.ready && this.data.anim && this.data.anim.ticks) || 0;
  }

  // one tick of the ambient loop (125ms ticks, wraps forever). The map deduped
  // held frames at extraction, so consecutive ticks may share a frame.
  animFrame(dir = 0, tick = 0, small = false) {
    if (!this.animTicks) return null;
    const u = this.data.anim.map[tick % this.data.anim.map.length];
    const f = this.data.frames;
    const d0 = this.data.dirs[0];
    if (small) {
      const s = f[`s32_a${u}_d${dir}`] || f[`s32_a${u}_d${d0}`];
      if (s) return { img: this.sheet, ...s, small: true };
    }
    const rect = f[`a${u}_d${dir}`] || f[`a${u}_d${d0}`];
    if (!rect) return null;
    return small ? bakeHalf(this.sheet, rect, this._small) : { img: this.sheet, ...rect };
  }

  shadow(dir = 0, small = false) {
    if (!this.ready) return null;
    const f = this.data.frames;
    const d0 = this.data.dirs[0];
    if (small) {
      const s = f[`s32_sd${dir}`] || f[`s32_sd${d0}`];
      if (s) return { img: this.sheet, ...s, small: true };
    }
    const rect = f[`sd${dir}`] || f[`sd${d0}`];
    if (!rect) return null;
    return small ? bakeHalf(this.sheet, rect, this._small) : { img: this.sheet, ...rect };
  }

  // Seat front cutout: only the layers the furni's visualization XML authors
  // ABOVE a seated avatar (explicit z ≥ 100 — armrests, throne fronts,
  // away-facing backrests). Null when this item/direction has none.
  front(dir = 0) {
    if (!this.ready || !this.data.front) return null;
    const rect = this.data.frames[`f_d${dir}`];
    return rect ? { img: this.sheet, ...rect } : null;
  }
}

// The render passes for a unit seated on a prop with the given sprite set:
// seats whose art includes above-the-sitter layers draw base → avatar →
// front cutout (three-pass); flat seats (stools) stay two-pass.
export function sitRenderPasses(sp, dir) {
  return sp && sp.ready && sp.front(dir) ? ['base', 'avatar', 'front'] : ['base', 'avatar'];
}

const cache = new Map();
export function propSprites(id) {
  if (!cache.has(id)) {
    const ps = new PropSprites(id);
    ps.load();
    cache.set(id, ps);
  }
  return cache.get(id);
}
