// Party rehydrate-on-connect tests - run with:  node tests/partyRehydrate.test.js
//
// A client learned it was in a party from exactly one place: the `party`
// broadcast. Those are pushed ON CHANGE (pushParty in _shared/party.ts) and
// nothing ever replays them, so a reload or a dropped socket left the roster
// blank on screen while party_members still held the row.
//
// That is the half of the "already in a party" bug the player actually feels.
// The server is right - they ARE in a party - but their own client shows no
// roster, so they never think to press Leave, and meanwhile party-invite reads
// the same row and refuses everyone with "already in a party". Both players end
// up believing they are partyless and neither can do anything about it.
//
// The fix reads the party back from Postgres on connect and feeds it through
// _onUserEvent('party'), the same path a real broadcast takes. So these cases
// drive the REAL SupabaseNet against a fake supabase-js query builder, and
// assert against the REAL PartyUI - because the whole point is that no new
// message type and no second render path were introduced.
import { SupabaseNet, partyShapeOf } from '../js/supabaseNet.js';
import { partyStateShape } from '../supabase/functions/_shared/partyShape.ts';
import { PartyUI } from '../js/party.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Deep-equal ignoring KEY ORDER. Object key order is not part of the wire
 *  contract - the shape crosses the network as JSON and is read by field name -
 *  and the server's own two branches happen to list their keys in different
 *  orders, so an order-sensitive compare would fail on a difference no client
 *  can observe. */
const sameShape = (a, b) => {
  const norm = (v) => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])]));
    }
    return v;
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
};

// PartyUI.render() builds the roster strip with real DOM calls, so the cases
// that assert the roster comes BACK need somewhere to build it. Minimal by
// intent: the assertions are about state and the Leave button, not layout.
function el(tag = 'div') {
  const node = {
    tag, children: [], attrs: {}, id: '', className: '', onclick: null,
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener(t, fn) { node[`on${t}`] = fn; },
    appendChild(c) { node.children.push(c); return c; },
    remove() { node.removed = true; },
    setAttribute(k, v) { node.attrs[k] = v; },
    querySelector(sel) { return node._all(sel)[0] || null; },
    querySelectorAll(sel) { return node._all(sel); },
    // render() writes the strip as one innerHTML string, so the nodes it then
    // reaches for (the Leave button, the member heads) never exist as objects.
    // Synthesise just those two, from the markup actually written, so the real
    // wiring below them runs instead of being stubbed past.
    _all(sel) {
      const html = String(node.innerHTML || '');
      if (/party-leave/.test(sel)) {
        if (!html.includes('party-leave')) return [];
        node._leave = node._leave || Object.assign(el('button'), { className: 'party-leave' });
        return [node._leave];
      }
      if (/img/.test(sel)) {
        const n = (html.match(/<img/g) || []).length;
        node._imgs = node._imgs || Array.from({ length: n }, () => el('img'));
        return node._imgs;
      }
      return [];
    },
  };
  let html = '';
  Object.defineProperty(node, 'innerHTML', {
    get: () => html,
    set: (v) => { html = v; node.children.length = 0; node._leave = null; node._imgs = null; },
  });
  return node;
}
globalThis.document = { createElement: (t) => el(t), body: el('body') };

// ---- a fake postgrest --------------------------------------------------------
// Only the four calls _rehydrateParty makes: select / eq / order / maybeSingle.
// Every query is recorded, so the cases can assert WHICH table was read and
// that the caller was scoped to itself - RLS would enforce that server-side,
// but a client that forgets .eq('user_id') would read another party in a test
// harness and look fine.
function fakeDb({ members = [], parties = [], onQuery = () => {} } = {}) {
  const log = [];
  const from = (table) => {
    const q = { table, filters: {}, ordered: null };
    log.push(q);
    const api = {
      select(cols) { q.cols = cols; return api; },
      eq(col, val) { q.filters[col] = val; return api; },
      order(col, opts) { q.ordered = { col, ...opts }; return api; },
      maybeSingle() { return Promise.resolve(resolve(q, true)); },
      then(res) { return Promise.resolve(resolve(q, false)).then(res); },
    };
    return api;
  };
  const resolve = (q, single) => {
    onQuery(q);
    let rows = q.table === 'party_members' ? members : parties;
    for (const [col, val] of Object.entries(q.filters)) {
      rows = rows.filter((r) => r[col] === val);
    }
    if (q.ordered) {
      rows = [...rows].sort((a, b) => String(a[q.ordered.col]).localeCompare(String(b[q.ordered.col])));
      if (q.ordered.ascending === false) rows.reverse();
    }
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  };
  return { from, log };
}

