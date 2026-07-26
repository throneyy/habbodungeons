// Habbo furnidata: the game's own furni catalogue, and the ONLY authoritative
// source for the two things our prop extraction never recorded —
//
//   * `height`  = zdim, the item's physical stack height (a float: 1.56, 0.8,
//                 0.0001 for a floor decal). NOT the per-layer `z` in a furni's
//                 visualization XML, which orders sprites WITHIN one item
//                 (js/props.js uses that one, correctly, for seat cutouts).
//   * canstandon / cansiton / canlayon / canputstuffon = walkability per furni
//                 TYPE, which the game currently re-guesses per placement.
//
// Cached at tools/swf/furnidata.json (~9.6MB, git-ignored, regenerable):
// the same cache tools/import-line.js used for `furniline`. Fetch it with
// `node tools/fetch-furnidata.mjs`.
//
// COLOUR VARIANTS: furnidata lists every recolour as its own record with a
// `base*N` classname (4,785 of them). Our props library keeps one directory
// per BASE class (colour set 0 baked), so the join collapses on `*`. Verified
// on the live file: not one base group disagrees with its variants about dims,
// height or flags, so any variant answers for the base.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

export const FURNIDATA_URL = 'https://www.habbo.com/gamedata/furnidata_json/1';
export const CACHE = new URL('../swf/furnidata.json', import.meta.url);

// The fields we mirror into each prop's data.json. `height` is renamed to
// `zdim` on the way out: it sits beside xdim/ydim and "height" already means
// heightmap tile height everywhere else in this codebase.
export const LOGIC_FIELDS = ['canstandon', 'cansiton', 'canlayon', 'canputstuffon'];

export async function fetchFurnidata({ force = false } = {}) {
  if (!force) {
    const cached = await loadFurnidata().catch(() => null);
    if (cached) return { data: cached, fetched: false };
  }
  // habbo.com 307s /1 to a build-hashed path; fetch follows redirects.
  const res = await fetch(FURNIDATA_URL, { headers: { 'user-agent': 'habbo-dungeons-asset-pipeline' } });
  if (!res.ok) throw new Error(`furnidata fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  const data = JSON.parse(text); // parse before writing: never cache a 404 page
  await mkdir(new URL('.', CACHE), { recursive: true });
  await writeFile(CACHE, text);
  return { data, fetched: true };
}

export async function loadFurnidata() {
  return JSON.parse(await readFile(CACHE, 'utf8'));
}

// base classname -> { record, variants } across BOTH room and wall item types
// (a floor prop is a roomitemtype; wall items are indexed too so a wrongly
// filed prop id is reported as "wall item", not as "missing").
export function indexFurnidata(data) {
  const index = new Map();
  const add = (rec, kind) => {
    const base = rec.classname.split('*')[0];
    const entry = index.get(base) || { base, kind, record: rec, variants: 0 };
    entry.variants++;
    index.set(base, entry);
  };
  for (const rec of data?.roomitemtypes?.furnitype || []) add(rec, 'room');
  for (const rec of data?.wallitemtypes?.furnitype || []) add(rec, 'wall');
  return index;
}

// Every field of a furnidata record we care about, normalised.
export function logicOf(rec) {
  const out = { zdim: typeof rec.height === 'number' ? rec.height : null };
  for (const f of LOGIC_FIELDS) out[f] = rec[f] === true;
  return out;
}

// Variants of one base disagreeing about dims/height/flags — the assumption
// the collapse rests on, re-checked every run instead of trusted.
export function variantConflicts(data) {
  const groups = new Map();
  const key = (f) => [f.xdim, f.ydim, f.height, ...LOGIC_FIELDS.map((k) => f[k] === true)].join('|');
  for (const rec of data?.roomitemtypes?.furnitype || []) {
    const base = rec.classname.split('*')[0];
    const seen = groups.get(base) || new Map();
    seen.set(key(rec), rec.classname);
    groups.set(base, seen);
  }
  return [...groups].filter(([, seen]) => seen.size > 1).map(([base, seen]) => ({ base, shapes: [...seen] }));
}
