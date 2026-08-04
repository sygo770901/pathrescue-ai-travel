import type { ScheduleItem } from '@/types/database';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parse "HH:MM" into minutes from midnight. */
export function parseTimeToMinutes(time: string): number | null {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

export function minutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${pad2(hours)}:${pad2(mins)}`;
}

/** Parse "09:00 - 11:30" into start/end minutes. */
export function parseTimeSlot(
  timeSlot: string,
): { start: number; end: number } | null {
  const parts = timeSlot.split('-').map((p) => p.trim());
  if (parts.length !== 2) return null;
  const start = parseTimeToMinutes(parts[0]);
  const end = parseTimeToMinutes(parts[1]);
  if (start === null || end === null) return null;
  return { start, end };
}

export function formatTimeSlot(startMins: number, endMins: number): string {
  return `${minutesToTime(startMins)} - ${minutesToTime(endMins)}`;
}

/**
 * Recalculate a day's schedule timeline after edit/replace/delete/reorder.
 * Uses estimated_stay_mins + travel_from_prev_mins to cascade time_slot.
 */
export function recalculateDayTimeline(
  schedule: ScheduleItem[],
  options?: { dayStartMins?: number },
): ScheduleItem[] {
  if (schedule.length === 0) return schedule;

  const dayStart =
    options?.dayStartMins ??
    parseTimeSlot(schedule[0].time_slot)?.start ??
    9 * 60;

  let cursor = dayStart;
  const result: ScheduleItem[] = [];

  for (let i = 0; i < schedule.length; i += 1) {
    const item = schedule[i];
    const travel =
      i === 0 ? 0 : Math.max(0, item.travel_from_prev_mins ?? 15);

    if (i > 0) {
      cursor += travel;
    }

    const stay = Math.max(15, item.estimated_stay_mins || 60);
    const start = cursor;
    const end = start + stay;

    result.push({
      ...item,
      time_slot: formatTimeSlot(start, end),
      estimated_stay_mins: stay,
      travel_from_prev_mins: i === 0 ? null : travel,
    });

    cursor = end;
  }

  return result;
}

/**
 * Replace one slot and recalculate the day timeline.
 */
export function replaceSlotAndRecalculate(
  schedule: ScheduleItem[],
  index: number,
  replacement: ScheduleItem,
): ScheduleItem[] {
  if (index < 0 || index >= schedule.length) return schedule;

  const next = schedule.map((item, i) =>
    i === index
      ? {
          ...replacement,
          travel_from_prev_mins: item.travel_from_prev_mins,
        }
      : item,
  );

  return recalculateDayTimeline(next);
}
