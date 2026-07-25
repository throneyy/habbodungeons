// party-decline — decline a pending invite (presence.js onDecline). Deletes the
// invite and pushes a `declined` prompt back to the inviter. Body: { from }.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/client.ts";
import { userByName } from "../_shared/party.ts";
import { broadcast, userTopic } from "../_shared/realtime.ts";

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
  const from = String(body?.from ?? "").trim();
  if (!from) return json({ ok: false, reason: "from required" }, 400);

  const svc = serviceClient();
  const inviter = await userByName(svc, from);
  if (!inviter) return json({ ok: true });

  const { data: deleted } = await svc.from("party_invites").delete()
    .eq("from_user", inviter.id).eq("to_user", user.id)
    .select("id");
  if (deleted && deleted.length) {
    const { data: prof } = await svc.from("profiles")
      .select("habbo_username").eq("id", user.id).maybeSingle();
    await broadcast(userTopic(inviter.id), "declined", {
      name: prof?.habbo_username ?? "player",
    });
  }
  return json({ ok: true });
});
