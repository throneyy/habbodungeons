// Backend mode switch — the seam the V2→Supabase migration turns on.
//
// The SAME static client runs two ways:
//   • Local Node dev (localhost): the zero-dep server.js still serves /api/* and
//     /ws. Everything works exactly as before — the Node test/e2e suites depend
//     on this path, so it stays the default for localhost/127.0.0.1.
//   • Deployed static host (Lovable / habbodungeons.com): there is NO same-origin
//     server, so identity/stash/layout/profile calls go to Supabase Edge
//     Functions and multiplayer rides Supabase Realtime (js/supabaseNet.js).
//
// Override for testing Supabase locally: `?backend=supabase` (or
// localStorage['hd-backend']='supabase'); force local with 'local'.
import { getSupabase, SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigError } from './supabase.js';

function detectMode() {
  try {
    const q = new URLSearchParams(location.search).get('backend');
    if (q === 'supabase' || q === 'local') return q;
    const ls = localStorage.getItem('hd-backend');
    if (ls === 'supabase' || ls === 'local') return ls;
  } catch {
    /* no window/localStorage (Node import) — fall through to local */
  }
  const host = (typeof location !== 'undefined' && location.hostname) || '';
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '' || host === '[::1]';
  return isLocal ? 'local' : 'supabase';
}

let _mode; // cached
export function backendMode() {
  if (!_mode) _mode = detectMode();
  return _mode;
}
export function isSupabase() {
  return backendMode() === 'supabase';
}

// The Edge Functions base URL, derived from the project URL. Null when the
// project is not configured -- callers must not build `/functions/v1` off an
// empty string, which would post the caller's JWT to the page's own origin.
export function functionsBase() {
  return SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : null;
}

// Invoke a Supabase Edge Function with the caller's JWT (when signed in).
// Returns the parsed JSON body, or { ok:false, reason } on transport failure —
// callers must never throw a dead backend into a game-over screen.
export async function invokeFn(name, body = null, { method = 'POST', query = '' } = {}) {
  // No project configured: report it in the same shape a dead backend reports,
  // so the existing { ok:false, reason } handling covers it and nothing throws.
  const configErr = supabaseConfigError();
  if (configErr) {
    // browser-only, same reasoning as getSupabase(): under Node there is no
    // meta tag to find, so silence is correct there
    if (typeof document !== 'undefined') console.error(`[habbo-dungeons] ${configErr}`);
    return { ok: false, reason: 'Supabase is not configured' };
  }
  const sb = await getSupabase();
  let token = null;
  try {
    const { data } = sb ? await sb.auth.getSession() : { data: null };
    token = data?.session?.access_token || null;
  } catch {
    /* signed out — anon call */
  }
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
  };
  try {
    const res = await fetch(`${functionsBase()}/${name}${query}`, {
      method,
      headers,
      body: body != null && method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    try {
      return await res.json();
    } catch {
      return { ok: res.ok };
    }
  } catch {
    return { ok: false, reason: 'Network error: cloud unreachable.' };
  }
}
