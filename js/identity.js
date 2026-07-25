// Habbo identity: the linked Origins account, synced Fishing/Gardening skills,
// and (optionally) a Supabase cloud mirror. Fully offline-capable — linking and
// skill sync persist to localStorage; signing in additionally mirrors to the
// `profiles` table and unlocks cloud run saves (see runStore.js).
//
// Flow:
//   1. Identity.makeCode()  -> a one-time 6-letter code (e.g. QMXKZP)
//   2. user sets it in their Origins motto
//   3. Identity.verify(name, code) -> server checks the live motto -> figure saved
//   4. Identity.sync() -> Bobba fishing/gardening levels -> unlocked tree skills
import { getSupabase } from './supabase.js';
import { isSupabase, invokeFn } from './backend.js';
import { unlockedTreeSkills } from './skills.js';

const LS_IDENTITY = 'habbo-dungeons-identity';
const LS_CHAR = 'habbo-dungeons-char'; // legacy figure-loader key, kept in sync

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_IDENTITY) || 'null');
  } catch {
    return null;
  }
}
function writeLocal(id) {
  localStorage.setItem(LS_IDENTITY, JSON.stringify(id));
  // Keep the legacy {name,figure} key in sync so the original loader still works.
  if (id && id.name && id.figure) {
    localStorage.setItem(LS_CHAR, JSON.stringify({ name: id.name, figure: id.figure }));
  }
}

export const Identity = {
  get: readLocal,
  figure() {
    const i = readLocal();
    return i && i.figure;
  },
  name() {
    const i = readLocal();
    return i && i.name;
  },
  unlockedSkills() {
    const i = readLocal();
    return (i && i.unlockedSkills) || [];
  },
  // The calling chosen at hero creation (landing page): the class "You"
  // fights as when a descent begins. Guests can pick one too — it's part of
  // the local identity, not the Habbo link.
  classId() {
    const i = readLocal();
    return (i && i.classId) || null;
  },
  setClass(classId) {
    const id = { ...(readLocal() || {}), classId };
    writeLocal(id);
    return id;
  },
  isVerified() {
    const i = readLocal();
    return !!(i && i.verifiedAt);
  },
  // The HMAC session credential minted by /api/link/verify — the multiplayer
  // WS handshake presents it to prove this browser owns the linked name.
  // Users verified before sessions existed have none: they re-link once.
  session() {
    const i = readLocal();
    return (i && i.session) || null;
  },
  clear() {
    localStorage.removeItem(LS_IDENTITY);
    localStorage.removeItem(LS_CHAR);
  },

  // A one-time code: 6 uppercase letters, no symbols or digits — the exact
  // format habbodungeons.com uses, so it survives Origins motto entry and the
  // server's case-insensitive substring match untouched.
  makeCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const rnd = new Uint8Array(6);
    (globalThis.crypto || {}).getRandomValues?.(rnd);
    let s = '';
    for (let i = 0; i < 6; i++) {
      const n = rnd[i] || Math.floor(Math.random() * 256);
      s += chars[n % chars.length];
    }
    return s;
  },

  // Quick "play as this figure" without verification (title-screen loader).
  // Switching to a different Habbo drops stale skills until re-synced.
  setFigure(name, figure) {
    const prev = readLocal() || {};
    const changed = prev.name && String(prev.name).toLowerCase() !== String(name).toLowerCase();
    const id = { ...prev, name, figure };
    if (changed) {
      delete id.fishingLevel;
      delete id.gardeningLevel;
      delete id.uniqueId;
      delete id.verifiedAt;
      delete id.syncedAt;
      delete id.session; // the credential belongs to the previous name
      id.unlockedSkills = [];
    }
    writeLocal(id);
    return id;
  },

  // Server-side motto verification. On success the verified figure is saved.
  // Local Node dev hits /api/link/verify; the static Supabase deploy invokes
  // the verify-habbo-link edge function (js/backend.js).
  async verify(name, code) {
    let data;
    if (isSupabase()) {
      data = await invokeFn('verify-habbo-link', { name, code });
    } else {
      try {
        const res = await fetch('/api/link/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, code }),
        });
        data = await res.json();
      } catch {
        return { ok: false, reason: 'Network error — is the server running?' };
      }
    }
    if (!data.ok) return { ok: false, reason: data.reason || 'Verification failed.', motto: data.motto };
    const prev = readLocal() || {};
    const id = {
      ...prev,
      name: data.name,
      figure: data.figure,
      uniqueId: data.uniqueId,
      motto: data.motto,
      session: data.token || prev.session || null,
      verifiedAt: new Date().toISOString(),
    };
    writeLocal(id);
    this.mirror(id).catch(() => {});
    return { ok: true, identity: id };
  },

  // Pull Fishing/Gardening levels (Bobba) and recompute unlocked tree skills.
  async sync() {
    const cur = readLocal();
    if (!cur || !cur.name) return { ok: false, reason: 'Link a Habbo first.' };
    let data;
    if (isSupabase()) {
      data = await invokeFn('sync-habbo-skills', { name: cur.name });
    } else {
      try {
        const res = await fetch('/api/habbo/skills?name=' + encodeURIComponent(cur.name));
        data = await res.json();
      } catch {
        return { ok: false, reason: 'Network error — is the server running?' };
      }
    }
    if (!data.ok) return { ok: false, reason: data.reason || 'No skill data found.' };
    const unlocked = unlockedTreeSkills(data.fishingLevel, data.gardeningLevel);
    const id = {
      ...cur,
      figure: data.figure || cur.figure,
      fishingLevel: data.fishingLevel,
      gardeningLevel: data.gardeningLevel,
      unlockedSkills: unlocked,
      syncedAt: new Date().toISOString(),
    };
    writeLocal(id);
    this.mirror(id).catch(() => {});
    return { ok: true, fishingLevel: data.fishingLevel, gardeningLevel: data.gardeningLevel, unlocked };
  },

  // --- cloud mirror (no-op when signed out or offline) ---
  async mirror(id = readLocal()) {
    const sb = await getSupabase();
    if (!sb || !id) return false;
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return false;
    const { error } = await sb
      .from('profiles')
      .update({
        habbo_username: id.name || null,
        habbo_unique_id: id.uniqueId || null,
        habbo_figure: id.figure || null,
        habbo_motto: id.motto || null,
        habbo_verified_at: id.verifiedAt || null,
        fishing_level: id.fishingLevel || 0,
        gardening_level: id.gardeningLevel || 0,
        unlocked_skills: id.unlockedSkills || [],
        last_habbo_skill_sync: id.syncedAt || null,
      })
      .eq('id', user.id);
    return !error;
  },

  // Adopt the cloud profile locally after signing in (if it has a linked Habbo).
  async loadFromCloud() {
    const sb = await getSupabase();
    if (!sb) return null;
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return null;
    const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
    if (!data || !data.habbo_username) return null;
    const id = {
      name: data.habbo_username,
      figure: data.habbo_figure,
      uniqueId: data.habbo_unique_id,
      motto: data.habbo_motto,
      fishingLevel: data.fishing_level,
      gardeningLevel: data.gardening_level,
      unlockedSkills: data.unlocked_skills || [],
      verifiedAt: data.habbo_verified_at,
      syncedAt: data.last_habbo_skill_sync,
    };
    writeLocal(id);
    return id;
  },
};

