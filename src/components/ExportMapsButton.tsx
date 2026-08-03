'use client';

import type { TripGeneratorResponse } from '@/types/database';
import { buildTripGoogleMapsUrls } from '@/utils/googleMapsExport';

interface ExportMapsButtonProps {
  trip: TripGeneratorResponse;
}

export function ExportMapsButton({ trip }: ExportMapsButtonProps) {
  const links = buildTripGoogleMapsUrls(trip);

  if (links.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-[var(--ink-soft)] uppercase">
        一鍵匯入 Google Maps
      </p>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.day}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-[var(--line)] bg-white/70 px-3 py-2 text-xs text-[var(--ink)] transition hover:border-[var(--sea)] hover:text-[var(--sea-deep)]"
          >
            Day {link.day} 路線
          </a>
        ))}
      </div>
    </div>
  );
}
