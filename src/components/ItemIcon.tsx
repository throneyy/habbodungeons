import { useGeneratedIcon } from '@/hooks/useGeneratedIcon';
import { Loader2 } from 'lucide-react';

interface ItemIconProps {
  itemName: string;
  itemType: string;
  sprite?: string;
  description?: string;
  className?: string;
  enableGeneration?: boolean;
}

export const ItemIcon = ({ 
  itemName, 
  itemType, 
  sprite, 
  description, 
  className = "w-16 h-16",
  enableGeneration = true
}: ItemIconProps) => {
  const { iconUrl, isGenerating, error } = useGeneratedIcon({
    itemName,
    itemType,
    sprite,
    description,
    enabled: enableGeneration
  });

  if (isGenerating) {
    return (
      <div className={`${className} flex items-center justify-center bg-muted rounded border-2 border-habbo-dark`}>
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !iconUrl) {
    return (
      <div className={`${className} flex items-center justify-center bg-muted rounded border-2 border-habbo-dark`}>
        <span className="text-xs text-muted-foreground">?</span>
      </div>
    );
  }

  return (
    <img 
      src={iconUrl} 
      alt={itemName}
      className={`${className} object-contain pixel-icon`}
      loading="lazy"
      onError={(e) => {
        // Fallback to placeholder on error
        e.currentTarget.src = '/placeholder.svg';
      }}
    />
  );
};