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
  targetX?: number;
  targetY?: number;
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
  damage,
  targetX,
  targetY
}: EntitySpriteProps) => {
  const [showDamage, setShowDamage] = useState(false);
  const [animatePosition, setAnimatePosition] = useState({ x, y });
  const [avatarAction, setAvatarAction] = useState<'std' | 'wlk' | 'crr'>('std');

  useEffect(() => {
    if (damage !== undefined && damage > 0) {
      setShowDamage(true);
      const timer = setTimeout(() => setShowDamage(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [damage]);

  // Attack animation for players
  useEffect(() => {
    if (type === 'player' && isAttacking && targetX !== undefined && targetY !== undefined) {
      // Phase 1: Move toward target
      setAvatarAction('wlk');
      const moveX = x + (targetX - x) * 0.4;
      const moveY = y + (targetY - y) * 0.4;
      setAnimatePosition({ x: moveX, y: moveY });
      
      // Phase 2: Attack pose at impact
      const attackTimer = setTimeout(() => {
        setAvatarAction('crr');
      }, 300);
      
      // Phase 3: Return to original position
      const returnTimer = setTimeout(() => {
        setAnimatePosition({ x, y });
        setAvatarAction('std');
      }, 700);
      
      return () => {
        clearTimeout(attackTimer);
        clearTimeout(returnTimer);
      };
    } else {
      setAnimatePosition({ x, y });
      setAvatarAction('std');
    }
  }, [isAttacking, type, x, y, targetX, targetY]);

  // Convert grid coordinates to isometric screen position
  // Scale up for better visibility
  const SCALE = 2.5; // Make entities much larger
  const isoX = (animatePosition.x - animatePosition.y) * (TILE_WIDTH / 2) * SCALE;
  const isoY = (animatePosition.x + animatePosition.y) * (TILE_HEIGHT / 2) * SCALE;
  
  // Calculate z-index based on depth (entities further back have lower z-index)
  const zIndex = 100 + Math.floor(animatePosition.x + animatePosition.y);

  // Generate player avatar URL with action and direction
  // Direction 6 = facing toward enemies at optimal angle, head_direction 5 for better facing
  const imageUrl = type === 'player' 
    ? (habboAvatar 
        ? habboAvatar
            .replace(/action=[^&]*/, `action=${avatarAction}`)
            .replace(/direction=\d/, `direction=6`)
            .replace(/head_direction=\d/, `head_direction=5`)
        : '/placeholder.svg'
      )
    : (sprite || '/placeholder.svg');

  // Scale sprite size for prominence
  const spriteSize = type === 'player' ? 120 : 160;
  
  // Flip enemies to face right toward players
  const shouldFlipEnemy = type === 'enemy';

  return (
    <div
      style={{
        position: 'absolute',
        left: `calc(50% + ${isoX}px)`,
        top: `calc(50% + ${isoY}px)`,
        transform: `translate(-50%, -100%) ${isAttacking ? 'scale(1.15)' : ''} ${type === 'enemy' && isAttacking ? 'translateX(-5px)' : ''}`,
        zIndex,
        transition: 'left 0.3s ease-out, top 0.3s ease-out, transform 0.2s ease-out',
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
            transform: shouldFlipEnemy ? 'scaleX(-1)' : 'none',
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
