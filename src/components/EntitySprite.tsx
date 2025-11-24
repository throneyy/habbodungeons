import { useEffect, useState } from 'react';

interface EntitySpriteProps {
  id: string;
  type: 'player' | 'enemy';
  x: number;
  y: number;
  sprite?: string;
  habboAvatar?: string | null;
  username?: string;
  name?: string;
  isDead?: boolean;
  isAttacking?: boolean;
  damage?: number;
}

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;

export const EntitySprite = ({
  id,
  type,
  x,
  y,
  sprite,
  habboAvatar,
  username,
  name,
  isDead,
  isAttacking,
  damage
}: EntitySpriteProps) => {
  const [showDamage, setShowDamage] = useState(false);

  useEffect(() => {
    if (damage !== undefined && damage > 0) {
      setShowDamage(true);
      const timer = setTimeout(() => setShowDamage(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [damage]);

  // Convert grid coordinates to isometric screen position
  // Scale up for better visibility
  const SCALE = 2.5; // Make entities much larger
  const isoX = (x - y) * (TILE_WIDTH / 2) * SCALE;
  const isoY = (x + y) * (TILE_HEIGHT / 2) * SCALE;
  
  // Calculate z-index based on depth (entities further back have lower z-index)
  const zIndex = 100 + x + y;

  // Fix sprite path - it's already resolved from ENEMY_SPRITES mapping in Battle.tsx
  const imageUrl = type === 'player' 
    ? (habboAvatar || '/placeholder.svg')
    : (sprite || '/placeholder.svg');

  // Scale sprite size for prominence
  const spriteSize = type === 'player' ? 120 : 160;

  return (
    <div
      style={{
        position: 'absolute',
        left: `calc(50% + ${isoX}px)`,
        top: `calc(50% + ${isoY}px)`,
        transform: isAttacking ? 'translate(-50%, -100%) scale(1.15)' : 'translate(-50%, -100%)',
        zIndex,
        transition: 'all 0.3s ease-out',
        filter: isDead ? 'grayscale(100%) brightness(0.5)' : 'none',
      }}
      className="drop-shadow-2xl"
    >
      {/* Entity sprite with glow effect */}
      <div className="relative">
        <img
          src={imageUrl}
          alt={username || name || 'Entity'}
          className="pixelated select-none pointer-events-none"
          style={{
            imageRendering: 'pixelated',
            width: `${spriteSize}px`,
            height: 'auto',
            filter: isAttacking ? 'brightness(1.5) drop-shadow(0 0 20px rgba(255,255,255,0.8))' : 'brightness(1.1)',
          }}
        />
        
        {/* Attack flash effect */}
        {isAttacking && (
          <div 
            className="absolute inset-0 bg-white/30 animate-pulse rounded-lg"
            style={{ mixBlendMode: 'overlay' }}
          />
        )}
      </div>
      
      {/* Username label for players */}
      {type === 'player' && username && (
        <div 
          className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-sm font-bold text-white bg-gradient-to-r from-primary/90 to-accent/90 px-3 py-1.5 rounded-full border-2 border-white/30 whitespace-nowrap shadow-lg"
          style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.9)' }}
        >
          {username}
        </div>
      )}

      {/* Enemy name label */}
      {type === 'enemy' && name && !isDead && (
        <div 
          className="absolute -top-12 left-1/2 -translate-x-1/2 text-sm font-bold text-red-400 bg-black/80 px-3 py-1.5 rounded border-2 border-red-500/50 whitespace-nowrap shadow-lg"
          style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.9)' }}
        >
          {name}
        </div>
      )}

      {/* Floating damage number */}
      {showDamage && damage && damage > 0 && (
        <div 
          className="absolute -top-16 left-1/2 -translate-x-1/2 text-4xl font-bold text-red-500 pointer-events-none"
          style={{ 
            textShadow: '3px 3px 6px rgba(0,0,0,1), -2px -2px 4px rgba(255,255,255,0.8)',
            animation: 'floatUp 1s ease-out',
            WebkitTextStroke: '2px black',
          }}
        >
          -{damage}
        </div>
      )}
    </div>
  );
};
