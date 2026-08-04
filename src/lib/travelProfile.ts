import type {
  DietaryPreference,
  TravelBudget,
  TravelCompanion,
  TravelMode,
  TravelPace,
  TravelTransport,
  UserTravelProfile,
} from '@/types/database';

export const PACE_OPTIONS: Array<{ id: TravelPace; label: string }> = [
  { id: 'relaxed', label: '鬆散慢活' },
  { id: 'balanced', label: '標準平衡' },
  { id: 'packed', label: '特種兵行程' },
];

export const COMPANION_OPTIONS: Array<{ id: TravelCompanion; label: string }> = [
  { id: 'solo', label: '獨旅' },
  { id: 'couple', label: '情侶/夫妻' },
  { id: 'family_kids', label: '帶小孩 (推車友善)' },
  { id: 'with_elders', label: '長輩同行 (低步行/少樓梯)' },
];

export const BUDGET_OPTIONS: Array<{ id: TravelBudget; label: string }> = [
  { id: 'budget', label: '小資省錢' },
  { id: 'comfort', label: '中等舒適' },
  { id: 'luxury', label: '奢華享受' },
];

export const TRANSPORT_OPTIONS: Array<{ id: TravelTransport; label: string }> = [
  { id: 'transit', label: '大眾運輸' },
  { id: 'driving', label: '租車自駕' },
  { id: 'taxi', label: '全程計程車/包車' },
  { id: 'walking', label: '純步行' },
];

export const DIETARY_OPTIONS: Array<{ id: DietaryPreference; label: string }> = [
  { id: 'vegetarian', label: '素食' },
  { id: 'no_beef', label: '不吃牛肉' },
  { id: 'local_snacks', label: '在地小吃優先' },
  { id: 'famous_queues', label: '排隊名店 OK' },
];

export const DEFAULT_USER_PROFILE: UserTravelProfile = {
  pace: 'balanced',
  companions: 'couple',
  budget: 'comfort',
  transport: 'transit',
  dietary: ['local_snacks'],
};

export function transportToTravelMode(transport: TravelTransport): TravelMode {
  if (transport === 'walking') return 'walking';
  if (transport === 'driving' || transport === 'taxi') return 'driving';
  return 'transit';
}

export function profileLabel(profile: UserTravelProfile): string {
  const pace = PACE_OPTIONS.find((o) => o.id === profile.pace)?.label ?? profile.pace;
  const companions =
    COMPANION_OPTIONS.find((o) => o.id === profile.companions)?.label ??
    profile.companions;
  const budget =
    BUDGET_OPTIONS.find((o) => o.id === profile.budget)?.label ?? profile.budget;
  const transport =
    TRANSPORT_OPTIONS.find((o) => o.id === profile.transport)?.label ??
    profile.transport;
  const dietary = profile.dietary
    .map((d) => DIETARY_OPTIONS.find((o) => o.id === d)?.label ?? d)
    .join('、');

  return `${pace}／${companions}／${budget}／${transport}${dietary ? `／${dietary}` : ''}`;
}
