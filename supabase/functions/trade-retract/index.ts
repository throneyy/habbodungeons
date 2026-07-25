// trade-retract — take one item back off the table (server/trade.js changeOffer
// -1). Removes one offer of that item id; any change resets both accepts.
// Body: { item }.
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

  const svc = serviceClient();
  const trade = await activeTrade(svc, user.id);
  if (!trade) return json({ ok: false, reason: "not trading" });

  const { data: row } = await svc.from("trade_offers").select("id")
    .eq("trade_id", trade.id).eq("user_id", user.id).eq("item_id", item)
    .limit(1).maybeSingle();
  if (!row) {
    await tradeError(user.id, "not on the table");
    return json({ ok: false, reason: "not on the table" });
  }
  await svc.from("trade_offers").delete().eq("id", row.id);
  await resetAccepts(svc, trade.id);
  await pushTradeState(svc, trade.id);
  return json({ ok: true });
});
