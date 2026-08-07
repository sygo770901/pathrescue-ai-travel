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
import {
  DEFAULT_USER_PROFILE,
  profileLabel,
  transportToTravelMode,
} from '@/lib/travelProfile';
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
/** Long trips use chunked AI calls + Maps enrichment */
export const maxDuration = 120;

/** Days per AI call — keeps each JSON payload under model output limits */
const CHUNK_SIZE = 7;
/** Above this, generate in chunks instead of one shot */
const CHUNK_THRESHOLD = 7;

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
  dayFrom?: number;
  dayTo?: number;
  previousThemes?: string[];
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

  const dayFrom = input.dayFrom ?? 1;
  const dayTo = input.dayTo ?? input.total_days;
  const chunkDays = dayTo - dayFrom + 1;
  const isPartial = dayFrom !== 1 || dayTo !== input.total_days;

  const dayCountRules = isPartial
    ? [
        `This is PART ${Math.ceil(dayFrom / CHUNK_SIZE)} of a ${input.total_days}-day trip.`,
        `Generate ONLY days ${dayFrom}–${dayTo} (exactly ${chunkDays} day objects).`,
        `CRITICAL: itinerary MUST contain exactly ${chunkDays} days with "day": ${dayFrom} through "day": ${dayTo}.`,
        `Set total_days to ${input.total_days} (full trip length).`,
        dayFrom === 1
          ? 'Include trip_title, destination_essentials, and user_profile.'
          : 'Reuse the same trip_title style; destination_essentials may be omitted or brief.',
        'Keep each day to 3–5 schedule stops (lean JSON — avoid huge reason_to_visit text).',
      ]
    : [
        `Create a ${input.total_days}-day travel itinerary.`,
        `CRITICAL: itinerary array MUST contain exactly ${input.total_days} day objects (day 1 through day ${input.total_days}). Do NOT stop after day 1.`,
        input.total_days > CHUNK_THRESHOLD
          ? 'Keep each day to 3–5 schedule stops to keep JSON compact.'
          : '',
      ];

  const continuity =
    input.previousThemes && input.previousThemes.length > 0
      ? `Previous days already planned (do NOT repeat the same themes/areas): ${input.previousThemes.join(' | ')}`
      : '';

  return [
    ...dayCountRules,
    `Destination: ${input.destination}`,
    startDateText,
    `Interest tags / directions: ${preferenceText}`,
    `user_profile: ${JSON.stringify(input.user_profile)}`,
    `Traveler profile (human readable): ${profileLabel(input.user_profile)}`,
    `Preferred response language for textual fields: ${input.locale}`,
    'Include destination_essentials and echo user_profile in the JSON response (at least on first chunk).',
    'Keep consecutive places geographically close and respect transport/companions constraints.',
    'Apply DIVERSITY RULES: mix venue types; avoid only municipal venues or chain cafes.',
    continuity,
    notesText,
    input.candidatesBlock ?? '',
    'Respond with ONE valid JSON object only. No markdown, no text after the closing brace.',
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

function mergeTripChunks(
  chunks: TripGeneratorResponse[],
  requestedDays: number,
): TripGeneratorResponse {
  const base = chunks[0];
  if (!base) {
    throw new Error('行程生成失敗：沒有任何分段結果');
  }

  const days: ItineraryDay[] = [];
  for (const chunk of chunks) {
    for (const day of chunk.itinerary) {
      days.push(day);
    }
  }

  const essentials =
    chunks.find((c) => c.destination_essentials)?.destination_essentials ??
    base.destination_essentials;

  const profile =
    chunks.find((c) => c.user_profile)?.user_profile ?? base.user_profile;

  return normalizeDayCount(
    {
      ...base,
      trip_title: base.trip_title,
      destination: base.destination,
      destination_essentials: essentials,
      user_profile: profile,
      total_days: requestedDays,
      itinerary: days,
    },
    requestedDays,
  );
}

async function generateSingleChunk(params: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}): Promise<TripGeneratorResponse> {
  const raw = await chatJsonCompletion({
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    temperature: params.temperature ?? 0.7,
    maxOutputTokens: 16384,
  });

  const json = parseStrictJson<unknown>(raw);
  return validateTripGeneratorResponse(json);
}