// Optional cloud auth (email one-time-code). All methods are safe to call when
// offline; they resolve to a graceful failure rather than throwing.
export const Auth = {
  async available() {
    return !!(await getSupabase());
  },
  async user() {
    const sb = await getSupabase();
    if (!sb) return null;
    const { data } = await sb.auth.getUser();
    return data.user || null;
  },
  // Guarantee a Supabase session exists (creating an anonymous one if needed)
  // so Realtime + RLS-backed writes work without an email sign-in. Safe to
  // call repeatedly; returns the current user or null if cloud is unreachable.
  async ensureSession() {
    const sb = await getSupabase();
    if (!sb) return null;
    const { data: { user } = { user: null } } = await sb.auth.getUser();
    if (user) return user;
    try {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      return data?.user || null;
    } catch (e) {
      console.warn('[habbo-dungeons] anonymous sign-in failed:', e?.message || e);
      return null;
    }
  },
  async signIn(email) {
    const sb = await getSupabase();
    if (!sb) return { ok: false, reason: 'Cloud unavailable (offline).' };
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    return error ? { ok: false, reason: error.message } : { ok: true };
  },
  async verifyOtp(email, token) {
    const sb = await getSupabase();
    if (!sb) return { ok: false, reason: 'Cloud unavailable (offline).' };
    const { data, error } = await sb.auth.verifyOtp({ email, token: token.trim(), type: 'email' });
    return error ? { ok: false, reason: error.message } : { ok: true, user: data.user };
  },
  async signOut() {
    const sb = await getSupabase();
    if (sb) await sb.auth.signOut();
  },
  async onChange(cb) {
    const sb = await getSupabase();
    if (sb) sb.auth.onAuthStateChange((_e, session) => cb(session));
  },
};
