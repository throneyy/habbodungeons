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

  // Number(x) || 0 can't tell "the field was never sent" from "the level is
  // genuinely 0" -- both coerce to 0. That distinction matters here: the PAID
  // tier (bobba.me/api, used whenever BOBBA_KEY is set) has been observed to
  // omit fishingLevel from mainDetails while gardeningLevel comes through
  // fine, silently reporting a real angler as a false zero. Check the raw key
  // BEFORE coercing, and when the paid tier drops a field, cross-check the
  // free tier for just that field rather than trusting the gap.
  const missing: string[] = [];
  if (md.fishingLevel === undefined) missing.push("fishingLevel");
  if (md.gardeningLevel === undefined) missing.push("gardeningLevel");

  let fishingLevel = Number(md.fishingLevel) || 0;
  let gardeningLevel = Number(md.gardeningLevel) || 0;

  if (BOBBA_KEY && missing.length) {
    console.warn(
      `[habbo] paid Bobba response for "${name}" is missing ${missing.join(" and ")}` +
        ` -- falling back to the free tier for it. Raw mainDetails: ${JSON.stringify(md)}`,
    );
    const free = await getJson(`${BOBBA_FREE}/${q}`);
    const freeMd = free.json && free.json.mainDetails;
    if (freeMd) {
      if (md.fishingLevel === undefined) fishingLevel = Number(freeMd.fishingLevel) || 0;
      if (md.gardeningLevel === undefined) gardeningLevel = Number(freeMd.gardeningLevel) || 0;
    } else {
      console.warn(`[habbo] free-tier fallback for "${name}" also failed (status ${free.status})`);
    }
  }

  return {
    ok: true,
    source: "bobba",
    name: md.name ?? name,
    uniqueId: (json.uniqueIds && json.uniqueIds.uniqueId) ?? null,
    figureString: md.figureString,
    motto: String(md.motto ?? ""),
    online: md.online === true || md.online === "true",
    fishingLevel,
    gardeningLevel,
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
