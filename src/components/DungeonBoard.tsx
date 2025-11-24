interface DungeonEntity {
  id: string;
  type: 'player' | 'enemy';
  x: number;
  y: number;
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
  damageDealt?: { entityId: string; amount: number };
}

import { EntitySprite } from './EntitySprite';

export const DungeonBoard = ({ 
  dungeon, 
  backgroundImageUrl,
  attackingEntityId,
  damageDealt
}: DungeonBoardProps) => {
  return (
    <div 
      className="absolute inset-0 w-full h-full overflow-hidden"
      style={{
        backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Entity container - centered in the board */}
      <div 
        className="relative w-full h-full"
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
          />
        ))}
      </div>
    </div>
  );
};
