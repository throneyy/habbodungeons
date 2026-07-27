import { DEFAULT_FIGURE } from './config.js';

// The fallback avatar: the DEFAULT HABBO LOOK, baked locally.
//
// Anything the renderer can't draw from its own art — a player whose
// habbo-imaging sprites are still in flight, a remote member who arrived with
// no figure, an enemy whose sheet failed offline — used to fall back to a drawn
// "token" (a rounded chip with the class initial). That reads as a generic app
// placeholder, not as Habbo. This module replaces it with the real thing: the
// classic black-hair / mustard-shirt / blue-jeans newbie figure (js/config.js
// DEFAULT_FIGURE), pre-rendered by tools/bake-default-avatar.mjs into
// public/assets/avatar/default/ so it works offline — which is exactly when the
// fallback is needed.
//
// Frames are untrimmed habbo-imaging canvases in a uniform grid (columns =
// the 8 directions, rows = std, sit, wlk0-3), one sheet per imaging size, so
// callers anchor them exactly like a live imaging PNG: centred on the tile,
// bottom edge lifted by AVATAR_FOOT_PAD.
const BASE = '/assets/avatar/default';

// engine action -> baked pose. Combat poses (atk/bow) and the corpse pose have
// no baked art; standing is the honest stand-in for all of them.
const ACTION_MAP = { std: 'std', sit: 'sit', wlk: 'wlk' };

class DefaultAvatar {
  constructor() {
    this.figure = DEFAULT_FIGURE;
    this.ready = false;
    this.data = null;
    this.sheets = new Map(); // size -> HTMLImageElement
    this.tinted = new Map(); // `${size}|${tint}` -> canvas
    this.loading = null;
  }

  // Idempotent: every caller shares the one fetch. Failure leaves ready=false
  // and get() returns null, so callers must still tolerate a missing frame.
  load() {
    if (this.loading) return this.loading;
    this.loading = fetch(`${BASE}/data.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`no default-avatar data (${r.status})`);
        return r.json();
      })
      .then((data) =>
        Promise.all(
          Object.entries(data.sizes).map(
            ([size, spec]) =>
              new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve([size, img]);
                img.onerror = () => reject(new Error(`default-avatar sheet ${spec.file} failed`));
                img.src = `${BASE}/${spec.file}`;
              })
          )
        ).then((pairs) => {
          for (const [size, img] of pairs) this.sheets.set(size, img);
          // The sheet is baked from a figure string; if config's has moved on
          // since, every fallback silently shows the OLD outfit. Say so.
          if (data.figure !== DEFAULT_FIGURE) {
            console.warn(
              `[habbo-dungeons] baked fallback avatar is "${data.figure}" but DEFAULT_FIGURE is ` +
              `"${DEFAULT_FIGURE}" - re-run tools/bake-default-avatar.mjs.`
            );
          }
          this.data = data;
          this.ready = true;
          return this;
        })
      )
      .catch((err) => {
        console.warn('[habbo-dungeons] default fallback avatar failed to load:', err.message);
        return this;
      });
    return this.loading;
  }

  // Returns a frame descriptor { img, x, y, w, h, pad } or null while loading.
  // `size` is an imaging size ('m' normal rooms, 's' the half-scale zoom) —
  // frames draw 1:1 at their own size, never scaled, so they stay pixel-crisp.
  // `tint` (a CSS colour, multiplied over the art) marks a fallback that isn't
  // a player: enemies keep their team read instead of turning into a crowd of
  // identical newbies.
  get(action, dir, frame = 0, size = 'm', tint = null) {
    if (!this.ready) return null;
    const spec = this.data.sizes[size] || this.data.sizes.m;
    const act = this.data.actions[ACTION_MAP[action] || 'std'] || this.data.actions.std;
    const d = ((Math.round(dir) % 8) + 8) % 8;
    const f = act.frames > 1 ? ((frame % act.frames) + act.frames) % act.frames : 0;
    return {
      img: tint ? this.tintedSheet(size, tint) : this.sheets.get(size),
      x: d * spec.w,
      y: (act.row + f) * spec.h,
      w: spec.w,
      h: spec.h,
    };
  }

  // Multiply tint baked once per (size, colour) — the client's own recolour
  // trick: shading survives, the hue doesn't.
  tintedSheet(size, tint) {
    const key = `${size}|${tint}`;
    const hit = this.tinted.get(key);
    if (hit) return hit;
    const img = this.sheets.get(size);
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = tint;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, 0, 0);
    this.tinted.set(key, c);
    return c;
  }
}

// One shared instance: the sheets are the same bytes for every caller.
export const defaultAvatar = new DefaultAvatar();
