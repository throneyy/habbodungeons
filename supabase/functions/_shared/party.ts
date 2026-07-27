// Shared party helpers — the leader-only rules, crown handoff and ≤4 cap that
// server/presence.js enforced in RAM, expressed against the parties /
// party_members / party_invites tables. All writes run with the service role
// (the caller is authorized by each function first); clients get SELECT only, so
// the invariants can't be bypassed by a direct table write.
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { broadcast, userTopic } from "./realtime.ts";
import { partyStateShape } from "./partyShape.ts";

// Re-exported so every existing importer of party.ts keeps working unchanged,
// and so the broadcast shape has exactly ONE definition now that the client
// rebuilds it on connect too (SupabaseNet._rehydrateParty).
export { partyStateShape };

export const PARTY_MAX = 4;
export const INVITE_TTL_MS = 60_000;

// Resolve a player by their Habbo name. null means GENUINELY NOT FOUND and
// nothing else — callers turn it into "no such player", so it has to be true.
//
// The error used to be discarded here, which made every query failure
// indistinguishable from an empty result. maybeSingle() errors on two or more
// matches (PGRST116), so once two accounts claimed one name BOTH became
// permanently uninvitable while the API blamed the name: "no such player" for
// someone standing right there. It took a live database dump to see, because
// the lie was total — no log, no status, no trace.
//
// 20260726180000_profiles_unique_habbo_username.sql makes the duplicate case
// impossible going forward. This throws anyway: an unread error is exactly how
// the first one hid, and the next failure here (dropped connection, revoked
// grant, schema drift) deserves a 500 that says so over a confident wrong
// answer. Callers need no change — none of them could act on the distinction.
export async function userByName(svc: SupabaseClient, name: string) {
  const { data, error } = await svc.from("profiles")
    .select("id, habbo_username, habbo_figure")
    .ilike("habbo_username", name)
    .maybeSingle();
  if (error) {
    console.error(
      `[userByName] lookup failed for ${JSON.stringify(name)}: ${error.code} ${error.message}`,
    );
    throw new Error(`profile lookup failed (${error.code})`);
  }
  return data;
}

// The party a user currently belongs to (with its members), or null.
export async function partyOf(svc: SupabaseClient, userId: string) {
  const { data: mem } = await svc.from("party_members")
    .select("party_id").eq("user_id", userId).maybeSingle();
  if (!mem) return null;
  return await partyById(svc, mem.party_id);
}

export async function partyById(svc: SupabaseClient, partyId: string) {
  const { data: party } = await svc.from("parties")
    .select("id, leader_id, room_id").eq("id", partyId).maybeSingle();
  if (!party) return null;
  const { data: members } = await svc.from("party_members")
    .select("user_id, name, figure, joined_at")
    .eq("party_id", partyId).order("joined_at", { ascending: true });
  return { ...party, members: members ?? [] };
}

// Push the current roster to every member's personal topic (the `party`
// broadcast presence.js sent on any change). Pass the member id list explicitly
// so members who were just removed still receive their teardown (leader:null).
export async function pushParty(
  party: any | null,
  recipients: { user_id: string }[],
) {
  const shape = partyStateShape(party);
  await Promise.all(
    recipients.map((r) => broadcast(userTopic(r.user_id), "party", shape)),
  );
}

// Remove a member with the crown-handoff rule (presence.js partyLeave):
// shrink the party; a leaving leader hands the crown to the oldest remaining
// member; ≤1 member left dissolves the party. Notifies everyone affected.
export async function leaveParty(svc: SupabaseClient, userId: string) {
  const party = await partyOf(svc, userId);
  if (!party) return;
  const before = party.members.map((m: any) => ({ user_id: m.user_id }));
  await svc.from("party_members").delete()
    .eq("party_id", party.id).eq("user_id", userId);
  const remaining = party.members.filter((m: any) => m.user_id !== userId);

  if (remaining.length <= 1) {
    // Party over: clear any lone survivor and tell everyone (leader:null).
    await svc.from("parties").delete().eq("id", party.id);
    await pushParty(null, before);
    return;
  }
  if (party.leader_id === userId) {
    await svc.from("parties").update({ leader_id: remaining[0].user_id }).eq("id", party.id);
  }
  const fresh = await partyById(svc, party.id);
  await pushParty(null, [{ user_id: userId }]); // the leaver: teardown
  await pushParty(fresh, remaining);            // survivors: new roster
}
