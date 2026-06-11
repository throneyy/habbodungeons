import React from 'react';
import { GridPosition } from '@/lib/gridSystem';
import { getEnemyBaseDirection, getEnemyScaleFactor } from '@/lib/enemyDirections';

interface EnemySpriteProps {
  spriteUrl: string;
  spriteFilename?: string;
  name?: string;
  position: GridPosition;
  shouldFace?: 'left' | 'right';
  screenX: number;
  screenY: number;
  zIndex: number;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const EnemySprite: React.FC<EnemySpriteProps> = ({
  spriteUrl,
  spriteFilename,
  name,
  position,
  shouldFace = 'right',
  screenX,
  screenY,
  zIndex,
  onClick,
  className = '',
  style,
}) => {
  const filename = spriteFilename || spriteUrl.split('/').pop() || '';
  const baseDirection = getEnemyBaseDirection(filename);
  const scaleFactor = getEnemyScaleFactor(filename);
  const needsFlip = baseDirection !== shouldFace;
  
  return (
    <div
      className={`absolute cursor-pointer ${className}`}
      style={{
        left: `${screenX}px`,
        top: `${screenY}px`,
        zIndex: zIndex + 1000,
        transform: 'translate(-50%, -100%)',
        ...style,
      }}
      onClick={onClick}
    >
      <img
        src={spriteUrl}
        alt={name || 'Enemy'}
        className="pixelated max-h-24 w-auto drop-shadow-lg"
        style={{
          imageRendering: 'pixelated',
          transform: `${needsFlip ? 'scaleX(-1)' : ''} ${scaleFactor !== 1.0 ? `scale(${scaleFactor})` : ''}`.trim(),
          transformOrigin: 'center',
          objectFit: 'contain',
        }}
      />
      {name && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/80 px-2 py-1 rounded text-xs text-white whitespace-nowrap">
          {name}
        </div>
      )}
    </div>
  );
};
