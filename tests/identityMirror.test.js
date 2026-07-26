// Identity.mirror() reports its failures — run with: node tests/identityMirror.test.js
//
// The bug this locks down: mirror() ended in `return !error`, so a refused
// write and a successful one were the same value shape, and all four callers
// dropped even that with `.catch(() => {})`. A player's name, figure, class and
// skill levels could fail to persist on every mirror with no console line, no
// return value and no trace — the write was not merely unhandled, it was
// unobservable. Same failure mode as userByName discarding its error in
// _shared/party.ts, where it took a live database dump to find.
//
// So the assertions here are deliberately about REPORTING, not about Supabase:
// a failed write must (a) not look like a success and (b) say the code and
// message out loud. The 23505-on-habbo_username case gets its own check because
// it is the one failure a player can act on — the unique index
// profiles_habbo_username_lower_key means one account per Habbo name, and the
// loser of that race needs to be told which name, not just "something failed".
//
// No network: mirror() takes an optional client (its test seam), so nothing
// here imports the esm.sh CDN that getSupabase() would.
globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
})();

import { Identity, isNameTakenError, reportMirrorError } from '../js/identity.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

// Capture console.error so the test can assert on what a player's devtools
// would actually show, then restore it. This is the real subject of the test:
// the whole point of the change is that the failure becomes VISIBLE.
function captureErrors(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.join(' '));
  try {
    return { result: fn(), lines };
  } finally {
    console.error = original;
  }
}
async function captureErrorsAsync(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.join(' '));
  try {
    return { result: await fn(), lines };
  } finally {
    console.error = original;
  }
}

// A Supabase client stub shaped exactly like the call chain mirror() uses:
// sb.auth.getUser() then sb.from(...).update(...).eq(...) resolving { error }.
function fakeClient({ user = { id: 'u-1' }, error = null } = {}) {
  const calls = { updates: [] };
  return {
    calls,
    auth: { getUser: async () => ({ data: { user } }) },
    from() {
      return {
        update(row) {
          calls.updates.push(row);
          return { eq: async () => ({ error }) };
        },
      };
    },
  };
}

const NAME_TAKEN = {
  code: '23505',
  message:
    'duplicate key value violates unique constraint "profiles_habbo_username_lower_key"',
  details: 'Key (lower(btrim(habbo_username)))=(throney) already exists.',
  hint: null,
};
const OTHER_DB_ERROR = { code: '42703', message: 'column "class_id" does not exist' };

const ID = { name: 'throney', figure: 'hd-180-1', classId: 'cleric' };

// ---- the headline: a failed write is not reported as success ---------------
console.log('a refused write is reported, not swallowed');
{
  const sb = fakeClient({ error: NAME_TAKEN });
  const { result, lines } = await captureErrorsAsync(() => Identity.mirror(ID, sb));

  check('mirror() returns the error object, not false', result === NAME_TAKEN);
  // The regression guard with teeth. Under `return !error` this was `false`,
  // which is falsy — so any caller written as `if (!await mirror()) warn()`
  // worked by accident and now works on purpose. What must NEVER happen again
  // is a failure that is indistinguishable from a success.
  check('a failed mirror is NOT null (null is the success signal)', result !== null);
  check('the error carries its Postgres code through unchanged', result.code === '23505');
  check('something was actually logged', lines.length === 1);
  check('the log names the Postgres code', lines[0].includes('23505'));
  check('the log includes the driver message', lines[0].includes('unique constraint'));
}

