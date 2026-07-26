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
import { findChromium, startServer, openPlayer, enterFreeRoam, makeChecker, portFor } from './lib.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = portFor(33); // per-worktree base (lib.mjs), was 8633
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
  const cat = await admin.evaluate(async () => {
    const { ROOM_BOTS } = await import('/js/botsData.js');
    const cells = [...document.querySelectorAll('.bot-cat .bot-cell')];
    const marcus = cells[1]; // roster order: harry, marcus, ...
    return {
      count: cells.length,
      names: cells.map((c) => c.querySelector('.fc-name').textContent),
      mottos: cells.map((c) => c.querySelector('.fc-motto').textContent),
      thumb: cells[0].querySelector('img').getAttribute('src'),
      carryThumb: marcus.querySelector('img').getAttribute('src'),
      foot: document.querySelector('.bot-cat .furni-cat-foot').textContent,
      rosterCarry: ROOM_BOTS[1].carry,
    };
  });
  // the full Havana `rooms_bots` dump: 33 rows, the first nine in commit order
  // then the rest in dump id order (js/botsData.js)
  const ROSTER = [
    'Harry', 'Marcus', 'Piers', 'Ingemar', 'Chloe', 'Jem', 'Miho', 'Amber', 'Ray',
    'Xenia', 'Pamela', 'Regina', 'James', 'Marion', 'Brone', 'Dave', 'Sadie',
    'Reginaldo', 'Billy', 'Phillip', 'Ariel', 'Marcel', 'Berith',
    'DJ von Beathoven', 'Maarit', 'ScubaJoe', 'Skye', 'Gino', 'Carlo', 'Lofar',
    'Eric', 'Laura', 'Tao',
  ];
  check('catalogue lists all 33 recovered bots', cat.count === 33);
  check('cells are named in roster order',
    JSON.stringify(cat.names) === JSON.stringify(ROSTER));
  check('names are trimmed (the dump stores "Eric  ")',
    cat.names.every((n) => n === n.trim()));
  check('cells show the motto under the name', cat.mottos[0] === 'Happy to help' &&
    cat.mottos[8] === 'Chill out and have a coconut!' &&
    cat.mottos[ROSTER.indexOf('Tao')] === 'Tea is serenity');
  check('ScubaJoe\'s empty motto renders as an empty line, not "undefined"',
    cat.mottos[ROSTER.indexOf('ScubaJoe')] === '');
  check('a non-carrier thumb is the plain stand pose',
    /action=std/.test(decodeURIComponent(cat.thumb)));
  check('a carrier thumb renders holding its item',
    decodeURIComponent(cat.carryThumb).includes(`action=crr=${cat.rosterCarry}`));
  check('footer counts the shelf', /33 bots/.test(cat.foot));

  // search narrows the shelf (matches the motto text too)
  await admin.fill('.bot-cat .furni-cat-search', 'katana');
  check('search filters on motto', (await admin.evaluate(() =>
    document.querySelectorAll('.bot-cat .bot-cell').length)) === 1);
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
    const def = window.__debug.botDefs()[0]; // Harry — no carry
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
  check('it carries a name tag', placed.tagText === 'Harry');
  check('it does NOT block its tile', placed.blocked === false);
  check('placement state is released', placed.placingCleared);
  check('the spec joins room.bots', placed.spec && placed.spec.bot === 'harry' && placed.spec.x === 6);

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
    roomBots.beginPlace(window.__debug.botDefs().find((b) => b.key === 'ray'));
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
    persist.botsBack.length === 1 && persist.botsBack[0].bot === 'ray' &&
    persist.botsBack[0].x === 7 && persist.botsBack[0].y === 7);
  check('furni survive the split untouched', persist.propsUnchanged);
  check('the dungeon gate still works', persist.gateStillThere);
  check('the Gatekeeper NPC is untouched', persist.keeperStillThere);
  check('the RP arrows are untouched', persist.arrowsStillThere === 2);

  // ---- a carrying bot actually holds its item in-room -------------------
  // Ray (carry: Cola) is on tile 7,7 from the persistence step above.
  const carry = await admin.evaluate(async () => {
    const roomBots = window.__debug.roomBots();
    const { handItemId } = await import('/js/handItems.js');
    const ray = roomBots.bots.find((b) => b.key === 'ray');
    const cola = handItemId('Cola');
    // a fresh non-carrier to compare against (the earlier Harry was picked up)
    roomBots.beginPlace(window.__debug.botDefs().find((b) => b.key === 'harry'));
    roomBots.place({ x: 5, y: 7 });
    // the sprite set requests the carry-decorated poses
    const posed = {
      std: ray.sprites.posed('std'),
      wlk: ray.sprites.posed('wlk'),
      sit: ray.sprites.posed('sit'),
      atk: ray.sprites.posed('atk'), // combat pose must stay untouched
    };
    const url = ray.sprites.spriteUrl(posed.std, 2, 0);
    // and a non-carrier's poses are unchanged
    const harry = roomBots.bots.find((b) => b.key === 'harry');
    roomBots.openStand(ray);
    const standImg = document.querySelector('.infostand--bot .infostand-preview--human img').getAttribute('src');
    const standMotto = document.querySelector('.infostand--bot .infostand-motto').textContent;
    roomBots.closeStand();
    return {
      cola, posed, url, standImg, standMotto,
      entityCarry: ray.carry,
      spriteCarry: ray.sprites.carry,
      harryPosedStd: harry ? harry.sprites.posed('std') : null,
      harryCarry: harry ? harry.sprites.carry : 'no-harry',
      cacheSeparate: ray.sprites !== (harry && harry.sprites),
    };
  });
  check('the carrying bot knows its item', carry.entityCarry === carry.cola && carry.spriteCarry === carry.cola);
  check('idle pose becomes the carry render', carry.posed.std === `crr=${carry.cola}`);
  check('walk keeps the item (comma-composed)', carry.posed.wlk === `wlk,crr=${carry.cola}`);
  check('sit keeps the item', carry.posed.sit === `sit,crr=${carry.cola}`);
  check('combat pose is left alone', carry.posed.atk === 'atk');
  check('the imaging URL carries the item', decodeURIComponent(carry.url).includes(`action=crr=${carry.cola}`));
  check('a non-carrier renders unchanged', carry.harryPosedStd === 'std' && carry.harryCarry === null);
  check('carry keys the sprite cache separately', carry.cacheSeparate);
  check('infostand preview holds the item', decodeURIComponent(carry.standImg).includes(`action=crr=${carry.cola}`));
  check('infostand shows the motto', carry.standMotto === 'Chill out and have a coconut!');

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
