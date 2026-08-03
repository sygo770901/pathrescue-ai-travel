import type { ItineraryDay, ScheduleItem, TripGeneratorResponse } from '@/types/database';

/**
 * Build a Google Maps multi-stop directions URL for one day.
 * Format: https://www.google.com/maps/dir/?api=1&origin=...&destination=...&waypoints=...
 */
export function buildDayGoogleMapsUrl(day: ItineraryDay): string | null {
  const points = day.schedule.filter(
    (item) =>
      typeof item.latitude === 'number' && typeof item.longitude === 'number',
  );

  if (points.length === 0) return null;

  if (points.length === 1) {
    const only = points[0];
    if (only.place_id) {
      return `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(only.place_id)}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${only.latitude},${only.longitude}`)}`;
  }

  const origin = `${points[0].latitude},${points[0].longitude}`;
  const destination = `${points[points.length - 1].latitude},${points[points.length - 1].longitude}`;
  const middle = points.slice(1, -1);

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'transit',
  });

  if (middle.length > 0) {
    params.set(
      'waypoints',
      middle.map((p) => `${p.latitude},${p.longitude}`).join('|'),
    );
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Build a list of per-day Google Maps import URLs for an entire trip.
 */
export function buildTripGoogleMapsUrls(
  trip: TripGeneratorResponse,
): Array<{ day: number; theme: string; url: string }> {
  return trip.itinerary
    .map((day) => {
      const url = buildDayGoogleMapsUrl(day);
      if (!url) return null;
      return { day: day.day, theme: day.theme, url };
    })
    .filter(
      (item): item is { day: number; theme: string; url: string } =>
        item !== null,
    );
}

/**
 * Flatten all schedule items across days (useful for map markers).
 */
export function flattenScheduleItems(
  trip: TripGeneratorResponse,
): Array<ScheduleItem & { day: number; theme: string }> {
  return trip.itinerary.flatMap((day) =>
    day.schedule.map((item) => ({
      ...item,
      day: day.day,
      theme: day.theme,
    })),
  );
}
