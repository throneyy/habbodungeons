// Walking room bot tests — run with:  node tests/roomBots.test.js
// Covers the pure helpers behind the :npc command: the saved-layout split
// (bots ride the same array as furni), the persistence shape, and the wander
// candidate filter (leash, blocked tiles, teleport pads, height steps).
import { splitBots, serializeBot, wanderTarget, LEASH } from '../js/roomBots.js';
import { ROOM_BOTS, botDef } from '../js/botsData.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

const KEY = ROOM_BOTS[0].key;

// ---- botDef ---------------------------------------------------------------
console.log('botDef');
check('known key resolves', botDef(KEY) === ROOM_BOTS[0]);
check('unknown key is null', botDef('no_such_bot') === null);
check('every definition has a figure', ROOM_BOTS.every((b) => /^[\w.-]+$/.test(b.figure)));
check('keys are unique + persistable', new Set(ROOM_BOTS.map((b) => b.key)).size === ROOM_BOTS.length &&
  ROOM_BOTS.every((b) => /^[\w-]{1,40}$/.test(b.key)));

// ---- splitBots ------------------------------------------------------------
console.log('splitBots');
const saved = [
  { id: 'vikings_chair_r', x: 3, y: 5, dir: 6 },
  { id: 'bot', bot: KEY, x: 7, y: 2, dir: 6 },
  { id: 'rp_arrow', x: 5, y: 2, dir: 0, walk: true, teleport: { room: 'tavern' } },
  { id: 'bot', bot: 'ghost_of_a_removed_definition', x: 1, y: 1, dir: 0 },
  { id: 'bot', bot: ROOM_BOTS[1].key, x: 9, y: 9 },
];
const split = splitBots(saved);
check('props keep every non-bot entry, in order', split.props.length === 2 &&
  split.props[0].id === 'vikings_chair_r' && split.props[1].id === 'rp_arrow');
check('known bot entries become specs', split.bots.length === 2 &&
  split.bots[0].bot === KEY && split.bots[0].x === 7 && split.bots[0].y === 2 && split.bots[0].dir === 6);
check('unknown bot keys are dropped', !split.bots.some((b) => b.bot.startsWith('ghost')));
check('missing dir defaults to 4', split.bots[1].dir === 4);
check('empty / missing input is safe', splitBots([]).bots.length === 0 && splitBots().props.length === 0);

// ---- serializeBot ---------------------------------------------------------
console.log('serializeBot');
const ser = serializeBot({ bot: KEY, x: 4, y: 6, dir: 2, home: { x: 4, y: 6 }, junk: true });
check('shape is exactly the whitelist', JSON.stringify(Object.keys(ser).sort()) ===
  JSON.stringify(['bot', 'dir', 'id', 'x', 'y']));
check('id marks it as a bot entry', ser.id === 'bot' && ser.bot === KEY && ser.x === 4 && ser.y === 6 && ser.dir === 2);
check('dir defaults to 4', serializeBot({ bot: KEY, x: 0, y: 0 }).dir === 4);
check('round-trips through splitBots', (() => {
  const back = splitBots([ser]).bots[0];
  return back.bot === KEY && back.x === 4 && back.y === 6 && back.dir === 2;
})());

// ---- wanderTarget ---------------------------------------------------------
console.log('wanderTarget');
// 9x9 flat room stub with the Room surface wanderTarget actually uses.
function stubRoom({ blocked = [], teleports = [], heights = {} } = {}) {
  const key = (x, y) => `${x},${y}`;
  const blockSet = new Set(blocked.map(([x, y]) => key(x, y)));
  const tpSet = new Set(teleports.map(([x, y]) => key(x, y)));
  return {
    tile: (x, y) => (x >= 0 && y >= 0 && x < 9 && y < 9 ? { z: 0 } : null),
    isBlocked: (x, y) => !(x >= 0 && y >= 0 && x < 9 && y < 9) || blockSet.has(key(x, y)),
    teleportAt: (x, y) => (tpSet.has(key(x, y)) ? { teleport: {} } : null),
    heightAt: (x, y) => heights[key(x, y)] ?? 0,
  };
}
const bot = (x, y, hx = x, hy = y) => ({ x, y, home: { x: hx, y: hy } });
const all = (room, b, occ) => {
  const out = new Set();
  // rnd sweeps every index so the whole candidate set is observed
  for (let i = 0; i < 8; i++) {
    const t = wanderTarget(room, b, occ, () => i / 8);
    if (t) out.add(`${t.x},${t.y}`);
  }
  return out;
};

const flat = stubRoom();
check('4 neighbours mid-room', all(flat, bot(4, 4)).size === 4);
check('never diagonal', ![...all(flat, bot(4, 4))].includes('5,5'));
check('room edge clips the void', all(flat, bot(0, 0)).size === 2);

check('blocked tiles rejected', !all(stubRoom({ blocked: [[5, 4]] }), bot(4, 4)).has('5,4'));
check('teleport pads rejected', !all(stubRoom({ teleports: [[5, 4]] }), bot(4, 4)).has('5,4'));
check('height steps > 1 rejected',
  !all(stubRoom({ heights: { '5,4': 2 } }), bot(4, 4)).has('5,4'));
check('height step of exactly 1 allowed',
  all(stubRoom({ heights: { '5,4': 1 } }), bot(4, 4)).has('5,4'));
check('occupied tiles rejected',
  !all(flat, bot(4, 4), (x, y) => x === 5 && y === 4).has('5,4'));

// leash: standing LEASH tiles east of home, only the way back is legal
const leashed = bot(4 + LEASH, 4, 4, 4);
const leashOpts = all(flat, leashed);
check(`leashed to ${LEASH} tiles from home`, !leashOpts.has(`${5 + LEASH},4`));
check('the way home stays open', leashOpts.has(`${3 + LEASH},4`));
check('boxed in returns null', wanderTarget(
  stubRoom({ blocked: [[3, 4], [5, 4], [4, 3], [4, 5]] }), bot(4, 4)
) === null);

console.log(failed ? `\n${failed} test(s) failed` : '\nall room-bot tests passed');
process.exit(failed ? 1 : 0);
