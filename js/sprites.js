import { IMAGING_URL, WALK_FRAMES, DEFAULT_FIGURE } from './config.js';
import { weaponFor } from './classWeapons.js';

// A full sprite set for one figure, rendered live by the official
// habbo-imaging endpoint (exactly how the avatar fan sites do it):
// 8 directions of standing + sitting, 8 dirs x 4 frames of walking, and the
// class's weapon carry pose (crr=N, see js/classWeapons.js — sword 241 is the
// fighter/melee default) — the training-dummy attack alternates it with the
// idle pose for a strike cycle. Some classes (currently just the cleric) also
// carry an idle item — see js/classWeapons.js — held whenever not swinging.
// size 'm' is the normal guest-room avatar, 's' the half-scale public-room one.
//
// `carry` (optional) is a plain hand-item id from js/handItems.js HAND_ITEMS.
// It is the non-combat counterpart to the class weapon: imaging composes a
// carry with a pose using a comma (`wlk,crr=5`, `sit,crr=5`), so a carrying
// figure keeps its full walk cycle and sits down without dropping the item.
// A carry set here takes over the idle/walk/sit poses; the combat poses
// (atk/bow) are untouched, since a fighting avatar's hand is already spoken
// for. No room bot sets one today — the dump's hand items named drinks they
// SERVED, not held (js/botsData.js) — so this path is exercised by the class
// weapons and stands ready for a bot with a real sourced item.
export class AvatarSprites {
  constructor(figure, size = 'm', classId = 'fighter', carry = null) {
    // An empty figure makes imaging render its own nonsense stand-in — ask for
    // the default Habbo instead (js/config.js DEFAULT_FIGURE).
    this.figure = figure || DEFAULT_FIGURE;
    this.size = size;
    this.classId = classId;
    this.weapon = weaponFor(classId);
    this.carry = carry;
    this.map = new Map();
    this.ready = false;
  }

  // Decorate an idle/walk/sit pose with this set's carried item. Frames stay
  // keyed in the map by the UNdecorated action, so get() needs no carry branch
  // beyond picking the idle pose.
  posed(action) {
    if (this.carry == null) return action;
    if (action === 'std') return `crr=${this.carry}`;
    if (action === 'wlk' || action === 'sit') return `${action},crr=${this.carry}`;
    return action;
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
    const { atk, idle, bow } = this.weapon;
    for (let d = 0; d < 8; d++) {
      jobs.push(this.loadOne('std', d, 0));
      jobs.push(this.loadOne('sit', d, 0)); // chairs (Free Roam seats)
      jobs.push(this.loadOne(`crr=${atk}`, d, 0)); // class weapon strike (melee attacks)
      if (idle) jobs.push(this.loadOne(`crr=${idle}`, d, 0)); // idle/off-swing carry (cleric's lantern)
      jobs.push(this.loadOne('crr', d, 0)); // empty-hand reach (archery draw fallback)
      if (bow) jobs.push(this.loadOne(`crr=${bow}`, d, 0)); // real bow art (ranger)
      for (let f = 0; f < WALK_FRAMES; f++) jobs.push(this.loadOne('wlk', d, f));
    }
    return Promise.all(jobs).then(() => {
      this.ready = true;
      return this;
    });
  }

  // Cached under the plain `action` key but REQUESTED as the carry-decorated
  // pose, so a carrying bot's 'std' frame is really its crr=<item> render.
  loadOne(action, dir, frame) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.map.set(`${action}_${dir}_${frame}`, img);
        resolve(true);
      };
      img.onerror = () => resolve(false); // offline → renderer falls back to a placeholder
      img.src = this.spriteUrl(this.posed(action), dir, frame);
    });
  }

  get(action, dir, frame = 0) {
    // 'atk' is a synthetic 2-tick strike: the class weapon raised (crr=N) /
    // idle pose (the cleric's lantern carry, or bare 'std' for everyone
    // else). 'bow' holds the class's own bow art if it has one (rangers),
    // else the empty-hand reach — the archery draw. 'std' itself carries the
    // class's idle item when it has one, so a cleric reads as "on duty"
    // (lantern in hand) any time they aren't mid-swing. Other callers pass
    // the raw 125ms tick; walk is 4.
    const { atk, idle, bow } = this.weapon;
    // A carried item owns the idle pose (and is already baked into the 'std'
    // frames), so it wins over any class idle weapon.
    const idlePose = this.carry != null || !idle ? `std_${dir}_0` : `crr=${idle}_${dir}_0`;
    if (action === 'atk') {
      const pose = frame % 2 === 0 ? `crr=${atk}_${dir}_0` : idlePose;
      return this.map.get(pose) || this.map.get(idlePose) || this.map.get(`std_${dir}_0`) || null;
    }
    if (action === 'bow') {
      const pose = bow ? `crr=${bow}_${dir}_0` : `crr_${dir}_0`;
      return this.map.get(pose) || this.map.get(`crr_${dir}_0`) || this.map.get(`std_${dir}_0`) || null;
    }
    if (action === 'std') {
      return this.map.get(idlePose) || this.map.get(`std_${dir}_0`) || null;
    }
    const f = frame % WALK_FRAMES;
    return this.map.get(`${action}_${dir}_${f}`) || this.map.get(`std_${dir}_0`) || null;
  }
}

// Per-figure sprite cache shared across rooms and sessions — walking into a
// room full of players (or bots) you've seen before costs zero imaging
// requests. Shared by remotePlayers.js and roomBots.js; entries are returned
// while still loading (the renderer falls back until `ready`). classId keys
// the cache too (default 'fighter'/sword) so a future caller can pass a
// remote player's real class and get their weapon art instead of the sword
// default — neither current caller does today, so this is a no-op for them.
// `carry` keys it as well, so Marcus-with-pizza and a bare Marcus can coexist.
const spriteCache = new Map(); // `${figure}|${size}|${classId}|${carry}` -> AvatarSprites
export function avatarSpritesFor(figure, size = 'm', classId = 'fighter', carry = null) {
  const key = `${figure}|${size}|${classId}|${carry ?? ''}`;
  if (!spriteCache.has(key)) {
    const sp = new AvatarSprites(figure, size, classId, carry);
    sp.load();
    spriteCache.set(key, sp);
  }
  return spriteCache.get(key);
}
