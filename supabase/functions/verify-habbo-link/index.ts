// verify-habbo-link — the motto-ownership proof (server.js verifyLink).
// Replaces the HMAC session mint entirely: the caller is already authenticated
// with a Supabase JWT, so on a successful motto match we just write the linked
// Habbo onto their own profile row. Body: { name, code }.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient, userClient } from "../_shared/client.ts";
import { fetchHabboProfile } from "../_shared/habbo.ts";

// Server-side copy of js/config.js ADMIN_NAMES. This is authorization data, not
// a secret: the Habbo name must still be proven by the live motto check below.
const ADMIN_HABBO_NAMES = new Set(["throney"]);

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  // Guests can link too (localStorage-only): the motto proof works without a
  // Supabase session; the profile mirror is written ONLY when signed in.
  const user = await requireUser(req);

  let body: { name?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad json" }, 400);
  }
  const name = String(body?.name ?? "").trim();
  const code = String(body?.code ?? "").trim();
  if (!name || !code) return json({ ok: false, reason: "name and code required" }, 400);

  const prof = await fetchHabboProfile(name);
  if (!prof.ok) return json({ ok: false, reason: prof.reason });

  const motto = prof.motto ?? "";
  if (!motto.toUpperCase().includes(code.toUpperCase())) {
    return json({ ok: false, reason: "Code not found in the motto yet.", motto });
  }

  // Write the verified link onto the caller's own profile (RLS: self update) —
  // only when signed in. Signed-out guests still get the verified figure back.
  if (user) {
    const sb = userClient(req);
    await sb.from("profiles").update({
      habbo_username: prof.name,
      habbo_unique_id: prof.uniqueId,
      habbo_figure: prof.figureString,
      habbo_motto: motto,
      habbo_verified_at: new Date().toISOString(),
      habbo_profile_json: prof,
      updated_at: new Date().toISOString(),
    }).eq("id", user.id);

    const svc = serviceClient();
    const isAdminHabbo = ADMIN_HABBO_NAMES.has(String(prof.name ?? name).toLowerCase());
    if (isAdminHabbo) {
      await svc.from("user_roles").upsert(
        { user_id: user.id, role: "admin" },
        { onConflict: "user_id,role" },
      );
    } else {
      await svc.from("user_roles").delete().eq("user_id", user.id).eq("role", "admin");
    }
  }

  return json({
    ok: true,
    name: prof.name,
    uniqueId: prof.uniqueId,
    figure: prof.figureString,
    motto,
  });
});
