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
          // Applies to the room's own tiles as well as to flat props: a
          // counter standing on a platform must outrank the step tile in
          // front of it, or the stair riser paints through the countertop.
          if (near(a, b)) raise(a, b.depth);
          continue;
        }
        // RAISED flat PROP strictly in front (on either axis) of a nearby unit
        // it should occlude: raise the SURFACE above the unit — never push the
        // unit down, which would re-break its flat-surface guarantees.
        //
        // `!a.passive` is load-bearing, and restores the invariant this file
        // already states above ("passive entries keep their scalar depth and
        // are never raised themselves") — which the old code contradicted by
        // raising room tiles right here. That contradiction is the whole bug:
        // the rule above raises a prop over the tiles it stands among, this
        // one raised the tile back over the unit, the generic rule raises a
        // unit over the prop it overlaps, and the three chase each other. In
        // the tavern (bar platform z=1, stairs down to z=0) the sweep never
        // reached a fixpoint inside its 6-pass bound, so draw order depended
        // on where it happened to stop and shifted as the player walked: a
        // stair slab tore loose and slid across the screen, the avatar's head
        // sank into the bar, a barrel punched through it. Measured on the live
        // tavern: converged=false at 6 passes before, 3 passes after.
        //
        // Room tiles lose nothing by sitting this out. A raised tile that
        // ought to hide something behind it is still handled: units by the
        // rule above, props by the generic box test below.
        if (a.groundZ != null && !a.passive && b.unit && a.groundZ > (b.z ?? 0)) {
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
