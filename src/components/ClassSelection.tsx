import { useState } from "react";
import { CLASS_ARCHETYPES, ClassArchetype } from "@/lib/classArchetypes";
import { HabboPanel } from "./HabboPanel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

interface ClassSelectionProps {
  onComplete: (classData: {
    customClassName: string;
    customClassDescription: string;
    customClassArchetype: string;
    classId: string;
  }) => void;
  onCancel?: () => void;
  initialData?: {
    customClassName?: string;
    customClassDescription?: string;
    customClassArchetype?: string;
  };
  showCancel?: boolean;
}

export const ClassSelection = ({ 
  onComplete, 
  onCancel, 
  initialData,
  showCancel = false 
}: ClassSelectionProps) => {
  const [selectedArchetype, setSelectedArchetype] = useState<ClassArchetype | null>(
    initialData?.customClassArchetype 
      ? CLASS_ARCHETYPES.find(a => a.id === initialData.customClassArchetype) || null
      : null
  );
  const [customName, setCustomName] = useState(initialData?.customClassName || "");
  const [customDescription, setCustomDescription] = useState(initialData?.customClassDescription || "");

  const handleSubmit = () => {
    if (!selectedArchetype) return;
    
    const finalName = customName.trim() || selectedArchetype.name;
    
    onComplete({
      customClassName: finalName,
      customClassDescription: customDescription.trim(),
      customClassArchetype: selectedArchetype.id,
      classId: selectedArchetype.id,
    });
  };

  const isValid = selectedArchetype && (customName.trim().length >= 3 || !customName);

  return (
    <HabboPanel title="Choose Your Class">
      <div className="space-y-6">
        <div className="space-y-4">
          <Label className="text-lg font-bold">Select Archetype</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CLASS_ARCHETYPES.map((archetype) => (
              <button
                key={archetype.id}
                onClick={() => setSelectedArchetype(archetype)}
                className={`p-4 border-4 border-habbo-dark rounded-lg text-center transition-all ${
                  selectedArchetype?.id === archetype.id
                    ? "bg-primary text-primary-foreground scale-105"
                    : "bg-card hover:bg-muted"
                }`}
              >
                <div className="font-bold text-lg">{archetype.name}</div>
              </button>
            ))}
          </div>
        </div>

        {selectedArchetype && (
          <div className="space-y-4 p-4 bg-muted rounded-lg border-4 border-habbo-dark">
            <div>
              <h3 className="font-bold text-lg mb-2">{selectedArchetype.name}</h3>
              <p className="text-sm text-muted-foreground mb-3">{selectedArchetype.description}</p>
              <div className="flex flex-wrap gap-2">
                {selectedArchetype.suggestedStatFocus.map((stat) => (
                  <span
                    key={stat}
                    className="px-2 py-1 bg-accent text-accent-foreground rounded text-xs font-bold"
                  >
                    {stat}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="className">Custom Class Name (Optional)</Label>
              <Input
                id="className"
                value={customName}
                onChange={(e) => setCustomName(e.target.value.slice(0, 24))}
                placeholder={`e.g., "Frostbound ${selectedArchetype.name}"`}
                className="border-2 border-habbo-dark"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use "{selectedArchetype.name}"
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="classDescription">Class Description (Optional)</Label>
              <Textarea
                id="classDescription"
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value.slice(0, 200))}
                placeholder="Describe your character's background, fighting style, or philosophy..."
                className="border-2 border-habbo-dark min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground">
                {customDescription.length}/200 characters
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            disabled={!isValid}
            className="flex-1 font-bold border-4 border-habbo-dark"
            size="lg"
          >
            {initialData ? "Update Class" : "Continue"}
          </Button>
          {showCancel && onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              className="font-bold border-4 border-habbo-dark"
              size="lg"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    </HabboPanel>
  );
};
