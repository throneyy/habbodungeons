// Downloads Habbo's furnidata catalogue to the git-ignored cache the furni
// pipeline reads (tools/swf/furnidata.json, ~9.6MB).
//
//   node tools/fetch-furnidata.mjs            # only if the cache is missing
//   node tools/fetch-furnidata.mjs --force    # re-download over the cache
//
// Then `node tools/gen-furni-logic.mjs` mirrors zdim + walkability flags into
// public/assets/props/*/data.json.

import { fetchFurnidata, indexFurnidata, variantConflicts, CACHE } from './lib/furnidata.mjs';

const force = process.argv.includes('--force');
const { data, fetched } = await fetchFurnidata({ force });
const index = indexFurnidata(data);
const room = data?.roomitemtypes?.furnitype?.length || 0;
const wall = data?.wallitemtypes?.furnitype?.length || 0;
const conflicts = variantConflicts(data);

console.log(`${fetched ? 'downloaded' : 'cached'}  ${CACHE.pathname.replace(/^\//, '')}`);
console.log(`  ${room} room items + ${wall} wall items -> ${index.size} base classes`);
console.log(`  colour-variant conflicts: ${conflicts.length}`);
for (const c of conflicts.slice(0, 20)) console.log(`    ${c.base}: ${c.shapes.join(' vs ')}`);
if (!fetched) console.log('  (pass --force to re-download)');
