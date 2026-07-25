import { IMAGING_URL, WALK_FRAMES } from './config.js';

// A full sprite set for one figure, rendered live by the official
// habbo-imaging endpoint (exactly how the avatar fan sites do it):
// 8 directions of standing + sitting, 8 dirs x 4 frames of walking, and the
// sword-carry pose (crr=241, the imaging catalogue's longsword hand-item) —
// the training-dummy attack alternates it with standing for a strike cycle.
// size 'm' is the normal guest-room avatar, 's' the half-scale public-room one.
const SWORD_ITEM = 241; // habbo-imaging hand-item id: longsword
export class AvatarSprites {
  constructor(figure, size = 'm') {
    this.figure = figure;
    this.size = size;
    this.map = new Map();
    this.ready = false;
  }

  spriteUrl(action, dir, frame) {
    const p = new URLSearchParams({
      figure: this.figure,
      action,
      direction: String(dir),
      head_direction: String(dir),
      frame: String(frame),
      size: this.size,
      img_format: 'png',
    });
    return `${IMAGING_URL}?${p.toString()}`;
  }

  load() {
    const jobs = [];
    for (let d = 0; d < 8; d++) {
      jobs.push(this.loadOne('std', d, 0));
      jobs.push(this.loadOne('sit', d, 0)); // chairs (Free Roam seats)
      jobs.push(this.loadOne(`crr=${SWORD_ITEM}`, d, 0)); // sword strike (melee attacks)
      jobs.push(this.loadOne('crr', d, 0)); // empty-hand reach (archery draw)
      for (let f = 0; f < WALK_FRAMES; f++) jobs.push(this.loadOne('wlk', d, f));
    }
    return Promise.all(jobs).then(() => {
      this.ready = true;
      return this;
    });
  }

  loadOne(action, dir, frame) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.map.set(`${action}_${dir}_${frame}`, img);
        resolve(true);
      };
      img.onerror = () => resolve(false); // offline → renderer falls back to a placeholder
      img.src = this.spriteUrl(action, dir, frame);
    });
  }

  get(action, dir, frame = 0) {
    // 'atk' is a synthetic 2-tick strike: sword raised (crr=241) / arm
    // down (std). 'bow' holds the empty-hand reach — the archery draw (no
    // bow hand-item exists in habbo-imaging, so no weapon art can fit).
    // Other callers pass the raw 125ms tick; walk is 4.
    if (action === 'atk') {
      const pose = frame % 2 === 0 ? `crr=${SWORD_ITEM}_${dir}_0` : `std_${dir}_0`;
      return this.map.get(pose) || this.map.get(`std_${dir}_0`) || null;
    }
    if (action === 'bow') {
      return this.map.get(`crr_${dir}_0`) || this.map.get(`std_${dir}_0`) || null;
    }
    const f = frame % WALK_FRAMES;
    return this.map.get(`${action}_${dir}_${f}`) || this.map.get(`std_${dir}_0`) || null;
  }
}

// Per-figure sprite cache shared across rooms and sessions — walking into a
// room full of players (or bots) you've seen before costs zero imaging
// requests. Shared by remotePlayers.js and roomBots.js; entries are returned
// while still loading (the renderer falls back until `ready`).
const spriteCache = new Map(); // `${figure}|${size}` -> AvatarSprites
export function avatarSpritesFor(figure, size = 'm') {
  const key = `${figure}|${size}`;
  if (!spriteCache.has(key)) {
    const sp = new AvatarSprites(figure, size);
    sp.load();
    spriteCache.set(key, sp);
  }
  return spriteCache.get(key);
}
