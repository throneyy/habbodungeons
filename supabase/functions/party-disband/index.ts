// party-disband — leader-only dissolve (presence.js onDisband). Clears every
// member and pushes leader:null to all. No body.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/client.ts";
import { partyOf, pushParty } from "../_shared/party.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  const svc = serviceClient();
  const party = await partyOf(svc, user.id);
  if (!party) return json({ ok: true });
  if (party.leader_id !== user.id) return json({ ok: false, reason: "only the leader disbands" });

  const members = party.members.map((m: any) => ({ user_id: m.user_id }));
  await svc.from("parties").delete().eq("id", party.id); // cascades party_members
  await pushParty(null, members);
  return json({ ok: true });
});
