// party-leave — leave your party (presence.js partyLeave). The crown-handoff /
// dissolve rules live in _shared/party.ts leaveParty. No body.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/client.ts";
import { leaveParty } from "../_shared/party.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  const svc = serviceClient();
  await leaveParty(svc, user.id);
  return json({ ok: true });
});
