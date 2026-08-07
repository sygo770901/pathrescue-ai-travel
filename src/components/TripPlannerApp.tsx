'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { DestinationInfoCard } from '@/components/DestinationInfoCard';
import { ExportMapsButton } from '@/components/ExportMapsButton';
import { GenerationProgress } from '@/components/GenerationProgress';
import {
  ItineraryBottomSheet,
  type SheetSnap,
} from '@/components/ItineraryBottomSheet';
import { ItineraryPanel } from '@/components/ItineraryPanel';
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
  TripWorkspaceTabs,
  type WorkspaceTab,
} from '@/components/TripWorkspaceTabs';
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

function headerCopy(tab: WorkspaceTab, hasTrip: boolean): {
  title: string;
  subtitle: string;
} {
  if (tab === 'ontrip' && hasTrip) {
    return {
      title: '今日導航員',
      subtitle: '聚焦下一站、一鍵導航，突發狀況可現場救援並寫回行程。',
    };
  }
  if (tab === 'itinerary') {
    return {
      title: '行程總覽',
      subtitle: '依天瀏覽與微調景點；需要空間感時切到地圖，出發當天切到出行。',
    };
  }
  if (tab === 'map') {
    return {
      title: '行程地圖',
      subtitle: '看景點相對位置與路線；點標記可對應行程站點。',
    };
  }
  return {
    title: 'AI 智慧旅遊導航與救援',
    subtitle: '選目的地、天數與出發日，生成後可到行程微調、地圖檢視或出行導航。',
  };
}

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
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('plan');
  const [offline, setOffline] = useState(false);
  const [usingCache, setUsingCache] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [userProfile, setUserProfile] =
    useState<UserTravelProfile>(DEFAULT_USER_PROFILE);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [exploring, setExploring] = useState(false);
  const [regenFocusOpen, setRegenFocusOpen] = useState(false);
  const [showItineraryHint, setShowItineraryHint] = useState(false);
  const autoLandedRef = useRef(false);

  const travelMode: TravelMode = useMemo(
    () =>
      transportToTravelMode(
        trip?.user_profile?.transport ?? userProfile.transport,
      ),
    [trip?.user_profile?.transport, userProfile.transport],
  );

  const todayDay = useMemo(
    () => (trip ? getTodayTripDay(trip) : null),
    [trip],
  );

  const onTripDay = useMemo(() => {
    if (workspaceTab !== 'ontrip' || !trip) return null;
    return todayDay ?? trip.itinerary[0]?.day ?? 1;
  }, [workspaceTab, todayDay, trip]);

  const focusSlot = useMemo(() => {
    if (!trip || onTripDay == null) return null;
    return findNextFocusSlot(trip, onTripDay);
  }, [trip, onTripDay]);

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

  const syncTabMode = useCallback((tab: WorkspaceTab) => {
    const nextMode: ModeOverride = tab === 'ontrip' ? 'ontrip' : 'planning';
    saveModeOverride(nextMode);
    if (tab === 'ontrip') setSheetSnap('mapFocus');
    if (tab === 'itinerary' || tab === 'plan') setSheetSnap('half');
    if (tab === 'map') setSheetSnap('mapFocus');
  }, []);

  const handleWorkspaceTab = useCallback(
    (tab: WorkspaceTab) => {
      setWorkspaceTab(tab);
      syncTabMode(tab);
      if (tab === 'ontrip') {
        setShowItineraryHint(false);
      }
    },
    [syncTabMode],
  );

  useEffect(() => {
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
    if (workspaceTab === 'ontrip' && onTripDay != null) {
      setActiveDay(onTripDay);
      setSheetSnap((prev) => (prev === 'full' ? prev : 'mapFocus'));
    }
  }, [workspaceTab, onTripDay]);

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

  /** First time a trip appears under auto mode during trip dates → land on 出行 */
  useEffect(() => {
    if (!trip || autoLandedRef.current) return;
    const stored = loadModeOverride();
    const autoDay = getTodayTripDay(trip);
    if ((stored === 'auto' || stored === 'ontrip') && autoDay != null) {
      autoLandedRef.current = true;
      setWorkspaceTab('ontrip');
      saveModeOverride('ontrip');
      setActiveDay(autoDay);
      setSheetSnap('mapFocus');
    }
  }, [trip]);

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
      if (!getTodayTripDay(cached.trip)) {
        setWorkspaceTab('itinerary');
        syncTabMode('itinerary');
      }
    }
  }, [applyTrip, searchParams, syncTabMode]);

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
        setWorkspaceTab('itinerary');
        syncTabMode('itinerary');
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
      autoLandedRef.current = true;
      setWorkspaceTab('itinerary');
      syncTabMode('itinerary');
      setShowItineraryHint(true);
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
        setWorkspaceTab('itinerary');
        syncTabMode('itinerary');
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
    await updateTripDays(
      (current) => ({
        ...current,
        itinerary: current.itinerary.map((d) =>
          d.day !== focusSlot.day
            ? d
            : {
                ...d,
                schedule: setSlotStatus(d.schedule, focusSlot.index, 'done'),
              },
        ),
      }),
      `已打卡：${focusSlot.item.place_name}`,
    );
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
        handleWorkspaceTab('map');
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
    [exploring, handleWorkspaceTab, showToast, trip],
  );

  const itineraryProps = trip
    ? {
        days: trip.itinerary,
        activeDay:
          workspaceTab === 'ontrip' && onTripDay != null
            ? onTripDay
            : activeDay,
        selectedKey,
        destination: trip.destination,
        userProfile: trip.user_profile ?? userProfile,
        travelMode,
        onSelectDay: (day: number | 'all') => {
          setActiveDay(day);
          setNearbyPlaces([]);
          setFocusTarget(null);
          if (workspaceTab !== 'ontrip') setSheetSnap('half');
        },
        onSelectPlace: handleSelectPlace,
        onHoverPlace: setHoverKey,
        onReplaceSlot: handleReplaceSlot,
        onExploreBetween:
          workspaceTab === 'itinerary' ? handleExploreBetween : undefined,
      }
    : null;

  const copy = headerCopy(workspaceTab, Boolean(trip));

  const tripMeta = trip ? (
    <div className="mb-1">
      <p className="text-xs tracking-wide text-[var(--ink-soft)] uppercase">
        {trip.destination} · {trip.itinerary.length}/{trip.total_days} 天
        {trip.start_date ? ` · 出發 ${trip.start_date}` : ''}
        {tripId ? ` · #${tripId.slice(0, 8)}` : ''}
      </p>
      <h2 className="font-display text-2xl text-[var(--ink)] sm:text-3xl">
        {trip.trip_title}
      </h2>
    </div>
  ) : null;

  const mapBlock = trip ? (
    <div className="relative min-h-[70vh] flex-1 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:gap-4">
      <div className="h-[70vh] min-h-[320px] lg:h-auto lg:min-h-[480px]">
        <TripMap
          trip={trip}
          selectedKey={selectedKey}
          highlightKey={hoverKey}
          focusTarget={focusTarget}
          activeDay={
            workspaceTab === 'ontrip' && onTripDay != null
              ? onTripDay
              : activeDay
          }
          nearbyPlaces={nearbyPlaces}
          onSelect={handleSelectPlace}
        />
      </div>
      <div className="hidden min-h-[280px] rounded-2xl border border-[var(--line)] bg-white/50 p-4 backdrop-blur-sm lg:block">
        {itineraryProps && <ItineraryPanel {...itineraryProps} />}
      </div>
      <ItineraryBottomSheet
        snap={sheetSnap}
        onSnapChange={setSheetSnap}
        title={
          workspaceTab === 'ontrip'
            ? '今日行程'
            : `${trip.destination} 行程`
        }
      >
        {itineraryProps && <ItineraryPanel {...itineraryProps} />}
      </ItineraryBottomSheet>
    </div>
  ) : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-8">
      <OfflineBanner offline={offline || (usingCache && Boolean(error))} />

      <header className="animate-rise mb-4 max-w-2xl">
        <p className="text-sm font-medium tracking-[0.18em] text-[var(--sea)] uppercase">
          PathRescue 2.0
        </p>
        <h1 className="font-display mt-2 text-4xl leading-tight text-[var(--ink)] sm:text-5xl">
          {copy.title}
        </h1>
        <p className="mt-3 max-w-xl text-base text-[var(--ink-soft)]">
          {copy.subtitle}
        </p>
      </header>

      <div className="mb-5">
        <TripWorkspaceTabs
          placement="top"
          active={workspaceTab}
          hasTrip={Boolean(trip)}
          onChange={handleWorkspaceTab}
          onBlocked={() => showToast('請先生成行程')}
        />
      </div>

      <main className="animate-rise min-h-[50vh] flex-1">
        {workspaceTab === 'plan' && (
          <div className="mx-auto w-full max-w-lg space-y-5">
            <div className="rounded-2xl border border-[var(--line)] bg-white/50 p-5 backdrop-blur-sm">
              <SearchForm loading={loading} onSubmit={handleGenerate} />
              <GenerationProgress active={loading} />
              {error && (
                <p className="mt-4 rounded-lg bg-[rgba(180,35,24,0.08)] px-3 py-2 text-sm text-[var(--danger)]">
                  {error}
                </p>
              )}
            </div>

            {!trip && (
              <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[rgba(15,107,92,0.06)] p-6">
                <h2 className="font-display text-2xl text-[var(--ink)]">
                  先選一個城市
                </h2>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">
                  選城市與出發日 → 勾旅行方向與想做的事 → 一鍵生成。完成後會自動打開「行程」。
                </p>
              </div>
            )}

            {trip && (
              <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-white/50 p-4">
                {tripMeta}
                <p className="text-sm text-[var(--ink-soft)]">
                  可在此重產行程，或使用下方工具。
                </p>
                <div className="flex flex-wrap items-start gap-3">
                  <ExportMapsButton trip={trip} travelMode={travelMode} />
                  <ShareTripButton
                    trip={trip}
                    tripId={tripId}
                    onTripIdChange={setTripId}
                    onToast={showToast}
                  />
                </div>
                <DestinationInfoCard
                  destination={trip.destination}
                  essentials={trip.destination_essentials}
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleWorkspaceTab('itinerary')}
                    className="rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-white"
                  >
                    查看行程
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWorkspaceTab('map')}
                    className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)]"
                  >
                    打開地圖
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {workspaceTab === 'itinerary' && trip && itineraryProps && (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            {tripMeta}
            {showItineraryHint && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--sea)]/25 bg-[rgba(15,107,92,0.08)] px-3 py-2.5 text-sm text-[var(--ink)]">
                <span>可微調景點，或切到「出行」開始今天。</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleWorkspaceTab('ontrip')}
                    className="rounded-lg bg-[var(--coral)] px-2.5 py-1 text-xs text-white"
                  >
                    去出行
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowItineraryHint(false)}
                    className="rounded-lg px-2 py-1 text-xs text-[var(--ink-soft)]"
                  >
                    關閉
                  </button>
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-[var(--line)] bg-white/50 p-4 backdrop-blur-sm">
              <ItineraryPanel {...itineraryProps} />
            </div>
          </div>
        )}

        {workspaceTab === 'map' && trip && (
          <div className="flex h-full min-h-0 flex-col gap-3">
            {tripMeta}
            <div className="relative min-h-[70vh] flex-1 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:gap-4">
              <div className="h-[70vh] min-h-[320px] lg:h-auto lg:min-h-[520px]">
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
              <div className="hidden min-h-[360px] rounded-2xl border border-[var(--line)] bg-white/50 p-4 backdrop-blur-sm lg:block">
                {itineraryProps && <ItineraryPanel {...itineraryProps} />}
              </div>
              <ItineraryBottomSheet
                snap={sheetSnap}
                onSnapChange={setSheetSnap}
                title={`${trip.destination} 行程`}
              >
                {itineraryProps && <ItineraryPanel {...itineraryProps} />}
              </ItineraryBottomSheet>
            </div>
          </div>
        )}

        {workspaceTab === 'ontrip' && trip && onTripDay != null && (
          <div className="flex h-full min-h-0 flex-col gap-4">
            {tripMeta}
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

            {showRescueForm && (
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

            {mapBlock}
          </div>
        )}
      </main>

      <TripWorkspaceTabs
        placement="bottom"
        active={workspaceTab}
        hasTrip={Boolean(trip)}
        onChange={handleWorkspaceTab}
        onBlocked={() => showToast('請先生成行程')}
      />

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
