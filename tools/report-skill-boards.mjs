// Print the daily fishing/gardening boards. Research tool, not shipped code.
//
//   node tools/report-skill-boards.mjs            # parse saved reference HTML
//   node tools/report-skill-boards.mjs --live     # re-fetch both sites
//
// Default is OFFLINE on purpose: the saved copies in tools/reference/ are the
// fixtures the parser is written against, so a plain run proves the parse
// without touching (or being rate-limited by) someone else's server. Those
// copies are gitignored (tools/reference/), so on a fresh clone use --live.
//
// The parser is imported straight from the edge function's shared dir -- ONE
// copy of the logic, exercised here exactly as Deno runs it. Node 24 strips the
// TypeScript types on import, so no build step is involved.

import { readFile } from 'node:fs/promises';
import { BOARDS, parseBoard, fetchBoard } from '../supabase/functions/_shared/skillBoards.ts';

const live = process.argv.includes('--live');
const n = (v) => (v === null || v === undefined ? '--' : v.toLocaleString('en-US'));

for (const board of Object.values(BOARDS)) {
  const result = live
    ? await fetchBoard(board)
    : parseBoard(
        await readFile(new URL(`./reference/${board.reference}`, import.meta.url), 'utf8'),
        board,
      );

  console.log(`\n=== ${result.label} - ${result.url} ${live ? '(live)' : '(saved)'} ===`);
  console.log(
    `total: ${n(result.stats.total)}   today: ${n(result.stats.today)}   ` +
      `avg XP today: ${n(result.stats.avgXp)}`,
  );
  for (const r of result.rows) {
    console.log(`  ${String(r.rank).padStart(2)}. ${r.username.padEnd(20)} +${n(r.xpGained)} XP`);
  }
  console.log(`  (${result.rows.length} rows)`);
  if (result.problems.length) console.log('  PROBLEMS:', result.problems.join('; '));
}
