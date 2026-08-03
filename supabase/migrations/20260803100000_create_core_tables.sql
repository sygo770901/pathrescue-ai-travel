-- =============================================================================
-- Migration: Create core tables for AI Travel Planner MVP
-- Tables: users, trips, itineraries, affiliate_logs
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------
CREATE TYPE public.subscription_tier AS ENUM ('free', 'pro');
CREATE TYPE public.trip_status AS ENUM ('draft', 'generating', 'ready', 'archived');
CREATE TYPE public.place_category AS ENUM ('attraction', 'food', 'shopping', 'accommodation');
CREATE TYPE public.affiliate_type AS ENUM ('klook', 'kkday', 'agoda', 'none');

-- -----------------------------------------------------------------------------
-- users
-- Extends Supabase Auth (auth.users). One profile row per authenticated user.
-- -----------------------------------------------------------------------------
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  subscription_tier public.subscription_tier NOT NULL DEFAULT 'free',
  -- Free-tier usage counter (reset / capped by application + Redis rate limiter)
  request_count INTEGER NOT NULL DEFAULT 0,
  request_count_reset_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
  locale TEXT NOT NULL DEFAULT 'zh-TW',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_not_empty CHECK (char_length(trim(email)) > 0),
  CONSTRAINT users_request_count_non_negative CHECK (request_count >= 0)
);

CREATE INDEX idx_users_email ON public.users (email);
CREATE INDEX idx_users_subscription_tier ON public.users (subscription_tier);

COMMENT ON TABLE public.users IS 'Application user profiles linked to auth.users';
COMMENT ON COLUMN public.users.request_count IS 'Monthly AI generation request counter for free-tier limits';

-- -----------------------------------------------------------------------------
-- trips
-- High-level trip metadata. Full AI JSON payload is also stored for replay.
-- -----------------------------------------------------------------------------
CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  trip_title TEXT NOT NULL,
  destination TEXT NOT NULL,
  total_days INTEGER NOT NULL,
  -- Preference tags from search form: e.g. ['food', 'photo', 'outdoor', 'family']
  preferences TEXT[] NOT NULL DEFAULT '{}',
  status public.trip_status NOT NULL DEFAULT 'draft',
  -- Complete AI response payload matching TripGeneratorResponse
  generated_payload JSONB,
  -- Optional start date for calendar / Maps export
  start_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT trips_total_days_positive CHECK (total_days >= 1 AND total_days <= 30),
  CONSTRAINT trips_title_not_empty CHECK (char_length(trim(trip_title)) > 0),
  CONSTRAINT trips_destination_not_empty CHECK (char_length(trim(destination)) > 0)
);

CREATE INDEX idx_trips_user_id ON public.trips (user_id);
CREATE INDEX idx_trips_status ON public.trips (status);
CREATE INDEX idx_trips_destination ON public.trips (destination);
CREATE INDEX idx_trips_created_at ON public.trips (created_at DESC);
CREATE INDEX idx_trips_generated_payload_gin ON public.trips USING GIN (generated_payload);

COMMENT ON TABLE public.trips IS 'User travel trips with AI-generated itinerary metadata';
COMMENT ON COLUMN public.trips.generated_payload IS 'Full TripGeneratorResponse JSON from the LLM';

-- -----------------------------------------------------------------------------
-- itineraries
-- One row per day in a trip. schedule is the ScheduleItem[] JSON array.
-- -----------------------------------------------------------------------------
CREATE TABLE public.itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  theme TEXT NOT NULL,
  -- Array of ScheduleItem objects (see src/types/database.ts)
  -- Example element:
  -- {
  --   "time_slot": "09:00 - 11:30",
  --   "place_name": "Senso-ji Temple",
  --   "category": "attraction",
  --   "estimated_stay_mins": 90,
  --   "latitude": 35.7148,
  --   "longitude": 139.7967,
  --   "reason_to_visit": "...",
  --   "suggested_affiliate_type": "klook",
  --   "affiliate_search_query": "Senso-ji temple tour",
  --   "place_id": null,
  --   "photo_url": null,
  --   "opening_hours": null
  -- }
  schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT itineraries_day_positive CHECK (day >= 1),
  CONSTRAINT itineraries_theme_not_empty CHECK (char_length(trim(theme)) > 0),
  CONSTRAINT itineraries_schedule_is_array CHECK (jsonb_typeof(schedule) = 'array'),
  CONSTRAINT itineraries_trip_day_unique UNIQUE (trip_id, day)
);

