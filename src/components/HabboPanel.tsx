import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface HabboPanelProps {
  children: ReactNode;
  title?: string;
  className?: string;
  headerClassName?: string;
}

export const HabboPanel = ({ children, title, className, headerClassName }: HabboPanelProps) => {
  return (
    <div className={cn(
      "bg-card border-4 border-habbo-dark rounded-xl overflow-hidden shadow-lg",
      className
    )}>
      {title && (
        <div className={cn(
          "bg-primary px-6 py-3 border-b-4 border-habbo-dark",
          headerClassName
        )}>
          <h2 className="text-xl font-bold text-primary-foreground tracking-wide">
            {title}
          </h2>
        </div>
      )}
      <div className="p-6">
        {children}
      </div>
    </div>
  );
};