// Utils/habbo.ts
//
// FIXED:
//  - Corrupted TILE_WIDTH / TILE_HEIGHT constants (the old file had a comment that
//    swallowed a line plus a stray `60;`).
//  - Replaced the dead `lookup.thequackory.com` placeholder imager with the SAME
//    official Habbo imager the rest of your app already uses successfully
//    (DailyLeaderboard, BattlePartyList, LinkHabbo).
//  - Added a real `frame` parameter so walk animation actually cycles.

/**
 * Direction Mapping:
 * Habbo Imager uses 0-7: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW
 */
export type DirectionName =
  | "up" | "down" | "left" | "right"
  | "up-right" | "down-right" | "down-left" | "up-left";

const DirectionMap: Record<DirectionName, number> = {
  up: 0,
  "up-right": 1,
  right: 2,
  "down-right": 3,
  down: 4,
  "down-left": 5,
  left: 6,
  "up-left": 7,
};

export function getHabboDirection(name: DirectionName): number {
  return DirectionMap[name];
}

// Official Habbo imager — same host/params your working components use.
const IMAGING_BASE = "https://www.habbo.com/habbo-imaging/avatarimage";

export interface HabboFrameOptions {
  direction: number;        // 0-7 body facing
  headDirection?: number;   // 0-7 head facing (defaults to body direction)
  action?: string;          // "std" | "wlk" | "wav" | "crr" | "sit" ...
  gesture?: string;         // "std" | "sml" | "agr" ...
  size?: "s" | "m" | "l";   // small / medium / large
  frame?: number;           // animation frame index (wlk cycles 0-3)
}

/**
 * Build a single-frame Habbo avatar URL.
 * `frame` is what makes the walk cycle animate — the old placeholder lacked it.
 */
export function getHabboFrameUrl(
  figureString: string,
  options: HabboFrameOptions,
): string {
  const {
    direction,
    headDirection = direction,
    action = "std",
    gesture = "std",
    size = "l",
    frame = 0,
  } = options;

  // Accept either a bare figure string or one that already includes "figure=".
  const figure = figureString.replace(/^figure=/, "");

  const params = new URLSearchParams({
    figure,
    hotel: "COM",
    size,
    direction: String(direction),
    head_direction: String(headDirection),
    action,
    gesture,
    frame: String(frame),
    service: "official",
    img_format: "png",
  });

  return `${IMAGING_BASE}?${params.toString()}`;
}

// Habbo walk cycle = 4 frames (0..3).
export const HABBO_WALK_FRAMES = [0, 1, 2, 3];

/**
 * Pre-build the 4 walk-frame URLs for a direction. Now each URL really does
 * use a distinct `frame`, so cycling them produces a walking animation.
 */
export function getWalkFrameUrls(figureString: string, direction: number): string[] {
  return HABBO_WALK_FRAMES.map((frame) =>
    getHabboFrameUrl(figureString, { direction, action: "wlk", gesture: "std", frame }),
  );
}

// Isometric conversion constants for the grid (matches lib/isometricUtils.ts).
export const TILE_WIDTH = 32;  // horizontal pixel width of a single tile
export const TILE_HEIGHT = 16; // vertical pixel height of a single tile
