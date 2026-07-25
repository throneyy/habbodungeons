// habbo-imaging — same-origin (CORS) proxy for avatar PNGs (server.js
// proxyImaging). habbo-imaging serves no CORS headers, so drawing its PNGs
// cross-origin taints the <canvas> and breaks export. Routing them through this
// function adds Access-Control-Allow-Origin so the sprite loader can draw + read
// them back. In-memory caching is dropped (functions are stateless) — the CDN /
// browser cache absorbs the repeated direction/frame variants.
// Query: the full avatarimage query string (?figure=...&action=...&size=...).
import { corsHeaders, preflight } from "../_shared/cors.ts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const UPSTREAMS = [
  "https://www.habbo.com/habbo-imaging/avatarimage",
  "https://sandbox.habbo.com/habbo-imaging/avatarimage",
];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const search = new URL(req.url).search;
  for (const base of UPSTREAMS) {
    try {
      const up = await fetch(`${base}${search}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(6000),
      });
      if (up.status !== 200) continue;
      const body = await up.arrayBuffer();
      return new Response(body, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": up.headers.get("content-type") ?? "image/png",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      /* try the next upstream */
    }
  }
  return new Response(
    JSON.stringify({ error: "all imaging upstreams failed" }),
    { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