/** A connected SupabaseNet with its query layer faked out. `_connected` is set
 *  because PartyUI.canInvite() gates on net.connected - a rehydrated roster on
 *  a disconnected socket must not offer to invite anyone. */
function net(db, userId = 'u-me') {
  const n = new SupabaseNet();
  n.sb = db ? { from: db.from } : null;
  n.userId = userId;
  n.name = 'Me';
  n._connected = true;
  const seen = [];
  n.on('party', (m) => seen.push(m));
  return { n, seen };
}

// Two members, me second, so ordering by joined_at is observable.
const PARTY = [
  { party_id: 'p1', user_id: 'u-lead', name: 'Ana', figure: 'fig-ana', joined_at: '2026-01-01T00:00:00Z' },
  { party_id: 'p1', user_id: 'u-me', name: 'Me', figure: 'fig-me', joined_at: '2026-01-01T00:00:05Z' },
];
const PARTIES = [{ id: 'p1', leader_id: 'u-lead' }];

// ---- rehydrating an existing party ------------------------------------------
console.log('a reconnecting member gets their roster back');
{
  const db = fakeDb({ members: PARTY, parties: PARTIES });
  const { n, seen } = net(db);
  await n._rehydrateParty();

  check('exactly one party event is emitted', seen.length === 1);
  const msg = seen[0] || {};
  check('the roster carries both members', (msg.members || []).length === 2);
  check('the leader is named, not just id-ed', msg.leader === 'Ana');
  check('members are in joined_at order',
    (msg.members || []).map((m) => m.name).join() === 'Ana,Me');
  check('figures come along, so chips are not blank',
    (msg.members || []).every((m) => !!m.figure));
  check('the party id is tracked for the co-op relay channel', n.partyId === 'p1');
}
{
  // The identity check: the client's reconstruction must equal what the server
  // would have broadcast for the same rows. This is what keeps the hand-copied
  // partyShapeOf honest.
  const db = fakeDb({ members: PARTY, parties: PARTIES });
  const { seen } = net(db);
  const n2 = net(db).n;
  await n2._rehydrateParty();
  const fromServer = partyStateShape({
    id: 'p1',
    leader_id: 'u-lead',
    members: PARTY.map((m) => ({ user_id: m.user_id, name: m.name, figure: m.figure })),
  });
  const fromClient = partyShapeOf({ id: 'p1', leader_id: 'u-lead', members: PARTY });
  check('client shape === server partyStateShape, field for field',
    sameShape(fromClient, fromServer));
  check('...including the key set',
    same(Object.keys(fromClient).sort(), Object.keys(fromServer).sort()));
  check('...and the member key set',
    same(Object.keys(fromClient.members[0]).sort(), Object.keys(fromServer.members[0]).sort()));
  check('the teardown shapes match too',
    sameShape(partyShapeOf(null), partyStateShape(null)));
  void seen;
}
{
  // It must ask only about itself. RLS enforces this for real, but a missing
  // filter would still be a bug worth failing on.
  const db = fakeDb({ members: PARTY, parties: PARTIES });
  const { n } = net(db);
  await n._rehydrateParty();
  // Defaulted rather than indexed: a regression that stops the queries should
  // FAIL these checks, not crash the file and hide every case below it.
  const first = db.log[0] || { table: null, filters: {} };
  check('the first read is my own membership row', first.table === 'party_members');
  check('...scoped to me', first.filters.user_id === 'u-me');
  check('the party row is read by id', db.log.some(
    (q) => q.table === 'parties' && q.filters.id === 'p1'));
  check('the roster read is scoped to my party', db.log.some(
    (q) => q.table === 'party_members' && q.filters.party_id === 'p1'));
  check('the roster read is ordered by joined_at', db.log.some(
    (q) => q.ordered && q.ordered.col === 'joined_at' && q.ordered.ascending === true));
}

