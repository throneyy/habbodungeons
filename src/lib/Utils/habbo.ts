// Utils/habbo.ts

/**
 * Direction Mapping:
 * Habbo Imager uses 0-7: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW
 */
export type DirectionName = "up" | "down" | "left" | "right" | "up-right" | "down-right" | "down-left" | "up-left";

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

export function getHabboFrameUrl(
  figureString: string,
  options: { direction: number; action?: string; size?: "s" | "m" | "b"; gesture?: string },
): string {
  const { direction, action = "std", size = "s", gesture = "std" } = options;
  const hotel = "COM"; // Assuming COM for origins
  const service = "official"; // or 'habboden'

  // *** PLUG IN YOUR REAL IMAGER URL HERE ***
  // Based on your pattern: https://lookup.thequackory.com/habbo-imaging/{username}?hotel={hotel}&size={size}&action={action}&gesture={gesture}&direction={direction}&head_direction={head_direction}&service={service}
  // The figureString usually replaces the {username} but for the official endpoint the figure is a parameter.

  // USING THE PROVIDED LOOKUP URL PATTERN FOR DEMO:
  // NOTE: This assumes the lookup service can take a figureString in place of username, which may not be true for all imager services.
  const figurePart = figureString.includes("figure=") ? figureString : `?figure=${figureString}`;

  return `https://lookup.thequackory.com/habbo-imaging/avatar.png${figurePart}&hotel=${hotel}&size=${size}&action=${action}&gesture=${gesture}&direction=${direction}&head_direction=${direction}&service=${service}`;
  // For the actual official imager you'd construct it differently, passing the figureString as part of a query param or path segment.
  // For now, this placeholder will demonstrate the logic.
}

// Habbo walk animation frames for size 'b'
// A simple walk cycle typically involves 4 frames/states
export const HABBO_WALK_FRAMES = [0, 1, 2, 3];

export function getWalkFrameUrls(figureString: string, direction: number): string[] {
  return HABBO_WALK_FRAMES.map(
    (frame) => getHabboFrameUrl(figureString, { direction, action: "wlk", gesture: "std" }),
    // Note: Real Habbo Imager animations use a `frame` or `frame_index` parameter to cycle, which is not in your provided lookup URL pattern.
    // For this demo, we'll simulate the animation by simply changing direction and relying on the imager's default 'wlk' action.
    // If your imager supports frame index, you'd modify getHabboFrameUrl to accept and use a frameIndex parameter.
  );
}

// Isometric conversion constants for the grid
export const TILE_WIDTH = 32; // Horizontal pixel width of a single tile
export const TILE_HEIGHT = 16; // Vertical pixel height of a single tile

/**
 * Calculate Habbo direction (0-7) from movement vector
 * 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW
 */
export function getDirectionFromVector(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 4; // Default south
  
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  
  // Map angle to 8 directions
  if (angle >= -22.5 && angle < 22.5) return 2;    // East (right)
  if (angle >= 22.5 && angle < 67.5) return 3;     // Southeast
  if (angle >= 67.5 && angle < 112.5) return 4;    // South (down)
  if (angle >= 112.5 && angle < 157.5) return 5;   // Southwest
  if (angle >= 157.5 || angle < -157.5) return 6;  // West (left)
  if (angle >= -157.5 && angle < -112.5) return 7; // Northwest
  if (angle >= -112.5 && angle < -67.5) return 0;  // North (up)
  if (angle >= -67.5 && angle < -22.5) return 1;   // Northeast
  
  return 4; // Default south
}
