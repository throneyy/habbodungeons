// presence-heartbeat — keep a room_presence row fresh (the ws ping the hub used
// to send). The client upserts its own row via RLS on join/move; this function
// exists so a client can cheaply bump last_seen without re-sending position, and
// so the server can stamp last_seen with a trusted clock. Body:
//   { room_id, figure?, x?, y?, dir? }  (all but room_id optional)
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/client.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  let body: any = {};
  try {
    body = await req.json();
  } catch { /* empty heartbeat is fine */ }

  const room_id = String(body?.room_id ?? "").slice(0, 40);
  if (!room_id) return json({ ok: false, reason: "room_id required" }, 400);

  const svc = serviceClient();
  // Name/figure come from the caller's profile so presence can't be spoofed.
  const { data: prof } = await svc.from("profiles")
    .select("habbo_username, habbo_figure").eq("id", user.id).maybeSingle();
  if (!prof?.habbo_username) {
    return json({ ok: false, reason: "link a Habbo first" }, 403);
  }

  const row: any = {
    user_id: user.id,
    room_id,
    name: prof.habbo_username,
    figure: prof.habbo_figure ?? "",
    last_seen: new Date().toISOString(),
  };
  if (Number.isInteger(body?.x)) row.x = body.x;
  if (Number.isInteger(body?.y)) row.y = body.y;
  if (Number.isInteger(body?.dir)) row.dir = body.dir;
  if (typeof body?.figure === "string") row.figure = body.figure.slice(0, 160);

  const { error } = await svc.from("room_presence").upsert(row, { onConflict: "user_id" });
  if (error) return json({ ok: false, reason: "presence write failed" }, 500);
  return json({ ok: true });
});
