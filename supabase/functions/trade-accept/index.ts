// trade-accept — lock stage one ("I'm happy with the table"; server/trade.js
// accept). Both accepts unlock the confirm stage. No body.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/client.ts";
import { activeTrade, isA, pushTradeState } from "../_shared/trade.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  const svc = serviceClient();
  const trade = await activeTrade(svc, user.id);
  if (!trade) return json({ ok: false, reason: "not trading" });

  const col = isA(trade, user.id) ? "a_accepted" : "b_accepted";
  await svc.from("trades").update({ [col]: true, updated_at: new Date().toISOString() })
    .eq("id", trade.id);
  await pushTradeState(svc, trade.id);
  return json({ ok: true });
});
