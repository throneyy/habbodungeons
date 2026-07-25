// Shared habbowheel sprite-art helpers used by both the daily-rewards popup
// (js/dailyRewardOverlay.js) and the always-visible dock (js/dailyRewardDock.js).
//
// The wheel is the extracted 2007 furni (assets/ui/wheel/{sheet.png,data.json}):
// a rotating pointer + rim light-chase, drawn frame-by-frame on a canvas like
// the old Flash client (the disc is isometric, so it is NOT a CSS rotation).
// Assets load once and are shared across every consumer.
const TICK_MS = 125; // the original client's animation cadence
const ASSET_BASE = 'assets/ui/wheel';

let sheet = null; // shared HTMLImageElement
let data = null; // frame rects + anim clips + landed poses
let loading = null; // in-flight load promise (load once)

// Load the sheet + frame data once; subsequent calls await the same promise.
export async function ensureWheelAssets() {
  if (data && sheet) return;
  if (!loading) {
    loading = (async () => {
      const d = await (await fetch(`${ASSET_BASE}/data.json`)).json();
      const img = new Image();
      img.src = `${ASSET_BASE}/sheet.png`;
      await img.decode();
      data = d;
      sheet = img;
    })();
  }
  await loading;
}

// The loaded frame data (frames / anims / poses). Null until ensureWheelAssets().
export function wheelData() {
  return data;
}

// Draw one sheet frame onto a canvas, centred on its bounding box (NOT the
// sprite's logical anchor, which sits high and would clip the wheel). Native
// 1x — no upscaling, so the pixel art stays crisp.
export function drawWheelFrame(key, cv) {
  if (!data || !sheet) return;
  const fr = data.frames[key];
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  if (!fr) return;
  g.imageSmoothingEnabled = false;
  const dx = Math.round((cv.width - fr.w) / 2);
  const dy = Math.round((cv.height - fr.h) / 2);
  g.drawImage(sheet, fr.x, fr.y, fr.w, fr.h, dx, dy, fr.w, fr.h);
}

// Play a named clip (spin/lights/win) for a direction on a canvas.
// Returns a stop fn. loop:false fires onEnd after the last frame.
export function playWheelClip(clip, dir, cv, { loop = true, onEnd } = {}) {
  if (!data) return () => {};
  const map = data.anims[clip][dir].map;
  let t = 0;
  let stopped = false;
  (function step() {
    if (stopped) return;
    drawWheelFrame(map[t % map.length], cv);
    t++;
    if (!loop && t >= map.length) {
      onEnd && onEnd();
      return;
    }
    setTimeout(() => requestAnimationFrame(step), TICK_MS);
  })();
  return () => {
    stopped = true;
  };
}
