import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skull } from "lucide-react";

interface PartyWipeDialogProps {
  open: boolean;
  onClose: () => void;
}

export const PartyWipeDialog = ({ open, onClose }: PartyWipeDialogProps) => {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="border-4 border-red-900 bg-gradient-to-b from-red-950/90 to-background">
        <AlertDialogHeader>
          <div className="flex justify-center mb-4">
            <div className="relative">
              <Skull className="w-24 h-24 text-red-500 animate-pulse" />
              <div className="absolute inset-0 w-24 h-24 bg-red-500/20 blur-xl animate-pulse" />
            </div>
          </div>
          <AlertDialogTitle className="text-3xl font-bold text-center text-red-500 font-['Volter']">
            PARTY WIPED OUT
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-lg mt-4">
            <p className="text-red-400 font-bold mb-2">
              Nobody from the party survived...
            </p>
            <p className="text-muted-foreground">
              All party members have been defeated and will return to town.
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              HP and MP have been restored to 50%.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction 
            onClick={onClose}
            className="w-full bg-red-900 hover:bg-red-800 text-white font-bold"
          >
            Return to Dashboard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
