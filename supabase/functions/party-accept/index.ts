// party-accept — accept a pending invite (presence.js onAccept). Validates a
// live (non-expired) invite from the named inviter, then joins (creating the
// party if the inviter had none), respecting the ≤4 cap. Body: { from }.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient, rateOk } from "../_shared/client.ts";
import { PARTY_MAX, userByName, partyOf, partyById, pushParty } from "../_shared/party.ts";

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
  if (!(await rateOk(svc, user.id, "party-accept", 1))) {
    return json({ ok: false, reason: "slow down" }, 429);
  }
  const inviter = await userByName(svc, from);
  if (!inviter) return json({ ok: true, party: null }); // lapsed — not an error

  // A live invite from that inviter to me?
  const { data: invite } = await svc.from("party_invites")
    .select("id, expires_at")
    .eq("from_user", inviter.id).eq("to_user", user.id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  // Clear any invites between this pair regardless (accept consumes them).
  await svc.from("party_invites").delete().eq("from_user", inviter.id).eq("to_user", user.id);
  if (!invite) return json({ ok: true, party: null });

  if (await partyOf(svc, user.id)) return json({ ok: false, reason: "already in a party" });

  let party = await partyOf(svc, inviter.id);
  if (party && (party.leader_id !== inviter.id || party.members.length >= PARTY_MAX)) {
    return json({ ok: true, party: null }); // inviter no longer able to add
  }
  const { data: prof } = await svc.from("profiles")
    .select("habbo_username, habbo_figure").eq("id", user.id).maybeSingle();
  const { data: inviterProf } = await svc.from("profiles")
    .select("habbo_username, habbo_figure").eq("id", inviter.id).maybeSingle();

  if (!party) {
    // Found the party now: inviter becomes leader + first member.
    const { data: created } = await svc.from("parties")
      .insert({ leader_id: inviter.id }).select("id").single();
    await svc.from("party_members").insert({
      party_id: created!.id,
      user_id: inviter.id,
      name: inviterProf?.habbo_username ?? from,
      figure: inviterProf?.habbo_figure ?? "",
    });
    party = await partyById(svc, created!.id);
  }
  await svc.from("party_members").insert({
    party_id: party!.id,
    user_id: user.id,
    name: prof?.habbo_username ?? "player",
    figure: prof?.habbo_figure ?? "",
  });

  const fresh = await partyById(svc, party!.id);
  await pushParty(fresh, fresh!.members.map((m: any) => ({ user_id: m.user_id })));
  return json({ ok: true, party: fresh });
});
