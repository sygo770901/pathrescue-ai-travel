import type { ScheduleItem } from '@/types/database';

const GOOGLE_PLACES_BASE = 'https://places.googleapis.com/v1';
const GOOGLE_DIRECTIONS_BASE =
  'https://maps.googleapis.com/maps/api/directions/json';

function getServerMapsKey(): string {
  const key =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!key) {
    throw new Error(
      'Missing GOOGLE_MAPS_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
    );
  }

  return key;
}

export interface PlaceDetails {
  place_id: string;
  name: string;
  formatted_address: string | null;
  latitude: number;
  longitude: number;
  photo_url: string | null;
  opening_hours: string | null;
  rating: number | null;
  google_maps_uri: string | null;
}

export interface RouteLeg {
  distance_meters: number;
  duration_seconds: number;
  duration_mins: number;
  summary: string;
  polyline: string | null;
  start_address: string | null;
  end_address: string | null;
}

export interface RouteResult {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  mode: 'walking' | 'transit' | 'driving';
  legs: RouteLeg[];
  total_duration_mins: number;
  total_distance_meters: number;
  overview_polyline: string | null;
}

interface PlacesTextSearchResponse {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    photos?: Array<{ name?: string }>;
    regularOpeningHours?: { weekdayDescriptions?: string[] };
    rating?: number;
    googleMapsUri?: string;
  }>;
}

interface DirectionsApiResponse {
  status: string;
  error_message?: string;
  routes?: Array<{
    summary?: string;
    overview_polyline?: { points?: string };
    legs?: Array<{
      distance?: { value?: number; text?: string };
      duration?: { value?: number; text?: string };
      start_address?: string;
      end_address?: string;
      steps?: unknown[];
    }>;
  }>;
}

/**
 * Resolve a place name (optionally biased by coordinates) via Places API (New)
 * Text Search, then return verified details.
 */
export async function getPlaceDetails(
  placeName: string,
  options?: {
    latitude?: number;
    longitude?: number;
    destinationHint?: string;
    languageCode?: string;
  },
): Promise<PlaceDetails | null> {
  const apiKey = getServerMapsKey();
  const query = options?.destinationHint
    ? `${placeName}, ${options.destinationHint}`
    : placeName;

  const body: Record<string, unknown> = {
    textQuery: query,
    languageCode: options?.languageCode ?? 'zh-TW',
    maxResultCount: 1,
  };

  if (
    typeof options?.latitude === 'number' &&
    typeof options?.longitude === 'number'
  ) {
    body.locationBias = {
      circle: {
        center: {
          latitude: options.latitude,
          longitude: options.longitude,
        },
        radius: 5000,
      },
    };
  }

  const response = await fetch(`${GOOGLE_PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.photos,places.regularOpeningHours,places.rating,places.googleMapsUri',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Places Text Search failed (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as PlacesTextSearchResponse;
  const place = data.places?.[0];
  if (!place?.id || !place.location) {
    return null;
  }

  const lat = place.location.latitude;
  const lng = place.location.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  const photoResource = place.photos?.[0]?.name;
  const photo_url = photoResource
    ? `${GOOGLE_PLACES_BASE}/${photoResource}/media?maxHeightPx=800&maxWidthPx=1200&key=${apiKey}`
    : null;

  const opening_hours =
    place.regularOpeningHours?.weekdayDescriptions?.join(' | ') ?? null;

  return {
    place_id: place.id,
    name: place.displayName?.text ?? placeName,
    formatted_address: place.formattedAddress ?? null,
    latitude: lat,
    longitude: lng,
    photo_url,
    opening_hours,
    rating: place.rating ?? null,
    google_maps_uri: place.googleMapsUri ?? null,
  };
}

/**
 * Enrich a ScheduleItem with verified Place ID, photo, hours, and coordinates.
 */
export async function enrichScheduleItem(
  item: ScheduleItem,
  destinationHint?: string,
): Promise<ScheduleItem> {
  try {
    const details = await getPlaceDetails(item.place_name, {
      latitude: item.latitude,
      longitude: item.longitude,
      destinationHint,
    });

    if (!details) {
      return item;
    }

    return {
      ...item,
      place_name: details.name || item.place_name,
      latitude: details.latitude,
      longitude: details.longitude,
      place_id: details.place_id,
      photo_url: details.photo_url,
      opening_hours: details.opening_hours,
    };
  } catch {
    return item;
  }
}

/**
 * Calculate best route between two coordinates using Directions API.
 */
export async function calculateRoute(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  mode: 'walking' | 'transit' | 'driving' = 'transit',
): Promise<RouteResult> {
  const apiKey = getServerMapsKey();

  const params = new URLSearchParams({
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    mode,
    language: 'zh-TW',
    key: apiKey,
  });

  const response = await fetch(`${GOOGLE_DIRECTIONS_BASE}?${params.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Directions API failed (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as DirectionsApiResponse;

  if (data.status !== 'OK' || !data.routes?.[0]) {
    throw new Error(
      `Directions API status ${data.status}: ${data.error_message ?? 'no route'}`,
    );
  }

  const route = data.routes[0];
  const legs: RouteLeg[] = (route.legs ?? []).map((leg) => {
    const durationSeconds = leg.duration?.value ?? 0;
    return {
      distance_meters: leg.distance?.value ?? 0,
      duration_seconds: durationSeconds,
      duration_mins: Math.max(1, Math.round(durationSeconds / 60)),
      summary: route.summary ?? '',
      polyline: route.overview_polyline?.points ?? null,
      start_address: leg.start_address ?? null,
      end_address: leg.end_address ?? null,
    };
  });

  const total_duration_mins = legs.reduce(
    (sum, leg) => sum + leg.duration_mins,
    0,
  );
  const total_distance_meters = legs.reduce(
    (sum, leg) => sum + leg.distance_meters,
    0,
  );

  return {
    origin,
    destination,
    mode,
    legs,
    total_duration_mins,
    total_distance_meters,
    overview_polyline: route.overview_polyline?.points ?? null,
  };
}

/**
 * Fill travel_from_prev_mins / route_summary between consecutive schedule items.
 */
export async function enrichScheduleWithRoutes(
  schedule: ScheduleItem[],
  mode: 'walking' | 'transit' | 'driving' = 'transit',
): Promise<ScheduleItem[]> {
  if (schedule.length === 0) return schedule;

  const enriched: ScheduleItem[] = [{ ...schedule[0] }];

  for (let i = 1; i < schedule.length; i += 1) {
    const prev = enriched[i - 1];
    const current = schedule[i];

    try {
      const route = await calculateRoute(
        { latitude: prev.latitude, longitude: prev.longitude },
        { latitude: current.latitude, longitude: current.longitude },
        mode,
      );

      enriched.push({
        ...current,
        travel_from_prev_mins: route.total_duration_mins,
        route_summary: `${route.mode} · ${route.total_duration_mins} 分 · ${Math.round(route.total_distance_meters / 1000 * 10) / 10} km`,
      });
    } catch {
      enriched.push({
        ...current,
        travel_from_prev_mins: null,
        route_summary: null,
      });
    }
  }

  return enriched;
}
