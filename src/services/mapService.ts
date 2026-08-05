import type { ScheduleItem, TravelMode } from '@/types/database';
import { buildKeywordMapsSearchUrl } from '@/utils/mapsUrl';
const GOOGLE_PLACES_BASE = 'https://places.googleapis.com/v1';
const GOOGLE_DIRECTIONS_BASE =
  'https://maps.googleapis.com/maps/api/directions/json';
const GOOGLE_DISTANCE_MATRIX_BASE =
  'https://maps.googleapis.com/maps/api/distancematrix/json';

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
  mode: TravelMode;
  legs: RouteLeg[];
  total_duration_mins: number;
  total_distance_meters: number;
  overview_polyline: string | null;
}

export interface TransitTimeResult {
  duration_mins: number;
  distance_meters: number;
  mode: TravelMode;
  summary: string;
}

export interface NearbyPlace {
  place_id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  distance_meters?: number;
  maps_url: string;
}

export type NearbyFacilityType =
  | 'convenience_store'
  | 'atm'
  | 'drugstore'
  | 'toilet';

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
  const fallbackUrl = buildKeywordMapsSearchUrl(
    item.place_name,
    destinationHint,
  );

  try {
    const details = await getPlaceDetails(item.place_name, {
      latitude: item.latitude,
      longitude: item.longitude,
      destinationHint,
    });

    if (!details) {
      return {
        ...item,
        maps_search_url: fallbackUrl,
        trust: item.trust ?? 'name_only',
        status: item.status ?? 'pending',
      };
    }

    return {
      ...item,
      place_name: details.name || item.place_name,
      latitude: details.latitude,
      longitude: details.longitude,
      place_id: details.place_id,
      photo_url: details.photo_url,
      opening_hours: details.opening_hours,
      maps_search_url: details.google_maps_uri ?? fallbackUrl,
      trust: 'verified',
      status: item.status ?? 'pending',
    };
  } catch {
    return {
      ...item,
      maps_search_url: fallbackUrl,
      trust: item.trust ?? 'name_only',
      status: item.status ?? 'pending',
    };
  }
}

/**
 * Calculate best route between two coordinates using Directions API.
 */
export async function calculateRoute(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  mode: TravelMode = 'transit',
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
  mode: TravelMode = 'transit',
): Promise<ScheduleItem[]> {
  if (schedule.length === 0) return schedule;

  const enriched: ScheduleItem[] = [{ ...schedule[0] }];

  for (let i = 1; i < schedule.length; i += 1) {
    const prev = enriched[i - 1];
    const current = schedule[i];

    try {
      const transit = await getTransitTime(
        { latitude: prev.latitude, longitude: prev.longitude },
        { latitude: current.latitude, longitude: current.longitude },
        mode,
      );

      enriched.push({
        ...current,
        travel_from_prev_mins: transit.duration_mins,
        route_summary: transit.summary,
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

/**
 * Estimate travel time between two points via Distance Matrix (fallback Directions).
 */
export async function getTransitTime(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  mode: TravelMode = 'transit',
): Promise<TransitTimeResult> {
  try {
    const apiKey = getServerMapsKey();
    const params = new URLSearchParams({
      origins: `${origin.latitude},${origin.longitude}`,
      destinations: `${destination.latitude},${destination.longitude}`,
      mode,
      language: 'zh-TW',
      key: apiKey,
    });

    const response = await fetch(
      `${GOOGLE_DISTANCE_MATRIX_BASE}?${params.toString()}`,
    );

    if (response.ok) {
      const data = (await response.json()) as {
        status: string;
        rows?: Array<{
          elements?: Array<{
            status?: string;
            duration?: { value?: number; text?: string };
            distance?: { value?: number; text?: string };
          }>;
        }>;
      };

      const element = data.rows?.[0]?.elements?.[0];
      if (data.status === 'OK' && element?.status === 'OK') {
        const durationMins = Math.max(
          1,
          Math.round((element.duration?.value ?? 60) / 60),
        );
        const distanceMeters = element.distance?.value ?? 0;
        const modeLabel =
          mode === 'walking' ? '步行' : mode === 'driving' ? '駕車' : '大眾運輸';
        return {
          duration_mins: durationMins,
          distance_meters: distanceMeters,
          mode,
          summary: `${modeLabel} ${durationMins} 分鐘`,
        };
      }
    }
  } catch {
    // fall through to Directions
  }

  const route = await calculateRoute(origin, destination, mode);
  const modeLabel =
    mode === 'walking' ? '步行' : mode === 'driving' ? '駕車' : '大眾運輸';
  return {
    duration_mins: route.total_duration_mins,
    distance_meters: route.total_distance_meters,
    mode,
    summary: `${modeLabel} ${route.total_duration_mins} 分鐘`,
  };
}

const NEARBY_TYPE_MAP: Record<
  NearbyFacilityType,
  { includedType: string; label: string }
> = {
  convenience_store: {
    includedType: 'convenience_store',
    label: '超商',
  },
  atm: { includedType: 'atm', label: 'ATM' },
  drugstore: { includedType: 'drugstore', label: '藥妝' },
  toilet: { includedType: 'public_bathroom', label: '廁所' },
};

/**
 * Nearby Search around the midpoint between two schedule points.
 */
export async function searchNearbyAlongRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  facility: NearbyFacilityType,
  radiusMeters = 600,
): Promise<NearbyPlace[]> {
  const apiKey = getServerMapsKey();
  const mid = {
    latitude: (from.latitude + to.latitude) / 2,
    longitude: (from.longitude + to.longitude) / 2,
  };
  const meta = NEARBY_TYPE_MAP[facility];

  const response = await fetch(`${GOOGLE_PLACES_BASE}/places:searchNearby`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.location,places.googleMapsUri,places.types',
    },
    body: JSON.stringify({
      includedTypes: [meta.includedType],
      maxResultCount: 5,
      languageCode: 'zh-TW',
      locationRestriction: {
        circle: {
          center: mid,
          radius: radiusMeters,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Nearby Search failed (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      location?: { latitude?: number; longitude?: number };
      googleMapsUri?: string;
      types?: string[];
    }>;
  };

  return (data.places ?? [])
    .map((place) => {
      const lat = place.location?.latitude;
      const lng = place.location?.longitude;
      if (!place.id || typeof lat !== 'number' || typeof lng !== 'number') {
        return null;
      }
      const name = place.displayName?.text ?? meta.label;
      return {
        place_id: place.id,
        name,
        category: meta.label,
        latitude: lat,
        longitude: lng,
        maps_url:
          place.googleMapsUri ??
          buildKeywordMapsSearchUrl(name),
      } satisfies NearbyPlace;
    })
    .filter((p): p is NearbyPlace => p !== null);
}
