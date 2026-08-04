'use client';

import { useEffect, useRef, useState } from 'react';

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
import {
  formatTravelLabel,
  makePlaceKey,
  toFocusTarget,
  type PlaceFocusTarget,
} from '@/utils/placeKey';

const FACILITY_OPTIONS: Array<{ id: NearbyFacilityType; label: string }> = [
  { id: 'convenience_store', label: '超商' },
  { id: 'atm', label: 'ATM' },
  { id: 'drugstore', label: '藥妝' },
  { id: 'toilet', label: '廁所' },
];

const CATEGORY_META: Record<
  ScheduleItem['category'],
  { emoji: string; label: string }
> = {
  food: { emoji: '🍽️', label: '美食' },
  attraction: { emoji: '🏛️', label: '景點' },
  shopping: { emoji: '🛍️', label: '購物' },
  accommodation: { emoji: '🛏️', label: '住宿' },
};

interface ItineraryPanelProps {
  days: ItineraryDay[];
  activeDay: number | 'all';
  selectedKey: string | null;
  destination: string;
  userProfile?: UserTravelProfile;
  travelMode?: TravelMode;
  onSelectDay: (day: number | 'all') => void;
  onSelectPlace: (key: string, target: PlaceFocusTarget) => void;
  onHoverPlace?: (key: string | null) => void;
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

function loadNote(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(`pathrescue:note:${key}`) ?? '';
  } catch {
    return '';
  }
}

function saveNote(key: string, note: string) {
  try {
    if (!note.trim()) {
      localStorage.removeItem(`pathrescue:note:${key}`);
    } else {
      localStorage.setItem(`pathrescue:note:${key}`, note.trim());
    }
  } catch {
    // ignore quota errors
  }
}

