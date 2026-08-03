'use client';

import { cn } from '@/lib/utils';
import type { ItineraryDay, ScheduleItem } from '@/types/database';
import {
  affiliateLinkFromScheduleItem,
  buildGoogleMapsSearchUrl,
  suggestAffiliateTypeFallback,
} from '@/utils/affiliate';
import { categoryLabel } from '@/utils/labels';

interface ItineraryPanelProps {
  days: ItineraryDay[];
  activeDay: number | 'all';
  selectedKey: string | null;
  onSelectDay: (day: number | 'all') => void;
  onSelectPlace: (key: string) => void;
}

function placeKey(day: number, index: number): string {
  return `${day}-${index}`;
}

function PlaceCard({
  item,
  day,
  index,
  selected,
  onSelect,
}: {
  item: ScheduleItem;
  day: number;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const affiliateType = suggestAffiliateTypeFallback(
    item.category,
    item.suggested_affiliate_type,
  );
  const affiliate = affiliateLinkFromScheduleItem({
    ...item,
    suggested_affiliate_type: affiliateType,
  });

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
        'w-full cursor-pointer rounded-xl border px-4 py-3 text-left transition',
        selected
          ? 'border-[var(--coral)] bg-[rgba(212,87,42,0.08)] shadow-[0_0_0_1px_rgba(212,87,42,0.25)]'
          : 'border-[var(--line)] bg-white/55 hover:bg-white/80',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[var(--ink-soft)]">
            Day {day} · {item.time_slot}
          </p>
          <h4 className="mt-1 font-medium text-[var(--ink)]">
            {index + 1}. {item.place_name}
          </h4>
        </div>
        <span className="shrink-0 rounded-md bg-[var(--paper-2)] px-2 py-1 text-[11px] text-[var(--sea-deep)]">
          {categoryLabel(item.category)}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-[var(--ink-soft)]">
        {item.reason_to_visit}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ink-soft)]">
        <span>停留 {item.estimated_stay_mins} 分</span>
        {typeof item.travel_from_prev_mins === 'number' && (
          <span>交通約 {item.travel_from_prev_mins} 分</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={
            item.place_id
              ? `https://www.google.com/maps/place/?q=place_id:${item.place_id}`
              : buildGoogleMapsSearchUrl(item.place_name)
          }
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
  onSelectDay,
  onSelectPlace,
}: ItineraryPanelProps) {
  const visibleDays =
    activeDay === 'all' ? days : days.filter((d) => d.day === activeDay);

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
                  <PlaceCard
                    key={key}
                    item={item}
                    day={day.day}
                    index={index}
                    selected={selectedKey === key}
                    onSelect={() => onSelectPlace(key)}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
