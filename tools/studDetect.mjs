// Studded-sole (soccer-cleat) detector for baked avatar frames.
//
// Lives in its own module so the baker (tools/bake-default-avatar.mjs) and the
// regression test (tests/defaultAvatarShoes.test.js) run the SAME code — a
// detector that silently drifts from the thing it guards is worse than none.
//
// Why it exists: habbo-imaging renders sh-290 (the shoe id every retro tool's
// default-look sample uses — Minerva, Avatara, the old CMS configs) as a CLEAT
// when the avatar STANDS. The bottom pixel row of the standing frame comes back
// as separated nubs under the sole:
//
//   sh-290 std  ......##..##..##......   <- studs
//   sh-290 wlk  ......########........   <- plain sole
//   sh-300 std  ....##############....   <- plain sole
//
// The walk and sit sprites of the same shoe are plain-soled, so the cleats show
// exactly while an avatar idles — which is nearly always — and disappear the
// moment it moves. That is a maddening thing to spot by eye, hence a pixel
// assertion in the bake step.

// Opaque-pixel run lengths along the bottom-most non-empty row of a frame.
// Alpha > 128 counts as ink: imaging antialiases shoe edges, and a half-lit
// edge pixel is not a sole.
export function bottomRowRuns(png) {
  let bottom = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > 128) {
        bottom = y;
        break;
      }
    }
  }
  if (bottom < 0) return [];
  const runs = [];
  let run = 0;
  for (let x = 0; x < png.width; x++) {
    if (png.data[(bottom * png.width + x) * 4 + 3] > 128) run++;
    else if (run) {
      runs.push(run);
      run = 0;
    }
  }
  if (run) runs.push(run);
  return runs;
}

// A plain shoe's bottom row is at most two runs — one per foot — and each is
// wide (the whole sole). Three or more SHORT runs is a studded sole.
//
// Both halves of that test matter: a plain two-shoe frame can still be three
// runs if a heel edge clips, so the runs must also be narrow; and a single
// narrow run is just a foot seen edge-on. Tuned against size-'m' frames, where
// studs measure 1-2px and soles 8px+.
export const MAX_STUD_WIDTH = 6;

export function isStudded(png) {
  const runs = bottomRowRuns(png);
  return runs.length >= 3 && runs.every((r) => r <= MAX_STUD_WIDTH);
}
