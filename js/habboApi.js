import { ORIGINS_API } from './config.js';
import { isSupabase, invokeFn } from './backend.js';

// Habbo Origins public profile lookup, normalized to
//   { uniqueId, name, figureString, motto, online }
// Local Node dev proxies via server.js (/api/origins/users); the static
// Supabase deploy invokes the fetch-habbo-profile edge function. The
// figureString renders directly on habbo-imaging.
export async function fetchOriginsUser(name) {
  let data;
  if (isSupabase()) {
    data = await invokeFn('fetch-habbo-profile', { name });
  } else {
    const res = await fetch(`${ORIGINS_API}/users?name=${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`Origins API returned ${res.status}`);
    data = await res.json();
  }
  if (!data || !data.figureString) throw new Error('No figure found for that name');
  return data;
}
