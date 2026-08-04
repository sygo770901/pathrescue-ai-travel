import type {
  ItineraryDay,
  ScheduleItem,
  TravelMode,
  TripGeneratorResponse,
} from '@/types/database';

function toLatLng(item: ScheduleItem): string {
  return `${item.latitude},${item.longitude}`;
}

function filterPoints(schedule: ScheduleItem[]): ScheduleItem[] {
  return schedule.filter(
    (item) =>
      typeof item.latitude === 'number' && typeof item.longitude === 'number',
  );
}

/**
 * Google Maps multi-stop directions URL.
 * origin = first, destination = last, middle = waypoints joined by |
 */
export function generateGoogleMapsDirUrl(
  schedule: ScheduleItem[],
  mode: TravelMode = 'transit',
): string | null {
  const points = filterPoints(schedule);
  if (points.length === 0) return null;

  if (points.length === 1) {
    const only = points[0];
    if (only.place_id) {
      return `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(only.place_id)}`;
    }
    if (only.maps_search_url) return only.maps_search_url;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(only.place_name)}`;
  }

  const origin = toLatLng(points[0]);
  const destination = toLatLng(points[points.length - 1]);
  const middle = points.slice(1, -1);

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: mode,
  });

  if (middle.length > 0) {
    params.set('waypoints', middle.map((p) => toLatLng(p)).join('|'));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Apple Maps multi-stop directions URL.
 * Uses daddr chain: first as source address via saddr, rest via daddr +to:
 */
export function generateAppleMapsUrl(
  schedule: ScheduleItem[],
  mode: TravelMode = 'transit',
): string | null {
  const points = filterPoints(schedule);
  if (points.length === 0) return null;

  const dirFlag =
    mode === 'driving' ? 'd' : mode === 'walking' ? 'w' : 'r';

  if (points.length === 1) {
    const only = points[0];
    return `https://maps.apple.com/?q=${encodeURIComponent(only.place_name)}&ll=${only.latitude},${only.longitude}`;
  }

  const saddr = toLatLng(points[0]);
  const daddr = points
    .slice(1)
    .map((p) => toLatLng(p))
    .join('+to:');

  return `https://maps.apple.com/?saddr=${encodeURIComponent(saddr)}&daddr=${encodeURIComponent(daddr)}&dirflg=${dirFlag}`;
}

export function buildDayGoogleMapsUrl(
  day: ItineraryDay,
  mode: TravelMode = 'transit',
): string | null {
  return generateGoogleMapsDirUrl(day.schedule, mode);
}

export function buildTripGoogleMapsUrls(
  trip: TripGeneratorResponse,
  mode: TravelMode = 'transit',
): Array<{ day: number; theme: string; url: string; appleUrl: string | null }> {
  return trip.itinerary
    .map((day) => {
      const url = generateGoogleMapsDirUrl(day.schedule, mode);
      if (!url) return null;
      return {
        day: day.day,
        theme: day.theme,
        url,
        appleUrl: generateAppleMapsUrl(day.schedule, mode),
      };
    })
    .filter(
      (
        item,
      ): item is {
        day: number;
        theme: string;
        url: string;
        appleUrl: string | null;
      } => item !== null,
    );
}

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
