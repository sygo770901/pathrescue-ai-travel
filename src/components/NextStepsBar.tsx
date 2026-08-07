'use client';

import { useRef } from 'react';

import { ShareTripButton } from '@/components/ShareTripButton';
import type { TripGeneratorResponse } from '@/types/database';

interface NextStepsBarProps {
  trip: TripGeneratorResponse;
  tripId: string | null;
  onTripIdChange: (tripId: string) => void;
  onToast: (message: string) => void;
  onStayPlanning: () => void;
  onStartOnTrip: () => void;
}

export function NextStepsBar({
  trip,
  tripId,
  onTripIdChange,
  onToast,
  onStayPlanning,
  onStartOnTrip,
}: NextStepsBarProps) {
  const shareRef = useRef<HTMLDivElement>(null);

  return (
    <section className="rounded-2xl border border-[var(--sea)]/25 bg-[rgba(15,107,92,0.08)] p-4">
      <p className="text-xs font-medium tracking-wide text-[var(--sea)] uppercase">
        下一步（選一個）
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={onStayPlanning}
          className="rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-left text-sm text-[var(--ink)] transition hover:border-[var(--sea)]"
        >
          <span className="block font-medium">微調行程</span>
          <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
            換景點、看地圖、調時間
          </span>
        </button>
        <button
          type="button"
          onClick={onStartOnTrip}
          className="rounded-xl bg-[var(--coral)] px-3 py-3 text-left text-sm text-white transition hover:opacity-95"
        >
          <span className="block font-medium">開始今天出行</span>
          <span className="mt-0.5 block text-xs text-white/85">
            下一站導航與打卡
          </span>
        </button>
        <div
          ref={shareRef}
          className="rounded-xl border border-[var(--line)] bg-white px-3 py-3"
        >
          <p className="text-sm font-medium text-[var(--ink)]">分享給同行</p>
          <p className="mt-0.5 text-xs text-[var(--ink-soft)]">複製連結傳給朋友</p>
          <div className="mt-2">
            <ShareTripButton
              trip={trip}
              tripId={tripId}
              onTripIdChange={onTripIdChange}
              onToast={onToast}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
