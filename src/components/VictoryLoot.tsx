import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HabboPanel } from "@/components/HabboPanel";
import { getItemImage } from "@/lib/itemAssets";
import { Button } from "@/components/ui/button";
import victoryTrophy from "@/assets/victory-trophy.png";

interface LootItem {
  item_name: string;
  quantity: number;
  item_type: string;
}

interface VictoryLootProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue?: () => void;
  lootItems: LootItem[];
  xpGained: number;
}

export const VictoryLoot = ({ isOpen, onClose, onContinue, lootItems, xpGained }: VictoryLootProps) => {
  const handleContinue = () => {
    onClose();
    if (onContinue) {
      onContinue();
    }
  };
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-center text-3xl font-black flex items-center justify-center gap-3">
            Victory!
            <img src={victoryTrophy} alt="Victory Trophy" className="pixelated inline-block" style={{ width: 'auto', height: 'auto' }} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {xpGained > 0 && (
            <div className="text-center p-4 bg-primary/10 rounded-lg border-2 border-primary">
              <p className="text-lg font-bold">
                +{xpGained} Experience Points
              </p>
            </div>
          )}

          {lootItems.length > 0 && (
            <HabboPanel title="Items Received">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
                {lootItems.map((item, index) => {
                  const itemImage = getItemImage(item.item_name);
                  return (
                    <div
                      key={index}
                      className="flex flex-col items-center gap-2 p-4 bg-muted rounded-lg border-2 border-habbo-dark hover:border-primary transition-colors"
                    >
                      {itemImage && (
                        <img
                          src={itemImage}
                          alt={item.item_name}
                          className="h-16 pixelated mx-auto"
                          style={{ width: 'auto' }}
                        />
                      )}
                      <div className="text-center">
                        <p className="font-bold text-sm">{item.item_name}</p>
                        {item.quantity > 1 && (
                          <p className="text-xs text-muted-foreground">
                            x{item.quantity}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground capitalize">
                          {item.item_type}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </HabboPanel>
          )}

          <div className="flex justify-center pt-4">
            <Button onClick={handleContinue} size="lg" className="min-w-[200px]">
              Continue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
