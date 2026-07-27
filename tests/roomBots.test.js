// Walking room bot tests — run with:  node tests/roomBots.test.js
// Covers the pure helpers behind the :npc command: the saved-layout split
// (bots ride the same array as furni), the persistence shape, the wander
// candidate filter (leash, blocked tiles, teleport pads, height steps) and the
// ambient chatter roll (per-bot timer + the room-wide bubble cooldown).
import {
  splitBots, serializeBot, wanderTarget, LEASH,
  speechLine, tryBark, nextBarkAt, BARK_MIN_MS, BARK_SPREAD_MS, BARK_COOLDOWN_MS,
} from '../js/roomBots.js';
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
  { id: `bot-${KEY}`, x: 7, y: 2, dir: 6 },
  { id: 'rp_arrow', x: 5, y: 2, dir: 0, walk: true, teleport: { room: 'tavern' } },
  { id: 'bot-ghost_of_a_removed_definition', x: 1, y: 1, dir: 0 },
  { id: `bot-${ROOM_BOTS[1].key}`, x: 9, y: 9 },
];
const split = splitBots(saved);
check('props keep every non-bot entry, in order', split.props.length === 2 &&
  split.props[0].id === 'vikings_chair_r' && split.props[1].id === 'rp_arrow');
check('known bot entries become specs', split.bots.length === 2 &&
  split.bots[0].bot === KEY && split.bots[0].x === 7 && split.bots[0].y === 2 && split.bots[0].dir === 6);
check('unknown bot keys are dropped', !split.bots.some((b) => b.bot.startsWith('ghost')));
check('missing dir defaults to 4', split.bots[1].dir === 4);
check('empty / missing input is safe', splitBots([]).bots.length === 0 && splitBots().props.length === 0);

// Layouts written by the first bot client (key in its own `bot` field) still
// load...
const legacy = splitBots([{ id: 'bot', bot: KEY, x: 1, y: 2, dir: 0 }]);
check('legacy { id: "bot", bot } entries still load', legacy.bots.length === 1 &&
  legacy.bots[0].bot === KEY && legacy.bots[0].x === 1 && legacy.bots[0].dir === 0);
// ...and the shape a pre-bot save-room-layout build left behind (it rebuilt
// each entry field by field and never copied `bot`) is dropped, not handed to
// the furni renderer as a prop with no sprite sheet.
const stripped = splitBots([{ id: 'bot', x: 1, y: 2, dir: 0 }]);
check('a server-stripped bot entry is dropped, never treated as furni',
  stripped.bots.length === 0 && stripped.props.length === 0);

// ---- serializeBot ---------------------------------------------------------
console.log('serializeBot');
const ser = serializeBot({ bot: KEY, x: 4, y: 6, dir: 2, home: { x: 4, y: 6 }, junk: true });
check('shape is exactly the whitelist', JSON.stringify(Object.keys(ser).sort()) ===
  JSON.stringify(['dir', 'id', 'x', 'y']));
check('the catalogue key rides in the id', ser.id === `bot-${KEY}` &&
  ser.x === 4 && ser.y === 6 && ser.dir === 2);
// save-room-layout preserves `id` verbatim in EVERY build; a separate field is
// dropped by any build that predates it. Keeping the key in the id is what
// makes a placed bot survive a save against an undeployed function.
check('nothing outside the id is needed to resolve the bot',
  splitBots([{ id: ser.id, x: ser.x, y: ser.y, dir: ser.dir }]).bots[0].bot === KEY);
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

// ---- ambient chatter (bark) ----------------------------------------------
// Idle `speech` lines only, gated by a per-bot timer AND a room-wide cooldown.
console.log('bark');
const mkBot = (key, nextBark = 0) => ({ key, name: botDef(key).name, nextBark });
const freshState = () => ({ lastBarkAt: -Infinity });
const ALWAYS_FIRST = () => 0; // deterministic: always index 0, never a coin-flip

// ---- speechLine: where lines may come from --------------------------------
check('a talker yields a line from its OWN speech array', ROOM_BOTS.every((b) => {
  if (SILENT_BOTS.includes(b.key)) return true;
  const own = CHATTER[b.key].speech;
  // sweep rnd across the whole array so every index is observed
  return own.every((_, i) => own.includes(speechLine(b.key, () => i / own.length)));
}));
check('silent bots never yield a line',
  SILENT_BOTS.every((k) => [0, 0.25, 0.5, 0.99].every((r) => speechLine(k, () => r) === null)));
check('an unknown key yields no line', speechLine('no_such_bot', ALWAYS_FIRST) === null);
// response/unrecognised are player-triggered and still hold %drink% tokens
check('lines never come from response/unrecognised', (() => {
  const speechTexts = new Set(Object.values(CHATTER).flatMap((c) => c.speech.map((l) => l.text)));
  const otherOnly = Object.values(CHATTER)
    .flatMap((c) => [...c.response, ...c.unrecognised])
    .filter((l) => !speechTexts.has(l.text));
  return otherOnly.length > 0 && ROOM_BOTS.every((b) => {
    if (SILENT_BOTS.includes(b.key)) return true;
    const n = CHATTER[b.key].speech.length;
    return Array.from({ length: n }, (_, i) => speechLine(b.key, () => i / n))
      .every((l) => !otherOnly.some((o) => o.text === l.text));
  });
})());
check('no ambient line can contain an unexpanded %token%', ROOM_BOTS.every((b) =>
  SILENT_BOTS.includes(b.key) || CHATTER[b.key].speech.every((l) => !/%\w+%/.test(l.text))));

