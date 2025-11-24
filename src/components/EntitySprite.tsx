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
  const isoX = (x - y) * (TILE_WIDTH / 2);
  const isoY = (x + y) * (TILE_HEIGHT / 2);
  
  // Calculate z-index based on depth (entities further back have lower z-index)
  const zIndex = x + y;

  const imageUrl = type === 'player' 
    ? (habboAvatar || '/placeholder.svg')
    : (sprite ? `/src/assets/${sprite}` : '/placeholder.svg');

  return (
    <div
      style={{
        position: 'absolute',
        left: `calc(50% + ${isoX}px)`,
        top: `calc(50% + ${isoY}px)`,
        transform: 'translate(-50%, -100%)',
        zIndex,
        transition: isAttacking 
          ? 'transform 0.2s ease-in-out' 
          : 'left 0.3s ease-out, top 0.3s ease-out',
      }}
      className={`${isDead ? 'opacity-30 grayscale' : 'opacity-100'} ${isAttacking ? 'scale-110' : ''}`}
    >
      {/* Entity sprite */}
      <img
        src={imageUrl}
        alt={username || name || 'Entity'}
        className="pixelated select-none pointer-events-none"
        style={{
          imageRendering: 'pixelated',
          width: type === 'player' ? '64px' : '80px',
          height: 'auto',
          filter: isAttacking ? 'brightness(1.3)' : 'none',
        }}
      />
      
      {/* Username label for players */}
      {type === 'player' && username && (
        <div 
          className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold text-white bg-black/70 px-2 py-1 rounded whitespace-nowrap"
          style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}
        >
          {username}
        </div>
      )}

      {/* Floating damage number */}
      {showDamage && damage && damage > 0 && (
        <div 
          className="absolute -top-8 left-1/2 -translate-x-1/2 text-2xl font-bold text-red-500 animate-fade-out pointer-events-none"
          style={{ 
            textShadow: '2px 2px 4px rgba(0,0,0,0.9), -1px -1px 2px rgba(255,255,255,0.5)',
            animation: 'floatUp 1s ease-out'
          }}
        >
          -{damage}
        </div>
      )}
    </div>
  );
};
