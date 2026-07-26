// A REAL Postgres + PostgREST stack for the duel suite, booted in-process.
//
// Why this exists: every duel check until now ran against an in-memory fake, so
// supabase/functions/_shared/duelStore.ts (PostgREST filter syntax, maybeSingle
// semantics) and supabase/migrations/*_duels.sql (the RLS policy) were entirely
// unproven. Proving them needs a database that behaves like Postgres, not a Map.
//
// What is REAL here:
//   • PostgreSQL 18 (embedded-postgres — the official binaries, a real server
//     on a real port), with the duels migration applied VERBATIM.
//   • PostgREST 14 in front of it, so duelStore.ts's queries are parsed and
//     executed by the same engine Supabase runs — `.or(...)` filter strings,
//     `.maybeSingle()`'s "more than one row" error, RLS rejections as PGRST/
//     SQLSTATE codes on the wire.
//   • JWT auth: PostgREST verifies HS256 tokens minted here, switches to the
//     `role` claim and exposes `sub` as request.jwt.claims — which is what
//     auth.uid() reads, exactly as on Supabase.
//   • Role privileges reproduced the way Supabase grants them: anon and
//     authenticated hold table-level GRANTs, so RLS is genuinely the only gate
//     (a rejection here is the POLICY refusing, not a missing GRANT), and
//     service_role is BYPASSRLS like the edge functions' service client.
//
// What is NOT here (and is called out at the end of the run rather than
// silently glossed): GoTrue, Realtime, and the deployed edge functions. Docker
// is unavailable on this machine so `supabase start` can't run, and the project
// baked into js/supabase.js does not resolve in DNS, so the hosted stack is
// unreachable too. The duel flows are therefore driven directly against
// duelStore(svc) — the same call the duel-* functions make one line below their
// auth check — and the broadcasts they return are asserted as data instead of
// being carried by Realtime.
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createHmac } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, openSync, closeSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import { PostgrestClient } from '@supabase/postgrest-js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PG_BIN = join(ROOT, 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin');
// PostgREST is fetched once by tests/e2e/fetchPostgrest.mjs (it is a single
// static binary, not an npm package).
const PGRST = join(ROOT, '.gg', 'bin', process.platform === 'win32' ? 'postgrest.exe' : 'postgrest');

// A 32+ char HS256 secret — PostgREST rejects anything shorter.
const JWT_SECRET = 'hd-duel-e2e-secret-key-0123456789abcdef';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

/** Mint a Supabase-shaped access token: `role` picks the Postgres role
 *  PostgREST switches to, `sub` is what auth.uid() returns. */
export function mintJwt(claims) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({
    iss: 'supabase', aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  }));
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

// The Supabase-managed schema the duels migration and duelStore.ts sit on top
// of: the auth schema + auth.uid(), the three API roles with Supabase's own
// grant shape, and the dependency tables duelStore reads. Column shapes are
// copied from supabase/migrations/20260725000000_v2_backend.sql so the queries
// under test see the columns they see in production.
const SUPABASE_SHIM = `
create extension if not exists pgcrypto;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

-- Supabase's auth.uid(): the JWT's sub claim, as seen by RLS policies.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;

do $$ begin create role anon nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role authenticator noinherit login password 'postgres'; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Dependency tables (shapes lifted from the v2 backend migration).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  habbo_username text,
  habbo_figure text,
  updated_at timestamptz not null default now()
);
create table if not exists public.room_presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  room_id text not null,
  name text not null,
  figure text not null default '',
  x int not null default 0,
  y int not null default 0,
  dir int not null default 4,
  last_seen timestamptz not null default now()
);
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  a_user uuid not null references auth.users (id) on delete cascade,
  b_user uuid not null references auth.users (id) on delete cascade,
  a_name text not null,
  b_name text not null,
  room_id text,
  status text not null default 'active' check (status in ('asked', 'active', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.party_members (
  party_id uuid not null references public.parties (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  primary key (party_id, user_id)
);
create table if not exists public.battle_states (
  id uuid primary key default gen_random_uuid(),
  party_id uuid references public.parties (id) on delete cascade,
  dungeon_id text not null,
  created_at timestamptz not null default now()
);
`;

// Supabase grants anon/authenticated full table privileges on public and lets
// RLS do the gating. Reproduced AFTER the migration so `duels` is included:
// without this a rejected INSERT could be a missing GRANT rather than the
// policy, and the RLS assertions would prove nothing.
const GRANTS = `
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
`;

