'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { DestinationInfoCard } from '@/components/DestinationInfoCard';
import { ExportMapsButton } from '@/components/ExportMapsButton';
import {
  ItineraryBottomSheet,
  type SheetSnap,
} from '@/components/ItineraryBottomSheet';
import { ItineraryPanel } from '@/components/ItineraryPanel';
import { OfflineBanner } from '@/components/OfflineBanner';
import { RescuePanel } from '@/components/RescuePanel';
import { SearchForm, type SearchFormValues } from '@/components/SearchForm';
import { ShareTripButton } from '@/components/ShareTripButton';
import { SosButton } from '@/components/SosButton';
import { Toast } from '@/components/Toast';
import { TripMap } from '@/components/TripMap';
import {
  getLatestCachedTrip,
  isBrowserOffline,
  saveTripToCache,
} from '@/lib/offline/tripCache';
import {
  DEFAULT_USER_PROFILE,
  transportToTravelMode,
} from '@/lib/travelProfile';
import type { NearbyFacilityType, NearbyPlace } from '@/services/mapService';
import type {
  ScheduleItem,
  TravelMode,
  TripGeneratorResponse,
  UserTravelProfile,
  RescueModeResponse,
} from '@/types/database';
import { toFocusTarget, type PlaceFocusTarget } from '@/utils/placeKey';
import { replaceSlotAndRecalculate } from '@/utils/timeCalculator';

const FACILITY_LABEL: Record<NearbyFacilityType, string> = {
  convenience_store: '超商',
  atm: 'ATM',
  drugstore: '藥妝店',
  toilet: '廁所',
};

