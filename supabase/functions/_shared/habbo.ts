// Habbo Origins profile + skills fetcher — ported from server.js
// (fetchHabboProfile / fetchOriginsDirect / fetchBobba). Edge functions run on
// clean cloud IPs, so Origins-direct is the primary source (fresh, live motto);
// Bobba is the fallback AND the only source of Fishing/Gardening levels.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const ORIGINS = Deno.env.get("ORIGINS_API_BASE") ??
  "https://origins.habbo.com/api/public";
const BOBBA = "https://bobba.me/api";
const BOBBA_FREE = "https://api.bobba.me";
const BOBBA_KEY = (Deno.env.get("BOBBA_API_KEY") ?? "").trim();

export interface HabboProfile {
  ok: boolean;
  source?: string;
  name?: string;
  uniqueId?: string | null;
  figureString?: string;
  motto?: string;
  online?: boolean;
  fishingLevel?: number;
  gardeningLevel?: number;
  status?: number;
  reason?: string;
}

async function getJson(url: string, headers: Record<string, string> = {}) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(12000),
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON error page */
    }
    return { status: res.status, json };
  } catch {
    return { status: 502, json: null };
  }
}

async function fetchOriginsDirect(name: string): Promise<HabboProfile> {
  const { status, json } = await getJson(
    `${ORIGINS}/users?name=${encodeURIComponent(name)}`,
  );
  if (!json || !json.figureString) return { ok: false, status };
  return {
    ok: true,
    source: "origins",
    name: json.name ?? name,
    uniqueId: json.uniqueId ?? null,
    figureString: json.figureString,
    motto: String(json.motto ?? ""),
    online: json.online === true,
    fishingLevel: 0,
    gardeningLevel: 0,
  };
}

async function fetchBobba(name: string): Promise<HabboProfile> {
  const q = `get_habbo?username=${encodeURIComponent(name)}`;
  const { status, json } = BOBBA_KEY
    ? await getJson(`${BOBBA}/${q}`, { "X-API-Key": BOBBA_KEY })
    : await getJson(`${BOBBA_FREE}/${q}`);
  if (json && json.ok === false && /api key/i.test(String(json.error ?? ""))) {
    return {
      ok: false,
      status,
      reason: `Bobba API key ${BOBBA_KEY ? "invalid" : "missing"}.`,
    };
  }
  const md = json && json.mainDetails;
  if (!md || !md.figureString) return { ok: false, status };
  return {
    ok: true,
    source: "bobba",
    name: md.name ?? name,
    uniqueId: (json.uniqueIds && json.uniqueIds.uniqueId) ?? null,
    figureString: md.figureString,
    motto: String(md.motto ?? ""),
    online: md.online === true || md.online === "true",
    fishingLevel: Number(md.fishingLevel) || 0,
    gardeningLevel: Number(md.gardeningLevel) || 0,
  };
}

// The live Origins profile, normalized. Pass withSkills to merge Bobba's
// Fishing/Gardening levels onto an Origins hit (Origins itself has none).
export async function fetchHabboProfile(
  name: string,
  withSkills = false,
): Promise<HabboProfile> {
  const live = await fetchOriginsDirect(name);
  if (live.ok) {
    if (!withSkills) return live;
    const bobba = await fetchBobba(name);
    return bobba.ok
      ? {
        ...live,
        fishingLevel: bobba.fishingLevel,
        gardeningLevel: bobba.gardeningLevel,
      }
      : live;
  }
  const bobba = await fetchBobba(name);
  if (bobba.ok) return bobba;
  if (bobba.reason) return { ok: false, status: bobba.status, reason: bobba.reason };
  const status = live.status || bobba.status;
  return {
    ok: false,
    status,
    reason: status === 404
      ? `No Origins user "${name}" found. Check the spelling and that it's a Habbo: Origins (com) account.`
      : `Couldn't reach Origins (status ${status}). Try again in a moment.`,
  };
}
