// duel-challenge — throw down the gauntlet at a room-mate (the duel twin of
// trade-open). Validates server-side that both players are in the SAME room
// and that neither is already duelling, trading or in a battle; records the
// ask and pings the target's user:<id> mailbox. If THEY already challenged US,
// challenging back accepts it and the countdown starts. Body: { name }.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient, rateOk } from "../_shared/client.ts";
import { duelStore, deliver } from "../_shared/duelStore.ts";
import { challengeFlow } from "../_shared/duelFlow.ts";

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

  const svc = serviceClient();
  if (!(await rateOk(svc, user.id, "duel-challenge", 1))) {
    return json({ ok: false, reason: "slow down" }, 429);
  }

  const out = await challengeFlow(duelStore(svc), { id: user.id }, body, Date.now());
  await deliver(out.sends);
  return json(out.body, out.status);
});
