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

const getHabboAvatarWithExpression = (
  figureString: string | undefined,
  hpPercentage: number,
  isCurrentTurn: boolean,
  isVictory: boolean = false
): string => {
  if (!figureString) return '';
  
  let gesture = 'std';
  let action = 'std';
  let direction = '2';
  
  // Dead Habbo Animation
  if (hpPercentage <= 0) {
    action = 'lay';
    gesture = 'std';
    direction = '4';
  } 
  // Hurt Habbo
  else if (hpPercentage < 30) {
    gesture = 'sad';
    action = 'std';
  } 
  // Victory
  else if (isVictory) {
    gesture = 'sml';
    action = 'std';
  }
  // Fighting (current turn)
  else if (isCurrentTurn) {
    gesture = 'agr';
    action = 'std';
  }
  
  return `https://www.habbo.com/habbo-imaging/avatarimage?figure=${figureString}&hotel=COM&size=b&action=${action}&gesture=${gesture}&direction=${direction}&head_direction=2&service=official`;
};

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
        const hpPercentage = (member.currentHp / member.maxHp) * 100;
        
        // Extract figure string from habboAvatar URL if available
        const figureString = member.habboAvatar?.match(/figure=([^&]+)/)?.[1];
        const avatarUrl = figureString 
          ? getHabboAvatarWithExpression(figureString, hpPercentage, isCurrentTurn)
          : member.habboAvatar;
        
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
              <div className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-habbo-dark border-2 border-foreground flex items-center justify-center text-xs font-bold z-10 shadow-lg">
                {turnIndex + 1}
              </div>
            )}
            
            {/* Current turn indicator */}
            {isCurrentTurn && (
              <div className="absolute -top-2 -left-2 animate-bounce z-10">
                <Swords className="w-5 h-5 text-green-400 drop-shadow-lg" />
              </div>
            )}

            <div className="flex flex-col items-center gap-1">
              {avatarUrl && (
                <img 
                  src={avatarUrl} 
                  alt={member.username}
                  className="w-16 h-16 pixelated"
                />
              )}
              <div className="text-xs font-bold text-center truncate w-full px-1">
                {member.username}
              </div>
              <div className="w-full bg-muted border border-habbo-dark rounded-sm h-2 overflow-hidden">
                <div 
                  className="h-full bg-hp transition-all duration-300"
                  style={{ width: `${hpPercentage}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
