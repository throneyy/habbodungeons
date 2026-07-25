// sync-habbo-skills — Fishing/Gardening levels from Bobba (server.js habboSkills).
// Returns the raw levels + figure/motto; the client (js/skills.js
// unlockedTreeSkills) computes the unlocked tree and mirrors it back, keeping
// the unlock thresholds in one place. We also persist the levels to profiles.
// Query: ?name=NAME  (or JSON body { name }).
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, userClient } from "../_shared/client.ts";
import { fetchHabboProfile } from "../_shared/habbo.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req); // optional: guests sync locally

  const url = new URL(req.url);
  let name = (url.searchParams.get("name") ?? "").trim();
  if (!name && req.method === "POST") {
    try {
      const body = await req.json();
      name = String(body?.name ?? "").trim();
    } catch { /* ignore */ }
  }
  if (!name) return json({ ok: false, reason: "name required" }, 400);

  const prof = await fetchHabboProfile(name, true);
  if (!prof.ok) return json({ ok: false, reason: prof.reason });

  if (user) {
    const sb = userClient(req);
    await sb.from("profiles").update({
      fishing_level: prof.fishingLevel ?? 0,
      gardening_level: prof.gardeningLevel ?? 0,
      habbo_figure: prof.figureString,
      last_habbo_skill_sync: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", user.id);
  }

  return json({
    ok: true,
    name: prof.name,
    figure: prof.figureString,
    motto: prof.motto,
    fishingLevel: prof.fishingLevel ?? 0,
    gardeningLevel: prof.gardeningLevel ?? 0,
  });
});
