import type {
  PlaceCategory,
  RescueAlternativePlace,
  ScheduleItem,
} from '@/types/database';

function mapCategory(raw: string): PlaceCategory {
  const lower = raw.toLowerCase();
  if (lower.includes('food') || lower.includes('餐') || lower.includes('cafe')) {
    return 'food';
  }
  if (lower.includes('shop') || lower.includes('購物')) return 'shopping';
  if (lower.includes('hotel') || lower.includes('住宿')) return 'accommodation';
  return 'attraction';
}

/** Convert SOS alternative into a schedule slot for replace/insert. */
export function rescuePlaceToScheduleItem(
  place: RescueAlternativePlace,
  template?: Partial<ScheduleItem>,
): ScheduleItem {
  return {
    time_slot: template?.time_slot ?? '12:00 - 13:00',
    place_name: place.place_name,
    category: mapCategory(place.category),
    estimated_stay_mins: template?.estimated_stay_mins ?? 60,
    latitude: place.latitude,
    longitude: place.longitude,
    reason_to_visit: place.why_this_is_a_good_backup,
    suggested_affiliate_type: place.suggested_affiliate_type ?? 'none',
    affiliate_search_query:
      place.affiliate_search_query ?? place.place_name,
    place_id: place.place_id ?? null,
    photo_url: place.photo_url ?? null,
    travel_from_prev_mins: template?.travel_from_prev_mins ?? 15,
    trust: place.place_id ? 'verified' : 'name_only',
    status: 'pending',
  };
}
