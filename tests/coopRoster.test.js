// Co-op descend roster tests — run with:  node tests/coopRoster.test.js
//
// The descend confirm is the handshake between "Leader picked a dungeon" and
// "the party is in the battle": the leader announces (js/coopBattle.js
// CoopLeader.announce), every other party member gets CONFIRM_MS to answer,
// and only members who reach 'ready' are taken down (readyMembers() feeds the
// squad builder in main.js and RunController's squad assembly).
//
// The bug this suite exists for: onAck looked its member up by `msg.name`, but
// nothing ever puts a `name` on that frame. SupabaseNet stamps party sends with
// `from` (send(): `{ ...msg, t, from: this.name }`) and CoopMember's ack carries
// only { t, accept, classId, figure }. So every ack matched no roster entry and
// was dropped, every member sat 'pending' until the confirm timer flipped them
// to 'declined', and the leader always descended alone — with no error anywhere,
// because a dropped ack looks exactly like a member who never answered.
//
// So the wire here is not hand-written: the fake net stamps `from` the way
// SupabaseNet does and drops the sender's own echo, and the acks come out of
// the REAL CoopMember.activate/decline. A test that hand-built the payload
// could have "fixed" the bug by inventing a `name` field the client never
// sends, which is the one outcome that must not pass.
import { CoopLeader, CoopMember, CONFIRM_MS } from '../js/coopBattle.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

// ---- the wire --------------------------------------------------------------
// One party channel, mirroring js/supabaseNet.js: send() stamps the sender's
// name as `from` and the transport delivers to everyone BUT the sender
// (broadcast self:false + the explicit echo guard in _onRelayed). `to`
// addresses a single recipient. Delivery is synchronous, so every assertion
// below reads the state after the round trip has fully landed.
function wire() {
  const peers = new Map();
  const bus = {
    net(name) {
      const handlers = new Map();
      const net = {
        name,
        sent: [], // what this client put on the wire, post-stamp
        on(t, fn) {
          if (!handlers.has(t)) handlers.set(t, new Set());
          handlers.get(t).add(fn);
          return () => handlers.get(t).delete(fn);
        },
        emit(t, msg) {
          for (const fn of handlers.get(t) || []) fn(msg);
        },
        send(msg) {
          const payload = { ...msg, from: name }; // supabaseNet.js stamps this
          net.sent.push(payload);
          for (const peer of peers.values()) {
            if (peer.name === name) continue; // never echo to self
            if (payload.to && payload.to !== peer.name) continue;
            peer.emit(payload.t, payload);
          }
        },
      };
      peers.set(name, net);
      return net;
    },
  };
  return bus;
}

const LEADER = 'Alice';
const partyState = (...names) => ({
  leader: LEADER,
  members: [LEADER, ...names].map((n) => ({ name: n, figure: `fig-${n.toLowerCase()}` })),
});

/** A leader mid-announce, plus a real CoopMember per follower on the same
 *  wire. Nothing is acked yet — each case drives that itself.
 *
 *  announce() arms the CONFIRM_MS sweep with setTimeout; `fireConfirmWindow`
 *  captures that callback so a case can reach the timeout without waiting 30
 *  real seconds (and without poking at Node's timer internals). */
