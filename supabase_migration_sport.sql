-- ==============================================================================
-- 🚀 NOUBLE SPORT & MUSIC - SUPABASE DATABASE MIGRATION
-- Copy and paste this script into your Supabase Dashboard:
-- Supabase -> SQL Editor -> New query -> Paste & Run (Ctrl+Enter / Cmd+Enter)
-- ==============================================================================

-- 1. Enable UUID Extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Add athletic stats columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_distance_km NUMERIC DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_workouts INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_duration_sec INTEGER DEFAULT 0;

-- 3. Create activities table (Strava-style GPS Run/Walk Records)
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('run', 'walk', 'cycle')),
  total_time INTEGER NOT NULL DEFAULT 0, -- in seconds
  total_distance NUMERIC NOT NULL DEFAULT 0, -- in km
  total_steps INTEGER DEFAULT 0,
  average_pace TEXT, -- e.g. "5:30 min/km"
  average_speed NUMERIC DEFAULT 0, -- in km/h
  route_coordinates JSONB DEFAULT '[]'::jsonb, -- Array of { latitude, longitude }
  calories INTEGER DEFAULT 0,
  notes TEXT,
  altitude NUMERIC,
  pressure NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Index for fast queries
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON public.activities(user_id, created_at DESC);

-- 5. Trigger to automatically update athlete stats in profiles on every new workout
CREATE OR REPLACE FUNCTION public.handle_new_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET
    total_distance_km = COALESCE(total_distance_km, 0) + COALESCE(NEW.total_distance, 0),
    total_workouts = COALESCE(total_workouts, 0) + 1,
    total_duration_sec = COALESCE(total_duration_sec, 0) + COALESCE(NEW.total_time, 0),
    updated_at = NOW()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_activity_created ON public.activities;
CREATE TRIGGER on_activity_created
  AFTER INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_activity();

-- 6. Enable Row Level Security (RLS) on activities
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own activities" ON public.activities;
CREATE POLICY "Users can view own activities" ON public.activities
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own activities" ON public.activities;
CREATE POLICY "Users can insert own activities" ON public.activities
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own activities" ON public.activities;
CREATE POLICY "Users can delete own activities" ON public.activities
  FOR DELETE USING (auth.uid() = user_id);

-- 7. Ensure music_likes table and its policies exist (Spotify-style saved songs)
CREATE TABLE IF NOT EXISTS public.music_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  thumbnail TEXT,
  duration INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_music_likes_user_id ON public.music_likes(user_id);

ALTER TABLE public.music_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own music likes" ON public.music_likes;
CREATE POLICY "Users can view own music likes" ON public.music_likes
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own music likes" ON public.music_likes;
CREATE POLICY "Users can manage own music likes" ON public.music_likes
  FOR ALL USING (auth.uid() = user_id);
