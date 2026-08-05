'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { DestinationInfoCard } from '@/components/DestinationInfoCard';
import { ExportMapsButton } from '@/components/ExportMapsButton';
import { GenerationProgress } from '@/components/GenerationProgress';
import {
  ItineraryBottomSheet,
  type SheetSnap,
} from '@/components/ItineraryBottomSheet';
import { ItineraryPanel } from '@/components/ItineraryPanel';
import { ModeToggle } from '@/components/ModeToggle';
import { OfflineBanner } from '@/components/OfflineBanner';
import { OnTripFocusCard } from '@/components/OnTripFocusCard';
import { RegenerateSlotModal } from '@/components/RegenerateSlotModal';
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
import {
  findNextFocusSlot,
  getTodayTripDay,
  loadModeOverride,
  resolveAppTripMode,
  saveModeOverride,
  type ModeOverride,
} from '@/lib/tripMode';
import type { NearbyFacilityType, NearbyPlace } from '@/services/mapService';
import type {
  RescueAlternativePlace,
  RescueModeResponse,
  ScheduleItem,
  TravelMode,
  TripGeneratorResponse,
  UserTravelProfile,
} from '@/types/database';
import { toFocusTarget, type PlaceFocusTarget } from '@/utils/placeKey';
import { rescuePlaceToScheduleItem } from '@/utils/rescueApply';
import {
  insertSlotAndRecalculate,
  replaceSlotAndRecalculate,
  setSlotStatus,
} from '@/utils/timeCalculator';

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
  const [showRescueForm, setShowRescueForm] = useState(false);
  const [activeDay, setActiveDay] = useState<number | 'all'>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<PlaceFocusTarget | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('half');
  const [modeOverride, setModeOverride] = useState<ModeOverride>('auto');
  const [offline, setOffline] = useState(false);
  const [usingCache, setUsingCache] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [userProfile, setUserProfile] =
    useState<UserTravelProfile>(DEFAULT_USER_PROFILE);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [exploring, setExploring] = useState(false);
  const [regenFocusOpen, setRegenFocusOpen] = useState(false);

  const travelMode: TravelMode = useMemo(
    () =>
      transportToTravelMode(
        trip?.user_profile?.transport ?? userProfile.transport,
      ),
    [trip?.user_profile?.transport, userProfile.transport],
  );

  const appMode = useMemo(
    () => resolveAppTripMode(trip, modeOverride),
    [trip, modeOverride],
  );

  const todayDay = useMemo(
    () => (trip ? getTodayTripDay(trip) : null),
    [trip],
  );

  const onTripDay = useMemo(() => {
    if (appMode !== 'ontrip' || !trip) return null;
    return todayDay ?? trip.itinerary[0]?.day ?? 1;
  }, [appMode, todayDay, trip]);

  const focusSlot = useMemo(() => {
    if (!trip || onTripDay == null) return null;
    return findNextFocusSlot(trip, onTripDay);
  }, [trip, onTripDay]);

  const canAutoOnTrip = todayDay !== null;

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  const handleSelectPlace = useCallback(
    (key: string, target: PlaceFocusTarget) => {
      setSelectedKey(key);
      setFocusTarget({ ...target });
      setSheetSnap('mapFocus');
    },
    [],
  );

  const handleModeOverride = useCallback((next: ModeOverride) => {
    setModeOverride(next);
    saveModeOverride(next);
    if (next === 'planning') setSheetSnap('half');
    if (next === 'ontrip') setSheetSnap('mapFocus');
  }, []);

  useEffect(() => {
    setModeOverride(loadModeOverride());
    // Soft prune on boot — keep newest trips only
    try {
      const latest = getLatestCachedTrip();
      if (latest?.tripId) {
        saveTripToCache(latest.tripId, latest.trip, {
          isPublic: latest.isPublic,
        });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (appMode === 'ontrip' && onTripDay != null) {
      setActiveDay(onTripDay);
      setSheetSnap((prev) => (prev === 'full' ? prev : 'mapFocus'));
    }
  }, [appMode, onTripDay]);

  const applyTrip = useCallback(
    (nextTrip: TripGeneratorResponse, nextTripId?: string | null) => {
      setTrip(nextTrip);
      setTripId(nextTripId ?? null);
      setNearbyPlaces([]);
      setHoverKey(null);
      setRescue(null);
      setShowRescueForm(false);

      const autoDay = getTodayTripDay(nextTrip);
      if (autoDay != null) {
        setActiveDay(autoDay);
        setSheetSnap('mapFocus');
      } else {
        setActiveDay('all');
        setSheetSnap('half');
      }

      const firstDay = nextTrip.itinerary[0];
      const firstItem = firstDay?.schedule[0];
      if (firstDay && firstItem) {
        setSelectedKey(toFocusTarget(firstDay.day, 0, firstItem).key);
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
    const updateOnline = () => setOffline(isBrowserOffline());
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
      if (isBrowserOffline()) setOffline(true);
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
          start_date: values.start_date,
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

      const withDate: TripGeneratorResponse = {
        ...json.data,
        start_date: json.data.start_date ?? values.start_date,
      };

      const savedId = await persistTrip(withDate);
      applyTrip(withDate, savedId);
      showToast(
        `行程已生成：${withDate.itinerary.length} 天（共 ${withDate.total_days} 天）`,
      );
    } catch (err) {
      const cached = getLatestCachedTrip();
      const rawMessage =
        err instanceof Error ? err.message : '行程生成失敗';
      const friendly = /quota|exceeded|setItem/i.test(rawMessage)
        ? '本機暫存空間不足，已自動清理；請再按一次生成'
        : rawMessage;

      if (cached) {
        applyTrip(
          cached.trip,
          cached.tripId.startsWith('local-') ? null : cached.tripId,
        );
        setUsingCache(true);
        setError(`${friendly}；已改顯示快取資料`);
      } else {
        setError(friendly);
      }
    } finally {
      setLoading(false);
    }
  }

  const updateTripDays = useCallback(
    async (
      mutator: (current: TripGeneratorResponse) => TripGeneratorResponse,
      toastMsg?: string,
    ) => {
      if (!trip) return;
      const nextTrip = mutator(trip);
      setTrip(nextTrip);
      const savedId = await persistTrip(nextTrip);
      if (savedId) setTripId(savedId);
      if (toastMsg) showToast(toastMsg);
    },
    [persistTrip, showToast, trip],
  );

  const handleReplaceSlot = useCallback(
    async (
      day: number,
      index: number,
      replacement: ScheduleItem,
      why: string,
    ) => {
      await updateTripDays(
        (current) => ({
          ...current,
          itinerary: current.itinerary.map((d) =>
            d.day !== day
              ? d
              : {
                  ...d,
                  schedule: replaceSlotAndRecalculate(
                    d.schedule,
                    index,
                    replacement,
                  ),
                },
          ),
        }),
        why ? `已替換：${why}` : `已替換為 ${replacement.place_name}`,
      );
      setFocusTarget(toFocusTarget(day, index, replacement));
      setSelectedKey(toFocusTarget(day, index, replacement).key);
      setNearbyPlaces([]);
    },
    [updateTripDays],
  );

  const applyRescuePlace = useCallback(
    async (place: RescueAlternativePlace, mode: 'replace' | 'insert') => {
      if (!trip) return;

      const target =
        focusSlot ??
        (typeof activeDay === 'number'
          ? findNextFocusSlot(trip, activeDay)
          : trip.itinerary[0]
            ? findNextFocusSlot(trip, trip.itinerary[0].day)
            : null);

      if (!target) {
        showToast('找不到可替換的景點');
        return;
      }

      const template = target.item;
      const slot = rescuePlaceToScheduleItem(place, {
        time_slot: template.time_slot,
        estimated_stay_mins: template.estimated_stay_mins,
        travel_from_prev_mins: template.travel_from_prev_mins ?? 15,
      });

      await updateTripDays(
        (current) => ({
          ...current,
          itinerary: current.itinerary.map((d) => {
            if (d.day !== target.day) return d;
            const schedule =
              mode === 'replace'
                ? replaceSlotAndRecalculate(d.schedule, target.index, slot)
                : insertSlotAndRecalculate(d.schedule, target.index, slot);
            return { ...d, schedule };
          }),
        }),
        mode === 'replace'
          ? `已取代為 ${place.place_name}`
          : `已插入 ${place.place_name}`,
      );

      setRescue(null);
      setShowRescueForm(false);
      setNearbyPlaces([]);
    },
    [activeDay, focusSlot, showToast, trip, updateTripDays],
  );

  const handleCheckIn = useCallback(async () => {
    if (!trip || !focusSlot) return;
    await updateTripDays((current) => ({
      ...current,
      itinerary: current.itinerary.map((d) =>
        d.day !== focusSlot.day
          ? d
          : {
              ...d,
              schedule: setSlotStatus(d.schedule, focusSlot.index, 'done'),
            },
      ),
    }), `已打卡：${focusSlot.item.place_name}`);
  }, [focusSlot, trip, updateTripDays]);

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
            from: { latitude: from.latitude, longitude: from.longitude },
            to: { latitude: to.latitude, longitude: to.longitude },
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

  const itineraryProps = trip
    ? {
        days: trip.itinerary,
        activeDay,
        selectedKey,
        destination: trip.destination,
        userProfile: trip.user_profile ?? userProfile,
        travelMode,
        onSelectDay: (day: number | 'all') => {
          setActiveDay(day);
          setNearbyPlaces([]);
          setFocusTarget(null);
          if (appMode === 'planning') setSheetSnap('half');
        },
        onSelectPlace: handleSelectPlace,
        onHoverPlace: setHoverKey,
        onReplaceSlot: handleReplaceSlot,
        onExploreBetween:
          appMode === 'planning' ? handleExploreBetween : undefined,
      }
    : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <OfflineBanner offline={offline || (usingCache && Boolean(error))} />

      <header className="animate-rise mb-6 max-w-2xl">
        <p className="text-sm font-medium tracking-[0.18em] text-[var(--sea)] uppercase">
          PathRescue 2.0
        </p>
        <h1 className="font-display mt-2 text-4xl leading-tight text-[var(--ink)] sm:text-5xl">
          {appMode === 'ontrip' && trip
            ? '今日導航員'
            : 'AI 智慧旅遊導航與救援'}
        </h1>
        <p className="mt-3 max-w-xl text-base text-[var(--ink-soft)]">
          {appMode === 'ontrip'
            ? '聚焦下一站、一鍵導航，突發狀況可現場救援並寫回行程。'
            : '三欄搞定行程：目的地、天數、出發日。進階偏好可選，旅途中自動切換出行模式。'}
        </p>
      </header>

      <div
        className={
          appMode === 'ontrip' && trip
            ? 'grid flex-1 gap-6'
            : 'grid flex-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]'
        }
      >
        {(appMode === 'planning' || !trip) && (
          <aside className="space-y-5">
            <div className="rounded-2xl border border-[var(--line)] bg-white/50 p-5 backdrop-blur-sm">
              <SearchForm loading={loading} onSubmit={handleGenerate} />
              <GenerationProgress active={loading} />
              {error && (
                <p className="mt-4 rounded-lg bg-[rgba(180,35,24,0.08)] px-3 py-2 text-sm text-[var(--danger)]">
                  {error}
                </p>
              )}
            </div>

            {trip && (
              <>
                <SosButton
                  onRescue={(payload) => {
                    setRescue(payload);
                    setError(null);
                  }}
                  onError={(message) => setError(message)}
                />
                <RescuePanel
                  rescue={rescue}
                  onReplaceCurrent={(place) => applyRescuePlace(place, 'replace')}
                  onInsertNext={(place) => applyRescuePlace(place, 'insert')}
                  onDismiss={() => setRescue(null)}
                />
              </>
            )}
          </aside>
        )}

        <main className="min-h-[70vh]">
          {!trip ? (
            <div className="animate-rise-delay-1 flex h-full min-h-[420px] items-end rounded-2xl border border-dashed border-[var(--line)] bg-[rgba(15,107,92,0.06)] p-8">
              <div className="max-w-md">
                <h2 className="font-display text-3xl text-[var(--ink)]">
                  先選一個城市
                </h2>
                <p className="mt-2 text-[var(--ink-soft)]">
                  填目的地、天數、出發日，一鍵生成後即可規劃或直接出行。
                </p>
              </div>
            </div>
          ) : (
            <div className="animate-rise flex h-full min-h-0 flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs tracking-wide text-[var(--ink-soft)] uppercase">
                    {trip.destination} · {trip.itinerary.length}/
                    {trip.total_days} 天
                    {trip.start_date ? ` · 出發 ${trip.start_date}` : ''}
                    {tripId ? ` · #${tripId.slice(0, 8)}` : ''}
                  </p>
                  <h2 className="font-display text-3xl text-[var(--ink)]">
                    {trip.trip_title}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ModeToggle
                    mode={appMode}
                    override={modeOverride}
                    canAutoOnTrip={canAutoOnTrip}
                    onChange={handleModeOverride}
                  />
                  {appMode === 'planning' && (
                    <>
                      <ShareTripButton
                        trip={trip}
                        tripId={tripId}
                        onTripIdChange={setTripId}
                        onToast={showToast}
                      />
                      <ExportMapsButton trip={trip} travelMode={travelMode} />
                    </>
                  )}
                </div>
              </div>

              {appMode === 'planning' && (
                <DestinationInfoCard
                  destination={trip.destination}
                  essentials={trip.destination_essentials}
                />
              )}

              {appMode === 'ontrip' && onTripDay != null && (
                <OnTripFocusCard
                  dayNumber={onTripDay}
                  startDate={trip.start_date}
                  focus={focusSlot}
                  travelMode={travelMode}
                  onNavigate={() => {
                    if (!focusSlot) return;
                    const target = toFocusTarget(
                      focusSlot.day,
                      focusSlot.index,
                      focusSlot.item,
                    );
                    handleSelectPlace(target.key, target);
                  }}
                  onCheckIn={handleCheckIn}
                  onRegenerate={() => setRegenFocusOpen(true)}
                  onRescue={() => {
                    setShowRescueForm(true);
                    setSheetSnap('half');
                  }}
                />
              )}

              {appMode === 'ontrip' && showRescueForm && (
                <div className="space-y-3">
                  <SosButton
                    onRescue={(payload) => {
                      setRescue(payload);
                      setError(null);
                    }}
                    onError={(message) => {
                      setError(message);
                      showToast(message);
                    }}
                  />
                  <RescuePanel
                    rescue={rescue}
                    compact
                    onReplaceCurrent={(place) =>
                      applyRescuePlace(place, 'replace')
                    }
                    onInsertNext={(place) => applyRescuePlace(place, 'insert')}
                    onDismiss={() => {
                      setRescue(null);
                      setShowRescueForm(false);
                    }}
                  />
                </div>
              )}

              <div className="relative min-h-[70vh] flex-1 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:gap-4">
                <div className="h-[70vh] min-h-[320px] lg:h-auto lg:min-h-[480px]">
                  <TripMap
                    trip={trip}
                    selectedKey={selectedKey}
                    highlightKey={hoverKey}
                    focusTarget={focusTarget}
                    activeDay={
                      appMode === 'ontrip' && onTripDay != null
                        ? onTripDay
                        : activeDay
                    }
                    nearbyPlaces={nearbyPlaces}
                    onSelect={handleSelectPlace}
                  />
                </div>

                <div className="hidden min-h-[360px] rounded-2xl border border-[var(--line)] bg-white/50 p-4 backdrop-blur-sm lg:block xl:min-h-0">
                  {itineraryProps && <ItineraryPanel {...itineraryProps} />}
                </div>

                <ItineraryBottomSheet
                  snap={sheetSnap}
                  onSnapChange={setSheetSnap}
                  title={
                    appMode === 'ontrip'
                      ? '今日行程'
                      : `${trip.destination} 行程`
                  }
                >
                  {itineraryProps && <ItineraryPanel {...itineraryProps} />}
                </ItineraryBottomSheet>
              </div>
            </div>
          )}
        </main>
      </div>

      {regenFocusOpen && focusSlot && trip && (
        <RegenerateSlotModal
          open
          currentSlot={focusSlot.item}
          previousPlace={
            trip.itinerary.find((d) => d.day === focusSlot.day)?.schedule[
              focusSlot.index - 1
            ] ?? null
          }
          nextPlace={
            trip.itinerary.find((d) => d.day === focusSlot.day)?.schedule[
              focusSlot.index + 1
            ] ?? null
          }
          destination={trip.destination}
          userProfile={trip.user_profile ?? userProfile}
          travelMode={travelMode}
          onClose={() => setRegenFocusOpen(false)}
          onReplaced={(replacement, why) => {
            void handleReplaceSlot(
              focusSlot.day,
              focusSlot.index,
              replacement,
              why,
            );
            setRegenFocusOpen(false);
          }}
        />
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