// ---- the no-party case -------------------------------------------------------
// It must still emit. Silence would leave a client that is holding a stale
// roster (say, the party disbanded while its tab was closed) rendering members
// who are long gone.
console.log('\na player with no party');
{
  const db = fakeDb({ members: [], parties: [] });
  const { n, seen } = net(db);
  await n._rehydrateParty();

  check('a party event is still emitted', seen.length === 1);
  check('it is the teardown shape', !!seen[0] && seen[0].leader === null);
  check('with an empty roster', !!seen[0] && (seen[0].members || []).length === 0);
  check('no party channel is opened', n.partyId === null);
  check('only one query was needed', db.log.length === 1);
}
{
  // A membership row whose party is gone (leader disbanded mid-disconnect):
  // not a party, so the same teardown.
  const db = fakeDb({ members: PARTY, parties: [] });
  const { n, seen } = net(db);
  await n._rehydrateParty();
  check('an orphaned membership row is not a party',
    !!seen[0] && seen[0].leader === null);
  check('...and opens no channel', n.partyId === null);
}

// ---- it must not break the session ------------------------------------------
console.log('\nfailure is survivable');
{
  const { n, seen } = net(null); // no supabase client at all (solo-local)
  await n._rehydrateParty();
  check('no client, no crash, no event', seen.length === 0);
}
{
  const n = new SupabaseNet();
  n.sb = { from: () => { throw new Error('RLS denied'); } };
  n.userId = 'u-me';
  const seen = [];
  n.on('party', (m) => seen.push(m));
  let threw = false;
  try { await n._rehydrateParty(); } catch { threw = true; }
  check('a failing query does not reject', threw === false);
  check('...and emits nothing rather than a false teardown', seen.length === 0);
}
{
  const db = fakeDb({ members: PARTY, parties: PARTIES });
  const n = new SupabaseNet();
  n.sb = { from: db.from };
  n.userId = null; // signed out
  const seen = [];
  n.on('party', (m) => seen.push(m));
  await n._rehydrateParty();
  check('a signed-out client asks nothing', db.log.length === 0 && seen.length === 0);
}

// ---- the point of it all: PartyUI rehydrates --------------------------------
// Driven through the REAL PartyUI on the REAL 'party' handler, because the
// claim being tested is that no new path was added.
console.log('\nthe roster comes back on screen');
{
  const db = fakeDb({ members: PARTY, parties: PARTIES });
  const { n } = net(db);
  const ui = new PartyUI(n, () => 'Me');
  const states = [];
  ui.onParty = (s) => states.push(s);

  check('the UI starts partyless, as a fresh page does', ui.inParty === false);
  check('...and would refuse to show a roster', ui.state === null);

  await n._rehydrateParty();

  check('after rehydrate the UI knows it is in a party', ui.inParty === true);
  check('it has the full roster', !!ui.state && ui.state.members.length === 2);
  check('it knows who leads', !!ui.state && ui.state.leader === 'Ana');
  check('it knows I am NOT the leader', ui.isLeader === false);
  check('the descent hook fired', states.length === 1);
  check('canInvite is false for a non-leader member', ui.canInvite() === false);
}
{
  // The leader's own view: same path, and the crown is theirs.
  const db = fakeDb({ members: PARTY, parties: PARTIES });
  const { n } = net(db, 'u-lead');
  const ui = new PartyUI(n, () => 'Ana');
  await n._rehydrateParty();
  check('the leader is rehydrated as leader', ui.isLeader === true);
  check('...and may invite again', ui.canInvite() === true);
}
{
  // The stuck player's actual escape route: they can now SEE the party, which
  // is the only reason they would ever press Leave.
  const db = fakeDb({ members: PARTY, parties: PARTIES });
  const { n } = net(db);
  const sent = [];
  n.send = (m) => { sent.push(m); return Promise.resolve({ ok: true }); };
  const ui = new PartyUI(n, () => 'Me');
  await n._rehydrateParty();
  check('the roster is visible', ui.inParty === true);
  // The real button out of the trap, from the real rendered strip.
  const leaveBtn = ui.strip && ui.strip.querySelector('.party-leave');
  check('a Leave button is rendered', !!leaveBtn);
  if (leaveBtn) leaveBtn.onclick();
  check('pressing it sends party-leave',
    sent.length === 1 && sent[0].t === 'party-leave');
}
{
  // A later real broadcast still wins - rehydrate seeds state, it does not
  // freeze it.
  const db = fakeDb({ members: PARTY, parties: PARTIES });
  const { n } = net(db);
  const ui = new PartyUI(n, () => 'Me');
  await n._rehydrateParty();
  check('seeded from the database', !!ui.state && ui.state.members.length === 2);

  n._onUserEvent('party', { partyId: null, leader: null, members: [] });
  check('a later teardown broadcast still clears it', ui.inParty === false);
  check('...and closes the co-op channel', n.partyId === null);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall party rehydrate checks passed');
process.exit(failed ? 1 : 0);
