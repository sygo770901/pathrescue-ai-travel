'use client';

import { useEffect, useState } from 'react';

import { ShareTripView } from '@/components/ShareTripView';
import type { PublicTripView, TripGeneratorResponse } from '@/types/database';
import { decodeTripFromShare } from '@/utils/shareCodec';

export default function LocalSharePage() {
  const [tripView, setTripView] = useState<PublicTripView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const hash = window.location.hash.replace(/^#/, '');
      if (!hash) {
        setError('分享連結不完整');
        return;
      }

      const trip = decodeTripFromShare(hash) as TripGeneratorResponse;
      if (!trip?.itinerary?.length) {
        setError('無法解析行程資料');
        return;
      }

      setTripView({
        id: 'local-share',
        trip_title: trip.trip_title,
        destination: trip.destination,
        total_days: trip.total_days,
        preferences: [],
        is_public: true,
        generated_payload: trip,
        created_at: new Date().toISOString(),
      });
    } catch {
      setError('分享連結已損壞或過長被截斷');
    }
  }, []);

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg items-center px-4">
        <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-6">
          <h1 className="font-display text-2xl text-[var(--ink)]">無法開啟分享</h1>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">{error}</p>
        </div>
      </div>
    );
  }

  if (!tripView) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--ink-soft)]">
        載入分享行程中…
      </div>
    );
  }

  return <ShareTripView tripView={tripView} />;
}
