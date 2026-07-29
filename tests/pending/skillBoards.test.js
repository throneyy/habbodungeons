// Leaderboard scrape tests — run with:  node tests/pending/skillBoards.test.js
//
// PASSES (39/39). NOT WIRED INTO `npm test` yet, and not because it is unready.
// tests/readmeTests.test.js asserts that the number of suites in tests/ matches
// a count stated in README.md, so adding a suite REQUIRES editing README.md --
// which was carrying another dev's uncommitted work, and off-limits, when this
// landed. Parking it one directory down keeps the tree green without throwing
// the coverage away: run-suites.mjs and readmeTests.test.js both use a
// NON-recursive readdir of tests/, so nothing in here is discovered.
//
// TO ENABLE (two minutes, once README.md is free):
//   1. git mv tests/pending/skillBoards.test.js tests/
//   2. add to README.md's suite table:  skillBoards.test.js  39
//   3. bump the headline suite count 27 -> 28 and the check total 1343 -> 1382
//   4. npm test  (readmeTests verifies all three numbers agree)
//
// The parser reads two fan sites' HTML (habbofishing.com / habbogardening.com)
// that nobody here controls and that can change without warning. It cannot be
// made not to break; it CAN be made to break loudly and safely, and that is
// what these tests pin:
//
//   * a broken parse yields an empty board plus a `problems` entry -- never a
//     throw into the title screen, and never a half-built row that renders as
//     "undefined" beside a real one,
//   * the two real traps found while writing it stay fixed (see below).
//
// The fixtures are inline and deliberately tiny. The full saved pages live in
// tools/reference/, which is GITIGNORED -- a suite keyed to them would pass here
// and fail on a fresh clone. Each fixture reproduces the exact markup shape the
// live pages use, including the two places they disagree with each other.
import {
  BOARDS,
  fetchBoard,
  parseBoard,
  parseHeaderStats,
  parseTodayRows,
} from '../../supabase/functions/_shared/skillBoards.ts';

