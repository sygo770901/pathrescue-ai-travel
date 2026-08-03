'use client';

import type { RescueModeResponse } from '@/types/database';
import { buildGoogleMapsSearchUrl } from '@/utils/affiliate';

interface RescuePanelProps {
  rescue: RescueModeResponse | null;
}

export function RescuePanel({ rescue }: RescuePanelProps) {
  if (!rescue) return null;

  return (
    <section className="animate-rise space-y-3 rounded-2xl border border-[var(--line)] bg-white/60 p-4">
      <div>
        <p className="text-xs tracking-wide text-[var(--sea)] uppercase">
          Rescue Mode · {rescue.rescue_status}
        </p>
        <h3 className="font-display text-xl text-[var(--ink)]">
          {rescue.issue_handled}
        </h3>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          鄰近參考：{rescue.current_location_near}
        </p>
      </div>

      <ul className="space-y-2">
        {rescue.alternative_places.map((place) => (
          <li
            key={`${place.place_name}-${place.latitude}`}
            className="rounded-xl border border-[var(--line)] bg-[var(--paper)]/70 px-3 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-[var(--ink)]">
                  {place.place_name}
                </p>
                <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
                  {place.category} · 約 {Math.round(place.distance_meters)} 公尺
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
          </li>
        ))}
      </ul>
    </section>
  );
}
