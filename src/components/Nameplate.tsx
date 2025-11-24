interface NameplateProps {
  name: string;
  offsetX?: number;
  offsetY?: number;
  slotIndex?: number;
}

export const Nameplate = ({ name, offsetX = 0, offsetY = -28, slotIndex = 0 }: NameplateProps) => {
  // Stagger nameplates vertically based on slot to prevent overlap in party formations
  const stackedOffsetY = offsetY - (slotIndex * 4);
  
  return (
    <div 
      className="absolute left-1/2 pointer-events-none"
      style={{ 
        top: `${stackedOffsetY}px`,
        transform: `translateX(calc(-50% + ${offsetX}px))`,
        zIndex: 100,
      }}
    >
      <div 
        className="px-3 py-1.5 text-sm font-bold text-white whitespace-nowrap"
        style={{
          background: 'rgba(0, 0, 0, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          borderRadius: '4px',
          textShadow: '1px 1px 2px rgba(0, 0, 0, 1), -1px -1px 0 rgba(0, 0, 0, 1), 1px -1px 0 rgba(0, 0, 0, 1), -1px 1px 0 rgba(0, 0, 0, 1)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
          imageRendering: 'pixelated',
        }}
      >
        {name}
      </div>
    </div>
  );
};
