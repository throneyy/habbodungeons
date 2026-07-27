// The Postgres implementation of duelFlow.ts's DuelStore port, plus the send
// fan-out. All writes run with the service role (the caller is authorized by
// each edge function first) — clients hold SELECT-only RLS on `duels`, so the
// handshake's invariants can't be bypassed by a direct table write.
// The jsr import is type-only: erased before execution, so this module also
// loads under plain type-stripping (Node) for tests/e2e/duel.e2e.mjs, which
// runs it against a real PostgREST. duel.ts is pure, so importing its values
// here loads the same way. Deno resolves both the same at type-check time.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { broadcast, userTopic } from "./realtime.ts";
import { DUEL_MAX_LIFE_MS, duelLapsed } from "./duel.ts";
import type { DuelRow, DuelSend, PresenceRow } from "./duel.ts";
import type { DuelStore } from "./duelFlow.ts";

/** The oldest created_at that could still belong to a live duel. Used as a
 *  query floor so debris isn't even fetched; duelLapsed then applies the
 *  tighter per-status horizon to whatever comes back. */
const liveSince = () => new Date(Date.now() - DUEL_MAX_LIFE_MS).toISOString();

/** The newest row that is actually still live. The query asks for a handful
 *  rather than one, because the newest unfinished row may itself be lapsed
 *  (a dead ask stacked on top of a real countdown) — taking limit(1) and then
 *  rejecting it would report "free" while a live duel sits one row down. */
const firstLive = (rows: DuelRow[] | null) =>
  (rows ?? []).find((d) => !duelLapsed(d, Date.now())) ?? null;

export function duelStore(svc: SupabaseClient): DuelStore {
  const duels = () => svc.from("duels");
  return {
    async userByName(name) {
      const { data } = await svc.from("profiles")
        .select("id, habbo_username").ilike("habbo_username", name).maybeSingle();
      return (data as { id: string; habbo_username: string } | null) ?? null;
    },

    async displayName(userId) {
      const { data } = await svc.from("profiles")
        .select("habbo_username").eq("id", userId).maybeSingle();
      return data?.habbo_username ?? "player";
    },

    async presenceOf(userId) {
      const { data } = await svc.from("room_presence")
        .select("room_id, last_seen").eq("user_id", userId).maybeSingle();
      return (data as PresenceRow | null) ?? null;
    },

    async liveDuelOf(userId) {
      const { data } = await duels().select("*")
        .or(`a_user.eq.${userId},b_user.eq.${userId}`)
        .in("status", ["asked", "countdown"])
        .gt("created_at", liveSince())
        .order("created_at", { ascending: false })
        .limit(5);
      return firstLive(data as DuelRow[] | null);
    },

    async countdownOf(userId) {
      const { data } = await duels().select("*")
        .or(`a_user.eq.${userId},b_user.eq.${userId}`)
        .eq("status", "countdown")
        .gt("created_at", liveSince())
        .order("created_at", { ascending: false })
        .limit(5);
      return firstLive(data as DuelRow[] | null);
    },

    async askBetween(fromUser, toUser) {
      const { data } = await duels().select("*")
        .eq("status", "asked").eq("a_user", fromUser).eq("b_user", toUser)
        .maybeSingle();
      return (data as DuelRow | null) ?? null;
    },

    async asksInvolving(userId) {
      const { data } = await duels().select("*")
        .eq("status", "asked")
        .or(`a_user.eq.${userId},b_user.eq.${userId}`);
      return (data as DuelRow[] | null) ?? [];
    },

    async insertAsk(row) {
      const { data } = await duels().insert({ ...row, status: "asked" })
        .select("*").single();
      return (data as DuelRow | null) ?? null;
    },

    async startCountdown(duelId, startsAtIso) {
      const { data } = await duels().update({
        status: "countdown",
        starts_at: startsAtIso,
        updated_at: new Date().toISOString(),
      }).eq("id", duelId).select("*").single();
      return (data as DuelRow | null) ?? null;
    },

    async endDuel(duelId, status) {
      await duels().update({ status, updated_at: new Date().toISOString() })
        .eq("id", duelId);
    },

    async dropAsk(duelId) {
      await duels().delete().eq("id", duelId).eq("status", "asked");
    },

    async isTrading(userId) {
      const { data } = await svc.from("trades").select("id")
        .or(`a_user.eq.${userId},b_user.eq.${userId}`)
        .in("status", ["asked", "active"]).limit(1).maybeSingle();
      return !!data;
    },

    // A live co-op battle: the user's party has a battle_states row.
    async isBattling(userId) {
      const { data: mem } = await svc.from("party_members")
        .select("party_id").eq("user_id", userId).maybeSingle();
      if (!mem?.party_id) return false;
      const { data } = await svc.from("battle_states").select("id")
        .eq("party_id", mem.party_id).limit(1).maybeSingle();
      return !!data;
    },
  };
}

/** Push the flow's returned broadcasts to each recipient's personal mailbox. */
export async function deliver(sends: DuelSend[]) {
  await Promise.all(
    sends.map((s) => broadcast(userTopic(s.userId), s.event, s.payload)),
  );
}
