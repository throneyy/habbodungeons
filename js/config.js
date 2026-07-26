// Core Habbo Origins metrics, verified against the classic client and Sulake's
// engineering blog ("On Walking and Stacking", 2013):
//   - Tiles are 64x32 px, 2:1 isometric. "Small" rendering (large public rooms /
//     zoomed view) is exactly half scale: 32x16 tiles + small avatars.
//   - The room ticks every 500ms and an avatar moves exactly one tile per tick,
//     diagonal steps included (no 1.4x cost — that's why Habbo walks look snappy
//     on diagonals).
//   - The walk animation is a 4-frame cycle, one full cycle per tile.
//   - Max climb per step is 1.25 height units; drops are allowed up to 4 units.

import { isSupabase, functionsBase } from './backend.js';

export const TILE_W = 64;
export const TILE_H = 32;
export const Z_STEP = 32; // screen pixels per height unit at zoom 1
export const TILE_THICKNESS = 8; // visible slab under each tile top

export const WALK_MS = 500; // one tile per Habbo server tick
export const WALK_FRAMES = 4;
export const WALK_FRAME_MS = WALK_MS / WALK_FRAMES; // 125ms per animation frame

export const MAX_CLIMB = 1.25;
export const MAX_DROP = 4;

// Official Habbo avatar renderer — the same endpoint the fan sites use.
// Origins figureStrings (from origins.habbo.com/api/public/users) render here.
// habbo-imaging has no CORS headers, so drawing its PNGs cross-origin taints
// the canvas and breaks export. Local Node dev proxies via server.js
// (/api/imaging); the static Supabase deploy proxies via the habbo-imaging edge
// function. Resolved once at import from the backend mode (js/backend.js).
export const IMAGING_URL = isSupabase() ? `${functionsBase()}/habbo-imaging` : '/api/imaging';

// Proxied by server.js -> https://origins.habbo.com/api/public/ (local dev). In
// Supabase mode the profile lookup goes through the fetch-habbo-profile edge
// function instead — see js/habboApi.js / js/humanInfostand.js.
export const ORIGINS_API = '/api/origins';

// THE default Habbo — the look every account starts as in the hotel: short
// black hair (hr-100-61), standard head (hd-180-1), mustard sweater
// (ch-210-66), blue jeans (lg-270-82), plain shoes (sh-300-62). Used wherever
// a figure is missing (before the player links a character, a remote member
// who arrived without one, the offline sprite fallback) so an unknown avatar
// reads as "a Habbo" and never as an invented mascot.
//
// SHOES ARE sh-300, NOT the sh-290 that every retro dev tool (Minerva,
// Avatara, the old CMS configs) ships in its default-look sample. On today's
// habbo-imaging, sh-290's STANDING sprite is a studded boot: its bottom pixel
// row renders as three separated nubs (`##..##..##`) under the sole — soccer
// cleats. Its walking and sitting sprites are the plain-soled shoe (`####`),
// so the cleats only show while an avatar stands still, which is most of the
// time. sh-300 is the same plain shoe silhouette with a solid sole in every
// pose and direction. tools/bake-default-avatar.mjs asserts this (see its
// stud check) so a future figure edit can't quietly put the cleats back.
//
// This exact string is baked into public/assets/avatar/default/ by
// tools/bake-default-avatar.mjs — re-run the baker if it ever changes.
export const DEFAULT_FIGURE = 'hr-100-61.hd-180-1.ch-210-66.lg-270-82.sh-300-62';

// habbo-imaging PNGs have a little transparent padding below the feet;
// this nudges the sprite so the feet sit on the tile centre. Tuned visually.
export const AVATAR_FOOT_PAD = { m: 6, s: 3 };

// Sittable furni (the client's "can_sit_on_top" behaviour), id -> sit height
// in tile-height units. v31 client behaviour: chairs are walkable; walking
// onto a seat tile snaps the avatar to the chair's direction (non-diagonal
// dirs only) and holds the habbo-imaging action=sit pose lifted by this
// height.
//
// Heights calibrated per seat with a screenshot sweep (0.15–0.55 in steps,
// avatar seated on the real art, picked where the rear meets the seat
// surface). Havana's items_definitions (Quackster/Havana tools/havana.sql)
// only carries the gothic line of our set (top_height 1.2, its tallest chair
// class) — that relative ordering is preserved: gothic sits above the other
// stools/chairs, grand thrones highest.
export const SEATS = {
  vikings_stool: 0.2, // calibrated: low round cushion
  vikings_chair_r: 0.25, // calibrated: seat pad just above stool height
  vikings_chair_g: 0.25, // calibrated: same art family as _r
  vikings_throne: 0.35, // calibrated: raised seat platform between the armrests
  greek_c15_bench: 0.1, // calibrated: thin stone slab, lowest of the set
  greek_c19_chair: 0.2, // calibrated: low wooden seat, red cushion
  gothic_stool: 0.3, // calibrated: tall gothic cushion (Havana 1.2 = tallest chair class)
  gothic_chair: 0.3, // calibrated: same cushion height as the gothic stool
  gothic_sofa: 0.3, // calibrated: same cushion height across the gothic line
  hween_r17_lichthrone: 0.3, // calibrated: squat round throne, cushion at chair height
  hween_ltd19_skullthrone: 0.35, // calibrated: cushion sits atop the skull pile base
  easter_ltd19_flowerthrone: 0.25, // calibrated: low flowerbed seat
  nft_h25_collbench: 0.1, // calibrated: thin upholstered bench slab
  nft_h25_collsofa: 0.2, // calibrated: bench slab + soft cushion
};

// Habbo usernames allowed to use admin tooling (case-insensitive): the Free
// Roam room editor plus the :admin / :furni / :bag chat commands. These must
// be LINKED HABBO USERNAMES (what Identity.verify stores), never anyone's
// real name — the game only ever addresses players by their Habbo name.
export const ADMIN_NAMES = ['throney'];
