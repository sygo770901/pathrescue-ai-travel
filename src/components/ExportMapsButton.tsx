'use client';

import type { TravelMode, TripGeneratorResponse } from '@/types/database';
import { buildTripGoogleMapsUrls } from '@/utils/exportMap';

interface ExportMapsButtonProps {
  trip: TripGeneratorResponse;
  travelMode?: TravelMode;
}

export function ExportMapsButton({
  trip,
  travelMode = 'transit',
}: ExportMapsButtonProps) {
  const links = buildTripGoogleMapsUrls(trip, travelMode);

  if (links.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-[var(--ink-soft)] uppercase">
        一鍵開啟今日路線
      </p>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <div key={link.day} className="flex flex-wrap gap-1">
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[var(--line)] bg-white/70 px-3 py-2 text-xs text-[var(--ink)] transition hover:border-[var(--sea)] hover:text-[var(--sea-deep)]"
            >
              Day {link.day} Google
            </a>
            {link.appleUrl && (
              <a
                href={link.appleUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-[var(--line)] bg-white/70 px-3 py-2 text-xs text-[var(--ink)] transition hover:border-[var(--sea)] hover:text-[var(--sea-deep)]"
              >
                Day {link.day} Apple
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
