// The persistent between-runs stash: dungeon loot survives here, keyed to the
// player's identity. Local Node dev uses the HMAC-authed /api/stash* routes;
// the static Supabase deploy uses the stash-bank edge function (writes) and
// direct RLS-guarded reads of inventory/stash_gold. Signed-out guests have no
// stash — every call quietly no-ops for them.
import { Identity } from './identity.js';
import { isSupabase } from './backend.js';
import { invokeFn } from './backend.js';
import { getSupabase } from './supabase.js';

// Bank a finished run's loot + gold. Fire-and-forget: a dead backend must never
// block the victory/defeat screen.
export async function bankRunLoot(items = [], gold = 0) {
  if (!items.length && !gold) return null;
  if (isSupabase()) {
    const json = await invokeFn('stash-bank', { items, gold });
    return json && json.ok ? json.stash : null;
  }
  const auth = Identity.session();
  if (!auth) return null;
  try {
    const res = await fetch('/api/stash/bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth, items, gold }),
    });
    const json = await res.json();
    return json.ok ? json.stash : null;
  } catch {
    return null;
  }
}

// Read your own stash (the trade/stash UI reads through this).
export async function fetchStash() {
  if (isSupabase()) {
    const sb = await getSupabase();
    if (!sb) return null;
    const { data: { user } = { user: null } } = await sb.auth.getUser();
    if (!user) return null; // guest — no stash
    const [{ data: inv }, { data: g }] = await Promise.all([
      sb.from('inventory').select('item_id').eq('user_id', user.id),
      sb.from('stash_gold').select('gold').eq('user_id', user.id).maybeSingle(),
    ]);
    return {
      name: user.id,
      gold: (g && g.gold) || 0,
      items: (inv || []).map((r) => r.item_id),
    };
  }
  const auth = Identity.session();
  if (!auth) return null;
  try {
    const res = await fetch(`/api/stash?auth=${encodeURIComponent(auth)}`);
    const json = await res.json();
    return json.ok ? json.stash : null;
  } catch {
    return null;
  }
}
