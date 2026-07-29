// The one item-icon painter. Every container that shows inventory art —
// the Hand's sockets (js/hand.js), the Backpack window, the kitchen sink —
// paints through here, so icons look identical everywhere and the sheet-poll
// logic lives in exactly one place.
//
// Draws an item's REAL furni art (ITEMS[id].icon / CONSUMABLES[id].icon ->
// assets/props) into a canvas, bottom-centred. Pixel-art rule: 1:1 when it
// fits, else an exact integer divisor — never fractional scaling.
//
// Sheets load lazily, so the painter polls propSprites until the set is
// ready and then draws. Two guards make that safe against a container
// re-rendering mid-poll: the canvas's dataset.icon must still name this icon
// (the painter stamps it), and the canvas must be in the document. A canvas
// that is merely not mounted YET keeps polling, so callers can paint first
// and append after (see itemIconCanvas).
import { propSprites } from '../props.js';

const POLL_MS = 250; // sprite-sheet readiness poll (matches furniCatalog)
const POLL_MAX = 20;

// cv       canvas to paint (its width/height set the icon box)
// iconId   extracted furni id, e.g. 'fantasy_c22_redpotion'
// tries    internal poll counter
export function drawItemIcon(cv, iconId, tries = 0) {
  if (!cv || !iconId) return;
  if (tries === 0) cv.dataset.icon = iconId; // claim the canvas for this icon
  if (cv.dataset.icon !== iconId) return; // a re-render handed it to another item
  const sp = propSprites(iconId);
  if (!sp.ready || !cv.isConnected) {
    if (tries < POLL_MAX) setTimeout(() => drawItemIcon(cv, iconId, tries + 1), POLL_MS);
    return;
  }
  const fr = sp.get(0) || sp.get(2) || sp.get(4);
  if (!fr) return;
  const box = cv.width;
  const boxH = cv.height;
  const ctx = cv.getContext('2d');
  const div = Math.max(1, Math.ceil(Math.max(fr.w / box, fr.h / boxH)));
  const w = Math.max(1, Math.floor(fr.w / div));
  const h = Math.max(1, Math.floor(fr.h / div));
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, box, boxH);
  ctx.drawImage(fr.img, fr.x, fr.y, fr.w, fr.h, Math.round((box - w) / 2), boxH - h, w, h);
}

// Convenience for containers that build their own sockets: a ready-to-append
// canvas already painting the icon.
export function itemIconCanvas(iconId, size = 36) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  drawItemIcon(cv, iconId);
  return cv;
}