// ---- tryBark: the per-bot timer -------------------------------------------
check('a bot with a future timer stays quiet',
  tryBark(mkBot('harry', 10_000), 500, freshState(), ALWAYS_FIRST) === null);
check('a due bot barks', (() => {
  const line = tryBark(mkBot('harry'), 1000, freshState(), ALWAYS_FIRST);
  return line !== null && line.text === CHATTER.harry.speech[0].text;
})());
check('barking reschedules the bot into the future', (() => {
  const bot = mkBot('harry');
  tryBark(bot, 1000, freshState(), ALWAYS_FIRST);
  return bot.nextBark >= 1000 + BARK_MIN_MS && bot.nextBark <= 1000 + BARK_MIN_MS + BARK_SPREAD_MS;
})());
check('nextBarkAt spans exactly the configured window',
  nextBarkAt(0, () => 0) === BARK_MIN_MS &&
  Math.abs(nextBarkAt(0, () => 1) - (BARK_MIN_MS + BARK_SPREAD_MS)) < 1e-9);

// ---- tryBark: silent bots --------------------------------------------------
check('silent bots never bark, however long they wait',
  SILENT_BOTS.every((k) => tryBark(mkBot(k), 1e9, freshState(), ALWAYS_FIRST) === null));
check('a silent bot does not consume the global cooldown', (() => {
  const state = freshState();
  tryBark(mkBot('xenia'), 1000, state, ALWAYS_FIRST); // silent
  return state.lastBarkAt === -Infinity && tryBark(mkBot('harry'), 1000, state, ALWAYS_FIRST) !== null;
})());

// ---- tryBark: the room-wide cooldown --------------------------------------
check('a second bot is suppressed inside the cooldown', (() => {
  const state = freshState();
  const first = tryBark(mkBot('harry'), 1000, state, ALWAYS_FIRST);
  const second = tryBark(mkBot('marcus'), 1000 + BARK_COOLDOWN_MS - 1, state, ALWAYS_FIRST);
  return first !== null && second === null;
})());
check('...and speaks again once the cooldown elapses', (() => {
  const state = freshState();
  tryBark(mkBot('harry'), 1000, state, ALWAYS_FIRST);
  return tryBark(mkBot('marcus'), 1000 + BARK_COOLDOWN_MS, state, ALWAYS_FIRST) !== null;
})());
check('a suppressed bot is rescheduled, not left hot re-rolling every frame', (() => {
  const state = freshState();
  tryBark(mkBot('harry'), 1000, state, ALWAYS_FIRST);
  const loser = mkBot('marcus');
  tryBark(loser, 1000, state, ALWAYS_FIRST); // swallowed by the cooldown
  return loser.nextBark >= 1000 + BARK_MIN_MS;
})());
check('all 33 due at once still yields exactly one bubble', (() => {
  const state = freshState();
  return ROOM_BOTS.map((b) => tryBark(mkBot(b.key), 5000, state, ALWAYS_FIRST)).filter(Boolean).length === 1;
})());
check('over a long window the rate stays under the cooldown', (() => {
  // every bot forced permanently ready, isolating the global gate
  const state = freshState();
  const bots = ROOM_BOTS.map((b) => mkBot(b.key));
  const SPAN = 60_000;
  let said = 0;
  for (let now = 0; now <= SPAN; now += 100) {
    for (const b of bots) {
      b.nextBark = 0;
      if (tryBark(b, now, state, ALWAYS_FIRST)) said++;
    }
  }
  return said <= Math.ceil(SPAN / BARK_COOLDOWN_MS) + 1;
})());

// ---- modes survive the trip ------------------------------------------------
check('shout mode is carried through on a known shout', (() => {
  const i = CHATTER.jem.speech.findIndex((l) => l.mode === 'shout');
  const line = speechLine('jem', () => i / CHATTER.jem.speech.length);
  return line.mode === 'shout' && modeOf(line) === 'shout';
})());
check('a barked line keeps its mode all the way out of tryBark', (() => {
  const line = tryBark(mkBot('laura'), 1000, freshState(), ALWAYS_FIRST); // laura's one line is a shout
  return line && modeOf(line) === 'shout';
})());
check('tryBark returns the CHATTER line object itself, so any mode travels',
  // identity, not a copy: whatever `mode` a line carries reaches bark() untouched
  tryBark(mkBot('laura'), 1000, freshState(), ALWAYS_FIRST) === CHATTER.laura.speech[0]);
check('every ambient line reports a real mode', ROOM_BOTS.every((b) => {
  if (SILENT_BOTS.includes(b.key)) return true;
  const n = CHATTER[b.key].speech.length;
  return Array.from({ length: n }, (_, i) => speechLine(b.key, () => i / n))
    .every((l) => ['say', 'shout', 'whisper'].includes(modeOf(l)));
}));
// Data fact worth pinning: every whisper in the dump lives in `unrecognised`
// (miho, skye, carlo) and none in `speech`, so ambient emits say + shout only.
// If a whisper is ever added to a speech bucket this still works (the mode is
// passed opaquely, per the identity check above) — this just records today.
check("the dump's whispers are all outside speech (ambient can't reach them)", (() => {
  const whisperers = Object.entries(CHATTER)
    .filter(([, c]) => [...c.response, ...c.unrecognised].some((l) => l.mode === 'whisper'))
    .map(([k]) => k);
  return whisperers.length === 3 && !Object.values(CHATTER).some((c) => c.speech.some((l) => l.mode === 'whisper'));
})());

console.log(failed ? `\n${failed} test(s) failed` : '\nall room-bot tests passed');
process.exit(failed ? 1 : 0);
