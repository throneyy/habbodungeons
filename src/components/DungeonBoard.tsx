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

export const DungeonBoard = ({ 
  dungeon, 
  backgroundImageUrl,
  attackingEntityId,
  targetEntityId,
  damageDealt
}: DungeonBoardProps) => {
  // Find target entity position for attack animations
  const targetEntity = dungeon.entities.find(e => e.id === targetEntityId);
  const targetX = targetEntity?.x;
  const targetY = targetEntity?.y;
  return (
    <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-black/20">
      {/* Dungeon image container with proper aspect ratio */}
      {backgroundImageUrl && (
        <div className="relative w-full h-full max-w-[1400px] max-h-[900px] mx-auto">
          <img 
            src={backgroundImageUrl} 
            alt="Dungeon background"
            className="absolute inset-0 w-full h-full object-contain drop-shadow-2xl"
            style={{
              imageRendering: 'pixelated',
            }}
          />
          {/* Subtle vignette overlay */}
          <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-black/30 pointer-events-none" />
        </div>
      )}
      
      {/* Entity container - centered battle stage */}
      <div 
        className="absolute inset-0 w-full h-full flex items-center justify-center"
        style={{
          transformStyle: 'preserve-3d',
        }}
      >
        {dungeon.entities.map((entity) => (
          <EntitySprite
            key={entity.id}
            id={entity.id}
            type={entity.type}
            x={entity.x}
            y={entity.y}
            sprite={entity.sprite}
            habboAvatar={entity.habboAvatar}
            username={entity.username}
            name={entity.name}
            isDead={entity.isDead}
            isAttacking={attackingEntityId === entity.id}
            damage={damageDealt?.entityId === entity.id ? damageDealt.amount : undefined}
            targetX={attackingEntityId === entity.id ? targetX : undefined}
            targetY={attackingEntityId === entity.id ? targetY : undefined}
          />
        ))}
      </div>
    </div>
  );
};
