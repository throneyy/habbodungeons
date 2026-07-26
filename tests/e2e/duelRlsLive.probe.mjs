// LIVE probe: is public.duels really SELECT-only for participants?
//
// Why this file exists. The anon-key probe that "verified" the deploy could
// not answer it. Against an EMPTY table, a PostgREST UPDATE/DELETE returns
// `204 No Content` whether RLS filtered every row away or no policy existed at
// all — zero rows matched either way. `204` on nothing proves nothing.
//
// The only way to tell the two apart is to aim the same statements at a REAL
// row, as the very user RLS is supposed to trust: a participant in that duel.
// That is also the threat worth testing. An outsider being unable to write the
// table is uninteresting; a PARTICIPANT who can is the actual hole the
// migration's comment claims to close — they could flip their own duel's
// status, rewrite the countdown anchor `starts_at` to fire early, or delete a
// duel they are losing. Writes are supposed to be service-role only, inside
// the duel-* edge functions.
//
// So: two real anonymous users, both present in one room, one challenges the
// other through the DEPLOYED duel-challenge function, and then the challenger
// — a genuine participant, holding a genuine JWT — tries to UPDATE and DELETE
// its own duel row and re-reads it to see whether anything moved.
//
// Read-only in intent: it creates a duel row through the sanctioned public API
// (exactly what a player does by clicking Duel) and never writes the table
// directly. Every write it attempts is one it EXPECTS to be refused.
//
// Runs against the live project from .env. Deliberately named `.probe.mjs`, not
// `.e2e.mjs`, so tests/run-suites.mjs does NOT auto-discover it: it burns three
// anonymous sign-ins from a budget of 30/hour shared by every worktree on this
// IP (AGENTS.md), which is not a toll the routine sweep should pay. Run it by
// hand:  node tests/e2e/duelRlsLive.probe.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { e2eName, makeChecker } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(here, '..', '..', '.env'), 'utf8');
const val = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1].trim().replace(/^"|"$/g, '');
const URL_ = val('VITE_SUPABASE_URL');
const KEY = val('VITE_SUPABASE_PUBLISHABLE_KEY');

