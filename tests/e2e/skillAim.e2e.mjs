// Skill-aiming VISUAL e2e — run with:  node tests/e2e/skillAim.e2e.mjs
//
// Two bugs a player reported, both invisible to every unit suite, because both
// are claims about PIXELS:
//
//   1. "the attack spells still highlight as green instead of red"
//      Every skill painted its legal targets from one overlay set, drawn green.
//      Green is the ALLY colour everywhere else in this UI (the roster's own
//      player bars are green, the enemy's red), so Net and Tidal Wave lit up
//      the monsters they were about to kill in friendly green.
//
//   2. "they need better descriptions of what each spell does"
//      A skill's whole description was its name and its price. "Whirlpool
//      (8 MP)" says nothing about damage, roots, or the 3x3 it covers, and the
//      numbers that decide whether to spend the MP appeared nowhere in-game.
//
// tests/skills.test.js asserts both in a fake DOM: which overlay set each skill
// writes to, and that the copy tracks the spec's numbers. What it cannot see is
// whether `overlays.skillHostile` is actually PAINTED red on the canvas, or
// whether the description card fits the 296px panel and stays legible on it.
// A Set name is not a colour and a string is not a layout, so this reads real
// pixels out of a real Chromium instead.
//
// It drives tests/e2e/skillAim.harness.html: the real Game, Room, Unit, Battle
// and BattleController, in the real index.html panel markup with css/style.css
// applied, with one mage who has ground out both Origins trees so every skill
// SHAPE (single strike, area strike, ally support, self-centered blast) is on
// one unit. The canvas pixels are sampled through the same iso projection the
// renderer uses, so the assertion is "the tile a player looks at is this
// colour", not "some pixel somewhere is reddish".
//
//   1-aim-strike.png    Net aimed: foes lit RED, card names the root
//   2-aim-support.png   Sapling Barrier aimed: allies lit GREEN
//   3-aim-selfblast.png Thorns aimed: the 3x3 blast lit red, with a confirm
//   4-skill-menu.png    the skill list, with a tooltip on every button
import { mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium, startServer, makeChecker, portFor } from './lib.mjs';

const PORT = portFor(61);
const SHOTS = fileURLToPath(new URL('screenshots/', import.meta.url));
const { check, state } = makeChecker();
const HARNESS = (skill) => `http://localhost:${PORT}/tests/e2e/skillAim.harness.html?skill=${skill}`;

// The overlay colours declared in js/game.js drawTileOverlay. Asserting against
// the CONSTANTS would just restate the source; these are the rendered results a
// player sees, so they are written out literally and compared with tolerance
// (the overlay is alpha-composited over the tile art beneath it).
const RED = { r: 224, g: 66, b: 66 };
const GREEN = { r: 95, g: 191, b: 106 };

// Which of the two overlay colours a sampled pixel is closer to - or neither.
// A tinted tile is the overlay over grey-brown floor art, so absolute values
// drift; what cannot drift is WHICH channel dominates.
function classify(px) {
  if (!px) return 'none';
  const { r, g, b } = px;
  const redness = r - Math.max(g, b);
  const greenness = g - Math.max(r, b);
  if (redness > 14) return 'red';
  if (greenness > 10) return 'green';
  return 'plain';
}

const shot = async (page, name) => page.screenshot({ path: `${SHOTS}${name}` });

// The TILE is the thing under test throughout, never the avatar standing on it:
// a monster sprite is the same pixels whichever spell is aimed at it, so it
// could not show this bug and cannot prove the fix. Two separate bits of code
// paint a tile, and a fix to one would not fix the other:
//   drawTileOverlay  the translucent fill on every legal target
//   hoverColor       the outline on the ONE tile under the cursor
// Both are sampled below.

const exe = findChromium();
if (!exe) {
  console.error('No Chromium found - run: npx playwright install chromium');
  process.exit(1);
}
if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
for (const f of ['1-aim-strike.png', '2-aim-support.png', '3-aim-selfblast.png', '4-skill-menu.png']) {
  rmSync(`${SHOTS}${f}`, { force: true });
}

const server = await startServer(PORT);
const browser = await chromium.launch({ executablePath: exe });

