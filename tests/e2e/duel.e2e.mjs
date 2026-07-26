// Duel handshake against a REAL database — run with:
//   node tests/e2e/fetchPostgrest.mjs   (once)
//   node tests/e2e/duel.e2e.mjs
//
// tests/duel.test.js drives the duel flows against an in-memory fake, so it
// proves the RULES and proves nothing at all about the storage layer:
// supabase/functions/_shared/duelStore.ts's PostgREST queries and the RLS
// policy in supabase/migrations/20260726120000_duels.sql have never executed.
// This suite applies that migration to a real PostgreSQL 18 server, puts a real
// PostgREST 14 in front of it, and runs the UNMODIFIED duelStore against it —
// two authenticated identities, exactly the two-session shape of
// partyInviteError.e2e.mjs.
//
// Covered:
//   • challenge → accept → countdown, with both sessions handed the same
//     startsAt / goAt / serverNow
//   • decline
//   • cancel mid-countdown reaching both sides
//   • a direct client INSERT and UPDATE on `duels`, which RLS must REJECT
//   • liveDuelOf() when a user somehow holds two live rows
//
// Every PostgREST error is printed verbatim (code / message / details) rather
// than swallowed — a silent {data:null} from a broken filter is the exact
// failure this suite exists to catch.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startStack, seedUser } from './pgStack.mjs';
import { makeChecker, e2eName, portFor } from './lib.mjs';
import { duelPhase } from '../../js/duelCountdown.js';

// duelStore.ts pulls in _shared/realtime.ts, which reads Deno.env at module
// load for the Realtime REST credentials. Nothing in this suite broadcasts
// (the flows return their sends as data and we assert on those), so a stub
// that yields empty credentials is enough to let the module load — and it is
// declared BEFORE the dynamic import below, since static imports are hoisted
// and would run realtime.ts's top-level code first.
globalThis.Deno = globalThis.Deno ?? { env: { get: () => '' } };
const { duelStore } = await import('../../supabase/functions/_shared/duelStore.ts');
const { challengeFlow, acceptFlow, declineFlow, cancelFlow } =
  await import('../../supabase/functions/_shared/duelFlow.ts');

const { check, state } = makeChecker();

// Namespaced and port-derived like the browser suites, for consistency rather
// than necessity: this suite seeds its OWN embedded Postgres, so these names
// cannot collide with a neighbouring worktree's the way shared-project names
// once did. Deriving them anyway leaves tests/e2e with one naming rule instead
// of two, and a row in a dump still says which worktree produced it.
const A = e2eName('DuelA');
const B = e2eName('DuelB');
const C = e2eName('DuelC');
const D = e2eName('DuelD');

// PREFERRED ports, not mandatory ones. Fixed ports matter for the browser
// suites because localStorage is scoped to origin including port; nothing here
// persists between runs, so a busy port is no reason to fail and startStack
// falls back to an OS-assigned one. Asking for a per-worktree pair anyway keeps
// the common case predictable when you go hunting for the server in netstat.
const PG_PORT = portFor(70);
const API_PORT = portFor(71);

const ROOT = new URL('../../', import.meta.url);
const migration = (f) => ({
  name: f,
  sql: readFileSync(fileURLToPath(new URL(`supabase/migrations/${f}`, ROOT)), 'utf8'),
});

// Print a PostgREST failure in full. `error` is postgrest-js's shape:
// { code, message, details, hint } — code is the SQLSTATE (42501 = RLS/
// privilege refusal) or a PGRST* code (PGRST116 = "not a single row").
const show = (label, { error, status, data } = {}) => {
  if (error) {
    return console.log(`  ${label}  ->  HTTP ${status ?? '?'} ${JSON.stringify({
      code: error.code, message: error.message, details: error.details, hint: error.hint,
    })}`);
  }
  const n = Array.isArray(data) ? `${data.length} row(s)` : data ? '1 row' : 'no rows';
  console.log(`  ${label}  ->  HTTP ${status ?? '?'} ok, ${n}`);
};

const sentTo = (res, event, userId) =>
  res.sends.find((s) => s.event === event && s.userId === userId) || null;

