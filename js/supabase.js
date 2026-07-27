// Isolated Supabase client, loaded from the esm.sh CDN — no build step.
// Everything degrades gracefully: if the CDN or network is unreachable, this
// returns null and the game stays fully playable offline (localStorage).
//
// IMPORTANT: core game modules (classes/units/battle/run/skills) must NOT import
// this file — only identity.js and the UI layer touch it, so the Node test suite
// never pulls in a browser-only CDN import.
// Project URL + anon key. On the Lovable/static deploy these are injected
// WITHOUT a build step, so the same source tree can point at whichever Supabase
// project hosts it. Order of precedence: window global → <meta> tag → baked
// default (kept for existing deploys).
//   window.HD_SUPABASE_URL / window.HD_SUPABASE_ANON_KEY
//   <meta name="hd-supabase-url" content="…"> / <meta name="hd-supabase-anon-key">
function injected(globalKey, metaName, fallback) {
  try {
    if (typeof window !== 'undefined' && window[globalKey]) return String(window[globalKey]);
    if (typeof document !== 'undefined') {
      const m = document.querySelector(`meta[name="${metaName}"]`);
      if (m && m.content) return m.content;
    }
  } catch {
    /* non-browser import — use the fallback */
  }
  return fallback;
}

export const SUPABASE_URL = injected(
  'HD_SUPABASE_URL',
  'hd-supabase-url',
  'https://lxtbevayelblobqpqtku.supabase.co',
);
// Public anon key — safe to ship in the client; Row-Level Security enforces
// per-user access server-side. (The modern sb_publishable_… key also works on
// recent SDKs; the anon JWT is used here for the widest compatibility.)
const BAKED_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4dGJldmF5ZWxibG9icXBxdGt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NTQ5ODUsImV4cCI6MjA5ODUzMDk4NX0.YKY5tjvRCj-QJYcqFe4MyTpWjPRXkRDY5HNlhOGdcdE';

export const SUPABASE_ANON_KEY = injected('HD_SUPABASE_ANON_KEY', 'hd-supabase-anon-key', BAKED_ANON_KEY);

let _client; // undefined = not tried yet, null = failed, object = ready
let _pending = null;

// Lazily create (once) and return the Supabase client, or null if unavailable.
export async function getSupabase() {
  if (_client !== undefined) return _client;
  if (_pending) return _pending;
  _pending = (async () => {
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    } catch (e) {
      console.warn('[habbo-dungeons] Supabase unavailable - cloud features off:', e?.message || e);
      _client = null;
    }
    return _client;
  })();
  return _pending;
}
