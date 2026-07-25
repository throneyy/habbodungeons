// trade-cancel — walk away from the table (server/trade.js cancel). Clears any
// pending ask and ends an active session for both sides. No body.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/client.ts";
import { activeTrade, endTrade } from "../_shared/trade.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  const svc = serviceClient();
  // Drop any outstanding asks by or to this user.
  await svc.from("trades").delete().eq("status", "asked")
    .or(`a_user.eq.${user.id},b_user.eq.${user.id}`);

  const trade = await activeTrade(svc, user.id);
  if (trade) {
    const { data: prof } = await svc.from("profiles")
      .select("habbo_username").eq("id", user.id).maybeSingle();
    await endTrade(svc, trade, `${prof?.habbo_username ?? "partner"} cancelled the trade`);
  }
  return json({ ok: true });
});
