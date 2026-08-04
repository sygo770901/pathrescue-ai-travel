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
import { DEFAULT_USER_PROFILE, profileLabel, transportToTravelMode } from '@/lib/travelProfile';
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
}): string {
  const preferenceText =
    input.preferences.length > 0
      ? input.preferences.join(', ')
      : 'general sightseeing';

  const notesText = input.notes?.trim()
    ? `\nAdditional notes from traveler: ${input.notes.trim()}`
    : '';

  return [
    `Create a ${input.total_days}-day travel itinerary.`,
    `Destination: ${input.destination}`,
    `Interest tags: ${preferenceText}`,
    `user_profile: ${JSON.stringify(input.user_profile)}`,
    `Traveler profile (human readable): ${profileLabel(input.user_profile)}`,
    `Preferred response language for textual fields: ${input.locale}`,
    'Include destination_essentials and echo user_profile in the JSON response.',
    'Keep consecutive places geographically close and respect transport/companions constraints.',
    notesText,
  ]
    .filter(Boolean)
    .join('\n');
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

    const userPrompt = buildUserPrompt({
      destination: parsed.data.destination,
      total_days: parsed.data.total_days,
      preferences: parsed.data.preferences,
      notes: parsed.data.notes,
      locale: parsed.data.locale,
      user_profile: userProfile,
    });

    const raw = await chatJsonCompletion({
      systemPrompt: TRIP_GENERATOR_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.7,
    });

    const json = parseStrictJson<unknown>(raw);
    const trip = validateTripGeneratorResponse(json);
    const enriched = await enrichTripPayload(trip, userProfile);

    return NextResponse.json(
      {
        data: enriched,
        meta: {
          ...getAiRuntimeInfo(),
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
