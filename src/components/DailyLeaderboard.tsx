import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HabboPanel } from "./HabboPanel";
import { Trophy, Swords, Skull } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import { LoadingSpinner } from "./LoadingSpinner";

interface LeaderboardEntry {
  user_id: string;
  username: string;
  habbo_username: string | null;
  figureString: string | null;
  damage_dealt: number;
  enemies_killed: number;
  bosses_defeated: number;
}

export const DailyLeaderboard = () => {
  const [topPlayers, setTopPlayers] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();

    // Subscribe to changes
    const channel = supabase
      .channel('leaderboard-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_stats'
      }, () => {
        loadLeaderboard();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadLeaderboard = async () => {
    try {
      // Get today's top players by damage dealt
      const { data: statsData, error } = await supabase
        .from('daily_stats')
        .select(`
          user_id,
          damage_dealt,
          enemies_killed,
          bosses_defeated
        `)
        .eq('stat_date', new Date().toISOString().split('T')[0])
        .order('damage_dealt', { ascending: false })
        .limit(5);

      if (error) throw error;

      if (!statsData || statsData.length === 0) {
        setTopPlayers([]);
        setLoading(false);
        return;
      }

      // Fetch profiles for these users
      const userIds = statsData.map(s => s.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, habbo_username, habbo_profile_json')
        .in('id', userIds);

      const leaderboard: LeaderboardEntry[] = statsData.map(stat => {
        const profile = profiles?.find(p => p.id === stat.user_id);
        const habboData = profile?.habbo_profile_json as any;
        return {
          user_id: stat.user_id,
          username: profile?.username || 'Unknown',
          habbo_username: profile?.habbo_username,
          figureString: habboData?.figureString || null,
          damage_dealt: stat.damage_dealt,
          enemies_killed: stat.enemies_killed,
          bosses_defeated: stat.bosses_defeated,
        };
      });

      setTopPlayers(leaderboard);
      setLoading(false);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-64 h-fit">
        <HabboPanel title="⭐ Daily Leaders">
          <div className="h-32 flex items-center justify-center">
            <LoadingSpinner />
          </div>
        </HabboPanel>
      </div>
    );
  }

  if (topPlayers.length === 0) {
    return (
      <div className="w-64 h-fit">
        <HabboPanel title="⭐ Daily Leaders">
          <div className="text-center py-4">
            <Trophy className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No battles today yet!</p>
          </div>
        </HabboPanel>
      </div>
    );
  }

  return (
    <div className="w-64 h-fit">
      <HabboPanel title="⭐ Daily Leaders">
        <ScrollArea className="h-[400px] pr-2">
          <div className="space-y-3">
            {topPlayers.map((player, index) => {
              const displayName = player.habbo_username || player.username.split('@')[0];
              const avatarUrl = player.figureString 
                ? `https://www.habbo.com/habbo-imaging/avatarimage?figure=${player.figureString}&size=s&direction=2&head_direction=2&gesture=std`
                : null;

              return (
                <div
                  key={player.user_id}
                  className="flex items-center gap-3 p-2 bg-background/50 rounded-lg border-2 border-habbo-dark/30 hover:border-primary/50 transition-colors"
                >
                  {/* Rank Badge */}
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary/20 border-2 border-primary font-bold text-sm">
                    #{index + 1}
                  </div>

                  {/* Avatar */}
                  <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-background rounded border-2 border-habbo-dark">
                    {avatarUrl ? (
                      <img 
                        src={avatarUrl} 
                        alt={displayName}
                        className="w-full h-full object-contain pixel-icon"
                      />
                    ) : (
                      <div className="w-6 h-6 bg-muted rounded-full" />
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{displayName}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Swords className="w-3 h-3" />
                        {player.damage_dealt.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Skull className="w-3 h-3" />
                        {player.enemies_killed}
                      </span>
                      {player.bosses_defeated > 0 && (
                        <span className="flex items-center gap-1 text-primary">
                          <Trophy className="w-3 h-3" />
                          {player.bosses_defeated}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </HabboPanel>
    </div>
  );
};
