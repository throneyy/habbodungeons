import { useEffect, useState } from 'react';
import { Nameplate } from './Nameplate';
import { EnemySprite } from './EnemySprite';
import explosionHit from '@/assets/explosion-hit.gif';
import hitBump from '@/assets/hit-bump.gif';

interface EntitySpriteProps {
  id: string;
  type: 'player' | 'enemy';
  x: number;
  y: number;
  sprite?: string;
  spriteFilename?: string; // Original backend filename for direction lookup
  habboAvatar?: string | null;
  username?: string;
  name?: string;
  isDead?: boolean;
  slotIndex?: number;
  isAttacking?: boolean;
  damage?: number;
  targetX?: number;
  targetY?: number;
}

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;

// Arena margin system to prevent entities from being cut off at edges
// These values ensure all characters stay within the visible floor area
const ARENA_MARGIN = {
  bottom: 120,  // Large bottom margin to keep players fully visible
  top: 80,      // Top margin prevents enemies from touching top border
  left: 100,    // Left margin for enemy positioning
  right: 100    // Right margin for player positioning
};

export const EntitySprite = ({
  id,
  type,
  x,
  y,
  sprite,
  spriteFilename, // Use this for direction lookup
  habboAvatar,
  username,
  name,
  isDead,
  slotIndex = 0,
  isAttacking,
  damage,
  targetX,
  targetY
}: EntitySpriteProps) => {
  const [showDamage, setShowDamage] = useState(false);
  const [animatePosition, setAnimatePosition] = useState({ x, y });
  const [avatarAction, setAvatarAction] = useState<'std' | 'wlk' | 'crr'>('std');
  const [showMovementEffect, setShowMovementEffect] = useState(false);

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
      setShowMovementEffect(true);
      const moveX = x + (targetX - x) * 0.4;
      const moveY = y + (targetY - y) * 0.4;
      setAnimatePosition({ x: moveX, y: moveY });
      
      // Phase 2: Attack pose at impact
      const attackTimer = setTimeout(() => {
        setAvatarAction('crr');
        setShowMovementEffect(false);
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
      setShowMovementEffect(false);
    }
  }, [isAttacking, type, x, y, targetX, targetY]);

  // Convert grid coordinates to isometric screen position with proper margins
  const SCALE = 2.5; // Make entities much larger
  const rawIsoX = (animatePosition.x - animatePosition.y) * (TILE_WIDTH / 2) * SCALE;
  const rawIsoY = (animatePosition.x + animatePosition.y) * (TILE_HEIGHT / 2) * SCALE;
  
  // Apply margins to keep entities within safe arena bounds
  let isoX = rawIsoX + ARENA_MARGIN.left;
  let isoY = rawIsoY + ARENA_MARGIN.top;
  
  // Clamp positions to ensure they never exceed arena bounds
  // Assume arena dimensions based on typical viewport
  const ARENA_WIDTH = 1600;
  const ARENA_HEIGHT = 800;
  isoX = Math.max(ARENA_MARGIN.left, Math.min(isoX, ARENA_WIDTH - ARENA_MARGIN.right));
  isoY = Math.max(ARENA_MARGIN.top, Math.min(isoY, ARENA_HEIGHT - ARENA_MARGIN.bottom));
  
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

  // Scale sprite size for prominence - larger for better visibility at full resolution
  const spriteSize = type === 'player' ? 120 : 200;

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
      {/* Movement effect under feet */}
      {showMovementEffect && (
        <img
          src={hitBump}
          alt=""
          className="absolute pixelated select-none pointer-events-none"
          style={{
            bottom: '-20px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '100px',
            height: 'auto',
            imageRendering: 'pixelated',
            zIndex: 1,
            opacity: 0.9,
          }}
        />
      )}

      {/* Entity sprite with glow effect */}
      <div className="relative">
        {type === 'player' ? (
          <img
            src={imageUrl}
            alt={username || 'Player'}
            className="pixelated select-none pointer-events-none"
            style={{
              imageRendering: 'pixelated',
              width: `${spriteSize}px`,
              height: 'auto',
              filter: isAttacking ? 'brightness(1.5) drop-shadow(0 0 20px rgba(255,255,255,0.8))' : 'brightness(1.1)',
            }}
          />
        ) : (
          <EnemySprite
            spriteUrl={imageUrl}
            spriteFilename={spriteFilename || sprite?.split('/').pop()}
            name={name}
            shouldFace="right"
            className="select-none pointer-events-none"
            style={{
              width: `${spriteSize}px`,
              height: 'auto',
              filter: isAttacking ? 'brightness(1.5) drop-shadow(0 0 20px rgba(255,255,255,0.8))' : 'brightness(1.1)',
            }}
          />
        )}
        
        
        {/* Damage effect on body */}
        {showDamage && damage && damage > 0 && (
          <img
            src={explosionHit}
            alt=""
            className="absolute pixelated select-none pointer-events-none"
            style={{
              top: '30%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '140px',
              height: 'auto',
              imageRendering: 'pixelated',
              zIndex: 10,
              opacity: 0.95,
            }}
          />
        )}
        
        {/* Attack flash effect */}
        {isAttacking && (
          <div 
            className="absolute inset-0 bg-white/30 animate-pulse rounded-lg"
            style={{ mixBlendMode: 'overlay' }}
          />
        )}
      </div>
      

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
