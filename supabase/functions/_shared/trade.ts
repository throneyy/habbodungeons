// Shared trade helpers — the two-step Safe Trading state machine
// (server/trade.js), expressed over the trades / trade_offers tables. The
// anti-scam rule (any offer change resets BOTH accepts + confirms) lives in
// resetAccepts(); the atomic double-confirm swap is the execute_trade() SQL
// function. Clients get SELECT-only RLS, so none of this can be bypassed.
import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { broadcast, userTopic } from "./realtime.ts";

export interface TradeRow {
  id: string;
  a_user: string;
  b_user: string;
  a_name: string;
  b_name: string;
  room_id: string | null;
  stage: string;
  a_accepted: boolean;
  b_accepted: boolean;
  a_confirmed: boolean;
  b_confirmed: boolean;
  status: string;
}

// The caller's live trade (status 'active'), or null.
export async function activeTrade(svc: SupabaseClient, userId: string) {
  const { data } = await svc.from("trades").select("*")
    .or(`a_user.eq.${userId},b_user.eq.${userId}`)
    .eq("status", "active")
    .maybeSingle();
  return data as TradeRow | null;
}

export function isA(t: TradeRow, userId: string) {
  return t.a_user === userId;
}

// Any offer change clears every accept + confirm (the anti-scam reset) and
// drops the stage back to 'offer'.
export async function resetAccepts(svc: SupabaseClient, tradeId: string) {
  await svc.from("trades").update({
    a_accepted: false,
    b_accepted: false,
    a_confirmed: false,
    b_confirmed: false,
    stage: "offer",
    updated_at: new Date().toISOString(),
  }).eq("id", tradeId);
}

// Recompute stage ('confirm' once both accept) and push a per-side trade-state
// broadcast to each party's personal topic (server/trade.js broadcastState).
export async function pushTradeState(svc: SupabaseClient, tradeId: string) {
  const { data: t } = await svc.from("trades").select("*").eq("id", tradeId).maybeSingle();
  if (!t) return;
  const trade = t as TradeRow;

  const { data: offers } = await svc.from("trade_offers")
    .select("user_id, item_id").eq("trade_id", tradeId);
  const offerOf = (uid: string) =>
    (offers ?? []).filter((o) => o.user_id === uid).map((o) => o.item_id);

  const stage = trade.a_accepted && trade.b_accepted ? "confirm" : "offer";
  if (stage !== trade.stage) {
    await svc.from("trades").update({ stage }).eq("id", tradeId);
  }

  const sideView = (uid: string, accepted: boolean, confirmed: boolean) => ({
    offer: offerOf(uid),
    accepted,
    confirmed,
  });

  // Payload for user A (them = B) and user B (them = A).
  await broadcast(userTopic(trade.a_user), "trade-state", {
    partner: trade.b_name,
    stage,
    you: sideView(trade.a_user, trade.a_accepted, trade.a_confirmed),
    them: sideView(trade.b_user, trade.b_accepted, trade.b_confirmed),
  });
  await broadcast(userTopic(trade.b_user), "trade-state", {
    partner: trade.a_name,
    stage,
    you: sideView(trade.b_user, trade.b_accepted, trade.b_confirmed),
    them: sideView(trade.a_user, trade.a_accepted, trade.a_confirmed),
  });
}

// Soft errors reach the client through its own user topic (net 'trade-error').
export async function tradeError(userId: string, reason: string) {
  await broadcast(userTopic(userId), "trade-error", { reason });
}

export async function endTrade(
  svc: SupabaseClient,
  trade: TradeRow,
  reason: string,
) {
  await svc.from("trades").update({ status: "cancelled" }).eq("id", trade.id);
  await broadcast(userTopic(trade.a_user), "trade-cancelled", { reason });
  await broadcast(userTopic(trade.b_user), "trade-cancelled", { reason });
}
