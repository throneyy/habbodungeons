// The wire shape of a party roster, and nothing else.
//
// Split out of party.ts so it can be imported without dragging in the whole
// server module: party.ts pulls in realtime.ts, which reads Deno.env at module
// top level, and a jsr: client import. Both are fine in an edge function and
// fatal anywhere else, which meant the one function describing the `party`
// broadcast could not be loaded by a test.
//
// It matters because this shape now has TWO producers. The server pushes it on
// every change (pushParty), and the client rebuilds it from its own SELECTs on
// connect (SupabaseNet._rehydrateParty) — a reconnecting player is still in the
// party as far as Postgres is concerned, but no broadcast is coming, because
// pushes only fire on change. If the two ever disagree about a field name, a
// rehydrated roster renders wrong or empty and the player believes they are
// partyless. tests/partyRehydrate.test.js pins them together by running this
// function and the client against the same rows.
//
// Pure: no imports, no I/O, no Deno globals. Keep it that way.

/** A party row joined with its members, as partyById returns it. */
export type PartyLike = {
  id: string;
  leader_id: string;
  members: { user_id: string; name: string; figure?: string }[];
};

/** Presence-side "party" broadcast shape, rendered by js/party.js onState().
 *  null means "no party" and must still be sent: it is how a client learns its
 *  party is gone (js/party.js treats a null leader as teardown). */
export function partyStateShape(party: PartyLike | null) {
  if (!party) return { leader: null, members: [] as any[], partyId: null as string | null };
  const leaderRow = party.members.find((m: any) => m.user_id === party.leader_id);
  return {
    partyId: party.id,
    leader: leaderRow?.name ?? null,
    members: party.members.map((m: any) => ({ name: m.name, figure: m.figure })),
  };
}
