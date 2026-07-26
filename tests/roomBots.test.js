// Walking room bot tests — run with:  node tests/roomBots.test.js
// Covers the pure helpers behind the :npc command: the saved-layout split
// (bots ride the same array as furni), the persistence shape, and the wander
// candidate filter (leash, blocked tiles, teleport pads, height steps).
import { splitBots, serializeBot, wanderTarget, LEASH } from '../js/roomBots.js';
import { ROOM_BOTS, botDef } from '../js/botsData.js';
import { HAND_ITEMS, handItemId } from '../js/handItems.js';
import { CHATTER, SILENT_BOTS, chatterFor, modeOf } from '../js/botChatter.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

const KEY = ROOM_BOTS[0].key; // 'harry'

// ---- botDef ---------------------------------------------------------------
console.log('botDef');
check('known key resolves', botDef(KEY) === ROOM_BOTS[0]);
check('unknown key is null', botDef('no_such_bot') === null);
check('every definition has a figure', ROOM_BOTS.every((b) => /^[\w.-]+$/.test(b.figure)));
check('keys are unique + persistable', new Set(ROOM_BOTS.map((b) => b.key)).size === ROOM_BOTS.length &&
  ROOM_BOTS.every((b) => /^[\w-]{1,40}$/.test(b.key)));

// ---- the roster ----------------------------------------------------------
// Recovered Havana `rooms_bots` roster: all 33 rows of the INSERT, the first
// nine in the order they were first committed, then the rest in dump id order.
// Frank and Mandy are NOT in the dump and must not reappear as invented figures.
console.log('roster');
const EXPECTED_KEYS = [
  'harry', 'marcus', 'piers', 'ingemar', 'chloe', 'jem', 'miho', 'amber', 'ray',
  'xenia', 'pamela', 'regina', 'james', 'marion', 'brone', 'dave', 'sadie',
  'reginaldo', 'billy', 'phillip', 'ariel', 'marcel', 'berith',
  'dj_von_beathoven', 'maarit', 'scubajoe', 'skye', 'gino', 'carlo', 'lofar',
  'eric', 'laura', 'tao',
];
check('roster is exactly the 33 recovered bots, in order',
  JSON.stringify(ROOM_BOTS.map((b) => b.key)) === JSON.stringify(EXPECTED_KEYS));
check('no placeholder bots survive', !ROOM_BOTS.some((b) => ['frank', 'mandy', 'guide', 'bouncer', 'barkeep', 'sage', 'guildmaster'].includes(b.key)));
check('every bot has a name and a motto string',
  ROOM_BOTS.every((b) => b.name && typeof b.motto === 'string'));
// ScubaJoe's `mission` is genuinely empty in the dump — he is the only one.
check('only ScubaJoe has an empty motto',
  JSON.stringify(ROOM_BOTS.filter((b) => b.motto === '').map((b) => b.key)) === JSON.stringify(['scubajoe']));
check('names carry no stray whitespace (the dump stores "Eric  ")',
  ROOM_BOTS.every((b) => b.name === b.name.trim()) && botDef('eric').name === 'Eric');
// Two figure strings really are duplicated in the source data. They are kept
// verbatim rather than nudged apart, so distinctness is asserted as 31 of 33.
const DUPLICATE_FIGURES = [['chloe', 'ariel'], ['berith', 'laura']];
check('figures are distinct apart from the dump\'s own two duplicate pairs',
  new Set(ROOM_BOTS.map((b) => b.figure)).size === ROOM_BOTS.length - DUPLICATE_FIGURES.length);
check('...and those pairs are exactly the known ones',
  DUPLICATE_FIGURES.every(([a, b]) => botDef(a).figure === botDef(b).figure));
check('figures are well-formed part-colour pairs',
  ROOM_BOTS.every((b) => b.figure.split('.').every((p) => /^[a-z]{2}-\d+-\d+$/.test(p))));
check('every figure carries a head part (hd-)',
  ROOM_BOTS.every((b) => b.figure.split('.').some((p) => p.startsWith('hd-'))));

// ---- carry ---------------------------------------------------------------
// A carry is set only where the dump's `hand_items` names something HAND_ITEMS
// has (first match in the list wins). Bots whose list maps to nothing — e.g.
// Reginaldo's 'Water,Juice,Lemonade,Tea', Carlo's 'Pizza,Water,Drink' — get no
// carry at all rather than a guessed id.
console.log('carry');
const CARRIERS = {
  marcus: 'Cola', ingemar: 'Coffee', chloe: 'Cola', jem: 'Cola', ray: 'Cola',
  regina: 'Coffee', billy: 'Coffee', phillip: 'Cola', ariel: 'Coffee',
  scubajoe: 'Cola', skye: 'Cola', lofar: 'Cola',
};
check('exactly the expected bots carry something',
  JSON.stringify(ROOM_BOTS.filter((b) => b.carry != null).map((b) => b.key)) ===
  JSON.stringify(Object.keys(CARRIERS)));
