import { getEnemyBaseDirection } from '@/lib/enemyDirections';

interface EnemySpriteProps {
  spriteUrl: string;
  spriteFilename?: string;
  name?: string;
  shouldFace: 'left' | 'right';
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

export const EnemySprite = ({
  spriteUrl,
  spriteFilename,
  name,
  shouldFace,
  className = '',
  style = {},
  alt,
}: EnemySpriteProps) => {
  // Extract filename from URL if not provided
  const filename = spriteFilename || spriteUrl.split('/').pop() || '';
  
  // Get the base direction from our lookup table
  const baseDirection = getEnemyBaseDirection(filename);
  
  // Flip only if base direction differs from desired direction
  const needsFlip = baseDirection !== shouldFace;
  
  return (
    <img
      src={spriteUrl}
      alt={alt || name || 'Enemy'}
      className={className}
      style={{
        imageRendering: 'pixelated',
        transform: needsFlip ? 'scaleX(-1)' : 'none',
        transformOrigin: 'center',
        ...style,
      }}
    />
  );
};
