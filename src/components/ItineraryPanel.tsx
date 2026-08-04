'use client';

import { useState } from 'react';

import { RegenerateSlotModal } from '@/components/RegenerateSlotModal';
import { cn } from '@/lib/utils';
import type { NearbyFacilityType } from '@/services/mapService';
import type {
  ItineraryDay,
  ScheduleItem,
  TravelMode,
  UserTravelProfile,
} from '@/types/database';
import {
  affiliateLinkFromScheduleItem,
  buildGoogleMapsSearchUrl,
  suggestAffiliateTypeFallback,
} from '@/utils/affiliate';
import { categoryLabel } from '@/utils/labels';

const FACILITY_OPTIONS: Array<{ id: NearbyFacilityType; label: string }> = [
  { id: 'convenience_store', label: '超商' },
  { id: 'atm', label: 'ATM' },
  { id: 'drugstore', label: '藥妝' },
  { id: 'toilet', label: '廁所' },
];

interface ItineraryPanelProps {
  days: ItineraryDay[];
  activeDay: number | 'all';
  selectedKey: string | null;
  destination: string;
  userProfile?: UserTravelProfile;
  travelMode?: TravelMode;
  onSelectDay: (day: number | 'all') => void;
  onSelectPlace: (key: string) => void;
  onReplaceSlot?: (
    day: number,
    index: number,
    replacement: ScheduleItem,
    why: string,
  ) => void;
  onExploreBetween?: (
    day: number,
    fromIndex: number,
    toIndex: number,
    facility: NearbyFacilityType,
  ) => void;
}

function placeKey(day: number, index: number): string {
  return `${day}-${index}`;
}

function PlaceCard({
  item,
  day,
  index,
  selected,
  canRegenerate,
  onSelect,
  onRegenerate,
}: {
  item: ScheduleItem;
  day: number;
  index: number;
  selected: boolean;
  canRegenerate: boolean;
  onSelect: () => void;
  onRegenerate: () => void;
}) {
  const affiliateType = suggestAffiliateTypeFallback(
    item.category,
    item.suggested_affiliate_type,
  );
  const affiliate = affiliateLinkFromScheduleItem({
    ...item,
    suggested_affiliate_type: affiliateType,
  });

  const mapHref = item.place_id
    ? `https://www.google.com/maps/place/?q=place_id:${item.place_id}`
    : item.maps_search_url || buildGoogleMapsSearchUrl(item.place_name);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'relative w-full cursor-pointer rounded-xl border px-4 py-3 text-left transition',
        selected
          ? 'border-[var(--coral)] bg-[rgba(212,87,42,0.08)] shadow-[0_0_0_1px_rgba(212,87,42,0.25)]'
          : 'border-[var(--line)] bg-white/55 hover:bg-white/80',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[var(--ink-soft)]">
            Day {day} · {item.time_slot}
            {item.from_cache ? ' · 離線快取' : ''}
          </p>
          <h4 className="mt-1 font-medium text-[var(--ink)]">
            {index + 1}. {item.place_name}
          </h4>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-md bg-[var(--paper-2)] px-2 py-1 text-[11px] text-[var(--sea-deep)]">
            {categoryLabel(item.category)}
          </span>
          {canRegenerate && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRegenerate();
              }}
              className="rounded-md bg-[var(--ink)]/90 px-2 py-1 text-[11px] text-white"
            >
              換一個
            </button>
          )}
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-[var(--ink-soft)]">
        {item.reason_to_visit}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ink-soft)]">
        <span>停留 {item.estimated_stay_mins} 分</span>
        {typeof item.travel_from_prev_mins === 'number' && (
          <span>
            {item.route_summary ?? `交通約 ${item.travel_from_prev_mins} 分`}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={mapHref}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="rounded-md bg-[var(--ink)]/90 px-2.5 py-1 text-[11px] text-white"
        >
          地圖
        </a>
        {affiliate && (
          <a
            href={affiliate.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded-md bg-[var(--coral)] px-2.5 py-1 text-[11px] text-white"
          >
            {affiliate.label}
          </a>
        )}
      </div>
    </div>
  );
}

export function ItineraryPanel({
  days,
  activeDay,
  selectedKey,
  destination,
  userProfile,
  travelMode = 'transit',
  onSelectDay,
  onSelectPlace,
  onReplaceSlot,
  onExploreBetween,
}: ItineraryPanelProps) {
  const visibleDays =
    activeDay === 'all' ? days : days.filter((d) => d.day === activeDay);

  const [regenTarget, setRegenTarget] = useState<{
    day: number;
    index: number;
    item: ScheduleItem;
  } | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelectDay('all')}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs transition',
            activeDay === 'all'
              ? 'bg-[var(--ink)] text-white'
              : 'bg-white/60 text-[var(--ink-soft)]',
          )}
        >
          全部
        </button>
        {days.map((day) => (
          <button
            key={day.day}
            type="button"
            onClick={() => onSelectDay(day.day)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs transition',
              activeDay === day.day
                ? 'bg-[var(--ink)] text-white'
                : 'bg-white/60 text-[var(--ink-soft)]',
            )}
          >
            Day {day.day}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {visibleDays.map((day) => (
          <section key={day.day} className="space-y-2">
            <div>
              <p className="text-xs tracking-wide text-[var(--ink-soft)] uppercase">
                Day {day.day}
              </p>
              <h3 className="font-display text-lg text-[var(--ink)]">
                {day.theme}
              </h3>
            </div>
            <div className="space-y-2">
              {day.schedule.map((item, index) => {
                const key = placeKey(day.day, index);
                return (
                  <div key={key} className="space-y-2">
                    <PlaceCard
                      item={item}
                      day={day.day}
                      index={index}
                      selected={selectedKey === key}
                      canRegenerate={Boolean(onReplaceSlot)}
                      onSelect={() => onSelectPlace(key)}
                      onRegenerate={() =>
                        setRegenTarget({ day: day.day, index, item })
                      }
                    />
                    {onExploreBetween && index < day.schedule.length - 1 && (
                      <div className="ml-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-[var(--ink-soft)]">
                          順路找：
                        </span>
                        {FACILITY_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() =>
                              onExploreBetween(
                                day.day,
                                index,
                                index + 1,
                                option.id,
                              )
                            }
                            className="rounded-md border border-dashed border-[var(--line)] px-2 py-1 text-[11px] text-[var(--ink-soft)] hover:border-[var(--sea)] hover:text-[var(--sea-deep)]"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {regenTarget && onReplaceSlot && (
        <RegenerateSlotModal
          open
          currentSlot={regenTarget.item}
          previousPlace={
            days.find((d) => d.day === regenTarget.day)?.schedule[
              regenTarget.index - 1
            ] ?? null
          }
          nextPlace={
            days.find((d) => d.day === regenTarget.day)?.schedule[
              regenTarget.index + 1
            ] ?? null
          }
          destination={destination}
          userProfile={userProfile}
          travelMode={travelMode}
          onClose={() => setRegenTarget(null)}
          onReplaced={(replacement, why) => {
            onReplaceSlot(
              regenTarget.day,
              regenTarget.index,
              replacement,
              why,
            );
            setRegenTarget(null);
          }}
        />
      )}
    </div>
  );
}
