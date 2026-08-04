import type { ScheduleItem, TravelMode } from '@/types/database';

/** Stable unique key for a schedule slot (works with or without place_id). */
export function makePlaceKey(
  day: number,
  index: number,
  item?: Pick<ScheduleItem, 'place_id' | 'place_name' | 'latitude' | 'longitude'>,
): string {
  if (item?.place_id) {
    return `pid:${item.place_id}:d${day}:i${index}`;
  }
  if (item) {
    const lat = Number(item.latitude).toFixed(5);
    const lng = Number(item.longitude).toFixed(5);
    return `coord:${lat},${lng}:d${day}:i${index}:${item.place_name}`;
  }
  return `slot:d${day}:i${index}`;
}

export interface PlaceFocusTarget {
  key: string;
  day: number;
  index: number;
  latitude: number;
  longitude: number;
  place_name: string;
  place_id?: string | null;
}

export function toFocusTarget(
  day: number,
  index: number,
  item: ScheduleItem,
): PlaceFocusTarget {
  return {
    key: makePlaceKey(day, index, item),
    day,
    index,
    latitude: item.latitude,
    longitude: item.longitude,
    place_name: item.place_name,
    place_id: item.place_id,
  };
}

export function travelModeIcon(mode: TravelMode): string {
  if (mode === 'walking') return '步行';
  if (mode === 'driving') return '開車';
  return '大眾運輸';
}

export function formatTravelLabel(
  mins: number | null | undefined,
  summary: string | null | undefined,
  mode: TravelMode,
): string | null {
  if (typeof mins !== 'number' || mins <= 0) {
    return summary?.trim() || null;
  }
  if (summary?.trim()) return summary.trim();
  return `${travelModeIcon(mode)} ${mins} 分鐘`;
}
