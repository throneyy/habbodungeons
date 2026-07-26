// duel-cancel — walk away (the duel twin of trade-cancel). Works at every
// point of the handshake: an unanswered ask, the 3-2-1 mid-flight, or the
// "duel ready" state the countdown lands in. Both sides get `duel-cancelled`
// and drop back to Free Roam. No body.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/client.ts";
import { duelStore, deliver } from "../_shared/duelStore.ts";
import { cancelFlow } from "../_shared/duelFlow.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  const svc = serviceClient();
  const out = await cancelFlow(duelStore(svc), { id: user.id });
  await deliver(out.sends);
  return json(out.body, out.status);
});
