// Draw-order relaxation for the iso renderer.
//
// The renderer painter-sorts by scalar depth (x+y, multi-tile furni by their
// deepest tile). That single number can't order a long item against things
// standing beside its NEAR end: a unit at (4,4) next to a table spanning
// (3,4)-(3,6) has depth 8 vs the table's 9, so the table would wrongly paint
// over it — the "pattern of tiles that clip" (and the same tiles clip while
// walking, because a walking unit's fractional depth passes through the same
// band).
//
// Fix: treat every prop/unit as an axis-aligned tile box and relax depths
// pairwise — in iso projection, box A provably occludes nothing of box B
// when A.x0 > B.x1 or A.y0 > B.y1 (A is strictly on B's front side), so A
// must draw after B. Units overlapping a footprint (sitting on a sofa,
// walking across a walkable item) always draw above it.
//
// `front: true` marks dominant furniture (admin-set, persisted): a base bias
// stacks it in front of everything in its own depth band, so overlapping
// decor can be layered deliberately instead of fighting the tie-breaker.

const EPS = 0.02; // "right after B": far below the next relaxation target
const FRONT_BIAS = 0.6; // dominant-furni base bias, < 1 depth band

// entries: [{ depth, x0, y0, x1, y1, unit?, z?, front?, groundZ?, passive? }]
// — mutates .depth.
//
// `groundZ` marks a FLAT SURFACE (floor tile, rug/floor-covering prop) whose
// top sits at that height: it only occludes a unit when the surface is
// actually ABOVE the unit's feet (`z` on unit entries). A flat surface at or
// below the feet never overdraws the unit — the fix for trailing floor tiles
// and rugs clipping walkers' boots mid-step. Raised surfaces (groundZ > feet
// z) keep occluding — a final clamp re-asserts that even against other
// raises. `passive` entries (floor tiles) keep their scalar depth and are
// never raised themselves.
export function relaxDrawDepths(entries) {
  for (const e of entries) e.depth += e.front ? FRONT_BIAS : 0;
  // A surface/unit pair only interacts when their boxes (grown by the ~1
  // tile a sprite spills over) can actually overlap on screen — a far-away
  // tile can neither clip nor occlude, and dragging depths across the room
  // would scramble unrelated orderings.
  const near = (a, b) => a.x0 <= b.x1 + 1 && b.x0 <= a.x1 + 1 && a.y0 <= b.y1 + 1 && b.y0 <= a.y1 + 1;

  // Anything that STANDS in the room rather than lying flat on it: units, and
  // solid furni. Both have a base height (`z`) and both must win against a
  // flat surface at or below that base — a rug never covers a wardrobe, and a
  // grass patch never covers the tree planted on it. This used to read
  // `e.unit`, so only avatars were protected and the square's money tree was
  // painted over by the grass decal in front of it.
  //
  // A prop earns that protection only against flat-surface PROPS (rugs, grass,
  // floor decals), never against the room's own passive tiles — see the
  // convergence note on the first rule below.
  const stands = (e) => e.groundZ == null && !e.passive;

  // Relaxation sweeps until stable. A raise means "draw right after B" —
  // uncapped, because a long item's scalar depth can sit several bands above
  // a unit standing at its near end. Pairs can't cycle (the front test is
  // asymmetric), and the two surface/unit rules are always jointly
  // satisfiable by interleaving (unit-on-top > raised-step > unit-behind),
  // so sweeping to a fixpoint terminates; 6 passes is a safety bound.
  const sweep = () => {
    let changed = false;
    const raise = (e, target) => {
      if (e.depth <= target) {
        e.depth = target + EPS;
        changed = true;
      }
    };
    for (const a of entries) {
      for (const b of entries) {
        if (a === b) continue;
        // flat surface at or below a nearby unit's feet: the unit draws
        // after it (never let ground art clip the walker)
        if (stands(a) && b.groundZ != null && b.groundZ <= (a.z ?? 0)) {
          // Units interact with EVERY flat surface, the room's own tiles
          // included — that is the original rule and it is what keeps floor
          // art off a walker's boots. Props interact only with flat-surface
          // props. Letting furni fight the room's tiles as well adds a pair
          // for every prop x every tile, and in a room with a raised platform
          // (the tavern's bar, z=1, with stairs down to z=0) the two surface
          // rules then chase each other: this rule raises the prop above the
          // low tiles, the next raises the raised STAIR tile back above the
          // prop, and the sweep never reaches a fixpoint inside its 6-pass
          // bound. Draw order then depends on where the sweep happened to
          // stop, so it changed as the player walked and shook a detached
          // stair slab across the screen. Measured on the live tavern:
          // converged=false at 6 passes, vs 3 passes with this guard.
          if ((a.unit || !b.passive) && near(a, b)) raise(a, b.depth);
          continue;
        }
        // RAISED surface strictly in front (on either axis) of a nearby
        // unit it should occlude: raise the SURFACE above the unit — never
        // push the unit down, which would re-break its flat-surface
        // guarantees. Applies to passive tiles too (a ledge step is exactly
        // such a tile); a unit standing ON the step is re-raised above it
        // by the flat rule on the next sweep, so the fixpoint interleaves.
        // Kept to UNITS deliberately: a raised tile must occlude a walker
        // standing below and behind it, but raising room tiles above PROPS is
        // what tore the stairs loose (see above). A prop that a raised surface
        // should hide is already ordered by the generic box test below.
        if (a.groundZ != null && b.unit && a.groundZ > (b.z ?? 0)) {
          if (near(a, b) && (a.x0 > b.x1 || a.y0 > b.y1)) raise(a, b.depth);
          continue;
        }
        // surfaces take part ONLY through the two rules above — a flat
        // decal/tile must never climb the generic box ordering (it would
        // drag depths up and leak over walkers standing past it)
        if (a.groundZ != null || a.passive) continue;
        const aFront = a.x0 > b.x1 || a.y0 > b.y1; // a strictly on b's front side
        const bFront = b.x0 > a.x1 || b.y0 > a.y1;
        if (aFront && !bFront) {
          raise(a, b.depth);
        } else if (!aFront && !bFront && a.unit && !b.unit) {
          // unit within the footprint (seated / walking across): draw above
          raise(a, b.depth);
        } else if (!aFront && !bFront && a.lift && !b.unit && !b.lift) {
          // lifted tabletop item (a platter/mug) resting ON another prop
          // (the table): draw above whatever it sits on, whichever of the
          // table's tiles it occupies
          raise(a, b.depth);
        }
      }
    }
    return changed;
  };
  for (let pass = 0; pass < 6; pass++) if (!sweep()) break;
}
