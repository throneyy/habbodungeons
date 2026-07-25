import { TILE_W, TILE_H, Z_STEP } from './config.js';

// Habbo's screen projection (identical to the Shockwave-era client and every
// faithful renderer since):
//   screenX = (x - y) * 32
//   screenY = (x + y) * 16 - z * 32
// Returned point is the CENTRE of the tile's top diamond. Fractional tile
// coordinates are fine — that's how walking is interpolated.
export function tileToScreen(x, y, z = 0, zoom = 1) {
  return {
    x: (x - y) * (TILE_W / 2) * zoom,
    y: (x + y) * (TILE_H / 2) * zoom - z * Z_STEP * zoom,
  };
}

// Inverse of the projection on the z=0 plane. Used as a coarse guess; real
// picking walks tiles front-to-back and height-tests their top faces.
export function screenToTile(sx, sy, zoom = 1) {
  const a = sx / ((TILE_W / 2) * zoom);
  const b = sy / ((TILE_H / 2) * zoom);
  return { x: (b + a) / 2, y: (b - a) / 2 };
}

// Is screen point (px,py) inside the top-face diamond centred at (cx,cy)?
export function pointInDiamond(px, py, cx, cy, zoom = 1) {
  const dx = Math.abs(px - cx) / ((TILE_W / 2) * zoom);
  const dy = Math.abs(py - cy) / ((TILE_H / 2) * zoom);
  return dx + dy <= 1;
}
