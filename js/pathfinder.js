import { MAX_CLIMB, MAX_DROP } from './config.js';

// Habbo direction constants (used by the game protocol AND habbo-imaging):
//   0=N(-y)  1=NE  2=E(+x)  3=SE  4=S(+y)  5=SW  6=W(-x)  7=NW
// On screen (2:1 iso) dir 2 walks toward the bottom-right, dir 4 bottom-left.
export const DIRECTIONS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
];

// The classic rotation function every Habbo server uses to face an avatar
// toward the tile it is stepping onto.
export function rotationBetween(x1, y1, x2, y2) {
  if (x1 > x2 && y1 > y2) return 7;
  if (x1 < x2 && y1 < y2) return 3;
  if (x1 > x2 && y1 < y2) return 5;
  if (x1 < x2 && y1 > y2) return 1;
  if (x1 > x2) return 6;
  if (x1 < x2) return 2;
  if (y1 < y2) return 4;
  if (y1 > y2) return 0;
  return null; // same tile
}

function heightOk(fromZ, toZ) {
  return toZ - fromZ <= MAX_CLIMB && fromZ - toZ <= MAX_DROP;
}

// One Habbo step from (fx,fy) to an adjacent (tx,ty). Rules per Sulake's
// "On Walking and Stacking":
//   - the target tile must exist (no walking over the void) and be unblocked
//   - climb at most 1.25 units, drop at most 4
//   - diagonals: NEVER across a void corner; cutting past ONE blocked corner
//     is allowed, squeezing between TWO blocked corners is not
export function canStep(room, fx, fy, tx, ty) {
  const from = room.tile(fx, fy);
  const to = room.tile(tx, ty);
  if (!from || !to || room.isBlocked(tx, ty)) return false;
  if (!heightOk(from.z, to.z)) return false;

  const dx = tx - fx;
  const dy = ty - fy;
  if (dx !== 0 && dy !== 0) {
    const a = room.tile(tx, fy); // corner in the x direction
    const b = room.tile(fx, ty); // corner in the y direction
    if (!a || !b) return false; // void corner — always forbidden
    const aOpen = !room.isBlocked(tx, fy) && heightOk(from.z, a.z);
    const bOpen = !room.isBlocked(fx, ty) && heightOk(from.z, b.z);
    if (!aOpen && !bOpen) return false; // two blocked corners
  }
  return true;
}

// A* with uniform step cost and a Chebyshev heuristic. Uniform cost means the
// fewest-steps path wins, so diagonals are taken whenever possible — producing
// Habbo's characteristic "diagonal until aligned, then straight" walk.
// Returns the path as [{x,y}, ...] EXCLUDING the start tile, or null.
export function findPath(room, sx, sy, tx, ty) {
  if (sx === tx && sy === ty) return [];
  if (room.isBlocked(tx, ty)) return null;

  const key = (x, y) => y * room.w + x;
  const open = new MinHeap();
  const gScore = new Map();
  const cameFrom = new Map();
  const closed = new Set();

  const h = (x, y) => Math.max(Math.abs(x - tx), Math.abs(y - ty));

  gScore.set(key(sx, sy), 0);
  open.push({ x: sx, y: sy, g: 0, f: h(sx, sy), h: h(sx, sy) });

  while (open.size) {
    const cur = open.pop();
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (cur.x === tx && cur.y === ty) {
      const path = [];
      let k = ck;
      while (cameFrom.has(k)) {
        path.push({ x: k % room.w, y: Math.floor(k / room.w) });
        k = cameFrom.get(k);
      }
      return path.reverse();
    }

    for (const { dx, dy } of DIRECTIONS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      if (!canStep(room, cur.x, cur.y, nx, ny)) continue;
      const g = cur.g + 1;
      if (g < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, g);
        cameFrom.set(nk, ck);
        const hh = h(nx, ny);
        open.push({ x: nx, y: ny, g, f: g + hh, h: hh });
      }
    }
  }
  return null;
}

// Small binary min-heap ordered by f, ties broken by h (closer to the goal
// first — this is what keeps the paths looking like Habbo's, not just equal
// length to them).
class MinHeap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  less(i, j) {
    const p = this.a[i];
    const q = this.a[j];
    return p.f < q.f || (p.f === q.f && p.h < q.h);
  }
  push(n) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(l, m)) m = l;
        if (r < a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