// ---- 23505 on habbo_username is called out by name ------------------------
console.log('23505 on habbo_username says the name is claimed');
{
  const sb = fakeClient({ error: NAME_TAKEN });
  const { lines } = await captureErrorsAsync(() => Identity.mirror(ID, sb));
  const log = lines.join('\n');
  check('the log says the name is already claimed', /already claimed/i.test(log));
  check('the log says it is a DIFFERENT account', /different account/i.test(log));
  check('the log quotes the offending name', log.includes('throney'));
}
{
  // Classification must not fire on every 23505 — profiles can violate other
  // constraints, and mislabelling one as a name clash sends a player chasing a
  // name that was never the problem.
  check('isNameTakenError() accepts 23505 on habbo_username', isNameTakenError(NAME_TAKEN) === true);
  check('isNameTakenError() rejects a different 23505',
    isNameTakenError({ code: '23505', message: 'duplicate key ... "profiles_pkey"' }) === false);
  check('isNameTakenError() rejects a non-23505 code', isNameTakenError(OTHER_DB_ERROR) === false);
  check('isNameTakenError() tolerates null', isNameTakenError(null) === false);
  check('isNameTakenError() reads the constraint field too',
    isNameTakenError({ code: '23505', constraint: 'profiles_habbo_username_lower_key' }) === true);
}

// ---- any other database error is still reported ---------------------------
console.log('other database errors are reported generically');
{
  const sb = fakeClient({ error: OTHER_DB_ERROR });
  const { result, lines } = await captureErrorsAsync(() => Identity.mirror(ID, sb));
  check('the error object is returned', result === OTHER_DB_ERROR);
  check('the log names the code', lines[0].includes('42703'));
  check('the log carries the message', lines[0].includes('column "class_id" does not exist'));
  check('it is not mislabelled as a name clash', !/already claimed/i.test(lines[0]));
}

// ---- success is silent and null -------------------------------------------
console.log('a successful write is silent');
{
  const sb = fakeClient({ error: null });
  const { result, lines } = await captureErrorsAsync(() => Identity.mirror(ID, sb));
  check('mirror() returns null on success', result === null);
  check('nothing is logged on success', lines.length === 0);
  check('the row was actually written', sb.calls.updates.length === 1);
  check('the row carries the identity fields', sb.calls.updates[0].habbo_username === 'throney');
  check('class_id is mirrored too', sb.calls.updates[0].class_id === 'cleric');
}

// ---- the deliberate no-ops are distinguishable from success ---------------
// Offline and signed-out are supported modes, so they must not shout. But they
// must not claim the row was saved either: `skipped` is what lets a caller that
// cares tell "written" from "never attempted", which a bare boolean could not.
console.log('offline / signed-out no-ops are marked, not logged');
{
  // `null` is nullish, so the ?? seam falls through to the real getSupabase().
  // That is deliberate: it exercises the genuine offline branch. It stays
  // hermetic because Node's ESM loader refuses the https: specifier outright
  // ("Only URLs with a scheme in: file and data are supported") before any
  // socket is opened, so getSupabase() returns null deterministically whether
  // or not this machine has a network. The console.warn it prints comes from
  // supabase.js, not from mirror().
  const { result, lines } = await captureErrorsAsync(() => Identity.mirror(ID, null));
  check('no client -> skipped, not success', result && result.skipped === true);
  check('no client -> code says offline', result.code === 'offline');
  check('no client -> mirror() itself logs nothing (offline is normal)', lines.length === 0);
}
{
  const sb = fakeClient({ user: null });
  const { result, lines } = await captureErrorsAsync(() => Identity.mirror(ID, sb));
  check('signed out -> skipped, not success', result && result.skipped === true);
  check('signed out -> code says no-session', result.code === 'no-session');
  check('signed out -> nothing written', sb.calls.updates.length === 0);
  check('signed out -> nothing logged (guest play is normal)', lines.length === 0);
}

// ---- reportMirrorError() hands back exactly what it was given -------------
console.log('reportMirrorError() does not reword the error');
{
  const { result } = captureErrors(() => reportMirrorError(NAME_TAKEN, ID));
  check('the same object identity comes back', result === NAME_TAKEN);
  check('details survive for a caller that wants them',
    result.details.includes('already exists'));
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll Identity.mirror() reporting tests passed');
process.exit(failed ? 1 : 0);
