// The duel handshake's decision logic, expressed over a narrow DuelStore port.
//
// Why a port instead of the SupabaseClient the trade functions use directly:
// every rule here is server-authoritative (same-room, both-free, ask freshness,
// who may cancel), and those are exactly the rules worth testing. Keeping the
// flows pure — deps injected, broadcasts RETURNED rather than sent — lets
// tests/duel.test.js drive the real code paths in Node instead of asserting
// against a re-implementation. The thin Deno.serve wrappers in
// duel-challenge/duel-accept/duel-decline/duel-cancel do auth, build the
// Postgres-backed store (duelStore.ts) and fan the returned sends out to each
// user's user:<id> mailbox.
// Type-only imports stay `import type` so this module is runnable under plain
// type-stripping (Node's .ts support) as well as Deno — that's what lets
// tests/duel.test.js exercise the real flows.
import type { DuelRow, DuelSend, FlowResult, PresenceRow } from "./duel.ts";
import {
  DUEL_LEAD_IN_MS,
  askFresh,
  duelStateShape,
  foeOf,
  presenceFresh,
} from "./duel.ts";

export interface DuelStore {
  userByName(name: string): Promise<{ id: string; habbo_username: string } | null>;
  displayName(userId: string): Promise<string>;
  presenceOf(userId: string): Promise<PresenceRow | null>;
  /** Any unfinished duel: a pending ask OR a live countdown. */
  liveDuelOf(userId: string): Promise<DuelRow | null>;
  /** Only a live (accepted) duel — the countdown / ready state. */
  countdownOf(userId: string): Promise<DuelRow | null>;
  askBetween(fromUser: string, toUser: string): Promise<DuelRow | null>;
  asksInvolving(userId: string): Promise<DuelRow[]>;
  insertAsk(
    row: Pick<DuelRow, "a_user" | "b_user" | "a_name" | "b_name" | "room_id">,
  ): Promise<DuelRow | null>;
  startCountdown(duelId: string, startsAtIso: string): Promise<DuelRow | null>;
  endDuel(duelId: string, status: "cancelled" | "done"): Promise<void>;
  dropAsk(duelId: string): Promise<void>;
  isTrading(userId: string): Promise<boolean>;
  isBattling(userId: string): Promise<boolean>;
}

const ok = (body: Record<string, unknown> = {}, sends: DuelSend[] = []): FlowResult => ({
  status: 200,
  body: { ok: true, ...body },
  sends,
});
const no = (reason: string, status = 200, sends: DuelSend[] = []): FlowResult => ({
  status,
  body: { ok: false, reason },
  sends,
});

/** Is this player free to duel? Returns the refusal, or null when clear.
 *  `who` is null for the caller ("you") and the display name for a target.
 *  `except` is the pair's OWN pending ask, which obviously must not make either
 *  of them look busy to each other (it would make accepting — and trade-open's
 *  challenge-back shortcut — impossible). */
async function busyReason(
  store: DuelStore,
  userId: string,
  who: string | null,
  except: (string | undefined)[] = [],
) {
  const [duel, trading, battling] = await Promise.all([
    store.liveDuelOf(userId),
    store.isTrading(userId),
    store.isBattling(userId),
  ]);
  if (duel && !except.includes(duel.id)) {
    return who ? `${who} is already duelling` : "you are already duelling";
  }
  if (trading) return who ? `${who} is already trading` : "finish your trade first";
  if (battling) return who ? `${who} is in a battle` : "you are in a battle";
  return null;
}

// --------------------------------------------------------------- challenge

/** duel-challenge — throw down the gauntlet at a room-mate. Mirrors
 *  trade-open, including the open-back shortcut: if THEY already challenged
 *  US, challenging back is an accept and the countdown starts. */
export async function challengeFlow(
  store: DuelStore,
  me: { id: string },
  body: { name?: string },
  nowMs: number,
): Promise<FlowResult> {
  const name = String(body?.name ?? "").trim();
  if (!name) return no("name required", 400);

  const target = await store.userByName(name);
  if (!target || target.id === me.id) return no("no such player");

  // Any ask already standing between these two, in either direction — it must
  // not count against either of them below.
  const [theirAsk, myAsk] = await Promise.all([
    store.askBetween(target.id, me.id),
    store.askBetween(me.id, target.id),
  ]);
  const pair = [theirAsk?.id, myAsk?.id];

  // Am *I* free? (checked before the target's state, like trade-open)
  const mine = await busyReason(store, me.id, null, pair);
  if (mine) return no(mine);

  // Both must be standing in the same room, right now. A missing or stale
  // presence row is a client that isn't there any more — offline.
  const [myPresence, theirPresence] = await Promise.all([
    store.presenceOf(me.id),
    store.presenceOf(target.id),
  ]);
  if (!presenceFresh(myPresence, nowMs)) return no("join a room first");
  if (!presenceFresh(theirPresence, nowMs)) return no(`${name} is offline`);
  if (myPresence!.room_id !== theirPresence!.room_id) {
    return no(`${name} is in another room`);
  }

  const theirs = await busyReason(store, target.id, name, pair);
  if (theirs) return no(theirs);

  const myName = await store.displayName(me.id);

  // Did they already challenge me? Challenging back accepts it (trade-open).
  if (theirAsk && askFresh(theirAsk, nowMs)) {
    return startCountdown(store, theirAsk, nowMs);
  }
  if (theirAsk) await store.dropAsk(theirAsk.id);

  // Already waiting on this player: re-ping instead of stacking a second row
  // (a double-tapped Duel button must not queue two challenges).
  if (myAsk && askFresh(myAsk, nowMs)) {
    return ok({ ask: myAsk.id }, [
      { userId: target.id, event: "duel-asked", payload: { from: myName, room: myAsk.room_id } },
    ]);
  }
  if (myAsk) await store.dropAsk(myAsk.id);

  const created = await store.insertAsk({
    a_user: me.id,
    b_user: target.id,
    a_name: myName,
    b_name: name,
    room_id: myPresence!.room_id,
  });
  return ok({ ask: created?.id ?? null }, [
    { userId: target.id, event: "duel-asked", payload: { from: myName, room: myPresence!.room_id } },
  ]);
}

