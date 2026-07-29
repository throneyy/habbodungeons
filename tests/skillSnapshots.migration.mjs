// Proves supabase/migrations/20260729120000_skill_snapshots.sql actually runs,
// and that the table it creates answers the question it exists to answer.
//
// Boots the real embedded PostgreSQL 18 the duel e2e stack already uses, lays
// down the Supabase shim (auth schema, the three API roles, profiles), applies
// the migration verbatim, then checks:
//   1. it applies cleanly, and is idempotent (re-running is a no-op)
//   2. the "gained in a window" query works and uses the covering index
//   3. anon can SELECT (RLS + grant), and anon canNOT write
//
//   node tests/skillSnapshots.migration.mjs
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIGRATION = join(ROOT, 'supabase/migrations/20260729120000_skill_snapshots.sql');

let failed = 0;
const check = (label, cond, detail) => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ->  ${detail}` : ''}`);
  if (!cond) failed++;
};

const freePort = () =>
  new Promise((res, rej) => {
    const s = createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

// The Supabase-managed surface the migration assumes exists.
const SHIM = `
create extension if not exists pgcrypto;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;
do $$ begin create role anon nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to anon, authenticated, service_role;
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  habbo_username text,
  fishing_level int not null default 0,
  gardening_level int not null default 0,
  last_habbo_skill_sync timestamptz
);
`;

const port = await freePort();
const dataDir = mkdtempSync(join(tmpdir(), 'skillsnap-pg-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: false,
});

console.log('skill_snapshots migration');
await pg.initialise();
await pg.start();
await pg.createDatabase('snap');
const db = pg.getPgClient('snap');
await db.connect();

try {
  await db.query(SHIM);
  const sql = readFileSync(MIGRATION, 'utf8');

  // ---- 1. applies, and is idempotent -------------------------------------
  await db.query(sql);
  check('migration applies cleanly', true);
  let idempotent = true;
  try {
    await db.query(sql);
  } catch (e) {
    idempotent = false;
    check('re-running is a no-op', false, e.message);
  }
  if (idempotent) check('re-running is a no-op (guards are IF NOT EXISTS)', true);

  const cols = await db.query(`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_name = 'skill_snapshots' order by ordinal_position`);
  check(
    'columns are user_id / fishing_level / gardening_level / captured_at',
    ['id', 'user_id', 'fishing_level', 'gardening_level', 'captured_at'].every((c) =>
      cols.rows.some((r) => r.column_name === c),
    ),
    cols.rows.map((r) => r.column_name).join(', '),
  );

  const idx = await db.query(
    `select indexname from pg_indexes where tablename = 'skill_snapshots' order by indexname`,
  );
  check('exactly 3 indexes: pk, unique(user,at), time -- no speculative extras',
    idx.rows.length === 3, idx.rows.map((r) => r.indexname).join(', '));

  // ---- 2. the query it exists to answer ----------------------------------
  // Two users, three readings each across a 2-day span. Ada gains 9 in the
  // window, Bo gains 2 -- so a "gained today" board must rank Ada first even
  // though Bo has the higher absolute level.
  await db.query(`
    insert into auth.users (id) values
      ('11111111-1111-1111-1111-111111111111'),
      ('22222222-2222-2222-2222-222222222222');
    insert into public.profiles (id, habbo_username) values
      ('11111111-1111-1111-1111-111111111111', 'Ada'),
      ('22222222-2222-2222-2222-222222222222', 'Bo');
    insert into public.skill_snapshots (user_id, fishing_level, gardening_level, captured_at) values
      ('11111111-1111-1111-1111-111111111111', 30, 5, now() - interval '30 hours'),
      ('11111111-1111-1111-1111-111111111111', 41, 6, now() - interval '20 hours'),
      ('11111111-1111-1111-1111-111111111111', 50, 7, now() - interval '1 hour'),
      ('22222222-2222-2222-2222-222222222222', 80, 1, now() - interval '30 hours'),
      ('22222222-2222-2222-2222-222222222222', 90, 2, now() - interval '20 hours'),
      ('22222222-2222-2222-2222-222222222222', 92, 3, now() - interval '1 hour');
  `);

  // earliest + latest per user inside a 24h window, in one pass
  const BOARD = `
    with w as (
      select user_id, fishing_level, captured_at,
             first_value(fishing_level) over (partition by user_id order by captured_at asc)  as first_f,
             first_value(fishing_level) over (partition by user_id order by captured_at desc) as last_f
      from public.skill_snapshots
      where captured_at >= now() - interval '24 hours'
    )
    select distinct p.habbo_username, (w.last_f - w.first_f) as gained
    from w join public.profiles p on p.id = w.user_id
    order by gained desc`;
  const board = await db.query(BOARD);
  check('window excludes the 30h-old rows', board.rows.length === 2);
  check('ranks by GAIN, not by absolute level',
    board.rows[0].habbo_username === 'Ada' && Number(board.rows[0].gained) === 9,
    board.rows.map((r) => `${r.habbo_username}+${r.gained}`).join(', '));
  check('the lower gainer still places', Number(board.rows[1].gained) === 2);

  // ---- the index must EARN its place at realistic volume -----------------
  // With six rows a seq scan is genuinely cheaper and the planner is right to
  // ignore the index, so asserting on a toy table proves nothing. Load a
  // year of daily history for 2,000 linked players (~700k rows) and check the
  // plan there instead.
  await db.query(`
    insert into auth.users (id)
    select gen_random_uuid() from generate_series(1, 2000);
    insert into public.skill_snapshots (user_id, fishing_level, gardening_level, captured_at)
    select u.id,
           (d % 100), (d % 60),
           now() - (d || ' hours')::interval
    from auth.users u
    cross join generate_series(1, 365) d
    where u.id not in ('11111111-1111-1111-1111-111111111111',
                       '22222222-2222-2222-2222-222222222222')
    on conflict do nothing;
  `);
  await db.query('analyze public.skill_snapshots');
  const total = await db.query('select count(*)::int as n from public.skill_snapshots');

  // The window predicate must prune via the time index -- never a seq scan
  // over the whole history. This is the claim the index choice rests on.
  const plan = await db.query(
    `explain (analyze, format text) select distinct on (user_id) user_id, fishing_level
     from public.skill_snapshots where captured_at >= now() - interval '24 hours'
     order by user_id, captured_at desc`,
  );
  const planText = plan.rows.map((r) => r['QUERY PLAN']).join('\n');
  const ms = (planText.match(/Execution Time: ([\d.]+)/) || [])[1];
  check('the window prunes via skill_snapshots_captured_at_idx',
    /skill_snapshots_captured_at_idx/.test(planText),
    `${total.rows[0].n} rows in ${ms}ms`);
  check('no sequential scan over the full history',
    !/Seq Scan on skill_snapshots/.test(planText));

  // per-user history is the shape that DOES lead with user_id -- it must use
  // the unique constraint's index rather than scanning
  const planUser = await db.query(
    `explain (format text) select fishing_level, captured_at from public.skill_snapshots
     where user_id = '11111111-1111-1111-1111-111111111111' order by captured_at desc`,
  );
  const userText = planUser.rows.map((r) => r['QUERY PLAN']).join('\n');
  check('per-user history uses the unique index (already paid for)',
    /skill_snapshots_user_at_key/.test(userText),
    userText.split('\n')[0].trim());

  // ---- 3. RLS + grants ----------------------------------------------------
  await db.query('set role anon');
  const anonRead = await db.query('select count(*)::int as n from public.skill_snapshots');
  check('anon can SELECT (policy + grant both present)',
    anonRead.rows[0].n === total.rows[0].n, `${anonRead.rows[0].n} rows visible`);

  let anonWriteBlocked = false;
  let why = '';
  try {
    await db.query(
      `insert into public.skill_snapshots (user_id, fishing_level)
       values ('11111111-1111-1111-1111-111111111111', 9999)`,
    );
  } catch (e) {
    anonWriteBlocked = true;
    why = e.message.slice(0, 60);
  }
  check('anon canNOT write its own history', anonWriteBlocked, why);
  await db.query('reset role');

  // retry safety: the same instant twice must not double-count
  const dup = await db.query(`
    insert into public.skill_snapshots (user_id, fishing_level, captured_at)
    select user_id, fishing_level, captured_at from public.skill_snapshots limit 1
    on conflict (user_id, captured_at) do nothing
    returning id`);
  check('a re-fired capture is swallowed by the unique guard', dup.rowCount === 0);

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nall skill_snapshots checks passed');
} finally {
  await db.end().catch(() => {});
  await pg.stop().catch(() => {});
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* windows lock */ }
}

process.exit(failed ? 1 : 0);
