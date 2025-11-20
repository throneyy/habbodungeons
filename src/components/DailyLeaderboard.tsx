import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";
import { LoadingSpinner } from "./LoadingSpinner";

interface LeaderboardEntry {
  user_id: string;
  username: string;
  habbo_username: string | null;
  figureString: string | null;
  xp_gained: number;
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
      // Get today's top players by XP gained
      const { data: statsData, error } = await supabase
        .from('daily_stats')
        .select(`
          user_id,
          xp_gained
        `)
        .eq('stat_date', new Date().toISOString().split('T')[0])
        .order('xp_gained', { ascending: false })
        .limit(10);

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
          xp_gained: stat.xp_gained,
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
      <div className="w-full h-20 bg-card border-4 border-habbo-dark rounded-xl shadow-lg flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (topPlayers.length === 0) {
    return (
      <div className="w-full h-20 bg-card border-4 border-habbo-dark rounded-xl shadow-lg flex items-center justify-center gap-2">
        <Trophy className="w-5 h-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No battles today yet!</p>
      </div>
    );
  }

  return (
    <div className="w-full h-20 bg-card border-4 border-habbo-dark rounded-xl shadow-lg overflow-hidden relative">
      {/* Header with descriptor */}
      <div className="absolute top-0 left-0 right-0 px-3 py-1 bg-muted/40 backdrop-blur-sm border-b-2 border-habbo-dark/20 z-10">
        <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
          <Trophy className="w-3 h-3 text-yellow-500" />
          Top adventurers by XP gained today
        </p>
      </div>

      {/* Sliding container with animation */}
      <div className="absolute inset-0 flex items-center pt-7">
        <div className="flex gap-4 px-4 animate-[slide-in-right_25s_linear_infinite]">
          {/* Duplicate the list for seamless loop */}
          {[...topPlayers, ...topPlayers].map((player, index) => {
            const displayName = player.habbo_username || player.username.split('@')[0];
            const rank = (index % topPlayers.length) + 1;
            
            return (
              <div 
                key={`${player.user_id}-${index}`}
                className="flex items-center gap-3 flex-shrink-0 bg-muted/30 rounded-lg px-4 py-2 border-2 border-habbo-dark/20"
              >
                {/* Rank Badge */}
                <div className={`
                  flex items-center justify-center w-7 h-7 rounded-full font-black text-sm
                  ${rank === 1 ? 'bg-yellow-500/20 text-yellow-500 border-2 border-yellow-500' : ''}
                  ${rank === 2 ? 'bg-gray-400/20 text-gray-400 border-2 border-gray-400' : ''}
                  ${rank === 3 ? 'bg-amber-700/20 text-amber-700 border-2 border-amber-700' : ''}
                  ${rank > 3 ? 'bg-muted text-muted-foreground' : ''}
                `}>
                  #{rank}
                </div>

                {/* Habbo Avatar or Placeholder - Full Resolution */}
                {player.figureString ? (
                  <img 
                    src={`https://www.habbo.com/habbo-imaging/avatarimage?figure=${player.figureString}&size=l&direction=2&head_direction=3`}
                    alt={displayName}
                    className="w-12 h-12 pixelated"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-primary" />
                  </div>
                )}

                {/* Player Info */}
                <div className="flex flex-col">
                  <span className="text-base font-bold leading-tight">{displayName}</span>
                  <span className="text-sm text-primary font-bold leading-tight">
                    ✨ {player.xp_gained} XP
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
