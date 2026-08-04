'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { DestinationInfoCard } from '@/components/DestinationInfoCard';
import { ExportMapsButton } from '@/components/ExportMapsButton';
import { ItineraryPanel } from '@/components/ItineraryPanel';
import { TripMap } from '@/components/TripMap';
import { transportToTravelMode } from '@/lib/travelProfile';
import { saveTripToCache } from '@/lib/offline/tripCache';
import { Toast } from '@/components/Toast';
import type { PublicTripView } from '@/types/database';

interface ShareTripViewProps {
  tripView: PublicTripView;
}

export function ShareTripView({ tripView }: ShareTripViewProps) {
  const router = useRouter();
  const trip = tripView.generated_payload;
  const [activeDay, setActiveDay] = useState<number | 'all'>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(
    trip.itinerary[0]?.schedule[0] ? '1-0' : null,
  );
  const [cloning, setCloning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const dayCountLabel = useMemo(
    () => `${trip.destination} · ${trip.total_days} 天`,
    [trip.destination, trip.total_days],
  );

  const travelMode = useMemo(
    () =>
      transportToTravelMode(trip.user_profile?.transport ?? 'transit'),
    [trip.user_profile?.transport],
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
        // Guest fallback: clone into local cache and open home editor
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

      <div className="mt-4 grid min-h-[70vh] gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <TripMap
          trip={trip}
          selectedKey={selectedKey}
          activeDay={activeDay}
          onSelect={setSelectedKey}
        />
        <div className="min-h-[360px] rounded-2xl border border-[var(--line)] bg-white/50 p-4 backdrop-blur-sm xl:min-h-0">
          <ItineraryPanel
            days={trip.itinerary}
            activeDay={activeDay}
            selectedKey={selectedKey}
            destination={trip.destination}
            userProfile={trip.user_profile}
            travelMode={travelMode}
            onSelectDay={setActiveDay}
            onSelectPlace={setSelectedKey}
          />
        </div>
      </div>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
