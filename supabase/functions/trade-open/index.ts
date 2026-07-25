// trade-open — ask a room-mate to trade, or open back to start the session
// (server/trade.js open). If THEY already asked US, the session goes live;
// otherwise we record the ask and ping them. Body: { name }.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient, rateOk } from "../_shared/client.ts";
import { userByName } from "../_shared/party.ts";
import { activeTrade, pushTradeState } from "../_shared/trade.ts";
import { broadcast, userTopic } from "../_shared/realtime.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad json" }, 400);
  }
  const name = String(body?.name ?? "").trim();
  if (!name) return json({ ok: false, reason: "name required" }, 400);

  const svc = serviceClient();
  if (!(await rateOk(svc, user.id, "trade-open", 1))) {
    return json({ ok: false, reason: "slow down" }, 429);
  }
  if (await activeTrade(svc, user.id)) {
    return json({ ok: false, reason: "already trading" });
  }
  const target = await userByName(svc, name);
  if (!target || target.id === user.id) return json({ ok: false, reason: "no such player" });
  if (await activeTrade(svc, target.id)) {
    return json({ ok: false, reason: `${name} is already trading` });
  }

  const { data: myProf } = await svc.from("profiles")
    .select("habbo_username").eq("id", user.id).maybeSingle();
  const myName = myProf?.habbo_username ?? "player";

  // Did the target already ask me? (an 'asked' row from them to me)
  const { data: theirAsk } = await svc.from("trades").select("*")
    .eq("status", "asked").eq("a_user", target.id).eq("b_user", user.id)
    .maybeSingle();

  if (theirAsk) {
    // Open back: the session goes live.
    await svc.from("trades").update({ status: "active", stage: "offer" }).eq("id", theirAsk.id);
    await pushTradeState(svc, theirAsk.id);
    return json({ ok: true, trade: theirAsk.id });
  }

  // Record our ask (asker = a_user) and ping the target.
  const { data: created } = await svc.from("trades").insert({
    a_user: user.id,
    b_user: target.id,
    a_name: myName,
    b_name: name,
    status: "asked",
    stage: "asked",
  }).select("id").single();
  await broadcast(userTopic(target.id), "trade-asked", { from: myName });
  return json({ ok: true, ask: created?.id });
});
