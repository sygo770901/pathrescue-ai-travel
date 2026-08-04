-- =============================================================================
-- Add public sharing support for trips
-- =============================================================================

ALTER TABLE public.trips
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_trips_is_public
  ON public.trips (is_public)
  WHERE is_public = true;

COMMENT ON COLUMN public.trips.is_public IS 'When true, trip can be viewed via /share/[tripId] without auth';

-- Public read for shared trips
DROP POLICY IF EXISTS "trips_select_public" ON public.trips;
CREATE POLICY "trips_select_public"
  ON public.trips
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

DROP POLICY IF EXISTS "itineraries_select_public" ON public.itineraries;
CREATE POLICY "itineraries_select_public"
  ON public.itineraries
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.trips
      WHERE trips.id = itineraries.trip_id
        AND trips.is_public = true
    )
  );
