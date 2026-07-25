// presence-reap — evict stale room_presence rows (the ws reaper that
// terminated dead sockets). Called on a schedule (Supabase cron / pg_cron) with
// the service-role key; verify_jwt is off so the scheduler can invoke it. Also
// callable manually for testing. Deletes rows older than the TTL and returns the
// count removed.
import { preflight, json } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/client.ts";

const TTL_SECONDS = 30;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const svc = serviceClient();
  const { data, error } = await svc.rpc("reap_stale_presence", {
    _ttl: `${TTL_SECONDS} seconds`,
  });
  if (error) return json({ ok: false, reason: error.message }, 500);
  return json({ ok: true, reaped: data ?? 0 });
});
