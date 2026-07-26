// duel-decline — "not now" (the duel twin of party-decline). Drops the pending
// ask and pushes `duel-declined` back to the challenger so their "Waiting
// for X..." toast resolves instead of hanging. Body: { from }.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/client.ts";
import { duelStore, deliver } from "../_shared/duelStore.ts";
import { declineFlow } from "../_shared/duelFlow.ts";

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
  const out = await declineFlow(duelStore(svc), { id: user.id }, body);
  await deliver(out.sends);
  return json(out.body, out.status);
});
