'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  estimateWalkMins,
  formatTripDayLabel,
  haversineDistanceMeters,
  type FocusSlot,
} from '@/lib/tripMode';
import type { ScheduleItem, TravelMode } from '@/types/database';
import { categoryLabel } from '@/utils/labels';

interface OnTripFocusCardProps {
  dayNumber: number;
  startDate?: string | null;
  focus: FocusSlot | null;
  travelMode: TravelMode;
  onNavigate: (item: ScheduleItem) => void;
  onCheckIn: () => void;
  onRegenerate: () => void;
  onRescue: () => void;
}

function buildSingleNavUrl(item: ScheduleItem, mode: TravelMode): string {
  if (item.place_id) {
    return `https://www.google.com/maps/dir/?api=1&destination=place_id:${encodeURIComponent(item.place_id)}&travelmode=${mode}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${item.latitude},${item.longitude}`)}&travelmode=${mode}`;
}

export function OnTripFocusCard({
  dayNumber,
  startDate,
  focus,
  travelMode,
  onNavigate,
  onCheckIn,
  onRegenerate,
  onRescue,
}: OnTripFocusCardProps) {
  const [userPos, setUserPos] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => setUserPos(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [focus?.item.place_name]);

  const distanceLabel = useMemo(() => {
    if (!focus || !userPos) return null;
    const meters = haversineDistanceMeters(userPos, {
      latitude: focus.item.latitude,
      longitude: focus.item.longitude,
    });
    const km = meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
    const walk = estimateWalkMins(meters);
    return `距離 ${km} · 步行約 ${walk} 分鐘`;
  }, [focus, userPos]);

  const dayLabel = formatTripDayLabel(startDate, dayNumber);

  if (!focus) {
    return (
      <section className="rounded-2xl border border-[var(--line)] bg-white/80 p-5 shadow-sm">
        <p className="text-xs tracking-wide text-[var(--sea)] uppercase">
          {dayLabel}
        </p>
        <h3 className="font-display mt-1 text-2xl text-[var(--ink)]">
          今日行程已完成
        </h3>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          太棒了！可以預覽明天，或切回規劃模式微調。
        </p>
      </section>
    );
  }

  const item = focus.item;
  const trust =
    item.trust === 'verified'
      ? '🟢 已驗證'
      : item.trust === 'time_risk'
        ? '🔴 時間風險'
        : '🟡 名稱搜尋';

  return (
    <section className="rounded-2xl border border-[var(--coral)]/30 bg-white/90 p-5 shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs tracking-wide text-[var(--coral)] uppercase">
            {dayLabel} · 下一站
          </p>
          <h3 className="font-display mt-1 text-2xl leading-tight text-[var(--ink)] sm:text-3xl">
            {item.place_name}
          </h3>
        </div>
        <span className="rounded-md bg-[var(--paper-2)] px-2 py-1 text-[11px] text-[var(--sea-deep)]">
          {categoryLabel(item.category)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--ink-soft)]">
        <span>{item.time_slot}</span>
        <span>{trust}</span>
        {distanceLabel && <span>{distanceLabel}</span>}
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-[var(--ink-soft)]">
        {item.reason_to_visit}
      </p>

      <a
        href={buildSingleNavUrl(item, travelMode)}
        target="_blank"
        rel="noreferrer"
        onClick={() => onNavigate(item)}
        className="mt-4 flex w-full items-center justify-center rounded-xl bg-[var(--ink)] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--sea-deep)]"
      >
        導航前往下一站
      </a>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onCheckIn}
          className="rounded-lg border border-[var(--line)] bg-white px-2 py-2 text-xs text-[var(--ink)]"
        >
          打卡完成
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          className="rounded-lg border border-[var(--line)] bg-white px-2 py-2 text-xs text-[var(--ink)]"
        >
          換一個
        </button>
        <button
          type="button"
          onClick={onRescue}
          className="rounded-lg bg-[var(--danger)]/90 px-2 py-2 text-xs font-medium text-white"
        >
          現場救援
        </button>
      </div>
    </section>
  );
}
