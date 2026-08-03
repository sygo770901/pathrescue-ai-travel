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
import {
  enrichScheduleItem,
  enrichScheduleWithRoutes,
} from '@/services/mapService';
import type { ItineraryDay, TripGeneratorResponse } from '@/types/database';

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
    `Traveler preferences: ${preferenceText}`,
    `Preferred response language for textual fields (trip_title, theme, reason_to_visit): ${input.locale}`,
    'Include a balanced mix of attractions and food based on preferences.',
    'Keep consecutive places geographically close.',
    notesText,
  ]
    .filter(Boolean)
    .join('\n');
}

async function enrichTripPayload(
  trip: TripGeneratorResponse,
): Promise<TripGeneratorResponse> {
  const hasMapsKey =
    Boolean(process.env.GOOGLE_MAPS_API_KEY) ||
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  if (!hasMapsKey) {
    return trip;
  }

  const enrichedDays: ItineraryDay[] = [];

  for (const day of trip.itinerary) {
    const placeEnriched = await Promise.all(
      day.schedule.map((item) =>
        enrichScheduleItem(item, trip.destination),
      ),
    );
    const withRoutes = await enrichScheduleWithRoutes(placeEnriched, 'transit');

    enrichedDays.push({
      day: day.day,
      theme: day.theme,
      schedule: withRoutes,
    });
  }

  return {
    ...trip,
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

    const userPrompt = buildUserPrompt({
      destination: parsed.data.destination,
      total_days: parsed.data.total_days,
      preferences: parsed.data.preferences,
      notes: parsed.data.notes,
      locale: parsed.data.locale,
    });

    const raw = await chatJsonCompletion({
      systemPrompt: TRIP_GENERATOR_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.7,
    });

    const json = parseStrictJson<unknown>(raw);
    const trip = validateTripGeneratorResponse(json);
    const enriched = await enrichTripPayload(trip);

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
