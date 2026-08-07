import { NextRequest, NextResponse } from 'next/server';

import {
  chatJsonCompletion,
  getAiRuntimeInfo,
  parseStrictJson,
} from '@/lib/ai/client';
import { TRIP_GENERATOR_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import {
  generateTripRequestSchema,
  validateTripGeneratorResponse,
} from '@/lib/ai/validators';
import { checkFreeTierRateLimit } from '@/lib/redis/rateLimiter';
import { preferenceLabel } from '@/lib/interestOptions';
import { DEFAULT_USER_PROFILE, profileLabel, transportToTravelMode } from '@/lib/travelProfile';
import {
  formatCandidatesForPrompt,
  searchInterestCandidates,
} from '@/services/interestSearch';
import {
  enrichScheduleItem,
  enrichScheduleWithRoutes,
} from '@/services/mapService';
import type {
  ItineraryDay,
  TripGeneratorResponse,
  UserTravelProfile,
} from '@/types/database';
import { recalculateDayTimeline } from '@/utils/timeCalculator';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getClientIdentifier(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'anonymous';
  }
  return request.headers.get('x-real-ip') ?? 'anonymous';
}

function buildUserPrompt(input: {
  destination: string;
  total_days: number;
  preferences: string[];
  notes?: string | null;
  locale: string;
  user_profile: UserTravelProfile;
  start_date?: string | null;
  candidatesBlock?: string;
}): string {
  const preferenceText =
    input.preferences.length > 0
      ? input.preferences.map((id) => preferenceLabel(id)).join(', ')
      : 'general sightseeing';

  const notesText = input.notes?.trim()
    ? `\nAdditional notes from traveler: ${input.notes.trim()}`
    : '';

  const startDateText = input.start_date
    ? `Trip start_date: ${input.start_date} (align weekday-sensitive tips when relevant).`
    : '';

  return [
    `Create a ${input.total_days}-day travel itinerary.`,
    `CRITICAL: itinerary array MUST contain exactly ${input.total_days} day objects (day 1 through day ${input.total_days}). Do NOT stop after day 1.`,
    `Destination: ${input.destination}`,
    startDateText,
    `Interest tags / directions: ${preferenceText}`,
    `user_profile: ${JSON.stringify(input.user_profile)}`,
    `Traveler profile (human readable): ${profileLabel(input.user_profile)}`,
    `Preferred response language for textual fields: ${input.locale}`,
    'Include destination_essentials and echo user_profile in the JSON response.',
    'Keep consecutive places geographically close and respect transport/companions constraints.',
    'Apply DIVERSITY RULES: mix venue types; avoid only municipal venues or chain cafes.',
    notesText,
    input.candidatesBlock ?? '',
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizeDayCount(
  trip: TripGeneratorResponse,
  requestedDays: number,
): TripGeneratorResponse {
  const sorted = [...trip.itinerary].sort((a, b) => a.day - b.day);
  const capped = sorted.slice(0, requestedDays).map((day, index) => ({
    ...day,
    day: index + 1,
  }));

  return {
    ...trip,
    total_days: requestedDays,
    itinerary: capped,
  };
}

async function ensureFullDayCount(
  trip: TripGeneratorResponse,
  requestedDays: number,
  baseUserPrompt: string,
): Promise<TripGeneratorResponse> {
  let current = normalizeDayCount(trip, requestedDays);

  if (current.itinerary.length >= requestedDays) {
    return current;
  }

  console.warn(
    `[generate-trip] Incomplete itinerary: got ${current.itinerary.length}/${requestedDays} days, retrying once`,
  );

  const retryPrompt = [
    baseUserPrompt,
    '',
    `RETRY REQUIRED: Your previous JSON only included ${current.itinerary.length} day(s).`,
    `Return a COMPLETE fresh JSON with exactly ${requestedDays} days in itinerary (day 1..${requestedDays}).`,
    'Each day needs a realistic full schedule (morning/lunch/afternoon/evening as appropriate).',
  ].join('\n');

  const raw = await chatJsonCompletion({
    systemPrompt: TRIP_GENERATOR_SYSTEM_PROMPT,
    userPrompt: retryPrompt,
    temperature: 0.55,
  });

  const json = parseStrictJson<unknown>(raw);
  const retried = validateTripGeneratorResponse(json);
  current = normalizeDayCount(retried, requestedDays);

  if (current.itinerary.length < requestedDays) {
    throw new Error(
      `行程天數不足：只產生了 ${current.itinerary.length} 天，但要求 ${requestedDays} 天。請再試一次。`,
    );
  }

  return current;
}

async function enrichTripPayload(
  trip: TripGeneratorResponse,
  profile: UserTravelProfile,
): Promise<TripGeneratorResponse> {
  const mode = transportToTravelMode(profile.transport);
  const hasMapsKey =
    Boolean(process.env.GOOGLE_MAPS_API_KEY) ||
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  if (!hasMapsKey) {
    return {
      ...trip,
      user_profile: trip.user_profile ?? profile,
      itinerary: trip.itinerary.map((day) => ({
        ...day,
        schedule: recalculateDayTimeline(day.schedule),
      })),
    };
  }

  const enrichedDays: ItineraryDay[] = [];

  for (const day of trip.itinerary) {
    const placeEnriched = await Promise.all(
      day.schedule.map((item) =>
        enrichScheduleItem(item, trip.destination),
      ),
    );
    const withRoutes = await enrichScheduleWithRoutes(placeEnriched, mode);
    enrichedDays.push({
      day: day.day,
      theme: day.theme,
      schedule: recalculateDayTimeline(withRoutes),
    });
  }

  return {
    ...trip,
    user_profile: trip.user_profile ?? profile,
    itinerary: enrichedDays,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = generateTripRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const identifier = getClientIdentifier(request);
    const rate = await checkFreeTierRateLimit(`generate:${identifier}`);

    if (!rate.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded for free tier',
          limit: rate.limit,
          remaining: rate.remaining,
          reset: rate.reset,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(rate.limit),
            'X-RateLimit-Remaining': String(rate.remaining),
            'X-RateLimit-Reset': String(rate.reset),
          },
        },
      );
    }

    const userProfile = parsed.data.user_profile ?? DEFAULT_USER_PROFILE;
    const startDate = parsed.data.start_date ?? null;

    let candidatesBlock = '';
    try {
      const candidates = await searchInterestCandidates(
        parsed.data.destination,
        parsed.data.preferences,
        parsed.data.notes,
      );
      candidatesBlock = formatCandidatesForPrompt(candidates);
      if (candidates.length > 0) {
        console.info(
          `[generate-trip] interest candidates=${candidates.length}`,
        );
      }
    } catch (error) {
      console.warn('[generate-trip] interest search skipped', error);
    }

    const userPrompt = buildUserPrompt({
      destination: parsed.data.destination,
      total_days: parsed.data.total_days,
      preferences: parsed.data.preferences,
      notes: parsed.data.notes,
      locale: parsed.data.locale,
      user_profile: userProfile,
      start_date: startDate,
      candidatesBlock,
    });

    const raw = await chatJsonCompletion({
      systemPrompt: TRIP_GENERATOR_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.7,
    });

    const json = parseStrictJson<unknown>(raw);
    const trip = validateTripGeneratorResponse(json);
    const fullDays = await ensureFullDayCount(
      trip,
      parsed.data.total_days,
      userPrompt,
    );
    const enriched = await enrichTripPayload(fullDays, userProfile);
    const withStartDate: TripGeneratorResponse = {
      ...enriched,
      total_days: parsed.data.total_days,
      start_date: startDate ?? enriched.start_date ?? null,
    };

    console.info(
      `[generate-trip] days=${withStartDate.itinerary.length}/${parsed.data.total_days}`,
    );

    return NextResponse.json(
      {
        data: withStartDate,
        meta: {
          ...getAiRuntimeInfo(),
          day_count: withStartDate.itinerary.length,
          requested_days: parsed.data.total_days,
          rate_limit: {
            limit: rate.limit,
            remaining: rate.remaining,
            reset: rate.reset,
            bypassed: rate.bypassed,
          },
        },
      },
      {
        status: 200,
        headers: {
          'X-RateLimit-Limit': String(rate.limit),
          'X-RateLimit-Remaining': String(rate.remaining),
          'X-RateLimit-Reset': String(rate.reset),
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error';

    console.error('[generate-trip]', error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