try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Sample the canvas on a tile's FLOOR, through the renderer's own projection
  // (game.p) so the sample lands where that tile actually drew.
  //
  // Two corrections the naive version got wrong, both worth naming because both
  // silently return black or the wrong thing:
  //   - game.p() is CAMERA-RELATIVE (js/game.js render() translates by cam), so
  //     the camera offset has to be added back to reach a screen coordinate.
  //   - the tile CENTRE is under the avatar standing on it; sampling there reads
  //     the monster's shirt, not the overlay. The east quarter-point is inside
  //     the tile diamond but clear of the sprite.
  const tileColorAt = (p, x, y) => p.evaluate(([tx, ty]) => {
    const g = window.__harness.game;
    const pt = g.p(tx + 0.3, ty - 0.3, g.room.heightAt(tx, ty));
    const c = g.canvas;
    const dpr = c.width / c.clientWidth;
    const px = g.ctx.getImageData(
      Math.round((pt.x + g.cam.x) * dpr), Math.round((pt.y + g.cam.y) * dpr), 1, 1).data;
    return { r: px[0], g: px[1], b: px[2] };
  }, [x, y]);

  const cardText = (p) => p.$eval('.skill-card', (el) => el.innerText.replace(/\s+/g, ' ').trim());

  // Walk a tile's north edge (where hoverColor's stroke lands) and report the
  // strongest red and green found anywhere along it.
  //
  // NOT "the most saturated pixel": that picks up whatever sprite overhangs the
  // edge - the Cleric's blue tunic out-saturated her own green outline and made
  // this read 'plain'. Per-channel maxima cannot be hijacked by an unrelated
  // colour, because blue raises neither.
  const edgePeak = (p, x, y) => p.evaluate(([tx, ty]) => {
    const g = window.__harness.game;
    const c = g.canvas;
    const dpr = c.width / c.clientWidth;
    let red = 0;
    let green = 0;
    for (let i = 0; i <= 20; i++) {
      const pt = g.p(tx - 0.5 + i / 20, ty - 0.5, g.room.heightAt(tx, ty));
      const d = g.ctx.getImageData(
        Math.round((pt.x + g.cam.x) * dpr), Math.round((pt.y + g.cam.y) * dpr), 1, 1).data;
      red = Math.max(red, d[0] - Math.max(d[1], d[2]));
      green = Math.max(green, d[1] - Math.max(d[0], d[2]));
    }
    return { red, green };
  }, [x, y]);

  const moveTo = async (p, x, y) => {
    const at = await p.evaluate(([tx, ty]) => {
      const g = window.__harness.game;
      const pt = g.p(tx, ty, g.room.heightAt(tx, ty));
      return { x: pt.x + g.cam.x, y: pt.y + g.cam.y };
    }, [x, y]);
    await p.mouse.move(at.x, at.y);
    await p.waitForTimeout(220);
  };

  // The tile under the cursor, sampled along the edge where hoverColor strokes.
  //
  // Deliberately NOT differenced against the un-hovered frame. Differencing
  // would isolate the stroke from the fill, but only when the two disagree -
  // and them AGREEING is the whole point of the fix, so on a correct build the
  // delta is zero and the check would fail for the best possible reason. What
  // is asserted instead is the property that actually regressed: hover a foe
  // while aiming a strike and there must be red on that edge and no green. The
  // old build painted both the fill and the stroke green here, so it fails
  // this on both counts (verified by reverting the fix).
  const hoverPeak = async (p, x, y) => {
    await moveTo(p, x, y);
    return edgePeak(p, x, y);
  };

  // ---- 1. an attack skill lights its foes RED -------------------------------
  console.log('a strike aims in red');
  await page.goto(HARNESS('net'), { waitUntil: 'load' });
  await page.waitForSelector('.skill-card');
  await page.waitForTimeout(300); // one render pass, so the overlay is on the canvas

  // The three foes stand at (5,3), (6,4), (5,5); the mage casting is at (4,4)
  // and the wounded cleric at (3,5). A strike must light the foes and nothing
  // friendly.
  const foeTiles = await Promise.all([[5, 3], [6, 4], [5, 5]].map(([x, y]) => tileColorAt(page, x, y)));
  check('every foe in range is painted red', foeTiles.every((p) => classify(p) === 'red'));
  check('the ally is NOT painted (a strike cannot target her)',
    classify(await tileColorAt(page, 3, 5)) === 'plain');
  check('no tile of a strike is painted ally-green',
    foeTiles.every((p) => classify(p) !== 'green'));

  const netCard = await cardText(page);
  check('the card names the skill and its price', netCard.includes('Net') && netCard.includes('4 MP'));
  check('the card states the damage the engine will deal', netCard.includes('Hits one foe for 8'));
  check('the card warns about the root, which nothing else in the UI mentions',
    /root/i.test(netCard));
  check('the card teaches the armor pierce', netCard.includes('half the target armor'));
  check('the prompt names the colour actually painted',
    (await page.$eval('#actions button', (el) => el.textContent)).includes('red foe'));

  // The cursor outline is a SECOND paint of the same tile (Game.hoverColor),
  // and it was green for every skill too - so a fix to the fill alone would
  // still have ringed a doomed monster in ally green as you pointed at it.
  const strikeHover = await hoverPeak(page, 5, 3);
  check('the hovered foe TILE reads red, with no ally-green on it',
    strikeHover.red > 20 && strikeHover.green < 8);
  await shot(page, '1-aim-strike.png');

  // ---- 2. a support skill lights its allies GREEN ---------------------------
  console.log('\nsupport aims in green');
  await page.goto(HARNESS('sapling_barrier'), { waitUntil: 'load' });
  await page.waitForSelector('.skill-card');
  await page.waitForTimeout(300);

  check('the ally is painted green', classify(await tileColorAt(page, 3, 5)) === 'green');
  const foesDuringSupport = await Promise.all([[5, 3], [6, 4], [5, 5]].map(([x, y]) => tileColorAt(page, x, y)));
  check('no foe is painted by a support cast', foesDuringSupport.every((p) => classify(p) === 'plain'));
  const saplingCard = await cardText(page);
  check('the card states the shield amount and the area',
    saplingCard.includes('soaks 8') && saplingCard.includes('3x3'));
  check('the prompt says green for support',
    (await page.$eval('#actions button', (el) => el.textContent)).includes('green ally'));
  const supportHover = await hoverPeak(page, 3, 5);
  check('the hovered ally tile reads green, with no attack-red on it',
    supportHover.green > 20 && supportHover.red < 8);
  await shot(page, '2-aim-support.png');

  // ---- 3. a self-centered blast previews itself -----------------------------
  // Thorns used to fire the instant its button was pressed: the 10 MP spell was
  // the one a player could never read before paying, because there was no
  // aiming step to show a description in. It now paints the tiles it will hit.
  console.log('\na self-centered blast previews before it fires');
  await page.goto(HARNESS('thorns'), { waitUntil: 'load' });
  await page.waitForSelector('.skill-card');
  await page.waitForTimeout(300);

  const blast = await Promise.all([[3, 3], [4, 4], [5, 5], [5, 3]].map(([x, y]) => tileColorAt(page, x, y)));
  check('the whole 3x3 blast is painted red', blast.every((p) => classify(p) === 'red'));
  check('a tile outside the blast is left alone',
    classify(await tileColorAt(page, 7, 4)) === 'plain');
  const thornsCard = await cardText(page);
  check('the card says the blast is centered on the caster',
    thornsCard.includes('Centered on you') && thornsCard.includes('around you'));
  const labels = await page.$$eval('#actions button', (els) => els.map((e) => e.textContent));
  check('the cast is a deliberate confirm, not an instant spend',
    labels.some((l) => l.includes('Cast Thorns')));
  check('and it can still be backed out of', labels.some((l) => l === 'Back'));
  await shot(page, '3-aim-selfblast.png');

  // ---- 4. the menu explains a spell BEFORE it is aimed ----------------------
  console.log('\nthe skill menu');
  await page.goto(HARNESS('none'), { waitUntil: 'load' });
  await page.waitForSelector('#actions button');
  await page.waitForTimeout(300);

  const tips = await page.$$eval('#actions button', (els) =>
    els.map((e) => ({ label: e.textContent, title: e.title })));
  const skillBtns = tips.filter((t) => /MP\)/.test(t.label));
  check('the mage offers her skills', skillBtns.length >= 3);
  check('every skill button carries a full description on hover',
    skillBtns.every((t) => t.title.includes('MP') && t.title.split('\n').length >= 2));
  check('the tooltip is the same copy the card shows',
    skillBtns.every((t) => t.title.startsWith(t.label.replace(/ \(\d+ MP\)$/, ''))));
  await shot(page, '4-skill-menu.png');

  check('no page errors in any of it', errors.length === 0);
  if (errors.length) for (const e of errors) console.error(`        ${e}`);

  // The screenshots are the artefact: prove they are real images, not 0-byte
  // files from a failed capture.
  console.log('\nscreenshots');
  for (const f of ['1-aim-strike.png', '2-aim-support.png', '3-aim-selfblast.png', '4-skill-menu.png']) {
    check(`${f} captured`, existsSync(`${SHOTS}${f}`) && statSync(`${SHOTS}${f}`).size > 3000);
  }
} finally {
  await browser.close();
  server.kill();
}

console.log(state.failed ? `\n${state.failed} check(s) FAILED` : '\nAll skill-aim visual checks passed');
process.exit(state.failed ? 1 : 0);
