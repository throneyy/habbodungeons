// Shared party helpers — the leader-only rules, crown handoff and ≤4 cap that
// server/presence.js enforced in RAM, expressed against the parties /
// party_members / party_invites tables. All writes run with the service role
// (the caller is authorized by each function first); clients get SELECT only, so
// the invariants can't be bypassed by a direct table write.
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { broadcast, userTopic } from "./realtime.ts";

export const PARTY_MAX = 4;
export const INVITE_TTL_MS = 60_000;

export async function userByName(svc: SupabaseClient, name: string) {
  const { data } = await svc.from("profiles")
    .select("id, habbo_username, habbo_figure")
    .ilike("habbo_username", name)
    .maybeSingle();
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

// Presence-side "party" broadcast shape, rendered by js/party.js onState().
export function partyStateShape(party: any | null) {
  if (!party) return { leader: null, members: [] as any[], partyId: null as string | null };
  const leaderRow = party.members.find((m: any) => m.user_id === party.leader_id);
  return {
    partyId: party.id,
    leader: leaderRow?.name ?? null,
    members: party.members.map((m: any) => ({ name: m.name, figure: m.figure })),
  };
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