const { check, state } = makeChecker();
const report = () => {
  console.log(state.failed ? `\n${state.failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(state.failed ? 1 : 0);
};

const api = (path, { token, method = 'GET', body, prefer } = {}) =>
  fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token || KEY}`,
      'content-type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

async function jsonOf(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

/** One anonymous user, with a profile and a fresh presence row in `room`. */
async function player(base, room) {
  const res = await api('/auth/v1/signup', { method: 'POST', body: { data: {} } });
  const auth = await jsonOf(res);
  if (!auth || !auth.access_token) {
    // AGENTS.md: the 30/hour/IP anonymous budget is shared by every worktree,
    // and exhaustion here is EXPLICIT rather than silent. Say so plainly
    // instead of failing as if the feature were broken.
    throw new Error(
      `anonymous sign-in failed (${(auth && (auth.msg || auth.error_description || auth.message)) || res.status}) ` +
      `\u2014 if this is a rate limit, wait for the bucket to refill and re-run`
    );
  }
  const token = auth.access_token;
  const id = auth.user.id;
  // Unique per run: profiles.habbo_username now carries a case-insensitive
  // unique index, so reusing a fixed name across runs is a hard 23505.
  const name = `${e2eName(base)}${Date.now().toString().slice(-6)}`;
  const now = new Date().toISOString();
  await api('/rest/v1/profiles', {
    token,
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: { id, habbo_username: name, habbo_figure: 'hr-100-61.hd-180-1', habbo_verified_at: now, updated_at: now },
  });
  await api('/rest/v1/room_presence', {
    token,
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: { user_id: id, room_id: room, name, figure: 'hr-100-61.hd-180-1', x: 5, y: 5, dir: 4, last_seen: now },
  });
  return { id, token, name };
}

console.log('=== live: is public.duels SELECT-only for its participants? ===\n');

const room = 'square';
const a = await player('RlsA', room);
const b = await player('RlsB', room);
console.log(`  challenger: ${a.name}\n  target:     ${b.name}\n`);

// --- create a real row, the only sanctioned way: the deployed function -------
const chRes = await api('/functions/v1/duel-challenge', { token: a.token, method: 'POST', body: { name: b.name } });
const ch = await jsonOf(chRes);
console.log(`  duel-challenge -> HTTP ${chRes.status} ${JSON.stringify(ch)}\n`);
check('the deployed duel-challenge accepted a real challenge', chRes.status === 200 && ch && ch.ok === true);

const rows = await jsonOf(await api('/rest/v1/duels?select=*', { token: a.token }));
check('the challenger can SELECT the duel row (the policy that SHOULD exist)',
  Array.isArray(rows) && rows.length === 1);
if (!Array.isArray(rows) || rows.length !== 1) {
  console.error('\n  no duel row to probe against \u2014 cannot resolve the ambiguity. Aborting.');
  report();
}
const duel = rows[0];
console.log(`  duel row: id=${duel.id} status=${duel.status} starts_at=${duel.starts_at}\n`);
check('the row names the challenger as a participant', duel.a_user === a.id || duel.b_user === a.id);

// The target is the other participant, and must see the same row.
const theirs = await jsonOf(await api('/rest/v1/duels?select=id', { token: b.token }));
check('the target can SELECT it too (both participants read)',
  Array.isArray(theirs) && theirs.length === 1 && theirs[0].id === duel.id);

// A third, unrelated user must NOT see it.
const c = await player('RlsC', 'some-other-room');
const outsider = await jsonOf(await api('/rest/v1/duels?select=id', { token: c.token }));
check('a non-participant sees nothing (the USING clause really filters)',
  Array.isArray(outsider) && outsider.length === 0);

// --- the writes, against a REAL row, as a REAL participant -------------------
// `return=representation` is what disambiguates: a permitted UPDATE echoes the
// rows it changed, a refused one yields [] or an error. The re-read after each
// attempt is the ground truth.
console.log('  --- writes as a participant (all must be refused) ---');

const upd = await api(`/rest/v1/duels?id=eq.${duel.id}`, {
  token: a.token, method: 'PATCH', prefer: 'return=representation',
  body: { status: 'done' },
});
const updBody = await jsonOf(upd);
console.log(`  UPDATE status -> HTTP ${upd.status} ${JSON.stringify(updBody)}`);
check('UPDATE by a participant changes nothing',
  upd.status === 404 || upd.status === 403 || (Array.isArray(updBody) && updBody.length === 0));

// The countdown anchor is the one field worth stealing: writing it early would
// start the duel before the other side is ready.
const anchor = await api(`/rest/v1/duels?id=eq.${duel.id}`, {
  token: a.token, method: 'PATCH', prefer: 'return=representation',
  body: { starts_at: new Date(Date.now() - 60000).toISOString() },
});
const anchorBody = await jsonOf(anchor);
console.log(`  UPDATE starts_at -> HTTP ${anchor.status} ${JSON.stringify(anchorBody)}`);
check('a participant cannot rewrite the countdown anchor',
  anchor.status === 404 || anchor.status === 403 || (Array.isArray(anchorBody) && anchorBody.length === 0));

const del = await api(`/rest/v1/duels?id=eq.${duel.id}`, {
  token: a.token, method: 'DELETE', prefer: 'return=representation',
});
const delBody = await jsonOf(del);
console.log(`  DELETE -> HTTP ${del.status} ${JSON.stringify(delBody)}`);
check('DELETE by a participant removes nothing',
  del.status === 404 || del.status === 403 || (Array.isArray(delBody) && delBody.length === 0));

const ins = await api('/rest/v1/duels', {
  token: a.token, method: 'POST', prefer: 'return=representation',
  body: {
    a_user: a.id, b_user: b.id, a_name: a.name, b_name: b.name,
    room_id: room, status: 'countdown', starts_at: new Date().toISOString(),
  },
});
const insBody = await jsonOf(ins);
console.log(`  INSERT a self-made countdown -> HTTP ${ins.status} ${JSON.stringify(insBody)}`);
check('a participant cannot forge a duel row outright',
  ins.status === 401 || ins.status === 403 || (insBody && insBody.code === '42501'));

// --- ground truth: re-read the row ------------------------------------------
const after = await jsonOf(await api(`/rest/v1/duels?select=*&id=eq.${duel.id}`, { token: a.token }));
console.log(`\n  row after all four attempts: ${JSON.stringify(after)}`);
check('the row still exists (the DELETE really did nothing)',
  Array.isArray(after) && after.length === 1);
check('its status is untouched',
  Array.isArray(after) && after.length === 1 && after[0].status === duel.status);
check('its starts_at is untouched',
  Array.isArray(after) && after.length === 1 && after[0].starts_at === duel.starts_at);

const count = await jsonOf(await api('/rest/v1/duels?select=id', { token: a.token }));
check('no forged second row was created',
  Array.isArray(count) && count.length === 1);

// --- leave the live project as we found it ----------------------------------
// Cancelling through the sanctioned function, not by writing the table.
const cancel = await api('/functions/v1/duel-cancel', { token: a.token, method: 'POST', body: {} });
const cancelBody = await jsonOf(cancel);
console.log(`\n  cleanup: duel-cancel -> HTTP ${cancel.status} ${JSON.stringify(cancelBody)}`);
check('the duel was called off through the function',
  cancel.status === 200 && cancelBody && cancelBody.ok === true);
// `cancelled` reports whether a live COUNTDOWN was ended; an unanswered ask is
// dropped outright instead (cancelFlow -> store.dropAsk), so false is correct
// for a row still in 'asked'.
check('an unanswered ask reports cancelled:false, not a cancelled countdown',
  cancelBody && cancelBody.cancelled === false);

const settled = await jsonOf(await api(`/rest/v1/duels?select=status&id=eq.${duel.id}`, { token: a.token }));
console.log(`  row now: ${JSON.stringify(settled)}`);
// THE CONTROL THAT MAKES THIS WHOLE FILE MEAN SOMETHING. Moments earlier the
// participant's own DELETE against this exact id did nothing. The service role,
// through the function, deleted it. Same row, same statement, different
// authority — so the client's empty result was RLS refusing it, not a filter
// that happened to match nothing.
check('the same row the client could NOT delete is gone once the service role deletes it',
  Array.isArray(settled) && settled.length === 0);

for (const p of [a, b, c]) {
  await api(`/rest/v1/room_presence?user_id=eq.${p.id}`, { token: p.token, method: 'DELETE' });
}

report();
