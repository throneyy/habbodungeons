// Cloud persistence for the active run (Supabase `runs` table), with
// localStorage as the offline fallback. This is the UI-layer bridge that keeps
// run.js pure: RunController injects push() as the run's onSave hook, and boot
// hydrates localStorage from the cloud so the existing "Continue Run" path works
// unchanged whether the newest save lives locally or in the cloud.
import { getSupabase } from './supabase.js';
import { SAVE_KEY } from './run.js';

async function signedInClient() {
  const sb = await getSupabase();
  if (!sb) return null;
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user ? { sb, user } : null;
}

export const RunStore = {
  // Upsert the single active run for this user (one save slot, co-op-ready shape).
  async push(run, blob) {
    const ctx = await signedInClient();
    if (!ctx) return false;
    const { sb, user } = ctx;
    blob = blob || run.serialize();
    const row = {
      user_id: user.id,
      state: blob,
      dungeon_id: blob.dungeonId,
      node_index: blob.nodeIndex || 0,
      outcome: blob.outcome || null,
      active: true,
    };
    const { data: existing } = await sb
      .from('runs')
      .select('id')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();
    if (existing) await sb.from('runs').update(row).eq('id', existing.id);
    else await sb.from('runs').insert(row);
    return true;
  },

  // If the cloud has a newer active run than localStorage, copy it down so the
  // normal Run.load(localStorage) path resumes it. Returns true if it updated.
  async hydrateFromCloud() {
    const ctx = await signedInClient();
    if (!ctx) return false;
    const { sb, user } = ctx;
    const { data } = await sb
      .from('runs')
      .select('state')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();
    if (!data || !data.state) return false;
    const cloud = data.state;
    let local = null;
    try {
      local = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    } catch {
      /* ignore */
    }
    if (local && local.savedAt && cloud.savedAt && local.savedAt >= cloud.savedAt) return false;
    localStorage.setItem(SAVE_KEY, JSON.stringify(cloud));
    return true;
  },

  // Remove the active cloud run (run won or lost).
  async clear() {
    const ctx = await signedInClient();
    if (!ctx) return;
    const { sb, user } = ctx;
    await sb.from('runs').delete().eq('user_id', user.id).eq('active', true);
  },
};
