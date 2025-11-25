import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Droplet, Leaf, Lock, CheckCircle2, RefreshCw } from "lucide-react";
import { SKILL_DEFINITIONS } from "@/lib/skillDefinitions";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

interface SkillTreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fishingLevel: number;
  gardeningLevel: number;
  unlockedSkills: string[];
  lastSyncTime?: string;
  onSkillsUpdated?: () => void;
}

export function SkillTreeDialog({
  open,
  onOpenChange,
  fishingLevel,
  gardeningLevel,
  unlockedSkills,
  lastSyncTime,
  onSkillsUpdated,
}: SkillTreeDialogProps) {
  const [syncing, setSyncing] = useState(false);

  const fishingSkills = SKILL_DEFINITIONS.filter(s => s.source === "fishing")
    .sort((a, b) => (a.requiredFishingLevel || 0) - (b.requiredFishingLevel || 0));
  
  const gardeningSkills = SKILL_DEFINITIONS.filter(s => s.source === "gardening")
    .sort((a, b) => (a.requiredGardeningLevel || 0) - (b.requiredGardeningLevel || 0));

  const handleSyncSkills = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Not authenticated");
        return;
      }

      const { data, error } = await supabase.functions.invoke('sync-habbo-skills', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      toast.success(`Skills synced! Fishing: Lv${data.fishingLevel} (${data.fishingXp} XP), Gardening: Lv${data.gardeningLevel} (${data.gardeningXp} XP)`);
      
      if (onSkillsUpdated) {
        onSkillsUpdated();
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      toast.error("Failed to sync skills. Please try again later.");
    } finally {
      setSyncing(false);
    }
  };


  const renderSkillNode = (skill: typeof SKILL_DEFINITIONS[0], currentLevel: number) => {
    const requiredLevel = skill.requiredFishingLevel || skill.requiredGardeningLevel || 0;
    const isUnlocked = unlockedSkills.includes(skill.id);
    const isLocked = currentLevel < requiredLevel;

    return (
      <div
        key={skill.id}
        className={`relative p-4 rounded-lg border-2 transition-all ${
          isLocked
            ? "bg-muted/50 border-muted opacity-50"
            : isUnlocked
            ? "bg-gradient-to-br from-primary/10 to-primary/5 border-primary shadow-lg"
            : "bg-card border-border"
        }`}
      >
        {/* Level Badge */}
        <div className="absolute -top-3 -left-3 bg-background border-2 border-current rounded-full w-10 h-10 flex items-center justify-center font-bold">
          {requiredLevel}
        </div>

        {/* Unlock Status Icon */}
        <div className="absolute -top-3 -right-3">
          {isLocked ? (
            <Lock className="w-6 h-6 text-muted-foreground" />
          ) : isUnlocked ? (
            <CheckCircle2 className="w-6 h-6 text-primary" />
          ) : null}
        </div>

        {/* Skill Content */}
        <div className="mt-2">
          <div className="flex items-center gap-2 mb-2">
            <h4 className={`font-bold text-sm ${isLocked ? "text-muted-foreground" : ""}`}>
              {skill.name}
            </h4>
            {skill.oncePerDungeon && (
              <Badge variant="secondary" className="text-xs">
                ULTIMATE
              </Badge>
            )}
          </div>
          
          <p className={`text-xs mb-2 ${isLocked ? "text-muted-foreground" : "text-muted-foreground"}`}>
            {skill.description}
          </p>

          <div className="flex items-center justify-between text-xs">
            <span className={`font-semibold ${isLocked ? "text-muted-foreground" : "text-primary"}`}>
              {skill.mpCost} MP
            </span>
            {isLocked && (
              <span className="text-muted-foreground">
                Requires Lv{requiredLevel}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <span className="text-2xl">🌟</span>
                Skill Trees
              </DialogTitle>
              <Button 
                onClick={handleSyncSkills} 
                disabled={syncing}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync from Habbo Origins'}
              </Button>
            </div>
            {lastSyncTime && (
              <p className="text-xs text-muted-foreground">
                Last synced: {new Date(lastSyncTime).toLocaleString()}
              </p>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="fishing" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="fishing" className="flex items-center gap-2">
              <Droplet className="w-4 h-4" />
              Fishing (Lv {fishingLevel})
            </TabsTrigger>
            <TabsTrigger value="gardening" className="flex items-center gap-2">
              <Leaf className="w-4 h-4" />
              Gardening (Lv {gardeningLevel})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fishing">
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-6">
                {/* Skill tier labels */}
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold flex items-center justify-center gap-2">
                    <Droplet className="w-5 h-5 text-blue-400" />
                    Fishing Abilities
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Progress through fishing challenges to unlock powerful water-based skills
                  </p>
                </div>

                {/* Skill nodes grouped by tier */}
                <div className="space-y-8">
                  {/* Starter */}
                  <div>
                    <div className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-2">
                      <div className="h-px bg-border flex-1" />
                      STARTER (Lv 10)
                      <div className="h-px bg-border flex-1" />
                    </div>
                    <div className="grid grid-cols-1 gap-4 px-4 pt-4">
                      {fishingSkills.filter(s => s.requiredFishingLevel === 10).map(skill => 
                        renderSkillNode(skill, fishingLevel)
                      )}
                    </div>
                  </div>

                  {/* Intermediate */}
                  <div>
                    <div className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-2">
                      <div className="h-px bg-border flex-1" />
                      INTERMEDIATE (Lv 30-55)
                      <div className="h-px bg-border flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 px-4 pt-4">
                      {fishingSkills.filter(s => s.requiredFishingLevel && s.requiredFishingLevel >= 30 && s.requiredFishingLevel <= 55).map(skill =>
                        renderSkillNode(skill, fishingLevel)
                      )}
                    </div>
                  </div>

                  {/* Advanced */}
                  <div>
                    <div className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-2">
                      <div className="h-px bg-border flex-1" />
                      ADVANCED (Lv 70-85)
                      <div className="h-px bg-border flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 px-4 pt-4">
                      {fishingSkills.filter(s => s.requiredFishingLevel && s.requiredFishingLevel >= 70 && s.requiredFishingLevel <= 85).map(skill =>
                        renderSkillNode(skill, fishingLevel)
                      )}
                    </div>
                  </div>

                  {/* Master */}
                  <div>
                    <div className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-2">
                      <div className="h-px bg-border flex-1" />
                      MASTER (Lv 99-100)
                      <div className="h-px bg-border flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 px-4 pt-4">
                      {fishingSkills.filter(s => s.requiredFishingLevel && s.requiredFishingLevel >= 99).map(skill =>
                        renderSkillNode(skill, fishingLevel)
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="gardening">
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-6">
                {/* Skill tier labels */}
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold flex items-center justify-center gap-2">
                    <Leaf className="w-5 h-5 text-green-400" />
                    Gardening Abilities
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Master the art of nature to unlock healing and support skills
                  </p>
                </div>

                {/* Skill nodes grouped by tier */}
                <div className="space-y-8">
                  {/* Starter */}
                  <div>
                    <div className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-2">
                      <div className="h-px bg-border flex-1" />
                      STARTER (Lv 10)
                      <div className="h-px bg-border flex-1" />
                    </div>
                    <div className="grid grid-cols-1 gap-4 px-4 pt-4">
                      {gardeningSkills.filter(s => s.requiredGardeningLevel === 10).map(skill =>
                        renderSkillNode(skill, gardeningLevel)
                      )}
                    </div>
                  </div>

                  {/* Intermediate */}
                  <div>
                    <div className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-2">
                      <div className="h-px bg-border flex-1" />
                      INTERMEDIATE (Lv 30-55)
                      <div className="h-px bg-border flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 px-4 pt-4">
                      {gardeningSkills.filter(s => s.requiredGardeningLevel && s.requiredGardeningLevel >= 30 && s.requiredGardeningLevel <= 55).map(skill =>
                        renderSkillNode(skill, gardeningLevel)
                      )}
                    </div>
                  </div>

                  {/* Advanced */}
                  <div>
                    <div className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-2">
                      <div className="h-px bg-border flex-1" />
                      ADVANCED (Lv 70-85)
                      <div className="h-px bg-border flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 px-4 pt-4">
                      {gardeningSkills.filter(s => s.requiredGardeningLevel && s.requiredGardeningLevel >= 70 && s.requiredGardeningLevel <= 85).map(skill =>
                        renderSkillNode(skill, gardeningLevel)
                      )}
                    </div>
                  </div>

                  {/* Master */}
                  <div>
                    <div className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-2">
                      <div className="h-px bg-border flex-1" />
                      MASTER (Lv 99-100)
                      <div className="h-px bg-border flex-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4 px-4 pt-4">
                      {gardeningSkills.filter(s => s.requiredGardeningLevel && s.requiredGardeningLevel >= 99).map(skill =>
                        renderSkillNode(skill, gardeningLevel)
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
