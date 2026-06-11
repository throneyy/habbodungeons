// Components/HabboAvatarSprite.tsx
//
// FIXED (previous patch): cycled the imager `frame` param so walking animates.
// FIXED (this patch):
//  - Preloads all 4 walk frames for the current direction, so the first walk
//    cycle doesn't flicker while each frame's image downloads mid-step.
//  - Passes through an optional `hotel` so non-.com figures render correctly.

import React, { useState, useEffect, useMemo } from 'react';
import {
  getHabboFrameUrl,
  getHabboDirection,
  getWalkFrameUrls,
  DirectionName,
  HABBO_WALK_FRAMES,
} from '../lib/Utils/habbo';

interface HabboAvatarSpriteProps {
  figureString: string;
  direction: DirectionName;
  isWalking: boolean;
  animationSpeedMs?: number;
  /** Rendered height in px (sprite scales to this). */
  heightPx?: number;
  size?: 's' | 'm' | 'l';
  /** Habbo hotel code, e.g. "COM", "ES", "COM.BR". Defaults to COM. */
  hotel?: string;
}

const defaultAnimationSpeedMs = 150;

export const HabboAvatarSprite: React.FC<HabboAvatarSpriteProps> = ({
  figureString,
  direction,
  isWalking,
  animationSpeedMs = defaultAnimationSpeedMs,
  heightPx = 96,
  size = 'l',
  hotel = 'COM',
}) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const habboDirection = getHabboDirection(direction);

  // Preload the walk frames for this figure+direction so cycling them never
  // shows a half-loaded image. The browser cache does the heavy lifting.
  useEffect(() => {
    const urls = getWalkFrameUrls(figureString, habboDirection, hotel);
    const imgs = urls.map((u) => {
      const img = new Image();
      img.src = u;
      return img;
    });
    // Keep references until cleanup so the requests aren't cancelled.
    return () => { imgs.length = 0; };
  }, [figureString, habboDirection, hotel]);

  useEffect(() => {
    if (!isWalking) {
      setFrameIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % HABBO_WALK_FRAMES.length);
    }, animationSpeedMs);
    return () => clearInterval(interval);
  }, [isWalking, animationSpeedMs]);

  const currentFrameUrl = useMemo(() => {
    return getHabboFrameUrl(figureString, {
      direction: habboDirection,
      headDirection: habboDirection,
      action: isWalking ? 'wlk' : 'std',
      gesture: 'std',
      size,
      frame: isWalking ? HABBO_WALK_FRAMES[frameIndex] : 0,
      hotel,
    });
  }, [figureString, habboDirection, isWalking, frameIndex, size, hotel]);

  const spriteStyle: React.CSSProperties = {
    position: 'absolute',
    // Anchor by the feet: centered horizontally, bottom on the tile point.
    transform: 'translate(-50%, -100%)',
    height: `${heightPx}px`,
    width: 'auto',
    imageRendering: 'pixelated',
    zIndex: 100,
    pointerEvents: 'none',
  };

  return (
    <img
      src={currentFrameUrl}
      alt={`${figureString} avatar`}
      style={spriteStyle}
      onError={(e) => {
        e.currentTarget.onerror = null;
        e.currentTarget.src = '/placeholder.svg';
      }}
    />
  );
};
