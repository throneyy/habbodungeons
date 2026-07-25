// Walking room bots (:npc) e2e — run with:  node tests/e2e/roomBots.e2e.mjs
// Drives the whole admin loop headless as an ADMIN identity: open the bot
// catalogue, pick a bot, drop it on a tile, prove it exists as a live unit with
// a name tag and that it never blocks its tile, prove Escape cancels an
// in-flight placement, prove the layout serializes/round-trips through
// splitBots, and prove the room's furni/Gatekeeper wiring is untouched.
// A screenshot of the catalogue + placed bot lands in .gg/screenshots/.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { findChromium, startServer, openPlayer, enterFreeRoam, makeChecker } from './lib.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 8633;
const { check, state } = makeChecker();
mkdirSync(join(ROOT, '.gg', 'screenshots'), { recursive: true });

const exe = findChromium();
if (!exe) {
  console.error('SKIP: no local Chromium build found (npx playwright install chromium)');
  process.exit(0);
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe, headless: true });

const runCommand = (page, cmd) =>
  page.evaluate((c) => {
    const input = document.querySelector('#chatToolbar input');
    input.value = c;
    input.form.requestSubmit();
  }, cmd);

try {
  console.log(':npc catalogue → place → wander → persist');
  // ADMIN_NAMES = ['throney'] — the admin gate is name-based
  const admin = await openPlayer(browser, PORT, 'throney', 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62');
  await enterFreeRoam(admin);
  // work in the square: it carries the dungeon gate, the Gatekeeper NPC and
  // both RP arrows, so this run also proves bots leave that wiring alone
  await admin.evaluate(() => document.querySelectorAll('#exploreBar button[data-room]')[1].click());
  await admin.waitForFunction(() => window.game.room && window.game.room.id === 'square');

  // ---- the catalogue window --------------------------------------------
  await runCommand(admin, ':npc');
  await admin.waitForSelector('.bot-cat', { timeout: 5000 });
  const cat = await admin.evaluate(() => ({
    cells: document.querySelectorAll('.bot-cat .bot-cell').length,
    firstName: document.querySelector('.bot-cat .bot-cell .fc-name').textContent,
    thumb: document.querySelector('.bot-cat .bot-cell img').getAttribute('src'),
    foot: document.querySelector('.bot-cat .furni-cat-foot').textContent,
  }));
  check('catalogue lists every bot', cat.cells === 6);
  check('cells render a habbo-imaging thumb', /figure=.+action=std/.test(decodeURIComponent(cat.thumb)));
  check('cells are named', cat.firstName.length > 0);
  check('footer counts the shelf', /6 bots/.test(cat.foot));

  // search narrows the shelf
  await admin.fill('.bot-cat .furni-cat-search', 'bounc');
  check('search filters', (await admin.evaluate(() => document.querySelectorAll('.bot-cat .bot-cell').length)) === 1);
  await admin.fill('.bot-cat .furni-cat-search', '');

  // ---- Escape cancels an in-flight placement ---------------------------
  const unitsBefore = await admin.evaluate(() => window.game.units.length);
  await admin.click('.bot-cat .bot-cell');
  check('catalogue closes on pick', await admin.evaluate(() => document.querySelector('.bot-cat').classList.contains('hidden')));
  check('a ghost bot joins the units while placing',
    (await admin.evaluate(() => window.game.units.length)) === unitsBefore + 1);
  await admin.keyboard.press('Escape');
  check('Escape returns the ghost to the shelf',
    (await admin.evaluate(() => window.game.units.length)) === unitsBefore);
  check('cancelled placement leaves room.bots empty',
    (await admin.evaluate(() => window.game.room.bots.length)) === 0);

  // ---- place a bot on a tile -------------------------------------------
  const placed = await admin.evaluate(() => {
    const roomBots = window.__debug.roomBots();
    const def = { key: 'frank', name: 'Frank', figure: 'hr-125-1104.hd-190-1026.ch-215-82.lg-280-1189.sh-295-62' };
    roomBots.beginPlace(def);
    roomBots.place({ x: 6, y: 6 }); // paved court, walkable
    const bot = roomBots.bots[0];
    return {
      count: roomBots.bots.length,
      x: bot.x, y: bot.y,
      home: bot.home,
      inUnits: window.game.units.includes(bot),
      hasSprites: !!bot.sprites,
      statless: bot.stats === null,
      tagText: document.querySelector('#botTagLayer .name-tag').textContent,
      blocked: window.game.room.isBlocked(6, 6),
      spec: window.game.room.bots[0],
      placingCleared: roomBots.placing === null,
    };
  });
  check('the bot lands on the clicked tile', placed.count === 1 && placed.x === 6 && placed.y === 6);
  check('the tile becomes its home', placed.home.x === 6 && placed.home.y === 6);
  check('it renders through the normal unit pipeline', placed.inUnits && placed.hasSprites);
  check('no HP bar (stat-less entity)', placed.statless);
  check('it carries a name tag', placed.tagText === 'Frank');
  check('it does NOT block its tile', placed.blocked === false);
  check('placement state is released', placed.placingCleared);
  check('the spec joins room.bots', placed.spec && placed.spec.bot === 'frank' && placed.spec.x === 6);

  // ---- it wanders, leashed ---------------------------------------------
  const drift = await admin.evaluate(async () => {
    const roomBots = window.__debug.roomBots();
    const bot = roomBots.bots[0];
    const seen = new Set();
    const started = performance.now();
    while (performance.now() - started < 9000) {
      bot.nextWander = 0; // skip the idle cadence — we want steps, fast
      seen.add(`${bot.x},${bot.y}`);
      await new Promise((r) => setTimeout(r, 120));
    }
    return { tiles: [...seen], home: bot.home };
  });
  check('the bot actually walks', drift.tiles.length > 1);
  check('...and stays leashed within 2 tiles of home', drift.tiles.every((t) => {
    const [x, y] = t.split(',').map(Number);
    return Math.abs(x - drift.home.x) <= 2 && Math.abs(y - drift.home.y) <= 2;
  }));

  await admin.screenshot({ path: join(ROOT, '.gg', 'screenshots', 'roomBots-placed.png') });

  // ---- edit-mode infostand: move / rotate / pick up ---------------------
  const stand = await admin.evaluate(() => {
    const roomBots = window.__debug.roomBots();
    const editor = window.__debug.editor();
    editor.enable();
    const bot = roomBots.bots[0];
    roomBots.openStand(bot);
    const el = document.querySelector('.infostand--bot');
    const acts = [...el.querySelectorAll('.infostand-btn')].map((b) => b.dataset.act);
    const dirBefore = bot.dir;
    el.querySelector('[data-act="rotate"]').click();
    const rotated = bot.dir !== dirBefore && bot.spec.dir === bot.dir;
    el.querySelector('[data-act="pickup"]').click();
    editor.disable();
    return {
      acts,
      rotated,
      preview: !!el.querySelector('.infostand-preview--human img'),
      gone: roomBots.bots.length === 0 && window.game.room.bots.length === 0,
      standClosed: !document.querySelector('.infostand--bot'),
      tagsGone: document.querySelectorAll('#botTagLayer .name-tag').length === 0,
    };
  });
  check('infostand offers move/rotate/pick up',
    JSON.stringify(stand.acts) === JSON.stringify(['move', 'rotate', 'pickup']));
  check('infostand shows the avatar render', stand.preview);
  check('rotate turns the bot and its spec', stand.rotated);
  check('pick up removes entity, spec, tag and stand',
    stand.gone && stand.standClosed && stand.tagsGone);

  // ---- persistence round-trip ------------------------------------------
  const persist = await admin.evaluate(async () => {
    const roomBots = window.__debug.roomBots();
    const { serializeBot, splitBots } = await import('/js/roomBots.js');
    const { serializeProp } = await import('/js/roomEditor.js');
    roomBots.beginPlace({ key: 'guildmaster', name: 'Guild Master', figure: 'x' });
    roomBots.place({ x: 7, y: 7 });
    const room = window.game.room;
    const layout = [...room.props.map(serializeProp), ...room.bots.map(serializeBot)];
    const botEntries = layout.filter((e) => e.id === 'bot');
    const back = splitBots(layout);
    return {
      botEntries,
      propsUnchanged: back.props.length === room.props.length,
      botsBack: back.bots,
      gateStillThere: room.props.some((p) => p.id === 'fantasy_c22_archway' && p.teleport && p.teleport.gate),
      keeperStillThere: room.props.some((p) => p.npc),
      arrowsStillThere: room.props.filter((p) => p.id === 'rp_arrow' && p.teleport && p.teleport.room).length,
    };
  });
  check('Save Layout serializes the bot', persist.botEntries.length === 1 &&
    JSON.stringify(Object.keys(persist.botEntries[0]).sort()) === JSON.stringify(['bot', 'dir', 'id', 'x', 'y']));
  check('...and reloads it back into room.bots',
    persist.botsBack.length === 1 && persist.botsBack[0].bot === 'guildmaster' &&
    persist.botsBack[0].x === 7 && persist.botsBack[0].y === 7);
  check('furni survive the split untouched', persist.propsUnchanged);
  check('the dungeon gate still works', persist.gateStillThere);
  check('the Gatekeeper NPC is untouched', persist.keeperStillThere);
  check('the RP arrows are untouched', persist.arrowsStillThere === 2);

  // ---- non-admins never see the shelf ----------------------------------
  const guest = await openPlayer(browser, PORT, 'NotAnAdmin', 'hr-125-1104.hd-190-1026.ch-260-1314.lg-280-1189.sh-295-62');
  await enterFreeRoam(guest);
  await runCommand(guest, ':npc');
  await guest.waitForTimeout(400);
  check('non-admins get nothing (and no chat bubble)', await guest.evaluate(() =>
    !document.querySelector('.bot-cat') && !document.body.textContent.includes(':npc')));
} finally {
  await browser.close();
  server.kill();
}

console.log(state.failed ? `\n${state.failed} check(s) failed` : '\nall room-bot e2e checks passed');
process.exit(state.failed ? 1 : 0);
