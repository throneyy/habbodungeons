// save-room-layout — admin furniture-layout save (server.js saveLayouts). Admin
// gate is has_role(auth.uid(),'admin') via RLS on room_layouts; we validate the
// same strict per-prop whitelist server.js used so a compromised admin session
// can rearrange furniture but never inject arbitrary shapes. Bumping version is
// the "refetch layout vN" push clients pick up over postgres_changes.
// Body: { layouts: { roomId: [prop, ...] } }.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, userClient, serviceClient } from "../_shared/client.ts";

const isInt = (n: unknown, lo: number, hi: number) =>
  Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi;

function cleanProp(p: any) {
  if (
    !p || !/^[\w-]{1,64}$/.test(String(p.id)) ||
    !isInt(p.x, 0, 99) || !isInt(p.y, 0, 99) || !isInt(p.dir ?? 0, 0, 7)
  ) throw new Error("bad prop");
  const out: any = { id: p.id, x: p.x, y: p.y, dir: p.dir ?? 0 };
  if (p.walk === true) out.walk = true;
  if (p.gate === true) out.gate = true;
  if (p.front === true) out.front = true;
  if (p.teleport && typeof p.teleport === "object" && !Array.isArray(p.teleport)) {
    const t = p.teleport;
    const tp: any = {};
    if (typeof t.room === "string" && /^[\w-]{1,40}$/.test(t.room)) tp.room = t.room;
    if (isInt(t.x, 0, 99)) tp.x = t.x;
    if (isInt(t.y, 0, 99)) tp.y = t.y;
    if (t.gate === true) tp.gate = true;
    if (tp.room || tp.gate) out.teleport = tp;
  }
  if (Array.isArray(p.tiles) && p.tiles.length && p.tiles.length <= 30) {
    out.tiles = p.tiles.map((t: any) => {
      if (!t || !isInt(t.x, 0, 99) || !isInt(t.y, 0, 99)) throw new Error("bad footprint");
      return { x: t.x, y: t.y };
    });
  }
  return out;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  // Authorize as admin explicitly (belt-and-braces with the RLS policy).
  const sb = userClient(req);
  const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (isAdmin !== true) return json({ ok: false, reason: "admin only" }, 403);

  let body: { layouts?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad json" }, 400);
  }
  const src = body?.layouts;
  if (!src || typeof src !== "object" || Array.isArray(src)) {
    return json({ ok: false, reason: "layouts object required" }, 400);
  }
  const rooms = Object.entries(src);
  if (rooms.length > 20) return json({ ok: false, reason: "too many rooms" }, 400);

  const svc = serviceClient();
  const results: Record<string, number> = {};
  try {
    for (const [roomId, props] of rooms) {
      if (!/^[\w-]{1,40}$/.test(roomId) || !Array.isArray(props) || props.length > 200) {
        return json({ ok: false, reason: `bad room "${roomId}"` }, 400);
      }
      const clean = props.map(cleanProp);
      // Read the current version so the save bumps it (drives the client push).
      const { data: existing } = await svc.from("room_layouts").select("version")
        .eq("room_id", roomId).maybeSingle();
      const version = (existing?.version ?? 0) + 1;
      const { error } = await svc.from("room_layouts").upsert(
        { room_id: roomId, layout: clean, version, updated_at: new Date().toISOString() },
        { onConflict: "room_id" },
      );
      if (error) return json({ ok: false, reason: "could not write layout" }, 500);
      results[roomId] = version;
    }
  } catch (e) {
    return json({ ok: false, reason: (e as Error).message }, 400);
  }
  return json({ ok: true, versions: results });
});
