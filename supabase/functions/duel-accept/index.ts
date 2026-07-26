// duel-accept — take a pending challenge (the duel twin of trade-accept).
// Re-runs every check duel-challenge made (the toast may have sat there while
// the challenger walked off, started a trade or dropped), then stamps
// starts_at ONCE and broadcasts the same absolute instant to both sides: that
// single timestamp is what keeps the two 3-2-1-GO countdowns in lockstep.
// Body: { from }.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient, rateOk } from "../_shared/client.ts";
import { duelStore, deliver } from "../_shared/duelStore.ts";
import { acceptFlow } from "../_shared/duelFlow.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  let body: { from?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad json" }, 400);
  }

  const svc = serviceClient();
  if (!(await rateOk(svc, user.id, "duel-accept", 1))) {
    return json({ ok: false, reason: "slow down" }, 429);
  }

  const out = await acceptFlow(duelStore(svc), { id: user.id }, body, Date.now());
  await deliver(out.sends);
  return json(out.body, out.status);
});