function PlaceCard({
  item,
  index,
  placeKey,
  selected,
  travelMode,
  canRegenerate,
  onSelect,
  onHover,
  onRegenerate,
  onOpenNote,
}: {
  item: ScheduleItem;
  index: number;
  placeKey: string;
  selected: boolean;
  travelMode: TravelMode;
  canRegenerate: boolean;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
  onRegenerate: () => void;
  onOpenNote: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
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

  const cat = CATEGORY_META[item.category] ?? {
    emoji: '📍',
    label: categoryLabel(item.category),
  };

  useEffect(() => {
    if (!selected || !cardRef.current) return;
    cardRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [selected]);

  return (
    <div
      ref={cardRef}
      data-place-key={placeKey}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'relative w-full cursor-pointer rounded-xl border bg-white px-3.5 py-3 text-left shadow-sm transition hover:shadow-md',
        selected
          ? 'border-[var(--coral)] shadow-md ring-2 ring-[rgba(212,87,42,0.28)]'
          : 'border-[var(--line)]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-[var(--ink)] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white">
              {item.time_slot}
            </span>
            <span className="rounded-md bg-[var(--paper-2)] px-2 py-0.5 text-[11px] text-[var(--sea-deep)]">
              {cat.emoji} {cat.label}
            </span>
            {item.from_cache && (
              <span className="text-[10px] text-[var(--ink-soft)]">
                離線快取
              </span>
            )}
          </div>
          <h4 className="mt-1.5 font-medium text-[var(--ink)]">
            {index + 1}. {item.place_name}
          </h4>
        </div>
      </div>

      <p className="mt-1.5 line-clamp-2 text-sm text-[var(--ink-soft)]">
        {item.reason_to_visit}
      </p>

      <div className="mt-2 text-xs text-[var(--ink-soft)]">
        停留 {item.estimated_stay_mins} 分
        {item.route_summary
          ? ` · ${formatTravelLabel(item.travel_from_prev_mins, item.route_summary, travelMode) ?? ''}`
          : ''}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
        {canRegenerate && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRegenerate();
            }}
            className="rounded-md bg-[var(--ink)]/90 px-2 py-1 text-[11px] text-white"
          >
            換一個 🔄
          </button>
        )}
        <a
          href={mapHref}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="rounded-md bg-[var(--sea)] px-2 py-1 text-[11px] text-white"
        >
          開啟導航 🗺️
        </a>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenNote();
          }}
          className="rounded-md border border-[var(--line)] bg-white px-2 py-1 text-[11px] text-[var(--ink)]"
        >
          備註 📝
        </button>
        {affiliate && (
          <a
            href={affiliate.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded-md bg-[var(--coral)] px-2 py-1 text-[11px] text-white"
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
  onHoverPlace,
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

  const [noteTarget, setNoteTarget] = useState<{
    key: string;
    name: string;
  } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  function setHover(key: string | null) {
    setHoverKey(key);
    onHoverPlace?.(key);
  }

  useEffect(() => {
    if (!noteTarget) return;
    setNoteDraft(loadNote(noteTarget.key));
  }, [noteTarget]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-10 -mx-1 mb-3 border-b border-[var(--line)] bg-[var(--paper)]/95 px-1 pb-2 backdrop-blur-sm">
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => onSelectDay('all')}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs transition',
              activeDay === 'all'
                ? 'bg-[var(--ink)] text-white'
                : 'bg-white/80 text-[var(--ink-soft)]',
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
                  : 'bg-white/80 text-[var(--ink-soft)]',
              )}
            >
              Day {day.day}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        {visibleDays.map((day) => (
          <section key={day.day} className="space-y-0">
            <div
              className={cn(
                'sticky top-[42px] z-[5] -mx-1 mb-3 border-b border-[var(--line)] bg-[var(--paper)]/90 px-1 py-2 backdrop-blur-sm',
                activeDay === 'all' ? 'block' : 'relative top-0',
              )}
            >
              <p className="text-xs tracking-wide text-[var(--ink-soft)] uppercase">
                Day {day.day}
              </p>
              <h3 className="font-display text-lg text-[var(--ink)]">
                {day.theme}
              </h3>
            </div>

            <ol className="relative ml-2 space-y-0 border-l-2 border-dashed border-[var(--sea)]/35 pl-5">
              {day.schedule.map((item, index) => {
                const key = makePlaceKey(day.day, index, item);
                const selected = selectedKey === key || hoverKey === key;
                const next = day.schedule[index + 1];
                const travelToNext = next
                  ? formatTravelLabel(
                      next.travel_from_prev_mins,
                      next.route_summary,
                      travelMode,
                    )
                  : null;

                return (
                  <li key={key} className="relative pb-4">
                    <span
                      className={cn(
                        'absolute top-4 -left-[27px] h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm',
                        selectedKey === key
                          ? 'bg-[var(--coral)]'
                          : 'bg-[var(--sea)]',
                      )}
                    />

                    <PlaceCard
                      item={item}
                      index={index}
                      placeKey={key}
                      selected={selected}
                      travelMode={travelMode}
                      canRegenerate={Boolean(onReplaceSlot)}
                      onSelect={() =>
                        onSelectPlace(key, toFocusTarget(day.day, index, item))
                      }
                      onHover={(hovering) => setHover(hovering ? key : null)}
                      onRegenerate={() =>
                        setRegenTarget({ day: day.day, index, item })
                      }
                      onOpenNote={() =>
                        setNoteTarget({ key, name: item.place_name })
                      }
                    />

                    {index < day.schedule.length - 1 && (
                      <div className="mt-2 ml-1 space-y-1.5">
                        {travelToNext && (
                          <div className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2.5 py-1 text-[11px] text-[var(--ink-soft)]">
                            {travelToNext}
                          </div>
                        )}
                        {onExploreBetween && (
                          <div className="flex flex-wrap items-center gap-1.5">
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
                    )}
                  </li>
                );
              })}
            </ol>
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

      {noteTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 shadow-xl"
          >
            <h3 className="font-display text-xl text-[var(--ink)]">
              備註 · {noteTarget.name}
            </h3>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={4}
              placeholder="例如：記得帶雨傘、想拍這角度…"
              className="mt-3 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--sea)]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteTarget(null)}
                className="rounded-lg px-3 py-2 text-sm text-[var(--ink-soft)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  saveNote(noteTarget.key, noteDraft);
                  setNoteTarget(null);
                }}
                className="rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-white"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
