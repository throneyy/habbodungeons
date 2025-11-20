import { cn } from "@/lib/utils";

interface StatBarProps {
  label: string;
  current: number;
  max: number;
  color?: "hp" | "mp" | "xp";
  className?: string;
}

export const StatBar = ({ label, current, max, color = "hp", className }: StatBarProps) => {
  const percentage = Math.max(0, Math.min(100, (current / max) * 100));
  
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex justify-between text-sm font-bold">
        <span>{label}</span>
        <span>{current} / {max}</span>
      </div>
      <div className="h-6 bg-muted border-2 border-habbo-dark rounded-md overflow-hidden relative">
        <div 
          className={cn(
            "h-full transition-all duration-300",
            color === "hp" ? "bg-hp" : color === "mp" ? "bg-mp" : "bg-xp"
          )}
          style={{ width: `${percentage}%` }}
        />
        <div className="absolute inset-0 border-r-2 border-habbo-dark/20" style={{ left: "50%" }} />
      </div>
    </div>
  );
};