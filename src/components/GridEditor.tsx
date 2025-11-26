import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Eye, EyeOff, Save, Grid as GridIcon } from 'lucide-react';
import { toast } from 'sonner';

interface GridEditorProps {
  gridCols: number;
  gridRows: number;
  backgroundUrl?: string;
  enabledCells: Array<{ x: number; y: number }>;
  onEnabledCellsChange: (cells: Array<{ x: number; y: number }>) => void;
}

export const GridEditor: React.FC<GridEditorProps> = ({
  gridCols,
  gridRows,
  backgroundUrl,
  enabledCells,
  onEnabledCellsChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const isCellEnabled = (x: number, y: number) => {
    return enabledCells.some(cell => cell.x === x && cell.y === y);
  };

  const toggleCell = (x: number, y: number) => {
    if (!isEditing) return;
    
    const enabled = isCellEnabled(x, y);
    let newCells: Array<{ x: number; y: number }>;
    
    if (enabled) {
      newCells = enabledCells.filter(cell => !(cell.x === x && cell.y === y));
    } else {
      newCells = [...enabledCells, { x, y }];
    }
    
    onEnabledCellsChange(newCells);
  };

  const enableAllCells = () => {
    const allCells: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < gridRows; y++) {
      for (let x = 0; x < gridCols; x++) {
        allCells.push({ x, y });
      }
    }
    onEnabledCellsChange(allCells);
    toast.success('All cells enabled');
  };

  const disableAllCells = () => {
    onEnabledCellsChange([]);
    toast.success('All cells disabled');
  };

  const saveGridConfiguration = async () => {
    if (!backgroundUrl) {
      toast.error('No background URL specified');
      return;
    }

    setIsSaving(true);
    try {
      // Check if configuration exists
      const { data: existing } = await supabase
        .from('grid_configurations')
        .select('id')
        .eq('background_url', backgroundUrl)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('grid_configurations')
          .update({
            enabled_cells: enabledCells,
            grid_cols: gridCols,
            grid_rows: gridRows,
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('grid_configurations')
          .insert({
            background_url: backgroundUrl,
            enabled_cells: enabledCells,
            grid_cols: gridCols,
            grid_rows: gridRows,
          });

        if (error) throw error;
      }

      toast.success('Grid configuration saved!');
    } catch (error) {
      console.error('Error saving grid config:', error);
      toast.error('Failed to save grid configuration');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-border pt-3 mt-3">
      <h3 className="font-bold text-lg flex items-center gap-2">
        <GridIcon className="w-5 h-5" />
        Grid Editor
      </h3>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => setIsEditing(!isEditing)}
          variant={isEditing ? 'default' : 'outline'}
          size="sm"
          className="flex items-center gap-2"
        >
          {isEditing ? 'Editing...' : 'Enable Editor'}
        </Button>

        <Button
          onClick={() => setShowGrid(!showGrid)}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          {showGrid ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {showGrid ? 'Hide Grid' : 'Show Grid'}
        </Button>

        <Button
          onClick={enableAllCells}
          variant="outline"
          size="sm"
          disabled={!isEditing}
        >
          Enable All
        </Button>

        <Button
          onClick={disableAllCells}
          variant="outline"
          size="sm"
          disabled={!isEditing}
        >
          Disable All
        </Button>

        <Button
          onClick={saveGridConfiguration}
          variant="default"
          size="sm"
          disabled={isSaving || !backgroundUrl}
          className="flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save Config'}
        </Button>
      </div>

      {isEditing && (
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
          <p className="font-semibold mb-1">Grid Editor Active</p>
          <p>Click cells on the battle grid to enable/disable them as walkable tiles.</p>
          <p className="mt-1">
            Enabled: <span className="font-bold text-green-500">{enabledCells.length}</span> / 
            <span className="font-bold"> {gridCols * gridRows}</span> cells
          </p>
        </div>
      )}
    </div>
  );
};
