interface DungeonEntity {
  id: string;
  type: 'player' | 'enemy';
  x: number;
  y: number;
  slotId?: string;
  username?: string;
  name?: string;
  habboAvatar?: string | null;
  sprite?: string;
  spriteFilename?: string; // Original backend filename for direction lookup
  current_hp?: number;
  max_hp?: number;
  isDead?: boolean;
}

interface DungeonBoardProps {
  dungeon: {
    width: number;
    height: number;
    entities: DungeonEntity[];
  };
  backgroundImageUrl: string | null;
  attackingEntityId?: string;
  targetEntityId?: string;
  damageDealt?: { entityId: string; amount: number };
}

import { EntitySprite } from './EntitySprite';
import { useEffect, useState, useRef } from 'react';

export const DungeonBoard = ({ 
  dungeon, 
  backgroundImageUrl,
  attackingEntityId,
  targetEntityId,
  damageDealt
}: DungeonBoardProps) => {
  const arenaRef = useRef<HTMLDivElement>(null);
  const [arenaDimensions, setArenaDimensions] = useState({ width: 1600, height: 1000 });

  // Detect arena dimensions dynamically
  useEffect(() => {
    const updateDimensions = () => {
      if (arenaRef.current) {
        setArenaDimensions({
          width: arenaRef.current.offsetWidth,
          height: arenaRef.current.offsetHeight
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Find target entity position for attack animations
  const targetEntity = dungeon.entities.find(e => e.id === targetEntityId);
  const targetX = targetEntity?.x;
  const targetY = targetEntity?.y;
  
  return (
    <div className="absolute inset-0 w-full h-full flex items-center justify-center">
      {/* Contained dungeon box - wider to fill space */}
      <div 
        ref={arenaRef}
        id="arena-container"
        className="relative w-[95%] max-w-[1600px] mx-auto aspect-[16/10] rounded-lg overflow-hidden border-4 border-border/50 shadow-2xl"
      >
        {/* Background image with cover */}
        <div 
          className="absolute inset-0 w-full h-full"
          style={{
            backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
          }}
        >
          {/* Vignette overlay for depth */}
          <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-black/30" />
        </div>
        
        {/* Entity container - centered battle stage */}
        <div 
          className="relative w-full h-full"
          style={{
            transformStyle: 'preserve-3d',
          }}
        >
        {dungeon.entities.map((entity) => {
          // Extract slot index from slotId (e.g., "P1" -> 0, "P2" -> 1)
          const slotIndex = entity.slotId && entity.type === 'player' 
            ? parseInt(entity.slotId.replace('P', '')) - 1 
            : 0;
          
          return (
            <EntitySprite
              key={entity.id}
              id={entity.id}
              type={entity.type}
              x={entity.x}
              y={entity.y}
              sprite={entity.sprite}
              spriteFilename={entity.spriteFilename} // Pass original filename
              habboAvatar={entity.habboAvatar}
              username={entity.username}
              name={entity.name}
              isDead={entity.isDead}
              slotIndex={slotIndex}
              totalPlayers={dungeon.entities.filter(e => e.type === 'player').length}
              arenaDimensions={arenaDimensions}
              isAttacking={attackingEntityId === entity.id}
              damage={damageDealt?.entityId === entity.id ? damageDealt.amount : undefined}
              targetX={attackingEntityId === entity.id ? targetX : undefined}
              targetY={attackingEntityId === entity.id ? targetY : undefined}
            />
          );
        })}
        </div>
      </div>
    </div>
  );
};
