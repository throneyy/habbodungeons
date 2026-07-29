// Isolated Supabase client, loaded from the esm.sh CDN — no build step.
// Everything degrades gracefully: if the CDN or network is unreachable, this
// returns null and the game stays fully playable offline (localStorage).
//
// IMPORTANT: core game modules (classes/units/battle/run/skills) must NOT import
// this file — only identity.js and the UI layer touch it, so the Node test suite
// never pulls in a browser-only CDN import.
// Project URL + anon key. On the Lovable/static deploy these are injected
// WITHOUT a build step, so the same source tree can point at whichever Supabase
// project hosts it. Order of precedence:
//   window.HD_SUPABASE_URL / window.HD_SUPABASE_ANON_KEY
//   <meta name="hd-supabase-url" content="…"> / <meta name="hd-supabase-anon-key">
//
// THERE IS NO BAKED FALLBACK, deliberately.
//
// This file used to default to https://lxtbevayelblobqpqtku.supabase.co, which
// supabase/HANDOFF.md documents as a PLACEHOLDER you must override. It is not
// this game's project: supabase/config.toml, .env and the deploy-functions
// workflow all say cswyarorrvzbunodiftf. So the fallback's only possible
// effect was to point a misconfigured deploy at a stale, foreign database --
// silently, with a working-looking client, reading and writing real rows in
// the wrong place. A config mistake that announces itself is strictly better
// than one that appears to work.
//
// "Fail loudly" here means: say so, once, in the console, and hand back no
// client. It does NOT mean throw. getSupabase() returning null is the existing
// offline path that every caller already handles, so a missing config leaves
// the game fully playable on localStorage instead of white-screening it.
function injected(globalKey, metaName) {
  try {
    if (typeof window !== 'undefined' && window[globalKey]) return String(window[globalKey]);
    if (typeof document !== 'undefined') {
      const m = document.querySelector(`meta[name="${metaName}"]`);
      if (m && m.content) return m.content.trim();
    }
  } catch {
    /* non-browser import (Node test suite) — no config, no client */
  }
  return '';
}

export const SUPABASE_URL = injected('HD_SUPABASE_URL', 'hd-supabase-url');
// Public anon key — safe to ship in the client; Row-Level Security enforces
// per-user access server-side. Supplied alongside the URL by the host page.
export const SUPABASE_ANON_KEY = injected('HD_SUPABASE_ANON_KEY', 'hd-supabase-anon-key');

// URL and key are resolved independently, so a page carrying only one of them
// would pair a live URL with a foreign key (or the reverse) and fail in a way
// that looks like an auth bug rather than a config one. Both, or neither.
export function supabaseConfigError() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('hd-supabase-url');
  if (!SUPABASE_ANON_KEY) missing.push('hd-supabase-anon-key');
  if (!missing.length) return null;
  return (
    `Supabase is not configured: missing ${missing.join(' and ')}. ` +
    'Add to index.html <head>, before js/main.js:\n' +
    '  <meta name="hd-supabase-url" content="https://<project-ref>.supabase.co" />\n' +
    '  <meta name="hd-supabase-anon-key" content="<anon-public-key>" />\n' +
    'Cloud features (sign-in, leaderboards, multiplayer) stay off until then; ' +
    'the game still runs offline on localStorage.'
  );
}

export function hasSupabaseConfig() {
  return !supabaseConfigError();
}

let _client; // undefined = not tried yet, null = failed, object = ready
let _pending = null;

// Lazily create (once) and return the Supabase client, or null if unavailable.
// Null means "no cloud" and is a supported state, not an error to recover from.
export async function getSupabase() {
  if (_client !== undefined) return _client;
  if (_pending) return _pending;

  // Announce a missing config once, then stay offline. Checked BEFORE the CDN
  // import so an unconfigured page reports the real cause instead of whatever
  // createClient() happens to throw on an empty URL.
  //
  // Only a BROWSER shouts. Under Node (the unit suite, any tooling import)
  // there is no document to carry a meta tag, so "unconfigured" is the normal
  // and expected state rather than a deploy mistake -- logging there would be
  // pure noise on every test run.
  const configErr = supabaseConfigError();
  if (configErr) {
    if (typeof document !== 'undefined') console.error(`[habbo-dungeons] ${configErr}`);
    _client = null;
    return _client;
  }

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
