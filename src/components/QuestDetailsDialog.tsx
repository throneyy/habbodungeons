import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface QuestDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dungeonName: string;
  questObjective: string;
  introText: string;
  npcName?: string;
}

export const QuestDetailsDialog = ({
  open,
  onOpenChange,
  dungeonName,
  questObjective,
  introText,
  npcName
}: QuestDetailsDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-4 border-habbo-dark">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-primary">Quest Details</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-primary">{dungeonName}</h3>
              {npcName && (
                <p className="text-sm text-muted-foreground italic">Quest from {npcName}</p>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-lg">Objective</h4>
              <p className="text-base leading-relaxed">{questObjective}</p>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-lg">Quest Briefing</h4>
              <p className="text-base leading-relaxed italic">"{introText}"</p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
