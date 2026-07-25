// Supabase client helpers for edge functions.
//
// - userClient(req): a client bound to the CALLER's JWT — RLS applies, and
//   getUser() returns the authenticated user (or null). Use for reads.
// - serviceClient(): the service-role client — bypasses RLS. Use ONLY inside a
//   function after it has authorized the caller, for the trusted writes the ws
//   hub used to do (presence upserts, party/trade state, the atomic swap).
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export function userClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Resolve the authenticated caller from the request JWT, or null.
export async function requireUser(req: Request) {
  const sb = userClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

// Per-invocation rate-limit gate (the strike-counter analogue). Returns true
// when the action is allowed; false when it fired too soon.
export async function rateOk(
  svc: SupabaseClient,
  userId: string,
  action: string,
  intervalSeconds: number,
): Promise<boolean> {
  const { data, error } = await svc.rpc("rate_limit_touch", {
    _user_id: userId,
    _action: action,
    _min_interval: `${intervalSeconds} seconds`,
  });
  if (error) return true; // fail-open: never brick a mutation on the limiter
  return data === true;
}
