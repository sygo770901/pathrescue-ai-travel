import type { TripGeneratorResponse } from '@/types/database';

/** Encode trip into URL-hash-safe base64 (unicode-safe). */
export function encodeTripForShare(trip: TripGeneratorResponse): string {
  const json = JSON.stringify(trip);
  if (typeof window !== 'undefined') {
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  return Buffer.from(json, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function decodeTripFromShare(encoded: string): TripGeneratorResponse {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLength);

  let json: string;
  if (typeof window !== 'undefined') {
    json = decodeURIComponent(escape(atob(base64)));
  } else {
    json = Buffer.from(base64, 'base64').toString('utf8');
  }

  return JSON.parse(json) as TripGeneratorResponse;
}

export function buildLocalShareUrl(
  origin: string,
  trip: TripGeneratorResponse,
): string {
  const encoded = encodeTripForShare(trip);
  return `${origin.replace(/\/$/, '')}/share/p#${encoded}`;
}
