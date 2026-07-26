// party-invite — leader/partyless invites a room-mate (presence.js onInvite).
// Rules preserved: only the leader invites, party not full, target not already
// in a party. The invite row (party_invites) has a 60s TTL; the target picks it
// up over postgres_changes (js/party.js showInvite). Body: { name, room_id? }.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient, rateOk } from "../_shared/client.ts";
import { PARTY_MAX, INVITE_TTL_MS, userByName, partyOf } from "../_shared/party.ts";
import { broadcast, userTopic } from "../_shared/realtime.ts";

// TEMPORARY DEPLOYMENT PROBE — delete once the question below is answered.
//
// We have proven Lovable does not apply database migrations (profiles.class_id
// has been declared in git for a day and still returns 42703 on the live DB).
// We have never proven it deploys EDGE FUNCTIONS at all, and a stale deployment
// of THIS file would explain the invite-broadcast failure entirely: the
// private:true fix in _shared/realtime.ts cannot take effect if the function
// bundling it was never rebuilt.
//
// A version marker on the success response answers that with no ambiguity:
// the field is absent from every previously deployed build, so if a live call
// returns it, the deploy pipeline reached the server; if it does not, the
// server is running old code and every edge-function fix so far is untested.
const DEPLOY_MARKER = "2026-07-26-dd70zn";

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
  return json({ ok: true, deployedAt: DEPLOY_MARKER });
});
