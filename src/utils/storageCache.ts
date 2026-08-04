const PLACE_PREFIX = 'pathrescue:place:';
const MAX_PLACE_ENTRIES = 80;

export interface CachedPlaceDetails {
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

export interface CachedPlaceRecord {
  key: string;
  details: CachedPlaceDetails;
  savedAt: string;
}

export { buildKeywordMapsSearchUrl } from '@/utils/mapsUrl';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function placeStorageKey(name: string, destinationHint?: string): string {
  return `${PLACE_PREFIX}${destinationHint ?? 'global'}:${name.trim().toLowerCase()}`;
}

export function savePlaceDetailsCache(
  placeName: string,
  details: CachedPlaceDetails,
  destinationHint?: string,
): void {
  if (!canUseStorage()) return;

  try {
    const key = placeStorageKey(placeName, destinationHint);
    const record: CachedPlaceRecord = {
      key,
      details,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(key, JSON.stringify(record));
    trimPlaceCache();
  } catch {
    // quota / private mode — ignore
  }
}

export function getPlaceDetailsCache(
  placeName: string,
  destinationHint?: string,
): CachedPlaceDetails | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(
      placeStorageKey(placeName, destinationHint),
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPlaceRecord;
    return parsed.details ?? null;
  } catch {
    return null;
  }
}

function trimPlaceCache(): void {
  if (!canUseStorage()) return;

  const keys = Object.keys(window.localStorage).filter((k) =>
    k.startsWith(PLACE_PREFIX),
  );
  if (keys.length <= MAX_PLACE_ENTRIES) return;

  const scored = keys
    .map((key) => {
      try {
        const raw = window.localStorage.getItem(key);
        const savedAt = raw
          ? (JSON.parse(raw) as CachedPlaceRecord).savedAt
          : '';
        return { key, savedAt };
      } catch {
        return { key, savedAt: '' };
      }
    })
    .sort((a, b) => a.savedAt.localeCompare(b.savedAt));

  const removeCount = keys.length - MAX_PLACE_ENTRIES;
  for (let i = 0; i < removeCount; i += 1) {
    window.localStorage.removeItem(scored[i].key);
  }
}
