// probe-party-invite.mjs — is the LIVE party-invite running the userByName fix?
//
// Pushing supabase/functions/ does not redeploy the runtime (AGENTS.md), so the
// only honest answer comes from calling the deployed function. Error *wording*
// cannot answer it: on a genuine miss both the old and the new build see
// `error: null` and return HTTP 200 {"reason":"no such player"}, byte for byte.
//
// What discriminates is an input that forces the query itself to error.
// userByName resolves with .ilike().maybeSingle(); `%` is an ILIKE wildcard, so
// "pi-Inv%" matches the pi- worktree's seeded rows. Two or more matches make
// maybeSingle() raise PGRST116:
//
//   OLD build (error discarded) -> HTTP 200 {"ok":false,"reason":"no such player"}
//   NEW build (throws)          -> HTTP 500, uncaught, no CORS headers
//
// That missing Access-Control-Allow-Origin is why this is a Node script and not
// a page fetch: in a browser an unhandled 500 skips _shared/cors.ts and dies as
// an opaque "TypeError: Failed to fetch", which reads exactly like a network
// fault. Node has no CORS, so the 500 arrives intact.
//
// The second call is the control: a name nothing can match, whose "no such
// player" is expected from BOTH builds. It proves the invite path is reachable
// and authorized, so a 500 on call 1 is attributable to the lookup and not to a
// broken function.
//
// Anonymous sign-ins are 30/hour per IP, shared by every worktree, and a full
// e2e pass can already exhaust that. This script signs in ONCE and reuses the
// token for both calls. It has no retries and no loops on purpose: a retry here
// spends a token that some other worktree's suite is going to need, and an
// exhausted bucket does not fail loudly — js/supabaseNet.js degrades to offline
// and the next suite reports a presence timeout that looks like a real bug.
//
// Usage: node tests/probe-party-invite.mjs

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Names for the two calls. The wildcard one must match >= 2 profiles to force
// PGRST116; "pi-" is the party-invite worktree's e2eName() slug, which seeds
// pi-InvA and pi-InvB. Hyphen matters -- `_` is itself an ILIKE wildcard.
const WILDCARD_NAME = "pi-Inv%";
const CONTROL_NAME = "probe-no-such-player-a7f3c1";

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue; // blank lines and # comments
    let value = m[2].trim();
    const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
    value = quoted ? quoted[2] : value.replace(/\s+#.*$/, "").trim();
    out[m[1]] = value;
  }
  return out;
}

async function loadConfig() {
  const path = resolve(ROOT, ".env");
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    throw new Error(`cannot read ${path}: ${err.message}`);
  }
  const env = parseEnv(text);

  const projectId = env.VITE_SUPABASE_PROJECT_ID;
  const url = (env.VITE_SUPABASE_URL || (projectId && `https://${projectId}.supabase.co`) || "")
    .replace(/\/+$/, "");
  const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;

  if (!url) throw new Error("no VITE_SUPABASE_URL (or VITE_SUPABASE_PROJECT_ID) in .env");
  if (!anonKey) throw new Error("no VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  return { url, anonKey };
}

// Mirrors supabase-js signInAnonymously(): POST /auth/v1/signup with no
// credentials. Spends exactly one token from the shared hourly bucket.
async function signInAnonymously({ url, anonKey }) {
  const res = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: {}, gotrue_meta_security: {} }),
  });
  const body = await res.text();

  if (!res.ok) {
    // 429 here is the explicit face of quota exhaustion ("Request rate limit
    // reached"). Do not retry -- the bucket refills one token every 2 minutes.
    throw new Error(`anonymous sign-in failed: HTTP ${res.status} ${body}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`anonymous sign-in returned non-JSON: ${body}`);
  }
  const token = parsed.access_token ?? parsed.session?.access_token;
  if (!token) throw new Error(`anonymous sign-in returned no access_token: ${body}`);
  return { token, userId: parsed.user?.id ?? parsed.session?.user?.id ?? "(unknown)" };
}

async function callPartyInvite({ url, anonKey, token }, label, name) {
  console.log(`\n=== ${label}: name = ${JSON.stringify(name)} ===`);
  let res;
  try {
    res = await fetch(`${url}/functions/v1/party-invite`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
  } catch (err) {
    // In Node this is a genuine transport fault, not the CORS mirage a browser
    // would show for the same unhandled 500.
    console.log(`  transport error: ${err.message}`);
    return null;
  }
  const body = await res.text();
  console.log(`  HTTP ${res.status} ${res.statusText}`);
  console.log(`  content-type: ${res.headers.get("content-type") ?? "(none)"}`);
  // An unhandled throw bypasses _shared/cors.ts, so this header's absence is
  // itself evidence the 500 came from outside the CORS-wrapped happy path.
  console.log(`  access-control-allow-origin: ${res.headers.get("access-control-allow-origin") ?? "(none)"}`);
  console.log(`  body: ${body || "(empty)"}`);
  return { status: res.status, body };
}

const config = await loadConfig();
console.log(`supabase url: ${config.url}`);

const { token, userId } = await signInAnonymously(config);
console.log(`signed in anonymously as ${userId} (1 token spent, no retries)`);

const ctx = { ...config, token };
const wildcard = await callPartyInvite(ctx, "call 1 (wildcard)", WILDCARD_NAME);

// party-invite calls rateOk(svc, user.id, "party-invite", 1): one invite per
// user per SECOND. Back-to-back calls make the second a 429 "slow down" that
// never reaches userByName, which silently voids the control. This wait is not
// a retry -- nothing is re-sent, and no second sign-in is spent.
await new Promise((r) => setTimeout(r, 1500));

const control = await callPartyInvite(ctx, "call 2 (control)", CONTROL_NAME);

console.log("\n=== verdict ===");
if (!wildcard || !control) {
  console.log("inconclusive: a call did not complete.");
} else if (wildcard.status >= 500) {
  console.log("NEW build is live: the wildcard forced PGRST116 and userByName threw.");
} else if (wildcard.status === 200 && /no such player/.test(wildcard.body)) {
  console.log("OLD build is live: the wildcard's lookup error was swallowed into");
  console.log('"no such player". Every fix to party-invite since then is untested.');
} else {
  console.log("inconclusive: unexpected response to the wildcard call.");
  console.log("if call 2 is 401/429, the probe never reached the lookup at all.");
}
if (control && control.status === 429) {
  console.log("note: the control was rate-limited and proves nothing about the");
  console.log("lookup -- it does confirm auth passed, since requireUser runs first.");
}
