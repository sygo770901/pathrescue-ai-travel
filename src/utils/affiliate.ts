import type { AffiliateType, ScheduleItem } from '@/types/database';

export interface AffiliateLink {
  type: AffiliateType;
  url: string;
  label: string;
  search_query: string;
}

function encode(value: string): string {
  return encodeURIComponent(value.trim());
}

/**
 * Build a Klook deep search link with affiliate aid.
 * Docs pattern: https://www.klook.com/search/result/?query=...&aid=...
 */
export function buildKlookLink(searchQuery: string): AffiliateLink {
  const aid = process.env.KLOOK_AID ?? process.env.NEXT_PUBLIC_KLOOK_AID ?? '';
  const params = new URLSearchParams({ query: searchQuery.trim() });
  if (aid) params.set('aid', aid);

  return {
    type: 'klook',
    url: `https://www.klook.com/search/result/?${params.toString()}`,
    label: '在 Klook 搜尋',
    search_query: searchQuery,
  };
}

/**
 * Build a KKday product search deep link with affiliate id.
 */
export function buildKKdayLink(searchQuery: string): AffiliateLink {
  const affiliateId =
    process.env.KKDAY_AFFILIATE_ID ??
    process.env.NEXT_PUBLIC_KKDAY_AFFILIATE_ID ??
    '';

  const params = new URLSearchParams({
    keyword: searchQuery.trim(),
  });
  if (affiliateId) {
    params.set('cid', affiliateId);
  }

  return {
    type: 'kkday',
    url: `https://www.kkday.com/zh-tw/product/productlist?${params.toString()}`,
    label: '在 KKday 搜尋',
    search_query: searchQuery,
  };
}

/**
 * Build an Agoda hotel search deep link with cid.
 */
export function buildAgodaLink(searchQuery: string): AffiliateLink {
  const cid =
    process.env.AGODA_CID ?? process.env.NEXT_PUBLIC_AGODA_CID ?? '';

  const params = new URLSearchParams({
    textToSearch: searchQuery.trim(),
  });
  if (cid) {
    params.set('cid', cid);
  }

  return {
    type: 'agoda',
    url: `https://www.agoda.com/search?${params.toString()}`,
    label: '在 Agoda 搜尋',
    search_query: searchQuery,
  };
}

/**
 * Convert a place / hotel name + suggested affiliate type into a deep link.
 */
export function buildAffiliateLink(
  placeName: string,
  affiliateType: AffiliateType,
  searchQuery?: string,
): AffiliateLink | null {
  if (affiliateType === 'none') {
    return null;
  }

  const query = (searchQuery?.trim() || placeName).trim();
  if (!query) return null;

  switch (affiliateType) {
    case 'klook':
      return buildKlookLink(query);
    case 'kkday':
      return buildKKdayLink(query);
    case 'agoda':
      return buildAgodaLink(query);
    default:
      return null;
  }
}

/**
 * Resolve affiliate link from a ScheduleItem.
 */
export function affiliateLinkFromScheduleItem(
  item: ScheduleItem,
): AffiliateLink | null {
  return buildAffiliateLink(
    item.place_name,
    item.suggested_affiliate_type,
    item.affiliate_search_query,
  );
}

/**
 * Heuristic: suggest affiliate type when AI returns 'none' but category implies booking.
 */
export function suggestAffiliateTypeFallback(
  category: ScheduleItem['category'],
  current: AffiliateType,
): AffiliateType {
  if (current !== 'none') return current;

  if (category === 'accommodation') return 'agoda';
  if (category === 'attraction') return 'klook';
  if (category === 'food' || category === 'shopping') return 'kkday';
  return 'none';
}

export function buildGoogleMapsSearchUrl(placeName: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encode(placeName)}`;
}

export function buildGoogleMapsPlaceUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${encode(placeId)}`;
}
