import { Swords } from "lucide-react";

interface PartyMember {
  userId: string;
  username: string;
  habboAvatar: string | null;
  level: number;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  statusEffects: string[];
}

interface BattlePartyListProps {
  members: PartyMember[];
  currentUserId: string;
  currentTurnUserId?: string;
  turnOrder?: string[];
}

export const BattlePartyList = ({ members, currentUserId, currentTurnUserId, turnOrder }: BattlePartyListProps) => {
  // Sort members by turn order if available
  const sortedMembers = turnOrder && turnOrder.length > 0
    ? [...members].sort((a, b) => {
        const aIndex = turnOrder.indexOf(a.userId);
        const bIndex = turnOrder.indexOf(b.userId);
        return aIndex - bIndex;
      })
    : members;

  return (
    <div className="flex gap-2">
      {sortedMembers.slice(0, 6).map((member) => {
        const isCurrentTurn = currentTurnUserId === member.userId;
        const turnIndex = turnOrder?.indexOf(member.userId);
        const isCurrentUser = member.userId === currentUserId;
        
        return (
          <div
            key={member.userId}
            className={`relative flex-1 p-2 rounded-lg border-2 ${
              isCurrentTurn
                ? 'bg-green-500/30 border-green-400 ring-2 ring-green-400/50 animate-pulse'
                : isCurrentUser
                ? 'bg-primary/20 border-primary'
                : 'bg-muted/50 border-habbo-dark'
            }`}
          >
            {/* Turn order badge */}
            {turnOrder && turnIndex !== undefined && turnIndex >= 0 && (
              <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-habbo-dark border-2 border-foreground flex items-center justify-center text-xs font-bold z-10">
                {turnIndex + 1}
              </div>
            )}
            
            {/* Current turn indicator */}
            {isCurrentTurn && (
              <div className="absolute -top-1 -left-1 animate-bounce z-10">
                <Swords className="w-4 h-4 text-green-400" />
              </div>
            )}

            <div className="flex flex-col items-center gap-1">
              {member.habboAvatar && (
                <img 
                  src={member.habboAvatar} 
                  alt={member.username}
                  className="w-12 h-12 pixelated"
                />
              )}
              <div className="text-xs font-bold text-center truncate w-full px-1">
                {member.username}
              </div>
              <div className="w-full bg-muted border border-habbo-dark rounded-sm h-2 overflow-hidden">
                <div 
                  className="h-full bg-hp transition-all duration-300"
                  style={{ width: `${(member.currentHp / member.maxHp) * 100}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
