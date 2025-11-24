import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Droplet, Leaf } from "lucide-react";

interface Skill {
  id: string;
  name: string;
  description: string;
  source: "fishing" | "gardening";
  mpCost: number;
  canUse: boolean;
  onCooldown: boolean;
  oncePerDungeon?: boolean;
  requiredFishingLevel?: number;
  requiredGardeningLevel?: number;
}

interface SkillMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skills: Skill[];
  currentMp: number;
  fishingLevel: number;
  gardeningLevel: number;
  onSelectSkill: (skillId: string) => void;
}

export function SkillMenu({ 
  open, 
  onOpenChange, 
  skills, 
  currentMp,
  fishingLevel,
  gardeningLevel,
  onSelectSkill 
}: SkillMenuProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Skills (MP: {currentMp})
          </DialogTitle>
        </DialogHeader>
        
        {skills.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No skills unlocked yet.</p>
            <p className="text-sm mt-2">Level up your Habbo Fishing or Gardening to unlock skills!</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className={`p-4 border rounded-lg ${
                    skill.canUse ? 'bg-card hover:bg-accent cursor-pointer' : 'bg-muted opacity-60'
                  }`}
                  onClick={() => skill.canUse && onSelectSkill(skill.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {skill.source === "fishing" ? (
                          <Droplet className="w-4 h-4 text-blue-400" />
                        ) : (
                          <Leaf className="w-4 h-4 text-green-400" />
                        )}
                        <h4 className="font-bold">{skill.name}</h4>
                        <span className="text-sm text-muted-foreground">
                          ({skill.mpCost} MP)
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{skill.description}</p>
                      {skill.oncePerDungeon && (
                        <p className="text-xs text-yellow-500 mt-1">ULTIMATE - Once per dungeon</p>
                      )}
                      {skill.onCooldown && (
                        <p className="text-xs text-red-500 mt-1">Already used this dungeon</p>
                      )}
                      {!skill.canUse && !skill.onCooldown && (
                        <p className="text-xs text-red-500 mt-1">Not enough MP</p>
                      )}
                    </div>
                    {skill.canUse && (
                      <Button size="sm" variant="outline">
                        Use
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
