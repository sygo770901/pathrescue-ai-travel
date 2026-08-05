import type { TripGeneratorResponse } from '@/types/database';

const LATEST_KEY = 'pathrescue:latest_trip';
const INDEX_KEY = 'pathrescue:trip_index';
const TRIP_PREFIX = 'pathrescue:trip:';
const MAX_CACHED_TRIPS = 3;

export interface CachedTripRecord {
  tripId: string;
  trip: TripGeneratorResponse;
  savedAt: string;
  isPublic?: boolean;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function tripKey(tripId: string): string {
  return `${TRIP_PREFIX}${tripId}`;
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    const message = error instanceof Error ? error.message : String(error);
    return /quota|exceeded/i.test(message);
  }
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22
  );
}

/** Drop heavy fields so LocalStorage stays small. */
function compactTrip(trip: TripGeneratorResponse): TripGeneratorResponse {
  return {
    ...trip,
    itinerary: trip.itinerary.map((day) => ({
      ...day,
      schedule: day.schedule.map((item) => ({
        ...item,
        photo_url: null,
        reason_to_visit:
          item.reason_to_visit.length > 180
            ? `${item.reason_to_visit.slice(0, 177)}...`
            : item.reason_to_visit,
      })),
    })),
  };
}

function readIndex(): string[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(ids: string[]): void {
  window.localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

/** Remove oldest trip entries until at most `keep` remain. */
function trimTripCache(keepCurrentId?: string, keep = MAX_CACHED_TRIPS): void {
  if (!canUseStorage()) return;

  let ids = readIndex().filter((id) => {
    const exists = window.localStorage.getItem(tripKey(id)) !== null;
    return exists;
  });

  if (keepCurrentId && !ids.includes(keepCurrentId)) {
    ids = [...ids, keepCurrentId];
  }

  // Newest at end
  while (ids.length > keep) {
    const removed = ids.shift();
    if (!removed) break;
    if (removed === keepCurrentId && ids.length === 0) break;
    window.localStorage.removeItem(tripKey(removed));
  }

  writeIndex(ids.filter((id) => id !== undefined));
}

/**
 * Clear PathRescue LocalStorage keys that eat quota
 * (trips, places, notes). Keeps mode override.
 */
export function clearPathRescueCache(options?: {
  keepLatest?: boolean;
}): void {
  if (!canUseStorage()) return;

  const keepLatest = options?.keepLatest ?? false;
  const latest = keepLatest ? window.localStorage.getItem(LATEST_KEY) : null;
  const keys: string[] = [];

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (
      key.startsWith('pathrescue:trip') ||
      key.startsWith('pathrescue:place:') ||
      key.startsWith('pathrescue:note:') ||
      key === LATEST_KEY ||
      key === INDEX_KEY
    ) {
      keys.push(key);
    }
  }

  for (const key of keys) {
    window.localStorage.removeItem(key);
  }

  if (keepLatest && latest) {
    try {
      window.localStorage.setItem(LATEST_KEY, latest);
      const parsed = JSON.parse(latest) as CachedTripRecord;
      if (parsed.tripId) {
        window.localStorage.setItem(tripKey(parsed.tripId), latest);
        writeIndex([parsed.tripId]);
      }
    } catch {
      // ignore
    }
  }
}

function trySet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isQuotaError(error)) return false;
    return false;
  }
}

/**
 * Save trip to LocalStorage safely.
 * Never throws. Returns false if still unable to persist after cleanup.
 */
export function saveTripToCache(
  tripId: string,
  trip: TripGeneratorResponse,
  options?: { isPublic?: boolean },
): boolean {
  if (!canUseStorage()) return false;

  const record: CachedTripRecord = {
    tripId,
    trip: compactTrip(trip),
    savedAt: new Date().toISOString(),
    isPublic: options?.isPublic,
  };

  const serialized = JSON.stringify(record);

  const writeAll = (): boolean => {
    const okLatest = trySet(LATEST_KEY, serialized);
    const okTrip = trySet(tripKey(tripId), serialized);
    if (!okLatest || !okTrip) return false;

    const ids = readIndex().filter((id) => id !== tripId);
    ids.push(tripId);
    try {
      writeIndex(ids);
    } catch {
      // index is optional
    }
    trimTripCache(tripId, MAX_CACHED_TRIPS);
    return true;
  };

  if (writeAll()) return true;

  // 1st recovery: trim old trips + place cache
  trimTripCache(tripId, 1);
  try {
    const placeKeys = Object.keys(window.localStorage).filter((k) =>
      k.startsWith('pathrescue:place:'),
    );
    for (const key of placeKeys) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }

  if (writeAll()) return true;

  // 2nd recovery: wipe PathRescue caches, keep only this trip
  clearPathRescueCache({ keepLatest: false });
  return writeAll();
}

export function getLatestCachedTrip(): CachedTripRecord | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(LATEST_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedTripRecord;
  } catch {
    return null;
  }
}

export function getCachedTripById(tripId: string): CachedTripRecord | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(tripKey(tripId));
    if (!raw) return null;
    return JSON.parse(raw) as CachedTripRecord;
  } catch {
    return null;
  }
}

export function isBrowserOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

/** Rough estimate of PathRescue LocalStorage usage (chars). */
export function getPathRescueCacheSize(): number {
  if (!canUseStorage()) return 0;
  let total = 0;
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith('pathrescue:')) continue;
    total += key.length + (window.localStorage.getItem(key)?.length ?? 0);
  }
  return total;
}
