import type { TripGeneratorResponse } from '@/types/database';

const LATEST_KEY = 'pathrescue:latest_trip';
const tripKey = (tripId: string) => `pathrescue:trip:${tripId}`;

export interface CachedTripRecord {
  tripId: string;
  trip: TripGeneratorResponse;
  savedAt: string;
  isPublic?: boolean;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveTripToCache(
  tripId: string,
  trip: TripGeneratorResponse,
  options?: { isPublic?: boolean },
): void {
  if (!canUseStorage()) return;

  const record: CachedTripRecord = {
    tripId,
    trip,
    savedAt: new Date().toISOString(),
    isPublic: options?.isPublic,
  };

  const serialized = JSON.stringify(record);
  window.localStorage.setItem(LATEST_KEY, serialized);
  window.localStorage.setItem(tripKey(tripId), serialized);
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
