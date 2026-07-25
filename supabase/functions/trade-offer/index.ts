// trade-offer — put one stash item on the table (server/trade.js changeOffer +1).
// Verifies the caller still owns a free copy, then any offer change resets both
// accepts (anti-scam). Body: { item }.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/client.ts";
import { activeTrade, resetAccepts, pushTradeState, tradeError } from "../_shared/trade.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  let body: { item?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad json" }, 400);
  }
  const item = String(body?.item ?? "");
  if (!item) return json({ ok: false, reason: "no such item" }, 400);

  const svc = serviceClient();
  const trade = await activeTrade(svc, user.id);
  if (!trade) return json({ ok: false, reason: "not trading" });

  // Inventory rows the caller owns with this item id, minus ones already offered
  // in this trade — pick the first free one.
  const [{ data: owned }, { data: offered }] = await Promise.all([
    svc.from("inventory").select("id").eq("user_id", user.id).eq("item_id", item),
    svc.from("trade_offers").select("inventory_id").eq("trade_id", trade.id).eq("user_id", user.id),
  ]);
  const usedIds = new Set((offered ?? []).map((o) => o.inventory_id));
  const free = (owned ?? []).find((r) => !usedIds.has(r.id));
  if (!free) {
    await tradeError(user.id, "you do not own that");
    return json({ ok: false, reason: "you do not own that" });
  }

  await svc.from("trade_offers").insert({
    trade_id: trade.id,
    user_id: user.id,
    inventory_id: free.id,
    item_id: item,
  });
  await resetAccepts(svc, trade.id);
  await pushTradeState(svc, trade.id);
  return json({ ok: true });
});
