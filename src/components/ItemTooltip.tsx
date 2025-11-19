import { useState } from "react";
import { getItemImage } from "@/lib/itemAssets";

interface ItemTooltipProps {
  itemName: string;
  children: React.ReactNode;
}

export const ItemTooltip = ({ itemName, children }: ItemTooltipProps) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const itemImage = getItemImage(itemName);

  return (
    <span 
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {children}
      {showTooltip && itemImage && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 animate-fade-in">
          <div className="bg-habbo-dark border-2 border-primary p-2 rounded shadow-lg">
            <img 
              src={itemImage} 
              alt={itemName}
              className="pixel-icon w-16 h-16 object-contain"
            />
          </div>
        </div>
      )}
    </span>
  );
};
