// party-invite — leader/partyless invites a room-mate (presence.js onInvite).
// Rules preserved: only the leader invites, party not full, target not already
// in a party. The invite row (party_invites) has a 60s TTL; the target picks it
// up over postgres_changes (js/party.js showInvite). Body: { name, room_id? }.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient, rateOk } from "../_shared/client.ts";
import { PARTY_MAX, INVITE_TTL_MS, userByName, partyOf } from "../_shared/party.ts";
import { broadcast, userTopic } from "../_shared/realtime.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  let body: { name?: string; room_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad json" }, 400);
  }
  const name = String(body?.name ?? "").trim();
  if (!name) return json({ ok: false, reason: "name required" }, 400);

  const svc = serviceClient();
  if (!(await rateOk(svc, user.id, "party-invite", 1))) {
    return json({ ok: false, reason: "slow down" }, 429);
  }

  const target = await userByName(svc, name);
  if (!target || target.id === user.id) return json({ ok: false, reason: "no such player" });

  const [mine, theirs] = await Promise.all([partyOf(svc, user.id), partyOf(svc, target.id)]);
  if (mine && mine.leader_id !== user.id) return json({ ok: false, reason: "only the leader invites" });
  if (mine && mine.members.length >= PARTY_MAX) return json({ ok: false, reason: "party is full" });
  if (theirs) return json({ ok: false, reason: "already in a party" });

  // Fetch the inviter's display name from their profile (trusted).
  const { data: prof } = await svc.from("profiles")
    .select("habbo_username").eq("id", user.id).maybeSingle();

  const fromName = prof?.habbo_username ?? "player";
  await svc.from("party_invites").insert({
    party_id: mine?.id ?? null,
    from_user: user.id,
    from_name: fromName,
    to_user: target.id,
    room_id: body.room_id ?? mine?.room_id ?? null,
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  });
  // Push the prompt to the target's personal topic (js/party.js showInvite).
  await broadcast(userTopic(target.id), "invited", { from: fromName });
  return json({ ok: true });
});
