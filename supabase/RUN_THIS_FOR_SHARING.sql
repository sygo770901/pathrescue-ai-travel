-- =============================================================================
-- PathRescue：啟用「雲端公開分享」
-- 請到 Supabase Dashboard → SQL Editor → New query → 整段貼上 → Run
-- =============================================================================

-- 1) 允許未登入也可建立/擁有行程（匿名分享）
ALTER TABLE public.trips
  ALTER COLUMN user_id DROP NOT NULL;

-- 2) 公開分享開關
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_trips_is_public
  ON public.trips (is_public)
  WHERE is_public = true;

COMMENT ON COLUMN public.trips.is_public IS
  'When true, trip can be viewed via /share/[tripId] without auth';

-- 3) 任何人可讀「已公開」的行程
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

-- 完成後：回到 PathRescue 再按「複製分享連結」
-- 成功時應顯示「分享連結已複製到剪貼簿」（不再是本機分享備援）
