// Pathfinding rule tests — run with:  node tests/pathfinder.test.js
// Verifies the movement rules against known Habbo behaviour.
import { Room } from '../js/room.js';
import { findPath, canStep, rotationBetween } from '../js/pathfinder.js';

let failed = 0;

function check(name, cond) {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

function room(rows) {
  return new Room({ id: 't', name: 't', heightmap: rows, spawn: { x: 1, y: 1 } });
}

// --- rotation: the classic 8-direction facing function ----------------------
console.log('rotationBetween');
check('east  (+x)      -> 2', rotationBetween(1, 1, 2, 1) === 2);
check('south (+y)      -> 4', rotationBetween(1, 1, 1, 2) === 4);
check('north (-y)      -> 0', rotationBetween(1, 1, 1, 0) === 0);
check('west  (-x)      -> 6', rotationBetween(1, 1, 0, 1) === 6);
check('south-east      -> 3', rotationBetween(1, 1, 2, 2) === 3);
check('north-west      -> 7', rotationBetween(1, 1, 0, 0) === 7);
check('same tile       -> null', rotationBetween(1, 1, 1, 1) === null);

// --- diagonal preference: Habbo walks diagonally whenever possible ----------
console.log('diagonal-first paths');
{
  const r = room(['0000000', '0000000', '0000000', '0000000', '0000000']);
  const p = findPath(r, 0, 0, 4, 4);
  check('4-step pure diagonal to (4,4)', p && p.length === 4 && p.every((s, i) => s.x === i + 1 && s.y === i + 1));
  const p2 = findPath(r, 0, 0, 6, 2);
  check('diagonal-then-straight is 6 steps (Chebyshev)', p2 && p2.length === 6);
  const p3 = findPath(r, 3, 2, 3, 2);
  check('path to own tile is empty', p3 && p3.length === 0);
}

// --- void rules: never walk (or cut a corner) over the void ------------------
console.log('void rules');
{
  const r = room(['00x', '0x0', 'x00']);
  check('cannot step onto void', !canStep(r, 0, 0, 2, 0));
  const r2 = room(['0x', '00']);
  check('diagonal past a void corner is forbidden', !canStep(r2, 0, 0, 1, 1));
  const r3 = room(['00', '00']);
  check('diagonal on open floor is fine', canStep(r3, 0, 0, 1, 1));
}

// --- blocked-corner rules (furni/monsters use room.block) --------------------
console.log('blocked corner rules');
{
  const r = room(['000', '000', '000']);
  r.block(1, 0); // one corner blocked
  check('cutting past ONE blocked corner allowed', canStep(r, 0, 0, 1, 1));
  const p = findPath(r, 0, 0, 2, 0);
  check('path routes around the blocker', p && p.every((s) => !(s.x === 1 && s.y === 0)));
  r.block(0, 1); // both corners blocked
  check('squeezing between TWO blocked corners forbidden', !canStep(r, 0, 0, 1, 1));
  check('cannot step onto a blocked tile', !canStep(r, 0, 0, 1, 0));
  check('fully boxed in -> no path (like the real client)', findPath(r, 0, 0, 2, 0) === null);
}

// --- height rules: climb <= 1.25, drop <= 4 ---------------------------------
console.log('height rules');
{
  const r = room(['012', '000', '050']);
  check('climb 0 -> 1 ok', canStep(r, 0, 0, 1, 0));
  check('climb 1 -> 2 ok', canStep(r, 1, 0, 2, 0));
  check('climb 0 -> 2 forbidden (> 1.25)', !canStep(r, 1, 1, 2, 0));
  check('climb 0 -> 5 forbidden', !canStep(r, 1, 1, 1, 2));
  check('drop 5 -> 0 forbidden (> 4)', !canStep(r, 1, 2, 1, 1));
  check('drop 2 -> 0 ok (<= 4)', canStep(r, 2, 0, 2, 1));
}

// --- full path over stairs ---------------------------------------------------
console.log('stairs path');
{
  const r = room(['22222', '11111', '00000', '00000']);
  const p = findPath(r, 2, 3, 2, 0);
  check('walks up 0 -> 1 -> 2 stairs', p && p.length === 3);
  const r2 = room(['22222', '00000', '00000']);
  const p2 = findPath(r2, 2, 2, 2, 0);
  check('no path up a 2-unit cliff', p2 === null);
}

// --- unreachable target ------------------------------------------------------
console.log('unreachable');
{
  const r = room(['000x0', '000x0', '000x0']);
  check('walled-off target -> null', findPath(r, 0, 0, 4, 1) === null);
}

console.log(failed ? `\n${failed} test(s) FAILED` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