/** N distinct OS-assigned free ports.
 *
 *  Fixed ports are a trap for a suite like this: a leftover server (or any
 *  other dev process) squatting on one makes embedded-postgres reject with a
 *  bare `undefined`, which reads like a broken test rather than a busy socket.
 *
 *  Every probe socket is held open until ALL of them have been assigned, then
 *  they are closed together. Probing one at a time is what caused a ~1-in-5
 *  flake here: the OS is free to hand the just-released port straight back on
 *  the next probe, so Postgres and PostgREST were occasionally given the SAME
 *  port. PostgREST would bind 0.0.0.0:P (legal alongside Postgres on
 *  127.0.0.1:P on Windows), report "API server listening", then dial
 *  localhost:P for its database, reach ITSELF, and exit 3 with no explanation. */
async function freePorts(n) {
  const servers = await Promise.all(Array.from({ length: n }, () => new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  })));
  const ports = servers.map((s) => s.address().port);
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  return ports;
}

/** Boot Postgres + PostgREST, apply the shim and the migration SQL. */
export async function startStack({ pgPort, apiPort, migrations = [] } = {}) {
  if (!existsSync(PGRST)) {
    throw new Error(`PostgREST binary missing at ${PGRST} — run: node tests/e2e/fetchPostgrest.mjs`);
  }
  const [autoPg, autoApi] = await freePorts(2);
  pgPort = pgPort ?? autoPg;
  apiPort = apiPort ?? autoApi;
  if (pgPort === apiPort) throw new Error(`port collision: postgres and postgrest both on ${pgPort}`);
  const dataDir = mkdtempSync(join(tmpdir(), 'hd-duel-pg-'));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres',
    port: pgPort, persistent: false, onLog: () => {},
  });
  // embedded-postgres rejects with undefined on a failed spawn, which would
  // otherwise surface as "FATAL: undefined" with nothing to act on.
  try {
    await pg.initialise();
    await pg.start();
  } catch (e) {
    throw new Error(
      `postgres failed to start on port ${pgPort}: ${e?.message ?? e ?? 'no error given'} ` +
      '(is another instance already listening?)',
    );
  }
  // UTF8 explicitly. initdb picks the host locale (WIN1252 on this machine),
  // and the migration's comments contain non-ASCII text — on a WIN1252
  // database applying it fails outright. Supabase databases are UTF8, so
  // anything else would also be testing the wrong server.
  const admin = pg.getPgClient();
  await admin.connect();
  await admin.query("create database duel_e2e encoding 'UTF8' template template0");
  await admin.end();

  const client = pg.getPgClient('duel_e2e');
  await client.connect();
  await client.query("set client_encoding to 'UTF8'");
  const applied = [];
  await client.query(SUPABASE_SHIM);
  for (const { name, sql } of migrations) {
    await client.query(sql); // throws with the real SQLSTATE if the migration is bad
    applied.push(name);
  }
  await client.query(GRANTS);

  // PostgREST connects as `authenticator`, which owns no data and can only
  // become anon/authenticated/service_role — the Supabase arrangement.
  const dbUri = `postgres://authenticator:postgres@localhost:${pgPort}/duel_e2e`;
  const writeConf = (port) => {
    const p = join(dataDir, `postgrest-${port}.conf`);
    writeFileSync(p, [
      `db-uri = "${dbUri}"`,
      'db-schemas = "public"',
      'db-anon-role = "anon"',
      `jwt-secret = "${JWT_SECRET}"`,
      `server-port = ${port}`,
      // 'info' so a startup failure reports WHY in the captured log; the log
      // is only printed when something goes wrong.
      'log-level = "info"',
      // Don't give up on the first connection attempt: Postgres has only just
      // finished booting. Both keys are verified against `postgrest --example`
      // — an UNRECOGNISED key does not fail loudly, it makes startup
      // intermittently abort with a bare `exit 3` and no log line at all. A
      // previously invented `db-connection-retry-wait` here cost ~2-in-10 runs
      // before it was caught.
      'db-pool-acquisition-timeout = 20',
      'db-pool-automatic-recovery = true',
    ].join('\n'));
    return p;
  };

  // Spawning PostgREST is retried, because the binary itself is flaky on
  // Windows at startup: roughly 1 run in 15 it prints "API server listening"
  // and then exits 3 immediately, writing no reason anywhere (confirmed with
  // the log going to a file rather than a pipe, so nothing is being dropped —
  // see below). That is a defect in the test tooling, not in anything this
  // suite asserts, and a failed boot is unambiguous, so a fresh attempt on a
  // fresh port is safe. A stuck-but-alive server is NOT retried: only an early
  // exit is.
  let api = null;
  let apiLog = null;
  let base = null;
  const attempts = [];
  for (let attempt = 1; attempt <= 3 && !base; attempt++) {
    const port = attempt === 1 ? apiPort : (await freePorts(1))[0];
    const confPath = writeConf(port);
    // Log to a FILE, not a pipe. On Windows a process that dies moments after
    // spawning can have its final pipe writes dropped, which is precisely when
    // the log matters — this suite spent several runs staring at "exited (3)"
    // with the reason missing. A file loses nothing.
    const logPath = join(dataDir, `postgrest-${port}.log`);
    const logFd = openSync(logPath, 'a');
    const child = spawn(PGRST, [confPath], {
      // libpq ships with the embedded Postgres; PostgREST needs it on PATH.
      env: { ...process.env, PATH: `${PG_BIN}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}` },
      stdio: ['ignore', logFd, logFd],
    });
    const log = {
      path: logPath,
      read: () => { try { return readFileSync(logPath, 'utf8'); } catch { return '<no log>'; } },
    };
    const url = `http://localhost:${port}`;
    try {
      await waitForApi(url, child, log, { pgPort, apiPort: port });
      api = child;
      apiLog = log;
      base = url;
      apiPort = port;
    } catch (e) {
      attempts.push(`attempt ${attempt} (port ${port}): ${e.message}`);
      try { child.kill(); } catch { /* already gone */ }
      await new Promise((r) => setTimeout(r, 500));
    } finally {
      closeSync(logFd);
    }
  }
  if (!base) {
    try { await client.end(); } catch { /* ignore */ }
    try { await pg.stop(); } catch { /* ignore */ }
    throw new Error(`PostgREST would not start after 3 attempts:\n${attempts.join('\n')}`);
  }
  if (attempts.length) {
    console.log(`  (postgrest needed ${attempts.length + 1} attempts to boot — known Windows flake)`);
  }

  return {
    pg, client, api, applied, dataDir, base, apiLog, pgPort, apiPort, dbUri,
    /** A PostgREST client bound to one identity. `.from()` is the very method
     *  supabase-js delegates to, so duelStore.ts runs unmodified against it. */
    clientFor(claims) {
      const token = mintJwt(claims);
      return new PostgrestClient(base, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
    },
    async stop() {
      // Order matters, and every step is best-effort but VERIFIED: a leaked
      // postgres keeps a port and a temp dir alive on the developer's machine
      // long after the run, and 15 runs leaked 3 of them before this was
      // tightened. pg.stop() can reject (or resolve without the server
      // actually being gone) when the data dir is still locked, so the process
      // is force-killed as a fallback.
      try { api.kill(); } catch { /* already gone */ }
      try { await client.end(); } catch { /* already closed */ }
      try {
        await pg.stop();
      } catch {
        try { pg.stopSync?.(); } catch { /* fall through to the pid kill */ }
      }
      await killIfAlive(pgPort);
      // Windows can hold the data dir briefly after the server exits.
      for (let i = 0; i < 5; i++) {
        try { rmSync(dataDir, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 300)); }
      }
    },
  };
}

