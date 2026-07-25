// stash-bank — bank a finished run's loot + gold (server.js bankStash +
// server/stash.js bank). The caller's JWT is the identity (no more HMAC token);
// items become inventory rows, gold accumulates on stash_gold. Writes use the
// service role AFTER authorizing the caller, because RLS denies direct client
// inventory inserts (so loot can't be minted by a crafted request).
// Body: { items: string[], gold: number }.
import { preflight, json } from "../_shared/cors.ts";
import { requireUser, serviceClient, rateOk } from "../_shared/client.ts";

const MAX_ITEMS = 200;
// Item ids are lowercase snake identifiers (see js/items.js ITEMS/CONSUMABLES).
// Full allowlist validation happens client-side; here we bound count + charset
// so a crafted request can't stuff junk. Tighten to a generated allowlist later.
const ITEM_RE = /^[a-z0-9_]{1,48}$/;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const user = await requireUser(req);
  if (!user) return json({ ok: false, reason: "sign in first" }, 401);

  let body: { items?: unknown; gold?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "bad json" }, 400);
  }

  const svc = serviceClient();
  if (!(await rateOk(svc, user.id, "stash-bank", 2))) {
    return json({ ok: false, reason: "slow down" }, 429);
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .map((s) => String(s))
    .filter((s) => ITEM_RE.test(s));
  const gold = Math.max(0, Math.min(1_000_000, Math.floor(Number(body.gold) || 0)));

  // Cap total inventory size like server/stash.js did.
  const { count } = await svc.from("inventory").select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const room = Math.max(0, MAX_ITEMS - (count ?? 0));
  const toInsert = items.slice(0, room).map((item_id) => ({ user_id: user.id, item_id }));

  if (toInsert.length) {
    const { error } = await svc.from("inventory").insert(toInsert);
    if (error) return json({ ok: false, reason: "could not write stash" }, 500);
  }
  if (gold) {
    // Accumulate: read the current balance, then upsert the new total.
    const { data: cur } = await svc.from("stash_gold").select("gold")
      .eq("user_id", user.id).maybeSingle();
    await svc.from("stash_gold").upsert(
      { user_id: user.id, gold: (cur?.gold ?? 0) + gold },
      { onConflict: "user_id" },
    );
  }

  const [{ data: inv }, { data: g }] = await Promise.all([
    svc.from("inventory").select("item_id").eq("user_id", user.id),
    svc.from("stash_gold").select("gold").eq("user_id", user.id).maybeSingle(),
  ]);
  return json({
    ok: true,
    stash: {
      name: user.id,
      gold: g?.gold ?? 0,
      items: (inv ?? []).map((r) => r.item_id),
    },
  });
});