async function generateTripPayload(input: {
  destination: string;
  total_days: number;
  preferences: string[];
  notes?: string | null;
  locale: string;
  user_profile: UserTravelProfile;
  start_date?: string | null;
  candidatesBlock?: string;
}): Promise<TripGeneratorResponse> {
  const { total_days } = input;

  if (total_days <= CHUNK_THRESHOLD) {
    const userPrompt = buildUserPrompt(input);
    let trip = await generateSingleChunk({
      systemPrompt: TRIP_GENERATOR_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.7,
    });
    trip = await ensureFullDayCount(trip, total_days, userPrompt);
    return trip;
  }

  // Long trip: generate in CHUNK_SIZE-day batches to avoid truncated / junk JSON
  const chunks: TripGeneratorResponse[] = [];
  const previousThemes: string[] = [];

  for (let dayFrom = 1; dayFrom <= total_days; dayFrom += CHUNK_SIZE) {
    const dayTo = Math.min(dayFrom + CHUNK_SIZE - 1, total_days);
    const userPrompt = buildUserPrompt({
      ...input,
      dayFrom,
      dayTo,
      previousThemes: [...previousThemes],
    });

    console.info(
      `[generate-trip] chunk days ${dayFrom}-${dayTo} of ${total_days}`,
    );

    let chunk = await generateSingleChunk({
      systemPrompt: TRIP_GENERATOR_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.65,
    });

    // Keep only days in this range; renumber later on merge
    const inRange = chunk.itinerary
      .filter((d) => d.day >= dayFrom && d.day <= dayTo)
      .sort((a, b) => a.day - b.day);

    if (inRange.length < dayTo - dayFrom + 1) {
      // Accept days numbered 1..N within chunk (model sometimes resets)
      const fallback = [...chunk.itinerary]
        .sort((a, b) => a.day - b.day)
        .slice(0, dayTo - dayFrom + 1)
        .map((d, i) => ({ ...d, day: dayFrom + i }));

      if (fallback.length >= dayTo - dayFrom + 1) {
        chunk = { ...chunk, itinerary: fallback };
      } else {
        console.warn(
          `[generate-trip] chunk incomplete ${inRange.length}/${dayTo - dayFrom + 1}, retrying`,
        );
        const retryPrompt = [
          userPrompt,
          '',
          `RETRY: Return exactly ${dayTo - dayFrom + 1} days (day ${dayFrom}..${dayTo}).`,
        ].join('\n');
        chunk = await generateSingleChunk({
          systemPrompt: TRIP_GENERATOR_SYSTEM_PROMPT,
          userPrompt: retryPrompt,
          temperature: 0.5,
        });
        const retried = [...chunk.itinerary]
          .sort((a, b) => a.day - b.day)
          .slice(0, dayTo - dayFrom + 1)
          .map((d, i) => ({ ...d, day: dayFrom + i }));
        chunk = { ...chunk, itinerary: retried };
      }
    } else {
      chunk = {
        ...chunk,
        itinerary: inRange.map((d, i) => ({ ...d, day: dayFrom + i })),
      };
    }

    for (const d of chunk.itinerary) {
      previousThemes.push(`Day ${d.day}: ${d.theme}`);
    }
    chunks.push(chunk);
  }

  const merged = mergeTripChunks(chunks, total_days);

  if (merged.itinerary.length < total_days) {
    throw new Error(
      `行程天數不足：只產生了 ${merged.itinerary.length} 天，但要求 ${total_days} 天。請再試一次。`,
    );
  }

  return merged;
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
    'Respond with ONE valid JSON object only — no text after the closing brace.',
  ].join('\n');

  const raw = await chatJsonCompletion({
    systemPrompt: TRIP_GENERATOR_SYSTEM_PROMPT,
    userPrompt: retryPrompt,
    temperature: 0.55,
    maxOutputTokens: 16384,
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

    const generated = await generateTripPayload({
      destination: parsed.data.destination,
      total_days: parsed.data.total_days,
      preferences: parsed.data.preferences,
      notes: parsed.data.notes,
      locale: parsed.data.locale,
      user_profile: userProfile,
      start_date: startDate,
      candidatesBlock,
    });

    const enriched = await enrichTripPayload(generated, userProfile);
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