CREATE INDEX idx_itineraries_trip_id ON public.itineraries (trip_id);
CREATE INDEX idx_itineraries_trip_day ON public.itineraries (trip_id, day);
CREATE INDEX idx_itineraries_schedule_gin ON public.itineraries USING GIN (schedule);

COMMENT ON TABLE public.itineraries IS 'Per-day itinerary rows; schedule stores ScheduleItem JSON array';
COMMENT ON COLUMN public.itineraries.schedule IS 'JSONB array of ScheduleItem matching System Prompt schema';

-- -----------------------------------------------------------------------------
-- affiliate_logs
-- Tracks affiliate deep-link impressions / clicks for monetization analytics.
-- -----------------------------------------------------------------------------
CREATE TABLE public.affiliate_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users (id) ON DELETE SET NULL,
  trip_id UUID REFERENCES public.trips (id) ON DELETE SET NULL,
  place_name TEXT NOT NULL,
  affiliate_type public.affiliate_type NOT NULL,
  affiliate_url TEXT NOT NULL,
  search_query TEXT,
  -- 'impression' | 'click' | 'conversion' stored as text for flexibility
  event_type TEXT NOT NULL DEFAULT 'click',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT affiliate_logs_place_name_not_empty CHECK (char_length(trim(place_name)) > 0),
  CONSTRAINT affiliate_logs_url_not_empty CHECK (char_length(trim(affiliate_url)) > 0),
  CONSTRAINT affiliate_logs_event_type_valid CHECK (
    event_type IN ('impression', 'click', 'conversion')
  )
);

CREATE INDEX idx_affiliate_logs_user_id ON public.affiliate_logs (user_id);
CREATE INDEX idx_affiliate_logs_trip_id ON public.affiliate_logs (trip_id);
CREATE INDEX idx_affiliate_logs_affiliate_type ON public.affiliate_logs (affiliate_type);
CREATE INDEX idx_affiliate_logs_created_at ON public.affiliate_logs (created_at DESC);
CREATE INDEX idx_affiliate_logs_event_type ON public.affiliate_logs (event_type);

COMMENT ON TABLE public.affiliate_logs IS 'Affiliate link events for Klook / KKday / Agoda monetization';

-- -----------------------------------------------------------------------------
-- updated_at trigger helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_itineraries_updated_at
  BEFORE UPDATE ON public.itineraries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Auto-create public.users row when a new auth.users account is created
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      NEW.raw_user_meta_data ->> 'full_name',
      split_part(COALESCE(NEW.email, 'user'), '@', 1)
    ),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Row Level Security (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_logs ENABLE ROW LEVEL SECURITY;

-- users policies
CREATE POLICY "users_select_own"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "users_update_own"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- trips policies
CREATE POLICY "trips_select_own"
  ON public.trips
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "trips_insert_own"
  ON public.trips
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "trips_update_own"
  ON public.trips
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "trips_delete_own"
  ON public.trips
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- itineraries policies (via parent trip ownership)
CREATE POLICY "itineraries_select_own"
  ON public.itineraries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = itineraries.trip_id
        AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "itineraries_insert_own"
  ON public.itineraries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = itineraries.trip_id
        AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "itineraries_update_own"
  ON public.itineraries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = itineraries.trip_id
        AND trips.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = itineraries.trip_id
        AND trips.user_id = auth.uid()
    )
  );

CREATE POLICY "itineraries_delete_own"
  ON public.itineraries
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = itineraries.trip_id
        AND trips.user_id = auth.uid()
    )
  );

-- affiliate_logs policies
CREATE POLICY "affiliate_logs_select_own"
  ON public.affiliate_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "affiliate_logs_insert_own"
  ON public.affiliate_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Service role / backend can insert anonymous impression logs; authenticated users insert own.
CREATE POLICY "affiliate_logs_insert_anon_impression"
  ON public.affiliate_logs
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL AND event_type IN ('impression', 'click'));