export function TripPlannerApp() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trip, setTrip] = useState<TripGeneratorResponse | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [rescue, setRescue] = useState<RescueModeResponse | null>(null);
  const [activeDay, setActiveDay] = useState<number | 'all'>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<PlaceFocusTarget | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('half');
  const [offline, setOffline] = useState(false);
  const [usingCache, setUsingCache] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [userProfile, setUserProfile] =
    useState<UserTravelProfile>(DEFAULT_USER_PROFILE);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [exploring, setExploring] = useState(false);

  const handleSelectPlace = useCallback(
    (key: string, target: PlaceFocusTarget) => {
      setSelectedKey(key);
      setFocusTarget({ ...target });
      setSheetSnap('mapFocus');
    },
    [],
  );

  const travelMode: TravelMode = useMemo(
    () =>
      transportToTravelMode(
        trip?.user_profile?.transport ?? userProfile.transport,
      ),
    [trip?.user_profile?.transport, userProfile.transport],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  const applyTrip = useCallback(
    (nextTrip: TripGeneratorResponse, nextTripId?: string | null) => {
      setTrip(nextTrip);
      setTripId(nextTripId ?? null);
      setActiveDay('all');
      setNearbyPlaces([]);
      setHoverKey(null);
      setSheetSnap('half');

      const firstDay = nextTrip.itinerary[0];
      const firstItem = firstDay?.schedule[0];
      if (firstDay && firstItem) {
        const target = toFocusTarget(firstDay.day, 0, firstItem);
        setSelectedKey(target.key);
        setFocusTarget(null);
      } else {
        setSelectedKey(null);
        setFocusTarget(null);
      }

      if (nextTrip.user_profile) {
        setUserProfile(nextTrip.user_profile);
      }
    },
    [],
  );

  useEffect(() => {
    const updateOnline = () => {
      setOffline(isBrowserOffline());
    };

    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    const cached = getLatestCachedTrip();
    if (!cached) return;

    if (
      searchParams.get('fromShare') === '1' ||
      searchParams.get('tripId') ||
      isBrowserOffline()
    ) {
      applyTrip(
        cached.trip,
        cached.tripId.startsWith('local-') ? null : cached.tripId,
      );
      setUsingCache(true);
      if (isBrowserOffline()) {
        setOffline(true);
      }
    }
  }, [applyTrip, searchParams]);

  const persistTrip = useCallback(
    async (nextTrip: TripGeneratorResponse): Promise<string | null> => {
      try {
        const response = await fetch('/api/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trip: nextTrip,
            is_public: false,
            trip_id: tripId ?? undefined,
          }),
        });

        const json = (await response.json()) as {
          data?: { id: string };
          error?: string;
        };

        if (!response.ok || !json.data) {
          throw new Error(json.error ?? '儲存失敗');
        }

        saveTripToCache(json.data.id, nextTrip);
        return json.data.id;
      } catch {
        const localId = tripId ?? `local-${Date.now()}`;
        saveTripToCache(localId, nextTrip);
        return localId.startsWith('local-') ? null : localId;
      }
    },
    [tripId],
  );

  async function handleGenerate(values: SearchFormValues) {
    setLoading(true);
    setError(null);
    setRescue(null);
    setUsingCache(false);
    setUserProfile(values.user_profile);

    if (isBrowserOffline()) {
      const cached = getLatestCachedTrip();
      if (cached) {
        applyTrip(
          cached.trip,
          cached.tripId.startsWith('local-') ? null : cached.tripId,
        );
        setUsingCache(true);
        setOffline(true);
        setError('目前離線，已改顯示本機快取行程');
      } else {
        setError('目前離線，且沒有可顯示的快取行程');
      }
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/generate-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: values.destination,
          total_days: values.total_days,
          preferences: values.preferences,
          notes: values.notes || null,
          locale: 'zh-TW',
          user_profile: values.user_profile,
        }),
      });

      const json = (await response.json()) as {
        data?: TripGeneratorResponse;
        error?: string;
      };

      if (!response.ok || !json.data) {
        throw new Error(json.error ?? '行程生成失敗');
      }

      const savedId = await persistTrip(json.data);
      applyTrip(json.data, savedId);
      showToast('行程已生成，並快取到本機');
    } catch (err) {
      const cached = getLatestCachedTrip();
      if (cached) {
        applyTrip(
          cached.trip,
          cached.tripId.startsWith('local-') ? null : cached.tripId,
        );
        setUsingCache(true);
        setError(
          `${err instanceof Error ? err.message : '行程生成失敗'}；已改顯示快取資料`,
        );
      } else {
        setError(err instanceof Error ? err.message : '行程生成失敗');
      }
    } finally {
      setLoading(false);
    }
  }

  const handleReplaceSlot = useCallback(
    async (
      day: number,
      index: number,
      replacement: ScheduleItem,
      why: string,
    ) => {
      if (!trip) return;

      const nextItinerary = trip.itinerary.map((d) => {
        if (d.day !== day) return d;
        return {
          ...d,
          schedule: replaceSlotAndRecalculate(d.schedule, index, replacement),
        };
      });

      const nextTrip: TripGeneratorResponse = {
        ...trip,
        itinerary: nextItinerary,
        user_profile: trip.user_profile ?? userProfile,
      };

      setTrip(nextTrip);
      const target = toFocusTarget(day, index, replacement);
      setSelectedKey(target.key);
      setFocusTarget(target);
      setNearbyPlaces([]);
      const savedId = await persistTrip(nextTrip);
      if (savedId) setTripId(savedId);
      showToast(why ? `已替換：${why}` : `已替換為 ${replacement.place_name}`);
    },
    [persistTrip, showToast, trip, userProfile],
  );

  const handleExploreBetween = useCallback(
    async (
      day: number,
      fromIndex: number,
      toIndex: number,
      facility: NearbyFacilityType,
    ) => {
      if (!trip || exploring) return;

      const dayData = trip.itinerary.find((d) => d.day === day);
      const from = dayData?.schedule[fromIndex];
      const to = dayData?.schedule[toIndex];
      if (!from || !to) return;

      setExploring(true);
      try {
        const response = await fetch('/api/nearby-along-route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: {
              latitude: from.latitude,
              longitude: from.longitude,
            },
            to: {
              latitude: to.latitude,
              longitude: to.longitude,
            },
            facility,
          }),
        });

        const json = (await response.json()) as {
          data?: { places: NearbyPlace[] };
          error?: string;
        };

        if (!response.ok || !json.data) {
          throw new Error(json.error ?? '順路探索失敗');
        }

        setNearbyPlaces(json.data.places);
        setActiveDay(day);
        showToast(
          json.data.places.length > 0
            ? `找到 ${json.data.places.length} 處順路${FACILITY_LABEL[facility]}`
            : `這段路上沒找到${FACILITY_LABEL[facility]}`,
        );
      } catch (err) {
        setNearbyPlaces([]);
        showToast(err instanceof Error ? err.message : '順路探索失敗');
      } finally {
        setExploring(false);
      }
    },
    [exploring, showToast, trip],
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <OfflineBanner offline={offline || (usingCache && Boolean(error))} />

      <header className="animate-rise mb-8 max-w-2xl">
        <p className="text-sm font-medium tracking-[0.18em] text-[var(--sea)] uppercase">
          PathRescue
        </p>
        <h1 className="font-display mt-2 text-4xl leading-tight text-[var(--ink)] sm:text-5xl">
          AI 智慧旅遊導航與救援
        </h1>
        <p className="mt-3 max-w-xl text-base text-[var(--ink-soft)]">
          依偏好生成可落地的行程，用地圖校正真實景點，現場突發狀況一鍵重排備案。也可加入主畫面，離線查看快取行程。
        </p>
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <div className="rounded-2xl border border-[var(--line)] bg-white/50 p-5 backdrop-blur-sm">
            <SearchForm loading={loading} onSubmit={handleGenerate} />
            {error && (
              <p className="mt-4 rounded-lg bg-[rgba(180,35,24,0.08)] px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </p>
            )}
          </div>

          <SosButton
            onRescue={(payload) => {
              setRescue(payload);
              setError(null);
            }}
            onError={(message) => setError(message)}
          />

          <RescuePanel rescue={rescue} />
        </aside>

        <main className="min-h-[70vh]">
          {!trip ? (
            <div className="animate-rise-delay-1 flex h-full min-h-[420px] items-end rounded-2xl border border-dashed border-[var(--line)] bg-[rgba(15,107,92,0.06)] p-8">
              <div className="max-w-md">
                <h2 className="font-display text-3xl text-[var(--ink)]">
                  先選一個城市
                </h2>
                <p className="mt-2 text-[var(--ink-soft)]">
                  生成後會在這裡展開路線地圖與每日行程卡片，點擊卡片可高亮對應標記。
                </p>
              </div>
            </div>
          ) : (
            <div className="animate-rise flex h-full min-h-0 flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs tracking-wide text-[var(--ink-soft)] uppercase">
                    {trip.destination} · {trip.total_days} 天
                    {tripId ? ` · #${tripId.slice(0, 8)}` : ''}
                  </p>
                  <h2 className="font-display text-3xl text-[var(--ink)]">
                    {trip.trip_title}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ShareTripButton
                    trip={trip}
                    tripId={tripId}
                    onTripIdChange={setTripId}
                    onToast={showToast}
                  />
                  <ExportMapsButton trip={trip} travelMode={travelMode} />
                </div>
              </div>

              <DestinationInfoCard
                destination={trip.destination}
                essentials={trip.destination_essentials}
              />

              <div className="relative min-h-[70vh] flex-1 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:gap-4">
                <div className="h-[70vh] min-h-[320px] lg:h-auto lg:min-h-[480px]">
                  <TripMap
                    trip={trip}
                    selectedKey={selectedKey}
                    highlightKey={hoverKey}
                    focusTarget={focusTarget}
                    activeDay={activeDay}
                    nearbyPlaces={nearbyPlaces}
                    onSelect={handleSelectPlace}
                  />
                </div>

                {/* Desktop side panel */}
                <div className="hidden min-h-[360px] rounded-2xl border border-[var(--line)] bg-white/50 p-4 backdrop-blur-sm lg:block xl:min-h-0">
                  <ItineraryPanel
                    days={trip.itinerary}
                    activeDay={activeDay}
                    selectedKey={selectedKey}
                    destination={trip.destination}
                    userProfile={trip.user_profile ?? userProfile}
                    travelMode={travelMode}
                    onSelectDay={(day) => {
                      setActiveDay(day);
                      setNearbyPlaces([]);
                      setFocusTarget(null);
                    }}
                    onSelectPlace={handleSelectPlace}
                    onHoverPlace={setHoverKey}
                    onReplaceSlot={handleReplaceSlot}
                    onExploreBetween={handleExploreBetween}
                  />
                </div>

                {/* Mobile bottom sheet */}
                <ItineraryBottomSheet
                  snap={sheetSnap}
                  onSnapChange={setSheetSnap}
                  title={`${trip.destination} 行程`}
                >
                  <ItineraryPanel
                    days={trip.itinerary}
                    activeDay={activeDay}
                    selectedKey={selectedKey}
                    destination={trip.destination}
                    userProfile={trip.user_profile ?? userProfile}
                    travelMode={travelMode}
                    onSelectDay={(day) => {
                      setActiveDay(day);
                      setNearbyPlaces([]);
                      setFocusTarget(null);
                      setSheetSnap('half');
                    }}
                    onSelectPlace={handleSelectPlace}
                    onHoverPlace={setHoverKey}
                    onReplaceSlot={handleReplaceSlot}
                    onExploreBetween={handleExploreBetween}
                  />
                </ItineraryBottomSheet>
              </div>
            </div>
          )}
        </main>
      </div>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
