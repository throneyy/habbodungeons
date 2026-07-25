// fetch-habbo-profile — public Origins profile lookup (server.js proxyOrigins).
// Normalized to the shape js/habboApi.js + humanInfostand.js expect:
//   { name, uniqueId, figureString, motto, online }
// verify_jwt is off so the infostand can render a motto for any tapped player
// even before that browser is fully authed; it never touches user data.
// Query: ?name=NAME  (or JSON body { name } / { username }).
import { preflight, json } from "../_shared/cors.ts";
import { fetchHabboProfile } from "../_shared/habbo.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const url = new URL(req.url);
  let name = (url.searchParams.get("name") ?? "").trim();
  if (!name && req.method === "POST") {
    try {
      const body = await req.json();
      name = String(body?.name ?? body?.username ?? "").trim();
    } catch { /* ignore */ }
  }
  if (!name) return json({ error: "name required" }, 400);

  const prof = await fetchHabboProfile(name);
  if (!prof.ok) return json({ error: prof.reason }, prof.status === 404 ? 404 : 502);

  return json({
    name: prof.name,
    uniqueId: prof.uniqueId,
    figureString: prof.figureString,
    motto: prof.motto,
    online: prof.online,
  });
});