/** Stamp the sync anchor and tell both sides. One timestamp, one instant.
 *
 * `serverNow` rides along with it: the anchor is only as good as the clock the
 * receiver measures it against, and a client whose machine clock is wrong (or
 * deliberately set forward to swing first) would otherwise reach GO at its own
 * private moment. Pairing the anchor with the server's own reading of "now"
 * lets each client derive its offset and tick on SERVER time instead — see
 * js/duelCountdown.js clockOffset(). */
async function startCountdown(store: DuelStore, ask: DuelRow, nowMs: number): Promise<FlowResult> {
  const startsAt = new Date(nowMs + DUEL_LEAD_IN_MS).toISOString();
  const live = (await store.startCountdown(ask.id, startsAt)) ??
    { ...ask, status: "countdown", starts_at: startsAt };
  const serverNow = new Date(nowMs).toISOString();
  return ok({ duel: live.id }, [
    {
      userId: live.a_user,
      event: "duel-state",
      payload: { ...duelStateShape(live, live.a_user), serverNow },
    },
    {
      userId: live.b_user,
      event: "duel-state",
      payload: { ...duelStateShape(live, live.b_user), serverNow },
    },
  ]);
}

// ------------------------------------------------------------------ accept

/** duel-accept — take the challenge. Re-validates everything the challenge
 *  checked (they may have wandered off, started a trade or gone offline in the
 *  seconds the toast sat there) before the countdown is allowed to start. */
export async function acceptFlow(
  store: DuelStore,
  me: { id: string },
  body: { from?: string },
  nowMs: number,
): Promise<FlowResult> {
  const from = String(body?.from ?? "").trim();
  if (!from) return no("from required", 400);

  const challenger = await store.userByName(from);
  if (!challenger) return ok({ duel: null }); // lapsed — not an error (party-accept)

  const ask = await store.askBetween(challenger.id, me.id);
  if (!ask) return ok({ duel: null });
  if (!askFresh(ask, nowMs)) {
    await store.dropAsk(ask.id);
    return ok({ duel: null });
  }

  const mine = await busyReason(store, me.id, null, [ask.id]);
  if (mine) return no(mine);
  const theirs = await busyReason(store, challenger.id, from, [ask.id]);
  if (theirs) {
    await store.dropAsk(ask.id);
    return no(theirs);
  }

  const [myPresence, theirPresence] = await Promise.all([
    store.presenceOf(me.id),
    store.presenceOf(challenger.id),
  ]);
  if (!presenceFresh(theirPresence, nowMs)) {
    await store.dropAsk(ask.id);
    return no(`${from} is offline`);
  }
  if (!presenceFresh(myPresence, nowMs) || myPresence!.room_id !== theirPresence!.room_id) {
    await store.dropAsk(ask.id);
    return no(`${from} is in another room`);
  }

  return startCountdown(store, ask, nowMs);
}

// ----------------------------------------------------------------- decline

/** duel-decline — "not now". Drops the ask and pushes `duel-declined` back to
 *  the challenger so their "Waiting for X..." toast resolves (party-decline). */
export async function declineFlow(
  store: DuelStore,
  me: { id: string },
  body: { from?: string },
): Promise<FlowResult> {
  const from = String(body?.from ?? "").trim();
  if (!from) return no("from required", 400);

  const challenger = await store.userByName(from);
  if (!challenger) return ok();

  const ask = await store.askBetween(challenger.id, me.id);
  if (!ask) return ok(); // already gone (cancelled / lapsed) — still a success
  await store.dropAsk(ask.id);

  const myName = await store.displayName(me.id);
  return ok({}, [
    { userId: challenger.id, event: "duel-declined", payload: { name: myName } },
  ]);
}

// ------------------------------------------------------------------ cancel

/** duel-cancel — either side walks away, at any point: an unanswered ask, the
 *  3-2-1 mid-flight, or the "duel ready" state the countdown lands in
 *  (trade-cancel). Both sides get `duel-cancelled` and fall back to Free Roam. */
export async function cancelFlow(
  store: DuelStore,
  me: { id: string },
): Promise<FlowResult> {
  const myName = await store.displayName(me.id);
  const sends: DuelSend[] = [];

  // Outstanding asks by or to me: drop them and fold the other side's prompt.
  for (const ask of await store.asksInvolving(me.id)) {
    await store.dropAsk(ask.id);
    const foe = foeOf(ask, me.id);
    sends.push({
      userId: foe.id,
      event: "duel-cancelled",
      payload: { reason: `${myName} called off the duel` },
    });
  }

  const live = await store.countdownOf(me.id);
  if (live) {
    await store.endDuel(live.id, "cancelled");
    const reason = `${myName} called off the duel`;
    sends.push({ userId: live.a_user, event: "duel-cancelled", payload: { reason } });
    sends.push({ userId: live.b_user, event: "duel-cancelled", payload: { reason } });
  }
  return ok({ cancelled: !!live }, sends);
}
