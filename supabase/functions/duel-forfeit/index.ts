// duel-forfeit — "I yield". Ends the duel the CALLER is in, with the caller as
// the loser and the other side as the winner.
//
// There is no duel id in the body, deliberately: the duel is found from the
// caller's own user id, so a bystander has nothing to forfeit and someone
// else's duel is not reachable from their identity. Spoofing would require
// their JWT, at which point the duel is the least of anyone's problems.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/client.ts";
import { duelStore, deliver } from "../_shared/duelStore.ts";
import { forfeitFlow } from "../_shared/duelFlow.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  const svc = serviceClient();
  const out = await forfeitFlow(duelStore(svc), { id: user.id });
  await deliver(out.sends);
  return json(out.body, out.status);
});
