'use client';

import type { RescueAlternativePlace, RescueModeResponse } from '@/types/database';
import { buildGoogleMapsSearchUrl } from '@/utils/affiliate';

interface RescuePanelProps {
  rescue: RescueModeResponse | null;
  compact?: boolean;
  onReplaceCurrent?: (place: RescueAlternativePlace) => void;
  onInsertNext?: (place: RescueAlternativePlace) => void;
  onDismiss?: () => void;
}

export function RescuePanel({
  rescue,
  compact = false,
  onReplaceCurrent,
  onInsertNext,
  onDismiss,
}: RescuePanelProps) {
  if (!rescue) return null;

  const actionable = Boolean(onReplaceCurrent || onInsertNext);

  return (
    <section
      className={
        compact
          ? 'space-y-3 rounded-2xl border border-[var(--danger)]/25 bg-white/90 p-4'
          : 'animate-rise space-y-3 rounded-2xl border border-[var(--line)] bg-white/60 p-4'
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs tracking-wide text-[var(--danger)] uppercase">
            現場救援 · {rescue.rescue_status}
          </p>
          <h3 className="font-display text-xl text-[var(--ink)]">
            {rescue.issue_handled}
          </h3>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            鄰近參考：{rescue.current_location_near}
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-xs text-[var(--ink-soft)]"
          >
            關閉
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {rescue.alternative_places.map((place) => (
          <li
            key={`${place.place_name}-${place.latitude}`}
            className="rounded-xl border border-[var(--line)] bg-[var(--paper)]/70 px-3 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-[var(--ink)]">{place.place_name}</p>
                <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                  {place.category} · 約 {Math.round(place.distance_meters)} 公尺
                  {place.place_id ? ' · 🟢 已驗證' : ' · 🟡 名稱搜尋'}
                </p>
              </div>
              <a
                href={
                  place.place_id
                    ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
                    : buildGoogleMapsSearchUrl(place.place_name)
                }
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-md bg-[var(--sea)] px-2.5 py-1 text-[11px] text-white"
              >
                導航
              </a>
            </div>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              {place.why_this_is_a_good_backup}
            </p>

            {actionable && (
              <div className="mt-3 flex flex-wrap gap-2">
                {onReplaceCurrent && (
                  <button
                    type="button"
                    onClick={() => onReplaceCurrent(place)}
                    className="rounded-md bg-[var(--ink)] px-2.5 py-1.5 text-[11px] text-white"
                  >
                    取代目前景點
                  </button>
                )}
                {onInsertNext && (
                  <button
                    type="button"
                    onClick={() => onInsertNext(place)}
                    className="rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 text-[11px] text-[var(--ink)]"
                  >
                    插入下一站
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
