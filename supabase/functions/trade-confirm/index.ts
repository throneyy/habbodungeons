// trade-confirm — lock stage two (server/trade.js confirm). Requires both
// accepts; once both confirm, execute_trade() performs the atomic swap. No body.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/client.ts";
import { activeTrade, isA, pushTradeState, endTrade, tradeError } from "../_shared/trade.ts";
import { broadcast, userTopic } from "../_shared/realtime.ts";

async function stashOf(svc: ReturnType<typeof serviceClient>, userId: string) {
  const [{ data: inv }, { data: g }] = await Promise.all([
    svc.from("inventory").select("item_id").eq("user_id", userId),
    svc.from("stash_gold").select("gold").eq("user_id", userId).maybeSingle(),
  ]);
  return { gold: g?.gold ?? 0, items: (inv ?? []).map((r) => r.item_id) };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  const svc = serviceClient();
  const trade = await activeTrade(svc, user.id);
  if (!trade) return json({ ok: false, reason: "not trading" });
  if (!(trade.a_accepted && trade.b_accepted)) {
    await tradeError(user.id, "both must accept first");
    return json({ ok: false, reason: "both must accept first" });
  }

  const col = isA(trade, user.id) ? "a_confirmed" : "b_confirmed";
  await svc.from("trades").update({ [col]: true, updated_at: new Date().toISOString() })
    .eq("id", trade.id);

  const { data: fresh } = await svc.from("trades").select("*").eq("id", trade.id).maybeSingle();
  if (!fresh) return json({ ok: false, reason: "trade gone" });
  if (!(fresh.a_confirmed && fresh.b_confirmed)) {
    await pushTradeState(svc, trade.id); // waiting on the other confirm
    return json({ ok: true });
  }

  // Both confirmed: the atomic double-confirm swap (execute_trade SQL fn).
  const { error } = await svc.rpc("execute_trade", { _trade_id: trade.id });
  if (error) {
    await endTrade(svc, fresh, "trade failed, nothing was exchanged");
    return json({ ok: false, reason: "trade failed" });
  }
  const [stashA, stashB] = await Promise.all([
    stashOf(svc, fresh.a_user),
    stashOf(svc, fresh.b_user),
  ]);
  await broadcast(userTopic(fresh.a_user), "trade-done", { stash: stashA });
  await broadcast(userTopic(fresh.b_user), "trade-done", { stash: stashB });
  return json({ ok: true, done: true });
});
