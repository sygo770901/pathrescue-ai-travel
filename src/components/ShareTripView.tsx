'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { DestinationInfoCard } from '@/components/DestinationInfoCard';
import { ExportMapsButton } from '@/components/ExportMapsButton';
import {
  ItineraryBottomSheet,
  type SheetSnap,
} from '@/components/ItineraryBottomSheet';
import { ItineraryPanel } from '@/components/ItineraryPanel';
import { TripMap } from '@/components/TripMap';
import { transportToTravelMode } from '@/lib/travelProfile';
import { saveTripToCache } from '@/lib/offline/tripCache';
import { Toast } from '@/components/Toast';
import type { PublicTripView } from '@/types/database';
import {
  toFocusTarget,
  type PlaceFocusTarget,
} from '@/utils/placeKey';

interface ShareTripViewProps {
  tripView: PublicTripView;
}

export function ShareTripView({ tripView }: ShareTripViewProps) {
  const router = useRouter();
  const trip = tripView.generated_payload;
  const [activeDay, setActiveDay] = useState<number | 'all'>('all');
  const first = trip.itinerary[0]?.schedule[0];
  const [selectedKey, setSelectedKey] = useState<string | null>(() =>
    first && trip.itinerary[0]
      ? toFocusTarget(trip.itinerary[0].day, 0, first).key
      : null,
  );
  const [focusTarget, setFocusTarget] = useState<PlaceFocusTarget | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('half');
  const [cloning, setCloning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const dayCountLabel = useMemo(
    () => `${trip.destination} · ${trip.total_days} 天`,
    [trip.destination, trip.total_days],
  );

  const travelMode = useMemo(
    () => transportToTravelMode(trip.user_profile?.transport ?? 'transit'),
    [trip.user_profile?.transport],
  );

  const handleSelectPlace = useCallback(
    (key: string, target: PlaceFocusTarget) => {
      setSelectedKey(key);
      setFocusTarget({ ...target });
      setSheetSnap('mapFocus');
    },
    [],
  );

  async function handleClone() {
    if (cloning) return;
    setCloning(true);

    try {
      const response = await fetch(`/api/trips/${tripView.id}/clone`, {
        method: 'POST',
      });

      const json = (await response.json()) as {
        data?: { id: string; redirect_to: string };
        error?: string;
        code?: string;
      };

      if (response.status === 401 || json.code === 'NEED_AUTH') {
        saveTripToCache(`local-clone-${tripView.id}`, {
          ...trip,
          trip_title: `${trip.trip_title}（副本）`,
        });
        setToast('尚未登入：已複製到本機，正在開啟編輯');
        window.setTimeout(() => {
          router.push('/?fromShare=1');
        }, 700);
        return;
      }

      if (!response.ok || !json.data) {
        throw new Error(json.error ?? '複製失敗');
      }

      saveTripToCache(json.data.id, {
        ...trip,
        trip_title: `${trip.trip_title}（副本）`,
      });
      setToast('已複製行程，正在前往編輯');
      window.setTimeout(() => {
        router.push(json.data!.redirect_to);
      }, 500);
    } catch (error) {
      setToast(error instanceof Error ? error.message : '複製失敗');
    } finally {
      setCloning(false);
    }
  }

  const panelProps = {
    days: trip.itinerary,
    activeDay,
    selectedKey,
    destination: trip.destination,
    userProfile: trip.user_profile,
    travelMode,
    onSelectDay: (day: number | 'all') => {
      setActiveDay(day);
      setFocusTarget(null);
    },
    onSelectPlace: handleSelectPlace,
    onHoverPlace: setHoverKey,
  } as const;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium tracking-[0.18em] text-[var(--sea)] uppercase">
            PathRescue Share
          </p>
          <h1 className="font-display mt-2 text-3xl text-[var(--ink)] sm:text-4xl">
            {trip.trip_title}
          </h1>
          <p className="mt-2 text-[var(--ink-soft)]">{dayCountLabel} · 唯讀分享</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ExportMapsButton trip={trip} travelMode={travelMode} />
          <button
            type="button"
            onClick={handleClone}
            disabled={cloning}
            className="rounded-xl bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] transition hover:bg-[var(--sea-deep)]"
          >
            {cloning ? '複製中…' : '複製並開始編輯'}
          </button>
        </div>
      </header>

      <DestinationInfoCard
        destination={trip.destination}
        essentials={trip.destination_essentials}
      />

      <div className="relative mt-4 min-h-[70vh] lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:gap-4">
        <div className="h-[70vh] min-h-[320px] lg:h-auto lg:min-h-[480px]">
          <TripMap
            trip={trip}
            selectedKey={selectedKey}
            highlightKey={hoverKey}
            focusTarget={focusTarget}
            activeDay={activeDay}
            onSelect={handleSelectPlace}
          />
        </div>

        <div className="hidden min-h-[360px] rounded-2xl border border-[var(--line)] bg-white/50 p-4 backdrop-blur-sm lg:block">
          <ItineraryPanel {...panelProps} />
        </div>

        <ItineraryBottomSheet
          snap={sheetSnap}
          onSnapChange={setSheetSnap}
          title={`${trip.destination} 行程`}
        >
          <ItineraryPanel {...panelProps} />
        </ItineraryBottomSheet>
      </div>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
