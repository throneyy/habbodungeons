// Components/HabboAvatarSprite.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { getHabboFrameUrl, getHabboDirection, DirectionName, HABBO_WALK_FRAMES, getWalkFrameUrls } from '../lib/Utils/habbo';

interface HabboAvatarSpriteProps {
  figureString: string;
  direction: DirectionName;
  isWalking: boolean;
  animationSpeedMs?: number;
}

const defaultAnimationSpeedMs = 150;

export const HabboAvatarSprite: React.FC<HabboAvatarSpriteProps> = ({
  figureString,
  direction,
  isWalking,
  animationSpeedMs = defaultAnimationSpeedMs,
}) => {
  const [frameIndex, setFrameIndex] = useState(0);
  const habboDirection = getHabboDirection(direction);

  useEffect(() => {
    if (!isWalking) {
      setFrameIndex(0); // Reset to idle frame when not walking
      return;
    }

    // Cycle through walk frames
    const interval = setInterval(() => {
      setFrameIndex(prevIndex => (prevIndex + 1) % HABBO_WALK_FRAMES.length);
    }, animationSpeedMs);

    return () => clearInterval(interval);
  }, [isWalking, animationSpeedMs]);

  const currentFrameUrl = useMemo(() => {
    const action = isWalking ? 'wlk' : 'std';
    // NOTE: This does NOT cycle frames based on the imager URL because the provided pattern
    // lacks a frame index. It only changes action and direction.
    return getHabboFrameUrl(figureString, { direction: habboDirection, action, gesture: 'std' });
  }, [figureString, habboDirection, isWalking, frameIndex]); // frameIndex is here for future proofing

  // Styles to anchor the sprite by its feet and keep it absolute
  const spriteStyle: React.CSSProperties = {
    position: 'absolute',
    // Center the sprite on the tile position (x-50% for width, y-100% for height/feet)
    transform: 'translate(-50%, -100%)',
    imageRendering: 'pixelated', // Keep it sharp and retro
    zIndex: 100, // Ensure sprites are above the grid
    transition: 'transform 0.3s ease-out, left 0.3s ease-out, top 0.3s ease-out', // Smooth movement between tiles
    pointerEvents: 'none', // Don't block tile clicks
  };

  return (
    <img
      src={currentFrameUrl}
      alt={`${figureString} avatar`}
      style={spriteStyle}
    />
  );
};