function descent(...names) {
  const bus = wire();
  const leaderNet = bus.net(LEADER);
  const leader = new CoopLeader(leaderNet, () => LEADER);
  const members = new Map();
  for (const n of names) {
    const net = bus.net(n);
    // game/dom are only touched once a battle starts; the confirm handshake
    // needs neither, so the real CoopMember runs here with stubs for both.
    members.set(n, { net, coop: new CoopMember(net, null, {}, () => n) });
  }
  const realSetTimeout = globalThis.setTimeout;
  let armed = null;
  let armedMs = null;
  globalThis.setTimeout = (fn, ms) => {
    armed = fn;
    armedMs = ms;
    return realSetTimeout(() => {}, 0); // a handle end()/clearTimeout can hold
  };
  try {
    leader.announce(partyState(...names), 'crypt');
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  return {
    leader, leaderNet, members, bus,
    armedMs: () => armedMs,
    fireConfirmWindow: () => armed(),
  };
}

/** The screen hooks main.js hands CoopMember.activate. `waiting` is captured
 *  rather than ignored so the "member accepted" path is driven whole. */
const memberUi = (classId, figure) => {
  const ui = { classId, figure, waited: null };
  ui.waiting = (html) => { ui.waited = html; };
  ui.battleReady = () => {};
  ui.exit = () => {};
  return ui;
};

const roster = (leader, name) => leader.members.get(name.toLowerCase());
const readyNames = (leader) => leader.readyMembers().map((m) => m.name).sort();

// ---- the announce -----------------------------------------------------------
console.log('announce');
{
  const { leader, leaderNet } = descent('Bob', 'Carol');
  const out = leaderNet.sent.filter((m) => m.t === 'descend');
  check('the descent is announced once', out.length === 1);
  check('the announce names the dungeon', out[0].dungeon === 'crypt');
  check('every other party member is on the roster', leader.members.size === 2);
  check('the leader is not on their own roster', !roster(leader, LEADER));
  check('members start pending', [...leader.members.values()].every((m) => m.status === 'pending'));
  check('nobody is ready before anyone answers', leader.readyMembers().length === 0);
  check('the roster carries the party figures', roster(leader, 'Bob').figure === 'fig-bob');
  leader.end();
}

// ---- a member accepts -------------------------------------------------------
console.log('descend-ack: accept');
{
  const { leader, members } = descent('Bob');
  const bob = members.get('Bob');
  let rerendered = 0;
  leader.onRoster = () => { rerendered++; };

  bob.coop.activate(LEADER, memberUi('ranger', 'fig-bob-live'));

  // What actually went over the wire — the shape onAck has to read.
  const ack = bob.net.sent.find((m) => m.t === 'descend-ack');
  check('the member sends a descend-ack', !!ack);
  check('the ack is an acceptance', ack.accept === true);
  check('the ack carries the chosen class', ack.classId === 'ranger');
  check('the ack carries the member figure', ack.figure === 'fig-bob-live');
  check('the sender is identified by `from`, the field supabaseNet stamps',
    ack.from === 'Bob');
  check('there is NO `name` field on the wire (the bug read one)',
    !('name' in ack));

  // ...and what the leader made of it.
  check('the member reaches ready', roster(leader, 'Bob').status === 'ready');
  check('they show up in readyMembers()', readyNames(leader).join() === 'Bob');
  check('readyMembers() carries the name the roster was built with',
    (leader.readyMembers()[0] || {}).name === 'Bob');
  check('the acked class lands on the roster', roster(leader, 'Bob').classId === 'ranger');
  check('the acked figure overrides the party one',
    roster(leader, 'Bob').figure === 'fig-bob-live');
  check('the squad builder is told to rerender', rerendered === 1);
  leader.end();
}
{
  // Case-insensitive, like every other name lookup on this path: the roster is
  // keyed lower-case and `from` is whatever the profile is cased as.
  const { leader, members } = descent('bOb');
  members.get('bOb').coop.activate(LEADER, memberUi('mage', null));
  check('a differently-cased name still matches its roster row',
    leader.readyMembers().length === 1);
  check('a missing figure leaves the party figure standing',
    roster(leader, 'bOb').figure === 'fig-bob');
  leader.end();
}
{
  // The whole party, and the ordering the leader hands to the squad builder.
  const { leader, members } = descent('Bob', 'Carol', 'Dave');
  members.get('Bob').coop.activate(LEADER, memberUi('fighter', 'f1'));
  members.get('Dave').coop.activate(LEADER, memberUi('mage', 'f3'));
  check('two acks, two ready members', readyNames(leader).join() === 'Bob,Dave');
  check('the silent member is still pending', roster(leader, 'Carol').status === 'pending');
  check('pending members are not descended with', leader.readyMembers().length === 2);
  members.get('Carol').coop.activate(LEADER, memberUi('ranger', 'f2'));
  check('a late-but-in-window ack still lands', readyNames(leader).join() === 'Bob,Carol,Dave');
  check('each ready member kept their own class',
    leader.readyMembers().map((m) => m.classId).sort().join() === 'fighter,mage,ranger');
  leader.end();
}

// ---- a member declines ------------------------------------------------------
console.log('descend-ack: decline');
{
  const { leader, members } = descent('Bob', 'Carol');
  const carol = members.get('Carol');
  carol.coop.decline();

  const ack = carol.net.sent.find((m) => m.t === 'descend-ack');
  check('the decline goes out as a descend-ack too', !!ack && ack.accept === false);
  check('the decline is identified by `from` as well', ack.from === 'Carol');
  check('a decline carries no class or figure',
    ack.classId === undefined && ack.figure === undefined);

  check('the decliner is marked declined', roster(leader, 'Carol').status === 'declined');
  check('a decliner is not ready', !readyNames(leader).includes('Carol'));
  check('declining does not disturb the other member',
    roster(leader, 'Bob').status === 'pending');

  members.get('Bob').coop.activate(LEADER, memberUi('fighter', 'f1'));
  check('the rest of the party still descends', readyNames(leader).join() === 'Bob');
  check('a declined member never joins readyMembers()', leader.readyMembers().length === 1);
  leader.end();
}
{
  // First answer wins: a second ack cannot flip a settled member either way.
  const { leader, members } = descent('Bob');
  const bob = members.get('Bob');
  bob.coop.decline();
  bob.coop.activate(LEADER, memberUi('mage', 'f1'));
  check('an accept after a decline does not resurrect the member',
    roster(leader, 'Bob').status === 'declined' && leader.readyMembers().length === 0);

  const { leader: l2, members: m2 } = descent('Bob');
  m2.get('Bob').coop.activate(LEADER, memberUi('mage', 'f1'));
  m2.get('Bob').coop.decline();
  check('a decline after an accept does not drop a ready member',
    l2.readyMembers().length === 1 && roster(l2, 'Bob').status === 'ready');
  leader.end();
  l2.end();
}
{
  // Acks from outside this descent are ignored rather than inventing a roster
  // row: a stranger (or a stale frame from the previous descent) must never
  // be able to add themselves to the squad.
  const { leader, leaderNet } = descent('Bob');
  leaderNet.emit('descend-ack', { t: 'descend-ack', accept: true, classId: 'mage', from: 'Mallory' });
  check('an ack from a non-member is dropped',
    leader.members.size === 1 && leader.readyMembers().length === 0);
  leaderNet.emit('descend-ack', { t: 'descend-ack', accept: true, classId: 'mage' });
  check('an ack with no sender at all is dropped', leader.readyMembers().length === 0);
  check('...and does not crash on the missing field', roster(leader, 'Bob').status === 'pending');
  leader.end();
}

// ---- the confirm window -----------------------------------------------------
console.log('confirm window');
{
  // Silence is a decline — but only for members who never answered. This is
  // the timer that used to sweep EVERY member, because no ack ever landed.
  const d = descent('Bob', 'Carol');
  const { leader, members } = d;
  members.get('Bob').coop.activate(LEADER, memberUi('fighter', 'f1'));

  check('the confirm timer is armed', !!leader.confirmTimer);
  check('the window is CONFIRM_MS long', d.armedMs() === CONFIRM_MS);
  d.fireConfirmWindow();

  check('the silent member is swept to declined', roster(leader, 'Carol').status === 'declined');
  check('the acked member SURVIVES the confirm window',
    roster(leader, 'Bob').status === 'ready');
  check('the leader does not descend alone', readyNames(leader).join() === 'Bob');
  leader.end();
}
{
  // A fresh announce starts a fresh roster: last descent's answers are gone.
  const { leader, members, bus } = descent('Bob');
  members.get('Bob').coop.activate(LEADER, memberUi('fighter', 'f1'));
  check('ready before the re-announce', leader.readyMembers().length === 1);
  leader.announce(partyState('Bob', 'Carol'), 'sewers');
  check('a second announce resets everyone to pending',
    leader.readyMembers().length === 0 && roster(leader, 'Bob').status === 'pending');
  const carolNet = bus.net('Carol');
  new CoopMember(carolNet, null, {}, () => 'Carol').activate(LEADER, memberUi('mage', 'f2'));
  check('a member added by the new announce can ack it',
    readyNames(leader).join() === 'Carol');
  leader.end();
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall co-op roster checks passed');
process.exit(failed ? 1 : 0);
