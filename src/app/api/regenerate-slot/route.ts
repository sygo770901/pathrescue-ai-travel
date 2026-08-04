import { NextRequest, NextResponse } from 'next/server';

import {
  chatJsonCompletion,
  getAiRuntimeInfo,
  parseStrictJson,
} from '@/lib/ai/client';
import { REGENERATE_SLOT_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import {
  regenerateSlotRequestSchema,
  regenerateSlotResponseSchema,
} from '@/lib/ai/validators';
import { checkFreeTierRateLimit } from '@/lib/redis/rateLimiter';
import { profileLabel } from '@/lib/travelProfile';
import {
  enrichScheduleItem,
  getTransitTime,
} from '@/services/mapService';
import type { ScheduleItem } from '@/types/database';

export const runtime = 'nodejs';
export const maxDuration = 45;

function getClientIdentifier(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'anonymous';
  }
  return request.headers.get('x-real-ip') ?? 'anonymous';
}

function summarizePlace(place: ScheduleItem | null | undefined): string {
  if (!place) return 'none';
  return `${place.place_name} (${place.latitude}, ${place.longitude}) [${place.category}]`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = regenerateSlotRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const identifier = getClientIdentifier(request);
    const rate = await checkFreeTierRateLimit(`regen:${identifier}`);
    if (!rate.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for free tier' },
        { status: 429 },
      );
    }

    const {
      current_slot,
      previous_place,
      next_place,
      user_preference,
      destination,
      user_profile,
      travel_mode = 'transit',
    } = parsed.data;

    const userPrompt = [
      `Destination context: ${destination}`,
      `Current slot to replace: ${JSON.stringify(current_slot)}`,
      `Previous place: ${summarizePlace(previous_place)}`,
      `Next place: ${summarizePlace(next_place)}`,
      `User preference for replacement: ${user_preference}`,
      user_profile
        ? `Traveler profile: ${profileLabel(user_profile)}`
        : 'Traveler profile: balanced defaults',
      'Return exactly one replacement slot JSON.',
    ].join('\n');

    const raw = await chatJsonCompletion({
      systemPrompt: REGENERATE_SLOT_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.6,
    });

    const json = parseStrictJson<unknown>(raw);
    const validated = regenerateSlotResponseSchema.parse(json);

    let replacement = await enrichScheduleItem(
      validated.replacement,
      destination,
    );

    if (previous_place) {
      try {
        const transit = await getTransitTime(
          {
            latitude: previous_place.latitude,
            longitude: previous_place.longitude,
          },
          {
            latitude: replacement.latitude,
            longitude: replacement.longitude,
          },
          travel_mode,
        );
        replacement = {
          ...replacement,
          travel_from_prev_mins: transit.duration_mins,
          route_summary: transit.summary,
        };
      } catch {
        // keep AI values
      }
    }

    return NextResponse.json({
      data: {
        replacement,
        why_replaced: validated.why_replaced,
      },
      meta: getAiRuntimeInfo(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error';
    console.error('[regenerate-slot]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
