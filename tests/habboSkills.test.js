// Bobba skills merge — run with: node tests/habboSkills.test.js
//
// The bug: fetchBobba (supabase/functions/_shared/habbo.ts) read
// mainDetails.fishingLevel/gardeningLevel with `Number(x) || 0`, which cannot
// tell "the field was never sent" from "the level is genuinely 0" -- both
// coerce to the same 0. That distinction mattered live: the PAID Bobba tier
// (bobba.me/api, used whenever BOBBA_API_KEY is set -- which it is in
// production) was observed dropping fishingLevel from mainDetails while
// gardeningLevel came through fine, so a real level-74 angler (throney)
// synced as Fishing 0 forever, on every re-sync, because the upstream
// payload itself never carried the field.
//
// The fix cross-checks the free tier (api.bobba.me) for exactly the field
// the paid tier omitted, instead of trusting the gap as a real zero. These
// checks pin that: a field truly absent from the paid response is filled
// from the free response's value, a field present as a real 0 is trusted
// as 0 (not silently "corrected" to the free tier's possibly-different
// value), and the free-tier-only path (no key) needs no cross-check at all.
//
// habbo.ts reads Deno.env at import time (ORIGINS_API_BASE, BOBBA_API_KEY).
// Node has no such global. A static import is hoisted above any statement in
// this file, so the stub has to be in place before the import runs at all --
// a dynamic import() after the assignment is the only order that works. The
// stubbed values never matter for these checks -- every case below passes
// its own bobbaKey/fetchImpl instead of relying on the module's env-derived
// defaults.
globalThis.Deno ??= { env: { get: () => undefined } };

const { fetchBobba, fetchHabboProfile } = await import('../supabase/functions/_shared/habbo.ts');

let failed = 0;
function check(name, cond) {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

// A Bobba get_habbo response shaped by `md` (mainDetails). Passing a key
// present/absent controls which tier's URL the code under test builds
// (BOBBA vs BOBBA_FREE); the fetchImpl below doesn't care which URL it's
// handed, only what mainDetails it stands behind.
const bobbaResponse = (md) =>
  new Response(
    JSON.stringify({
      mainDetails: { name: 'throney', figureString: 'hr-1-1', motto: 'hi', online: '1', ...md },
      uniqueIds: { uniqueId: 'hhous-abc' },
    }),
    { status: 200 },
  );

console.log('a field the paid tier omits falls back to the free tier value');
{
  // Paid tier (has fishingLevel: 74 in reality per the free tier, but its own
  // response never sends the key at all) vs free tier (sends both).
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('bobba.me/api')) {
      // paid: gardeningLevel present, fishingLevel MISSING entirely
      return bobbaResponse({ gardeningLevel: 47 });
    }
    // free: both present, ground truth
    return bobbaResponse({ fishingLevel: 74, gardeningLevel: 47 });
  };

  const r = await fetchBobba('throney', { bobbaKey: 'fake-paid-key', fetchImpl });
  check('profile resolves ok', r.ok === true);
  check('the missing field is filled from the free tier (74), not defaulted to 0', r.fishingLevel === 74);
  check('the present field keeps the paid tier value (47)', r.gardeningLevel === 47);
  check('the paid endpoint was queried first', calls[0].includes('bobba.me/api'));
  check('the free endpoint was queried as the fallback', calls.some((u) => u.includes('api.bobba.me')));
  check('exactly one fallback call was made (not one per missing field)', calls.length === 2);
}

console.log('\na field the paid tier reports as a genuine 0 is trusted, not overwritten');
{
  // Paid tier explicitly sends fishingLevel: 0 (a real beginner) -- this must
  // NOT be treated as "missing" and swapped for whatever the free tier says,
  // even if the free tier happens to disagree (e.g. stale cache).
  const fetchImpl = async (url) => {
    if (String(url).includes('bobba.me/api')) {
      return bobbaResponse({ fishingLevel: 0, gardeningLevel: 12 });
    }
    return bobbaResponse({ fishingLevel: 99, gardeningLevel: 12 }); // must be ignored
  };
  const r = await fetchBobba('newbie', { bobbaKey: 'fake-paid-key', fetchImpl });
  check('a real 0 from the paid tier is kept as 0', r.fishingLevel === 0);
  check('no free-tier fallback field leaks in when nothing was missing', r.gardeningLevel === 12);
}

console.log('\nboth fields missing from the paid tier both get filled');
{
  const fetchImpl = async (url) => {
    if (String(url).includes('bobba.me/api')) {
      return bobbaResponse({}); // neither field sent at all
    }
    return bobbaResponse({ fishingLevel: 31, gardeningLevel: 8 });
  };
  const r = await fetchBobba('doublemiss', { bobbaKey: 'fake-paid-key', fetchImpl });
  check('fishingLevel filled from the free tier', r.fishingLevel === 31);
  check('gardeningLevel filled from the free tier', r.gardeningLevel === 8);
}

console.log('\nno key configured: the free tier is used directly, no extra fallback call');
{
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return bobbaResponse({ fishingLevel: 5, gardeningLevel: 6 });
  };
  const r = await fetchBobba('freeonly', { bobbaKey: '', fetchImpl });
  check('resolves using the free tier', r.ok === true && r.fishingLevel === 5 && r.gardeningLevel === 6);
  check('only one request was made', calls.length === 1);
  check('it hit the free host', calls[0].includes('api.bobba.me'));
}

console.log('\nthe free-tier fallback itself failing does not throw or crash the merge');
{
  const fetchImpl = async (url) => {
    if (String(url).includes('bobba.me/api')) {
      return bobbaResponse({ gardeningLevel: 20 }); // fishingLevel missing
    }
    return new Response('nope', { status: 500 }); // fallback fails
  };
  let r;
  try {
    r = await fetchBobba('unlucky', { bobbaKey: 'fake-paid-key', fetchImpl });
  } catch {
    r = null;
  }
  check('did not throw', r !== null);
  check('still resolves ok from the paid tier data it did have', r && r.ok === true);
  check('the missing field defaults to 0 rather than staying undefined', r && r.fishingLevel === 0);
  check('the present field is untouched', r && r.gardeningLevel === 20);
}

console.log('\nfetchHabboProfile threads bobbaKey/fetchImpl through to the merge');
{
  // Origins-direct succeeds (has no skills of its own); withSkills=true must
  // still reach fetchBobba's merge logic through the same injected fetchImpl.
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('origins.habbo.com') || u.includes('/users?name=')) {
      return new Response(
        JSON.stringify({ name: 'throney', figureString: 'hr-1-1', motto: 'hi', online: true }),
        { status: 200 },
      );
    }
    if (u.includes('bobba.me/api')) return bobbaResponse({ gardeningLevel: 47 });
    return bobbaResponse({ fishingLevel: 74, gardeningLevel: 47 });
  };
  const r = await fetchHabboProfile('throney', true, { bobbaKey: 'fake-paid-key', fetchImpl });
  check('origins profile resolves', r.ok === true && r.source === 'origins');
  check('the skill merge still fills the paid tier\'s missing field', r.fishingLevel === 74);
  check('and keeps the field the paid tier did send', r.gardeningLevel === 47);
}

console.log(failed ? `\n${failed} habbo skills check(s) FAILED` : '\nall habbo skills merge checks passed');
process.exit(failed ? 1 : 0);