let stack = null;
try {
  console.log('booting postgres + postgrest');
  stack = await startStack({
    pgPort: PG_PORT,
    apiPort: API_PORT,
    migrations: [migration('20260726120000_duels.sql')],
  });
  check('the duels migration applies to a real Postgres', stack.applied.length === 1);

  const db = stack.client;
  const cols = await db.query(
    `select column_name, data_type from information_schema.columns
     where table_schema = 'public' and table_name = 'duels' order by ordinal_position`,
  );
  console.log(`  duels columns  ->  ${cols.rows.map((r) => r.column_name).join(', ')}`);
  check('the duels table exists with the handshake columns',
    ['id', 'a_user', 'b_user', 'room_id', 'status', 'starts_at']
      .every((c) => cols.rows.some((r) => r.column_name === c)));
  const rls = await db.query(
    `select relrowsecurity from pg_class where oid = 'public.duels'::regclass`,
  );
  check('RLS is enabled on duels', rls.rows[0].relrowsecurity === true);
  const pol = await db.query(
    `select polname, polcmd from pg_policy where polrelid = 'public.duels'::regclass`,
  );
  console.log(`  duels policies ->  ${pol.rows.map((r) => `${r.polname}(${r.polcmd})`).join(', ')}`);
  check('the only policy is a SELECT policy (r)',
    pol.rows.length === 1 && pol.rows[0].polcmd === 'r');

  // ---- two sessions -------------------------------------------------------
  const alice = await seedUser(db, { name: A, room: 'lobby' });
  const bob = await seedUser(db, { name: B, room: 'lobby' });
  const carol = await seedUser(db, { name: C, room: 'lobby' });

  // The service client the edge functions build (BYPASSRLS, like the real
  // service-role key) and the two player sessions (role: authenticated + sub).
  const svc = stack.clientFor({ role: 'service_role' });
  const sessionA = stack.clientFor({ role: 'authenticated', sub: alice.id });
  const sessionB = stack.clientFor({ role: 'authenticated', sub: bob.id });
  const store = duelStore(svc);

  const probe = await svc.from('duels').select('id');
  show('service select', probe);
  check('the service client can read duels', !probe.error);

  // ---- challenge -> accept -> countdown ------------------------------------
  console.log('challenge → accept → countdown');
  const now = Date.now();
  const challenge = await challengeFlow(store, { id: alice.id }, { name: B }, now);
  console.log(`  duel-challenge ->  ${JSON.stringify(challenge.body)}`);
  check('challenge succeeds against real Postgres', challenge.body.ok === true);
  check('an ask row is persisted', !!challenge.body.ask);
  check('B is the one pinged', !!sentTo(challenge, 'duel-asked', bob.id));

  const askRow = await svc.from('duels').select('*').eq('status', 'asked').maybeSingle();
  show('ask row read', askRow);
  check('the persisted ask names both players',
    askRow.data && askRow.data.a_name === A && askRow.data.b_name === B);
  check('the persisted ask carries the shared room', askRow.data?.room_id === 'lobby');
  check('starts_at is still null before acceptance', askRow.data?.starts_at === null);

  // Both sessions can SELECT their own duel (the read policy) ...
  const readA = await sessionA.from('duels').select('*');
  const readB = await sessionB.from('duels').select('*');
  show('A select own duel', readA);
  check('session A can read its own duel row', !readA.error && readA.data.length === 1);
  check('session B can read the same duel row', !readB.error && readB.data.length === 1);
  // ... and an uninvolved player sees nothing.
  const sessionC = stack.clientFor({ role: 'authenticated', sub: carol.id });
  const readC = await sessionC.from('duels').select('*');
  check('an uninvolved player sees no rows (RLS scoping)',
    !readC.error && readC.data.length === 0);

  const accept = await acceptFlow(store, { id: bob.id }, { from: A }, Date.now());
  console.log(`  duel-accept    ->  ${JSON.stringify(accept.body)}`);
  check('accept succeeds', accept.body.ok === true);

  const frameA = sentTo(accept, 'duel-state', alice.id)?.payload;
  const frameB = sentTo(accept, 'duel-state', bob.id)?.payload;
  console.log(`  A duel-state   ->  ${JSON.stringify(frameA)}`);
  console.log(`  B duel-state   ->  ${JSON.stringify(frameB)}`);
  check('both sessions get a duel-state frame', !!frameA && !!frameB);
  check('both sessions get the SAME startsAt', frameA.startsAt === frameB.startsAt);
  check('both sessions get the SAME goAt', frameA.goAt === frameB.goAt);
  check('both sessions get the SAME serverNow', frameA.serverNow === frameB.serverNow);
  check('each session is told its own opponent',
    frameA.opponent === B && frameB.opponent === A);

  const live = await svc.from('duels').select('*').eq('status', 'countdown').maybeSingle();
  show('countdown row', live);
  check('the row is persisted as countdown', live.data?.status === 'countdown');
  // The DB renders timestamptz in the session timezone; the payload is
  // normalised to UTC ISO (duel.ts duelTimeline), so compare instants.
  check('starts_at is persisted as the broadcast anchor',
    live.data && new Date(live.data.starts_at).toISOString() === frameA.startsAt);
  check('the anchor is canonical UTC on the wire, whatever the DB renders',
    frameA.startsAt.endsWith('Z') && frameA.goAt.endsWith('Z'));
  const go = Date.parse(frameA.goAt);
  check('both frames drive the same phase off the stored anchor',
    duelPhase(frameA, go - 1500).label === duelPhase(frameB, go - 1500).label);

  // ---- RLS: a client must NOT be able to write the table -------------------
  // This is the load-bearing guarantee: the handshake's invariants live in the
  // edge functions, so a player who can INSERT or UPDATE `duels` directly can
  // put themselves in a duel, restart a countdown, or hand themselves a
  // starts_at in the past. anon/authenticated hold table GRANTs here (as on
  // Supabase), so a refusal below is the POLICY talking, not a missing grant.
  console.log('RLS write rejection');
  const forgedInsert = await sessionA.from('duels').insert({
    a_user: alice.id, b_user: carol.id, a_name: A, b_name: C,
    room_id: 'lobby', status: 'countdown',
    starts_at: new Date(Date.now() - 60000).toISOString(),
  }).select();
  show('client INSERT', forgedInsert);
  check('a direct client INSERT is REJECTED by RLS', !!forgedInsert.error);
  check('the insert refusal is a privilege error (42501)',
    forgedInsert.error?.code === '42501');

  // UPDATE and DELETE are refused DIFFERENTLY, and the difference is worth
  // pinning down: INSERT trips a WITH CHECK and errors loudly (42501), but with
  // no UPDATE/DELETE policy at all there are simply no rows visible to modify,
  // so Postgres reports success over zero rows. PostgREST returns HTTP 200 with
  // an empty array. The data is equally safe — but a caller cannot tell it was
  // refused, so this asserts on the EFFECT (nothing changed), not on an error.
  // Verified against the row through a superuser connection, which no policy
  // filters, so a silent partial write could not hide from it.
  const before = await db.query('select * from public.duels where id = $1', [live.data.id]);
  const forgedUpdate = await sessionA.from('duels')
    .update({ starts_at: new Date(Date.now() - 60000).toISOString(), status: 'countdown' })
    .eq('id', live.data.id).select();
  show('client UPDATE', forgedUpdate);
  check('a direct client UPDATE changes NOTHING (RLS admits no rows)',
    !forgedUpdate.error && forgedUpdate.data.length === 0);

  const forgedDelete = await sessionB.from('duels').delete().eq('id', live.data.id).select();
  show('client DELETE', forgedDelete);
  check('a direct client DELETE removes NOTHING',
    !forgedDelete.error && forgedDelete.data.length === 0);

  const after = await db.query('select * from public.duels where id = $1', [live.data.id]);
  check('the duel row still exists after all three attempts', after.rows.length === 1);
  check('every column is byte-identical to before the attempts',
    JSON.stringify(before.rows[0]) === JSON.stringify(after.rows[0]));
  check('the forged starts_at never landed',
    after.rows[0].starts_at.toISOString() === frameA.startsAt);
  console.log(`  row after      ->  status=${after.rows[0].status} starts_at=${after.rows[0].starts_at.toISOString()}`);

  // ---- cancel mid-countdown ----------------------------------------------
  console.log('cancel mid-countdown');
  check('the countdown is genuinely mid-flight', duelPhase(frameA, go - 1500).phase === 'countdown');
  const cancelled = await cancelFlow(store, { id: alice.id });
  console.log(`  duel-cancel    ->  ${JSON.stringify(cancelled.body)}`);
  check('cancel succeeds', cancelled.body.ok === true && cancelled.body.cancelled === true);
  check('BOTH sessions are told',
    !!sentTo(cancelled, 'duel-cancelled', alice.id) && !!sentTo(cancelled, 'duel-cancelled', bob.id));
  console.log(`  cancel reason  ->  ${JSON.stringify(sentTo(cancelled, 'duel-cancelled', bob.id).payload)}`);
  const afterCancel = await svc.from('duels').select('status').eq('id', live.data.id).maybeSingle();
  show('row after cancel', afterCancel);
  check('the row is persisted as cancelled', afterCancel.data?.status === 'cancelled');
  check('neither player is left blocked',
    (await store.liveDuelOf(alice.id)) === null && (await store.liveDuelOf(bob.id)) === null);

  // ---- decline ------------------------------------------------------------
  console.log('decline');
  const c2 = await challengeFlow(store, { id: alice.id }, { name: B }, Date.now());
  check('a fresh challenge lands after the cancel', c2.body.ok === true);
  const declined = await declineFlow(store, { id: bob.id }, { from: A });
  console.log(`  duel-decline   ->  ${JSON.stringify(declined.body)}`);
  check('decline succeeds', declined.body.ok === true);
  const back = sentTo(declined, 'duel-declined', alice.id);
  check('the challenger is told who declined', back?.payload.name === B);
  const leftover = await svc.from('duels').select('*').eq('status', 'asked');
  show('asks after decline', leftover);
  check('the ask row is really deleted from Postgres', leftover.data?.length === 0);
  check('both players are free again',
    (await store.liveDuelOf(alice.id)) === null && (await store.liveDuelOf(bob.id)) === null);

  // ---- two live rows ------------------------------------------------------
  // Nothing in the schema forbids a player holding two unfinished duels (no
  // partial unique index), so a race between two challenges — or a bad manual
  // fixup — can produce one. liveDuelOf/countdownOf must still answer with ONE
  // row: PostgREST's .maybeSingle() raises PGRST116 on multiple rows, which
  // would surface as a 500 from the edge function instead of a clean refusal.
  console.log('two live rows');
  // Both duplicates are on Alice, against DIFFERENT opponents — and neither is
  // Carol, who has to stay free to act as the third-party challenger below.
  const dave = await seedUser(db, { name: D, room: 'lobby' });
  const dup = async (a, b, status) => db.query(
    `insert into public.duels (a_user, b_user, a_name, b_name, room_id, status, starts_at)
     values ($1, $2, $3, $4, 'lobby', $5, case when $5 = 'countdown' then now() else null end)
     returning id`,
    [a.id, b.id, a.name, b.name, status],
  );
  await dup(alice, bob, 'countdown');
  await dup(alice, dave, 'countdown');
  const twoRows = await db.query(
    `select count(*)::int as n from public.duels
     where status in ('asked','countdown') and (a_user = $1 or b_user = $1)`, [alice.id],
  );
  check('the fixture really put two live rows on one user', twoRows.rows[0].n === 2);

  let liveErr = null;
  let liveRow;
  try {
    liveRow = await store.liveDuelOf(alice.id);
  } catch (e) {
    liveErr = e;
  }
  console.log(`  liveDuelOf     ->  ${liveErr ? `THREW ${liveErr.message}` : JSON.stringify(liveRow && { id: liveRow.id, status: liveRow.status })}`);
  check('liveDuelOf does not throw on two live rows', !liveErr);
  check('liveDuelOf returns exactly one row', !!liveRow && !!liveRow.id);

  let cdErr = null;
  let cdRow;
  try {
    cdRow = await store.countdownOf(alice.id);
  } catch (e) {
    cdErr = e;
  }
  console.log(`  countdownOf    ->  ${cdErr ? `THREW ${cdErr.message}` : JSON.stringify(cdRow && { id: cdRow.id, status: cdRow.status })}`);
  check('countdownOf does not throw on two live rows', !cdErr);
  check('countdownOf returns exactly one row', !!cdRow && cdRow.status === 'countdown');

  // The duplicate must still read as "busy" — a second live row must never let
  // a third player start yet another duel with them.
  const blocked = await challengeFlow(store, { id: carol.id }, { name: A }, Date.now());
  console.log(`  challenge busy ->  ${JSON.stringify(blocked.body)}`);
  check('a doubly-duelling player still reads as busy',
    blocked.body.ok === false && blocked.body.reason === `${A} is already duelling`);

  // asksInvolving has no .maybeSingle(), so it must return BOTH rows — this is
  // what lets duel-cancel clean a doubled-up player out completely.
  await db.query(`update public.duels set status = 'asked', starts_at = null
                  where status = 'countdown' and (a_user = $1 or b_user = $1)`, [alice.id]);
  const asks = await store.asksInvolving(alice.id);
  console.log(`  asksInvolving  ->  ${asks.length} row(s)`);
  check('asksInvolving returns every live ask, not just one', asks.length === 2);
  const swept = await cancelFlow(store, { id: alice.id });
  const remaining = await svc.from('duels').select('id').in('status', ['asked', 'countdown']);
  show('live rows after sweep', remaining);
  check('cancel sweeps BOTH rows', remaining.data?.length === 0);
  check('both opponents are notified by the sweep',
    !!sentTo(swept, 'duel-cancelled', bob.id) && !!sentTo(swept, 'duel-cancelled', dave.id));
} catch (e) {
  state.failed++;
  console.error('\n  FATAL:', e && e.stack ? e.stack : e);
  if (stack?.apiLog) console.error('  postgrest log:\n', stack.apiLog.read());
} finally {
  if (stack) await stack.stop();
}

console.log(state.failed ? `\n${state.failed} check(s) FAILED` : '\nall duel e2e checks passed');
console.log([
  '\nNot covered here (no Docker for `supabase start`, and the project baked into',
  'js/supabase.js does not resolve in DNS): GoTrue, Realtime delivery, and the',
  'deployed duel-* functions. The flows are driven straight against duelStore(svc)',
  '— the call the edge functions make right after their auth check — so the',
  'database, PostgREST and RLS layers are real; only the transport is asserted',
  'as data instead of over a websocket.',
].join('\n'));
process.exit(state.failed ? 1 : 0);
