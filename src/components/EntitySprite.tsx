import { useEffect, useState } from 'react';
import React from 'react';
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
  totalPlayers?: number;
  arenaDimensions: { width: number; height: number };
  isAttacking?: boolean;
  damage?: number;
  targetX?: number;
  targetY?: number;
}

// Diagonal party formation offsets for JRPG-style positioning
const PARTY_OFFSETS = [
  { x: 0, y: 0 },        // front-most player
  { x: -28, y: 28 },     // one step back-left
  { x: -56, y: 56 },     // two steps back-left
  { x: -84, y: 84 },     // three steps back-left (for 4+ party)
  { x: -112, y: 112 },   // four steps back-left (for 5+ party)
  { x: -140, y: 140 },   // five steps back-left (for 6 party)
];

export const EntitySprite = React.memo(({
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
  totalPlayers = 1,
  arenaDimensions,
  isAttacking,
  damage,
  targetX,
  targetY
}: EntitySpriteProps) => {
  const [showDamage, setShowDamage] = useState(false);
  const [animatePosition, setAnimatePosition] = useState<{ x: number; y: number } | null>(null);
  const [avatarAction, setAvatarAction] = useState<'std' | 'wlk' | 'crr'>('std');
  const [showMovementEffect, setShowMovementEffect] = useState(false);
  const [showPushbackEffect, setShowPushbackEffect] = useState(false);

  // Calculate base position based on type
  const getBasePosition = (): { x: number; y: number } => {
    const { width: arenaWidth, height: arenaHeight } = arenaDimensions;

    if (type === 'enemy') {
      // ENEMY: DEAD-CENTER IN ARENA
      return {
        x: arenaWidth / 2,
        y: (arenaHeight / 2) - 20 // slight upward offset for floor alignment
      };
    } else {
      // PARTY: RIGHT-SIDE DIAGONAL FORMATION
      const partyBase = {
        x: arenaWidth * 0.72,  // 72% from left
        y: arenaHeight * 0.60  // 60% from top
      };

      const offset = PARTY_OFFSETS[slotIndex] || PARTY_OFFSETS[0];
      
      return {
        x: partyBase.x + offset.x,
        y: partyBase.y + offset.y
      };
    }
  };

  const basePosition = getBasePosition();

  // Damage animation with delay for turn-based sequencing
  useEffect(() => {
    if (damage !== undefined && damage > 0) {
      // Delay damage display so attacker animation plays first
      const damageDelay = isAttacking ? 0 : 500;
      
      const showTimer = setTimeout(() => {
        setShowDamage(true);
        setShowPushbackEffect(true);
        
        // Pushback animation - move slightly away from center
        const pushbackDistance = type === 'player' ? 15 : -15;
        setAnimatePosition({ 
          x: basePosition.x + pushbackDistance, 
          y: basePosition.y 
        });
        
        // Return to normal position
        const returnTimer = setTimeout(() => {
          setAnimatePosition(null);
          setShowPushbackEffect(false);
        }, 300);
        
        // Hide damage after animation
        const hideTimer = setTimeout(() => {
          setShowDamage(false);
        }, 1000);
        
        return () => {
          clearTimeout(returnTimer);
          clearTimeout(hideTimer);
        };
      }, damageDelay);
      
      return () => clearTimeout(showTimer);
    }
  }, [damage, id, isAttacking, type, basePosition.x, basePosition.y]);

  // Attack animation
  useEffect(() => {
    if (type === 'player' && isAttacking) {
      // Calculate enemy center position for targeting
      const enemyCenter = {
        x: arenaDimensions.width / 2,
        y: (arenaDimensions.height / 2) - 20
      };
      
      // Phase 1: Move toward enemy center
      setAvatarAction('wlk');
      setShowMovementEffect(true);
      const moveX = basePosition.x + (enemyCenter.x - basePosition.x) * 0.4;
      const moveY = basePosition.y + (enemyCenter.y - basePosition.y) * 0.4;
      setAnimatePosition({ x: moveX, y: moveY });
      
      // Phase 2: Attack pose at impact
      const attackTimer = setTimeout(() => {
        setAvatarAction('crr');
        setShowMovementEffect(false);
      }, 300);
      
      // Phase 3: Return to original position
      const returnTimer = setTimeout(() => {
        setAnimatePosition(null);
        setAvatarAction('std');
      }, 700);
      
      return () => {
        clearTimeout(attackTimer);
        clearTimeout(returnTimer);
      };
    } else if (type === 'enemy' && isAttacking) {
      // Enemy shake animation (no movement, just visual effect)
      setShowMovementEffect(true);
      const shakeTimer = setTimeout(() => {
        setShowMovementEffect(false);
      }, 400);
      
      return () => clearTimeout(shakeTimer);
    } else {
      setAnimatePosition(null);
      setAvatarAction('std');
      setShowMovementEffect(false);
    }
  }, [isAttacking, type, basePosition.x, basePosition.y, arenaDimensions]);

  // Current position for rendering (animated position or base position)
  const currentPosition = animatePosition || basePosition;
  
  // Calculate z-index based on Y position for proper isometric layering
  const zIndex = 100 + Math.floor(currentPosition.y);

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
  const spriteSize = type === 'player' ? 80 : 240;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${currentPosition.x}px`,
        top: `${currentPosition.y}px`,
        transform: `translate(-50%, -100%) ${isAttacking && type === 'player' ? 'scale(1.15)' : ''} ${type === 'enemy' && isAttacking ? 'translateX(-5px)' : ''}`,
        zIndex,
        transition: 'left 0.3s ease-out, top 0.3s ease-out, transform 0.2s ease-out',
        filter: isDead ? 'grayscale(100%) brightness(0.5)' : 'none',
      }}
      className="drop-shadow-2xl"
    >
      {/* Movement effect under feet - for attacking or taking damage */}
      {(showMovementEffect || showPushbackEffect) && (
        <img
          src={hitBump}
          alt="Movement effect"
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
            alt="Damage explosion"
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
          className="absolute -top-16 left-1/2 -translate-x-1/2 text-4xl font-bold text-red-500 pointer-events-none font-volter"
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
});
