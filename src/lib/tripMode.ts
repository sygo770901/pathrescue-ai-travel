import type {
  AppTripMode,
  ScheduleItem,
  TripGeneratorResponse,
} from '@/types/database';

const MODE_OVERRIDE_KEY = 'pathrescue:mode_override';

export type ModeOverride = 'auto' | 'planning' | 'ontrip';

/** Parse YYYY-MM-DD as local calendar date (no TZ shift). */
export function parseLocalDate(isoDate: string): Date | null {
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(isoDate: string, days: number): string | null {
  const base = parseLocalDate(isoDate);
  if (!base) return null;
  base.setDate(base.getDate() + days);
  return formatLocalISODate(base);
}

export function getTripEndDate(
  startDate: string,
  totalDays: number,
): string | null {
  return addDays(startDate, Math.max(1, totalDays) - 1);
}

/** 1-based day index for today, or null if outside trip window / no start. */
export function getTodayTripDay(
  trip: Pick<TripGeneratorResponse, 'start_date' | 'total_days'>,
  today = new Date(),
): number | null {
  if (!trip.start_date) return null;
  const start = parseLocalDate(trip.start_date);
  if (!start) return null;

  const endIso = getTripEndDate(trip.start_date, trip.total_days);
  const end = endIso ? parseLocalDate(endIso) : null;
  if (!end) return null;

  const todayMid = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  if (todayMid < start || todayMid > end) return null;

  const diffMs = todayMid.getTime() - start.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

export function formatTripDayLabel(
  startDate: string | null | undefined,
  day: number,
): string {
  if (!startDate) return `Day ${day}`;
  const iso = addDays(startDate, day - 1);
  if (!iso) return `Day ${day}`;
  const date = parseLocalDate(iso);
  if (!date) return `Day ${day}`;

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const month = date.getMonth() + 1;
  const dateNum = date.getDate();
  const weekday = weekdays[date.getDay()];
  return `Day ${day} · ${month}月${dateNum}日 (${weekday})`;
}

export function resolveAppTripMode(
  trip: Pick<TripGeneratorResponse, 'start_date' | 'total_days'> | null,
  override: ModeOverride = 'auto',
  today = new Date(),
): AppTripMode {
  if (override === 'planning') return 'planning';
  if (override === 'ontrip') return 'ontrip';
  if (!trip?.start_date) return 'planning';
  return getTodayTripDay(trip, today) !== null ? 'ontrip' : 'planning';
}

export function loadModeOverride(): ModeOverride {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = localStorage.getItem(MODE_OVERRIDE_KEY);
    if (raw === 'planning' || raw === 'ontrip' || raw === 'auto') return raw;
  } catch {
    // ignore
  }
  return 'auto';
}

export function saveModeOverride(override: ModeOverride) {
  try {
    localStorage.setItem(MODE_OVERRIDE_KEY, override);
  } catch {
    // ignore
  }
}

export interface FocusSlot {
  day: number;
  index: number;
  item: ScheduleItem;
}

/** First incomplete slot of a day (pending / undefined). */
export function findNextFocusSlot(
  trip: TripGeneratorResponse,
  dayNumber: number,
): FocusSlot | null {
  const day = trip.itinerary.find((d) => d.day === dayNumber);
  if (!day) return null;

  for (let index = 0; index < day.schedule.length; index += 1) {
    const item = day.schedule[index];
    const status = item.status ?? 'pending';
    if (status === 'pending') {
      return { day: dayNumber, index, item };
    }
  }
  return null;
}

export function haversineDistanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rough walking ETA assuming 80 m/min. */
export function estimateWalkMins(distanceMeters: number): number {
  return Math.max(1, Math.round(distanceMeters / 80));
}
