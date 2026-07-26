// duel-claim — "my opponent abandoned the fight; award me the win".
//
// The caller does not get to assert that. claimFlow decides it from the SAME
// presence rule the challenge and the accept already apply (presenceFresh +
// same room), so a closed tab, a dropped connection and a walk-out are one
// definition of "gone" rather than three. If the opponent is still standing
// there the claim is refused, which is what stops a losing duellist from
// stealing a win by declaring a disconnect.
//
// Clients poll this while a duel is live and their opponent has gone quiet;
// the server is the only thing that decides whether it is true.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/client.ts";
import { duelStore, deliver } from "../_shared/duelStore.ts";
import { claimFlow } from "../_shared/duelFlow.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  const svc = serviceClient();
  const out = await claimFlow(duelStore(svc), { id: user.id }, Date.now());
  await deliver(out.sends);
  return json(out.body, out.status);
});
