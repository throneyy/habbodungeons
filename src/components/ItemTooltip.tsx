import { useState } from "react";
import { getItemImage, getItemDescription } from "@/lib/itemAssets";

interface ItemTooltipProps {
  itemName: string;
  children: React.ReactNode;
}

export const ItemTooltip = ({ itemName, children }: ItemTooltipProps) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const itemImage = getItemImage(itemName);
  const itemDescription = getItemDescription(itemName);

  return (
    <span 
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {children}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 animate-fade-in">
          <div className="bg-habbo-dark border-2 border-primary p-3 rounded shadow-lg max-w-xs">
            <img 
              src={itemImage} 
              alt={itemName}
              className="pixel-icon w-16 h-16 object-contain mx-auto"
            />
            <p className="text-sm text-center text-foreground mt-2 font-bold">
              {itemName}
            </p>
            <p className="text-xs text-center text-muted-foreground mt-1">
              {itemDescription}
            </p>
          </div>
        </div>
      )}
    </span>
  );
};
