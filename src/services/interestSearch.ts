import { preferenceLabel } from '@/lib/interestOptions';
import { searchPlacesByText } from '@/services/mapService';

export interface InterestCandidate {
  intent: string;
  query: string;
  place_id: string;
  name: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  formatted_address: string | null;
}

/** Map activity / direction ids and free-text notes to search query sets. */
const INTENT_QUERY_MAP: Array<{
  id: string;
  match: RegExp;
  intent: string;
  queries: (city: string) => string[];
}> = [
  {
    id: 'act_tennis',
    match: /網球|tennis|羽球|籃球|運動場|打球/i,
    intent: 'tennis_sport',
    queries: (city) => [
      `${city} 網球場`,
      `${city} 公園 網球`,
      `${city} tennis court`,
      `${city} 運動公園`,
    ],
  },
  {
    id: 'act_coffee',
    match: /咖啡|下午茶|cafe|coffee|甜點|輕食/i,
    intent: 'coffee_tea',
    queries: (city) => [
      `${city} 獨立咖啡`,
      `${city} 下午茶`,
      `${city} 甜點店`,
      `${city} 在地咖啡`,
    ],
  },
  {
    id: 'act_local_food',
    match: /拉麵|小吃|夜市|排隊|美食/i,
    intent: 'local_food',
    queries: (city) => [
      `${city} 在地小吃`,
      `${city} 拉麵`,
      `${city} 夜市`,
      `${city} 排隊美食`,
    ],
  },
  {
    id: 'act_market',
    match: /市集|小攤|攤販|市集/i,
    intent: 'market',
    queries: (city) => [`${city} 市集`, `${city} 文創市集`, `${city} 夜市`],
  },
  {
    id: 'act_onsen',
    match: /溫泉|温泉|onsen|泡湯/i,
    intent: 'onsen',
    queries: (city) => [`${city} 溫泉`, `${city} 日式溫泉`, `${city} 泡湯`],
  },
  {
    id: 'act_museum',
    match: /美術館|博物館|museum|gallery/i,
    intent: 'museum',
    queries: (city) => [`${city} 美術館`, `${city} 博物館`],
  },
  {
    id: 'act_bar',
    match: /酒吧|bar|居酒屋|nightlife/i,
    intent: 'bar',
    queries: (city) => [`${city} 酒吧`, `${city} 居酒屋`, `${city} cocktail`],
  },
  {
    id: 'act_park',
    match: /公園|散步|綠地/i,
    intent: 'park',
    queries: (city) => [`${city} 公園`, `${city} 河濱公園`],
  },
  {
    id: 'act_photo',
    match: /拍照|網美|觀景|景觀/i,
    intent: 'photo',
    queries: (city) => [`${city} 觀景台`, `${city} 拍照景點`, `${city} 夜景`],
  },
  {
    id: 'dir_sport',
    match: /運動健身|健身|sports/i,
    intent: 'sport_general',
    queries: (city) => [
      `${city} 運動公園`,
      `${city} 網球場`,
      `${city} 健身房`,
    ],
  },
  {
    id: 'dir_nightlife',
    match: /夜生活/i,
    intent: 'nightlife',
    queries: (city) => [`${city} 夜市`, `${city} 酒吧`, `${city} 宵夜`],
  },
];

function collectIntents(
  preferences: string[],
  notes?: string | null,
): Array<{ intent: string; queries: string[] }> {
  const cityPlaceholder = '__CITY__';
  const found = new Map<string, string[]>();

  for (const row of INTENT_QUERY_MAP) {
    const hitPref = preferences.some(
      (p) => p === row.id || preferenceLabel(p).match(row.match),
    );
    const hitNotes = notes ? row.match.test(notes) : false;
    if (!hitPref && !hitNotes) continue;

    const queries = row.queries(cityPlaceholder);
    const existing = found.get(row.intent) ?? [];
    found.set(row.intent, [...existing, ...queries]);
  }

  // Free-text only intents not covered by chips
  if (notes?.trim()) {
    const extra = notes.trim();
    if (![...found.keys()].length || extra.length >= 2) {
      // Always add a raw note-based query set for uncovered hobbies
      const covered = INTENT_QUERY_MAP.some((row) => row.match.test(extra));
      if (!covered) {
        found.set('custom_note', [
          `${cityPlaceholder} ${extra}`,
          `${cityPlaceholder} ${extra} 推薦`,
        ]);
      }
    }
  }

  return [...found.entries()].map(([intent, queries]) => ({
    intent,
    queries: [...new Set(queries)],
  }));
}

/**
 * Search multiple query variants per interest and return deduped candidates.
 */
export async function searchInterestCandidates(
  destination: string,
  preferences: string[],
  notes?: string | null,
): Promise<InterestCandidate[]> {
  const intents = collectIntents(preferences, notes);
  if (intents.length === 0) return [];

  const hasMapsKey =
    Boolean(process.env.GOOGLE_MAPS_API_KEY) ||
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  if (!hasMapsKey) return [];

  const candidates: InterestCandidate[] = [];
  const seen = new Set<string>();

  // Limit total API calls to keep latency/cost reasonable
  const limitedIntents = intents.slice(0, 4);

  for (const { intent, queries } of limitedIntents) {
    const limitedQueries = queries.slice(0, 3);
    for (const template of limitedQueries) {
      const query = template.replace(/__CITY__/g, destination);
      try {
        const places = await searchPlacesByText(query, { maxResults: 4 });
        for (const place of places) {
          const key = place.place_id || `${place.name}:${place.latitude}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({
            intent,
            query,
            place_id: place.place_id,
            name: place.name,
            latitude: place.latitude,
            longitude: place.longitude,
            rating: place.rating,
            formatted_address: place.formatted_address,
          });
        }
      } catch (error) {
        console.warn('[interestSearch] query failed', query, error);
      }
    }
  }

  return candidates.slice(0, 24);
}

export function formatCandidatesForPrompt(
  candidates: InterestCandidate[],
): string {
  if (candidates.length === 0) return '';

  const lines = candidates.map(
    (c, i) =>
      `${i + 1}. [${c.intent}] ${c.name} (${c.latitude}, ${c.longitude})` +
      (c.rating != null ? ` rating=${c.rating}` : '') +
      (c.formatted_address ? ` — ${c.formatted_address}` : ''),
  );

  return [
    'candidate_places (prefer diversifying from these real results; avoid only official municipal venues or single chain brands):',
    ...lines,
  ].join('\n');
}
