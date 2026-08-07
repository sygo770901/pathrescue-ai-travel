/** Trip direction chips — max 2 selectable */
export const TRIP_DIRECTION_OPTIONS = [
  { id: 'dir_food', label: '美食探索' },
  { id: 'dir_culture', label: '文化古蹟' },
  { id: 'dir_nature', label: '自然戶外' },
  { id: 'dir_shopping', label: '購物血拼' },
  { id: 'dir_relax', label: '放鬆慢活' },
  { id: 'dir_family', label: '親子友善' },
  { id: 'dir_sport', label: '運動健身' },
  { id: 'dir_nightlife', label: '夜生活' },
] as const;

/** Activity / want-to-do chips — multi-select */
export const ACTIVITY_OPTIONS = [
  { id: 'act_coffee', label: '咖啡／下午茶' },
  { id: 'act_local_food', label: '拉麵／在地小吃' },
  { id: 'act_tennis', label: '網球／運動' },
  { id: 'act_onsen', label: '溫泉' },
  { id: 'act_market', label: '市集小攤' },
  { id: 'act_photo', label: '觀景拍照' },
  { id: 'act_museum', label: '美術館' },
  { id: 'act_bar', label: '酒吧' },
  { id: 'act_park', label: '公園散步' },
  { id: 'act_nightlife_food', label: '夜市宵夜' },
  { id: 'act_shopping', label: '藥妝購物' },
  { id: 'act_temple', label: '寺廟神社' },
  { id: 'act_hiking', label: '健行登山' },
  { id: 'act_kids', label: '親子設施' },
] as const;

export type TripDirectionId = (typeof TRIP_DIRECTION_OPTIONS)[number]['id'];
export type ActivityId = (typeof ACTIVITY_OPTIONS)[number]['id'];

export const MAX_DIRECTIONS = 2;

export function preferenceLabel(id: string): string {
  const dir = TRIP_DIRECTION_OPTIONS.find((o) => o.id === id);
  if (dir) return dir.label;
  const act = ACTIVITY_OPTIONS.find((o) => o.id === id);
  if (act) return act.label;
  return id;
}
