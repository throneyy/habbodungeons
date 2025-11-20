-- Create rate limiting table
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  last_action_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action_count INT DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, action_type)
);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Users can view their own rate limits
CREATE POLICY "Users can view own rate limits" ON public.rate_limits
  FOR SELECT USING (auth.uid() = user_id);

-- Users can manage their own rate limits
CREATE POLICY "Users can manage own rate limits" ON public.rate_limits
  FOR ALL USING (auth.uid() = user_id);

-- Create verification attempts table for password reset security
CREATE TABLE IF NOT EXISTS public.verification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  attempts INT DEFAULT 1,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.verification_attempts ENABLE ROW LEVEL SECURITY;

-- Only the system can manage verification attempts (through service role)
CREATE POLICY "Service role only" ON public.verification_attempts
  FOR ALL USING (false);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_verification_attempts_username ON public.verification_attempts(username);
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action ON public.rate_limits(user_id, action_type);