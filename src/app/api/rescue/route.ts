import { NextRequest, NextResponse } from 'next/server';

import {
  chatJsonCompletion,
  getAiRuntimeInfo,
  parseStrictJson,
} from '@/lib/ai/client';
import { RESCUE_MODE_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import {
  rescueRequestSchema,
  validateRescueModeResponse,
} from '@/lib/ai/validators';
import { checkFreeTierRateLimit } from '@/lib/redis/rateLimiter';
import { getPlaceDetails } from '@/services/mapService';
import type { RescueAlternativePlace, RescueModeResponse } from '@/types/database';

export const runtime = 'nodejs';
export const maxDuration = 45;

function getClientIdentifier(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'anonymous';
  }
  return request.headers.get('x-real-ip') ?? 'anonymous';
}

function buildRescueUserPrompt(input: {
  latitude: number;
  longitude: number;
  issue: string;
  radius_meters: number;
}): string {
  return [
    'The traveler needs an immediate itinerary rescue.',
    `Current GPS: latitude=${input.latitude}, longitude=${input.longitude}`,
    `Issue: ${input.issue}`,
    `Search radius: ${input.radius_meters} meters (must stay within this radius).`,
    'Recommend exactly 3 alternative places.',
    'Prefer indoor / covered / low-effort options when the issue involves rain, heat, or fatigue.',
    'Respond with textual fields in Traditional Chinese (zh-TW) when possible.',
  ].join('\n');
}

async function enrichRescuePlaces(
  payload: RescueModeResponse,
): Promise<RescueModeResponse> {
  const hasMapsKey =
    Boolean(process.env.GOOGLE_MAPS_API_KEY) ||
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  if (!hasMapsKey) {
    return payload;
  }

  const alternative_places: RescueAlternativePlace[] = await Promise.all(
    payload.alternative_places.map(async (place) => {
      try {
        const details = await getPlaceDetails(place.place_name, {
          latitude: place.latitude,
          longitude: place.longitude,
        });

        if (!details) return place;

        return {
          ...place,
          place_name: details.name || place.place_name,
          latitude: details.latitude,
          longitude: details.longitude,
          place_id: details.place_id,
          photo_url: details.photo_url,
        };
      } catch {
        return place;
      }
    }),
  );

  return {
    ...payload,
    alternative_places,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = rescueRequestSchema.safeParse(body);

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
    const rate = await checkFreeTierRateLimit(`rescue:${identifier}`);

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

    const userPrompt = buildRescueUserPrompt({
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      issue: parsed.data.issue,
      radius_meters: parsed.data.radius_meters,
    });

    const raw = await chatJsonCompletion({
      systemPrompt: RESCUE_MODE_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.5,
    });

    const json = parseStrictJson<unknown>(raw);
    const rescue = validateRescueModeResponse(json);
    const enriched = await enrichRescuePlaces(rescue);

    return NextResponse.json(
      {
        data: enriched,
        meta: {
          ...getAiRuntimeInfo(),
          request: {
            latitude: parsed.data.latitude,
            longitude: parsed.data.longitude,
            radius_meters: parsed.data.radius_meters,
            trip_id: parsed.data.trip_id ?? null,
          },
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

    console.error('[rescue]', error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