let failed = 0;
function check(label, cond) {
  if (!cond) failed++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}`);
}

// --- fixtures --------------------------------------------------------------

const statCard = (label, value) =>
  `<div class="card bg-light text-dark h-100"><div class="card-body text-center">
     <h5 class="card-title">${label}</h5>
     <p class="display-6 fw-bold">${value}</p>
   </div></div>`;

// rankClass mirrors the ONE structural difference between the two sites:
// fishing tags the rank span with `rank`, gardening does not tag it at all.
const entry = (name, rank, xp, rankClass) =>
  `<div class="col">
     <a href="https://example.com/player/${name}" class="text-decoration-none">
       <div class="card white h-100 shadow-sm"><div class="card-body d-flex align-items-center">
         <div class="me-3 p-2"><span class="${rankClass}">${rank}</span></div>
         <img src="https://www.habbo.com/habbo-imaging/avatarimage?figure=hr-1-1" alt="${name}" />
         <div class="flex-grow-1 text-dark"><h6 class="mb-0">${name}</h6></div>
         <div><span class="badge bg-success">+${xp} XP</span></div>
       </div></div>
     </a>
   </div>`;

// The fishing page really does carry a stat-less <h5 class="card-title"> in its
// frenzy banner, ABOVE the stat cards. That is trap #1, reproduced exactly.
const fishingPage = `
  <div class="card red"><div class="card-body py-3">
    <h5 class="card-title mb-0"><span data-role="title">Fishing Frenzy starts soon</span></h5>
    <p class="card-text mb-0 mt-1"><span data-role="label">Starts in</span><strong>-</strong></p>
  </div></div>
  <div class="card white mt-3"><div class="card-body">
    <h4 class="mb-3">General Fishing Statistics</h4>
    ${statCard('Total Fishers', '4,554')}
    ${statCard('Fishers Today', '183')}
    ${statCard('Avg. XP Gain Today', '63,842 XP')}
  </div></div>
  <div class="card white mt-3"><div class="card-body">
    <h4 class="mb-3">Derby Statistics</h4>
    ${statCard('Total Derbies', '1,224')}
  </div></div>
  <div class="card white mt-3"><div class="card-body">
    <h5 class="mb-3">Top fishermen today</h5>
    <div class="row row-cols-1">
      ${entry('.Dean.', 1, '695,420', 'fw-bold text-dark rank')}
      ${entry('johanna', 2, '538,846', 'fw-bold text-dark rank')}
    </div>
  </div></div>
  <div class="card white mt-3"><div class="card-body"><h5>Daily Trends</h5></div></div>`;

const gardeningPage = `
  <div class="card white mt-3"><div class="card-body">
    <h4 class="mb-3">General Gardening Statistics</h4>
    ${statCard('Total Gardeners', '2,638')}
    ${statCard('Gardeners Today', '36')}
    ${statCard('Avg. XP Gain Today', '346,528 XP')}
  </div></div>
  <div class="card white mt-3"><div class="card-body">
    <h5 class="mb-3">Top gardeners today</h5>
    <div class="row row-cols-1">
      ${entry('Jordid', 1, '6,558,300', 'fw-bold text-dark')}
      ${entry('caddylaks', 2, '2,406,627', 'fw-bold text-dark')}
    </div>
  </div></div>`;

// --- tests -----------------------------------------------------------------

console.log('\nthe fishing board parses');
{
  const r = parseBoard(fishingPage, BOARDS.fishing);
  check('no problems reported', r.problems.length === 0);
  check('two rows', r.rows.length === 2);
  check('rank, name and XP on row 1', r.rows[0].rank === 1 && r.rows[0].username === '.Dean.' && r.rows[0].xpGained === 695420);
  check('row 2 keeps its own rank', r.rows[1].rank === 2 && r.rows[1].username === 'johanna');
  check('header stats read', r.stats.total === 4554 && r.stats.today === 183 && r.stats.avgXp === 63842);
  check('credit is carried for the UI', r.credit === 'habbofishing.com');
}

console.log('\nthe gardening board parses, despite differing markup');
{
  const r = parseBoard(gardeningPage, BOARDS.gardening);
  check('no problems reported', r.problems.length === 0);
  check('two rows', r.rows.length === 2);
  // TRAP #2: gardening's rank span has no `rank` class. Keying on that class
  // silently lost every gardening rank.
  check('rank found without a .rank class', r.rows[0].rank === 1 && r.rows[1].rank === 2);
  check('seven-figure XP intact', r.rows[0].xpGained === 6558300);
  check('header stats read', r.stats.total === 2638 && r.stats.today === 36);
}

console.log('\nthe two traps stay fixed');
{
  // TRAP #1: a lazy [\s\S]*? capture backtracks past </h5> and welds the
  // frenzy banner onto the next card, so "Total Fishers" reads as missing.
  const { stats, problems } = parseHeaderStats(fishingPage, BOARDS.fishing.stats);
  check('a stat-less card-title above the stats does not swallow them', stats.total === 4554);
  check('and reports no problem', problems.length === 0);

  // Card ORDER differs between the sites (fishing has an extra Derby block), so
  // the labels must be matched by text, never by position.
  const r = parseBoard(fishingPage, BOARDS.fishing);
  check('the Derby card does not leak into the general stats', r.stats.total === 4554);
}

console.log('\nbreakage degrades, never throws');
{
  const cases = [
    ['empty document', ''],
    ['heading renamed', gardeningPage.replace('Top gardeners today', 'Top growers of the day')],
    ['player links gone', fishingPage.replace(/href="[^"]*"/g, 'href="#"')],
    ['XP badges gone', fishingPage.replace(/class="badge bg-success"/g, 'class="chip"')],
    ['stats gone', fishingPage.replace(/display-6 fw-bold/g, 'x')],
  ];
  for (const [label, html] of cases) {
    let r;
    try {
      r = parseBoard(html, BOARDS.fishing);
    } catch (e) {
      check(`${label}: did not throw`, false);
      continue;
    }
    check(`${label}: did not throw`, true);
    check(`${label}: says what went wrong`, r.problems.length > 0);
    check(`${label}: every returned row is complete`, r.rows.every((x) => x.username && x.xpGained > 0));
  }
}

console.log('\nrow-level edge cases');
{
  const enc = parseTodayRows(entry('Mr%20Big%21', 1, '5,000', 'rank'));
  check('a URL-encoded name is decoded', enc.rows[0].username === 'Mr Big!');

  // A row missing only its XP is dropped rather than shown as "+undefined",
  // and the rows around it keep their own ranks.
  const mixed = parseTodayRows(
    entry('Good', 1, '100', 'rank') + entry('Broken', 2, '200', 'rank').replace(/<span class="badge[^<]*<\/span>/, '') + entry('Also', 3, '300', 'rank'),
  );
  check('the broken row is dropped', mixed.rows.length === 2);
  check('surviving rows keep their source ranks', mixed.rows[0].rank === 1 && mixed.rows[1].rank === 3);
  check('and the drop is reported', mixed.problems.some((p) => p.includes('Broken')));
}

// fetchError is the edge function's retry signal. It must be set for transport
// failures ONLY: retrying a timeout is worth a second request, but re-fetching
// a page whose markup moved just doubles our load on their server for the same
// wrong answer. Getting this backwards means hammering a site that is fine.
console.log('\nfetchError marks transport failures, and only those');
{
  const reject = () => Promise.reject(new Error('ETIMEDOUT'));
  const r1 = await fetchBoard(BOARDS.fishing, { fetchImpl: reject });
  check('a network failure sets fetchError', r1.fetchError === 'fetch failed: ETIMEDOUT');
  check('and returns no rows', r1.rows.length === 0);

  const fail503 = () => Promise.resolve(new Response('nope', { status: 503 }));
  const r2 = await fetchBoard(BOARDS.fishing, { fetchImpl: fail503 });
  check('a non-2xx sets fetchError', r2.fetchError === 'HTTP 503');

  const junk = () => Promise.resolve(new Response('<html>maintenance</html>', { status: 200 }));
  const r3 = await fetchBoard(BOARDS.fishing, { fetchImpl: junk });
  check('a page that loads but does not parse does NOT set fetchError', r3.fetchError === undefined);
  check('though it still reports problems', r3.problems.length > 0);

  const ok = () => Promise.resolve(new Response(fishingPage, { status: 200 }));
  const r4 = await fetchBoard(BOARDS.fishing, { fetchImpl: ok });
  check('a good fetch sets no fetchError', r4.fetchError === undefined && r4.rows.length === 2);
}

console.log(
  failed === 0 ? '\nall skill board parse checks passed' : `\n${failed} skill board check(s) FAILED`,
);
process.exit(failed === 0 ? 0 : 1);
