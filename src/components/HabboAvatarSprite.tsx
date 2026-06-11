// Components/HabboAvatarSprite.tsx
//
// FIXED: this component used to compute a `frameIndex` but never used it, so the
// walk animation never moved. It now cycles the imager `frame` parameter, so a
// walking avatar actually animates. Anchored by the feet for grid placement.

import React, { useState, useEffect, useMemo } from 'react';
import {
  getHabboFrameUrl,
  getHabboDirection,
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
}

const defaultAnimationSpeedMs = 150;

export const HabboAvatarSprite: React.FC<HabboAvatarSpriteProps> = ({
  figureString,
  direction,
  isWalking,
  animationSpeedMs = defaultAnimationSpeedMs,
  heightPx = 96,
  size = 'l',
}) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const habboDirection = getHabboDirection(direction);

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
    });
  }, [figureString, habboDirection, isWalking, frameIndex, size]);

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
