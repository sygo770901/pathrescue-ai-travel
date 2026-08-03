import type { AffiliateType, PlaceCategory } from '@/types/database';

export function categoryLabel(category: PlaceCategory): string {
  const map: Record<PlaceCategory, string> = {
    attraction: '景點',
    food: '美食',
    shopping: '購物',
    accommodation: '住宿',
  };
  return map[category];
}

export function affiliateTypeLabel(type: AffiliateType): string {
  const map: Record<AffiliateType, string> = {
    klook: 'Klook',
    kkday: 'KKday',
    agoda: 'Agoda',
    none: '無',
  };
  return map[type];
}
