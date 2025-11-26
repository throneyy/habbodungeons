import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Combatant } from "@/lib/Utils/types";
import { getEnemySpriteUrl } from "@/lib/enemySprites";

interface Enemy {
  id: string;
  enemy_name: string;
  sprite_filename: string;
}

interface PartyMember {
  id: string;
  username: string;
  figureString: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  spd: number;
  position: { x: number; y: number };
}

interface BattleSimControlsProps {
  onStartBattle: (players: Combatant[], enemies: Combatant[]) => void;
}

export const BattleSimControls = ({ onStartBattle }: BattleSimControlsProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>([]);
  const [selectedEnemies, setSelectedEnemies] = useState<Enemy[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | undefined>(undefined);

  useEffect(() => {
    loadEnemies();
  }, []);

  const loadEnemies = async () => {
    const { data, error } = await supabase
      .from("enemy_sprites")
      .select("id, enemy_name, sprite_filename")
      .order("enemy_name");
    
    if (data) setEnemies(data);
  };

  const addPartyMember = () => {
    if (!newUsername.trim() || partyMembers.length >= 6) return;

    const newMember: PartyMember = {
      id: `player-${Date.now()}`,
      username: newUsername.trim(),
      figureString: "lg-3050-100.hr-100-31.hd-180-1.ch-210-66.sh-305-62.fa-1201.ca-1800-60", // Default figure
      hp: 50,
      maxHp: 50,
      mp: 30,
      maxMp: 30,
      atk: 10,
      def: 3,
      spd: 5,
      position: { x: 1, y: 4 + partyMembers.length },
    };

    setPartyMembers([...partyMembers, newMember]);
    setNewUsername("");
  };

  const removePartyMember = (id: string) => {
    setPartyMembers(partyMembers.filter(m => m.id !== id));
  };

  const addEnemy = () => {
    if (!selectedEnemyId) return;
    const enemy = enemies.find(e => e.id === selectedEnemyId);
    if (enemy && selectedEnemies.length < 6) {
      setSelectedEnemies([...selectedEnemies, enemy]);
    }
  };

  const removeEnemy = (index: number) => {
    setSelectedEnemies(selectedEnemies.filter((_, i) => i !== index));
  };

  const handleStartBattle = () => {
    const players: Combatant[] = partyMembers.map((member, index) => ({
      id: member.id,
      name: member.username,
      type: "player" as const,
      hp: member.hp,
      maxHp: member.maxHp,
      mp: member.mp,
      maxMp: member.maxMp,
      atk: member.atk,
      def: member.def,
      spd: member.spd,
      figureString: member.figureString,
      position: { x: 1, y: 4 + index },
      moveRange: 3,
      skills: [],
      isDefending: false,
    }));

    const enemyCombatants: Combatant[] = selectedEnemies.map((enemy, index) => ({
      id: `enemy-${index}`,
      name: enemy.enemy_name,
      type: "enemy" as const,
      hp: 100,
      maxHp: 100,
      mp: 0,
      maxMp: 0,
      atk: 15,
      def: 5,
      spd: 3,
      sprite: getEnemySpriteUrl(enemy.sprite_filename),
      position: { x: 6, y: 1 + index },
      moveRange: 2,
      skills: [],
      isDefending: false,
    }));

    onStartBattle(players, enemyCombatants);
    setIsOpen(false);
  };

  const handleReset = () => {
    setPartyMembers([]);
    setSelectedEnemies([]);
    setNewUsername("");
    setSelectedEnemyId(undefined);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full flex items-center justify-between">
          <span className="font-bold">Battle Simulator Controls</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="border border-border rounded-b-lg p-4 space-y-6">
        {/* Party Setup */}
        <div className="space-y-3">
          <h3 className="font-bold text-lg">Party Setup ({partyMembers.length}/6)</h3>
          
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Enter Habbo username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPartyMember()}
                disabled={partyMembers.length >= 6}
              />
            </div>
            <Button onClick={addPartyMember} disabled={partyMembers.length >= 6}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          {partyMembers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {partyMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-2 p-2 border border-border rounded">
                  <img
                    src={`https://lookup.thequackory.com/habbo-imaging/avatar.png?figure=${member.figureString}&hotel=COM&size=s&action=std&gesture=std&direction=2&head_direction=2&service=official`}
                    alt={member.username}
                    className="w-12 h-12 pixelated"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{member.username}</div>
                    <div className="text-xs text-muted-foreground">
                      HP: {member.hp} | ATK: {member.atk} | DEF: {member.def} | SPD: {member.spd}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removePartyMember(member.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Enemy Selection */}
        <div className="space-y-3">
          <h3 className="font-bold text-lg">Enemy Selection ({selectedEnemies.length}/6)</h3>
          
          <div className="flex gap-2">
            <Select value={selectedEnemyId} onValueChange={setSelectedEnemyId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select an enemy" />
              </SelectTrigger>
              <SelectContent>
                {enemies.map((enemy) => (
                  <SelectItem key={enemy.id} value={enemy.id}>
                    {enemy.enemy_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={addEnemy} disabled={selectedEnemies.length >= 6 || !selectedEnemyId}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          {selectedEnemies.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {selectedEnemies.map((enemy, index) => (
                <div key={`${enemy.id}-${index}`} className="flex items-center gap-2 p-2 border border-border rounded">
                  <img
                    src={getEnemySpriteUrl(enemy.sprite_filename)}
                    alt={enemy.enemy_name}
                    className="w-16 h-16 object-contain pixelated"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{enemy.enemy_name}</div>
                    <div className="text-xs text-muted-foreground">
                      HP: 100 | ATK: 15 | DEF: 5 | SPD: 3
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeEnemy(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Battle Controls */}
        <div className="flex gap-2 pt-4 border-t border-border">
          <Button 
            onClick={handleStartBattle} 
            className="flex-1"
            disabled={partyMembers.length === 0 || selectedEnemies.length === 0}
          >
            Start Battle
          </Button>
          <Button onClick={handleReset} variant="outline">
            Reset
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