/** Nothing should still be listening on the stack's Postgres port once it has
 *  been stopped. If something is, it is our own orphaned server — kill it by
 *  the PID that holds the port rather than leaving it running. */
async function killIfAlive(port) {
  if (process.platform !== 'win32') return;
  try {
    const pids = execFileSync('powershell', [
      '-NoProfile', '-Command',
      `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess`,
    ], { encoding: 'utf8', timeout: 10000 }).split(/\s+/).filter(Boolean);
    for (const pid of [...new Set(pids)]) {
      execFileSync('powershell', [
        '-NoProfile', '-Command', `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`,
      ], { timeout: 10000 });
    }
  } catch { /* nothing listening, or no powershell — nothing to clean */ }
}

async function waitForApi(base, api, apiLog, { pgPort, apiPort }) {
  const deadline = Date.now() + 30000;
  let last = '';
  while (Date.now() < deadline) {
    if (api.exitCode !== null) {
      // Let the pipes drain: PostgREST writes the reason (bad credentials,
      // unreachable database) after the "listening" line, and throwing
      // immediately reports the banner without the actual error.
      await new Promise((r) => setTimeout(r, 300)); // let the last write land
      throw new Error(
        `PostgREST exited (${api.exitCode}) [db :${pgPort}, api :${apiPort}]:\n${apiLog.read()}`,
      );
    }
    try {
      const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e.message;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`PostgREST never came up (${last})\n${apiLog.read()}`);
}

/** Insert a row straight through Postgres (the "seed" path — service-side). */
export async function seedUser(client, { name, room = null, lastSeen = 'now()' }) {
  const { rows } = await client.query('insert into auth.users default values returning id');
  const id = rows[0].id;
  await client.query(
    'insert into public.profiles (id, habbo_username) values ($1, $2)', [id, name],
  );
  if (room) {
    await client.query(
      `insert into public.room_presence (user_id, room_id, name, last_seen)
       values ($1, $2, $3, ${lastSeen})`, [id, room, name],
    );
  }
  return { id, name };
}
