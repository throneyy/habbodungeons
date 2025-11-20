-- Create a table for daily player statistics
CREATE TABLE public.daily_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  damage_dealt INTEGER NOT NULL DEFAULT 0,
  enemies_killed INTEGER NOT NULL DEFAULT 0,
  quests_completed INTEGER NOT NULL DEFAULT 0,
  bosses_defeated INTEGER NOT NULL DEFAULT 0,
  dice_rolls_made INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, stat_date)
);

-- Enable Row Level Security
ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;

-- Anyone can view leaderboard stats
CREATE POLICY "Anyone can view daily stats"
ON public.daily_stats
FOR SELECT
USING (true);

-- Users can update their own stats
CREATE POLICY "Users can update own stats"
ON public.daily_stats
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create index for faster leaderboard queries
CREATE INDEX idx_daily_stats_date_damage ON public.daily_stats(stat_date DESC, damage_dealt DESC);
CREATE INDEX idx_daily_stats_user_date ON public.daily_stats(user_id, stat_date);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_daily_stats_updated_at
BEFORE UPDATE ON public.daily_stats
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();