check('each carry resolves to the right hand-item id',
  Object.entries(CARRIERS).every(([key, item]) => botDef(key).carry === handItemId(item)));
check('carry ids are real entries in HAND_ITEMS',
  ROOM_BOTS.every((b) => b.carry == null || HAND_ITEMS[b.carry] !== undefined));
check('no bot carries Soda4 (id 49 has no art upstream)',
  !ROOM_BOTS.some((b) => b.carry === 49));
check('non-carriers leave the field unset',
  ['harry', 'piers', 'miho', 'amber', 'reginaldo', 'carlo', 'tao', 'xenia'].every((k) => botDef(k).carry === undefined));
check('handItemId is name-exact and throws on a typo', (() => {
  try { handItemId('cola'); return false; } catch { return handItemId('Cola') === 5; }
})());

// ---- chatter --------------------------------------------------------------
// js/botChatter.js: the dump's speech / response / unrecognised_response
// columns, keyed by the same bot keys. Silent bots are ABSENT, not empty.
console.log('chatter');
const chatterKeys = Object.keys(CHATTER);
const allLines = Object.values(CHATTER).flatMap((c) => [...c.speech, ...c.response, ...c.unrecognised]);
check('every chatter key is a real bot', chatterKeys.every((k) => botDef(k) !== null));
check('chatter + silent covers the whole roster exactly',
  chatterKeys.length + SILENT_BOTS.length === ROOM_BOTS.length &&
  new Set([...chatterKeys, ...SILENT_BOTS]).size === ROOM_BOTS.length &&
  ROOM_BOTS.every((b) => chatterKeys.includes(b.key) || SILENT_BOTS.includes(b.key)));
check('silent bots are absent, not empty entries',
  SILENT_BOTS.every((k) => CHATTER[k] === undefined && chatterFor(k) === null));
check('no entry is silent-by-empty-arrays',
  Object.values(CHATTER).every((c) => c.speech.length + c.response.length + c.unrecognised.length > 0));
check('every entry has all three buckets as arrays',
  Object.values(CHATTER).every((c) => ['speech', 'response', 'unrecognised'].every((k) => Array.isArray(c[k]))));
check('chatterFor resolves a talker and rejects an unknown key',
  chatterFor('harry') === CHATTER.harry && chatterFor('no_such_bot') === null);

// the #SHOUT / #WHISPER suffixes must have been parsed into `mode`, never left
// sitting in text where a chat bubble would render them literally
check('no line still carries a raw #SHOUT / #WHISPER suffix',
  allLines.every((l) => !/#(SHOUT|WHISPER)/.test(l.text)));
check('modes are only the three known values',
  allLines.every((l) => ['say', 'shout', 'whisper'].includes(modeOf(l))));
check('the shout/whisper lines actually survived as modes',
  allLines.some((l) => modeOf(l) === 'shout') && allLines.some((l) => modeOf(l) === 'whisper'));
check('a known shout is parsed off its text', (() => {
  const l = CHATTER.jem.speech[0];
  return l.text === "Quiet please, I'm thinking" && modeOf(l) === 'shout';
})());
// Volter (the bitmap chat font) mis-renders curly punctuation and em dashes
check('text is ASCII-only: no curly quotes, em dashes or ellipsis glyphs',
  allLines.every((l) => !/[^\x20-\x7E]/.test(l.text)));
check("Piers' curly apostrophe came through as ASCII",
  CHATTER.piers.speech.some((l) => l.text === "That's a recipe for disaster."));
check("no stray CR/LF survived inside a line (Amber's row carries one)",
  allLines.every((l) => !/[\r\n]/.test(l.text)) &&
  CHATTER.amber.response.some((l) => l.text === 'Thirst quenching, soul refreshing!'));
check("no line is empty or untrimmed (Miho's row ends with a trailing |)",
  allLines.every((l) => l.text.length > 0 && l.text === l.text.trim()));
// the emulator's substitution tokens are content, not damage: they stay
check('%drink% / %lowercaseDrink% template tokens are preserved',
  CHATTER.lofar.response.some((l) => l.text.includes('%drink%')) &&
  CHATTER.marcus.response.some((l) => l.text.includes('%lowercaseDrink%')));

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
