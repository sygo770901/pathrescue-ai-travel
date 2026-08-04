import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { tripGeneratorResponseSchema } from '@/lib/ai/validators';
import type { ItineraryInsert, Json, TripInsert } from '@/types/database';

export const runtime = 'nodejs';

const saveTripSchema = z.object({
  trip: tripGeneratorResponseSchema,
  preferences: z.array(z.string()).optional().default([]),
  notes: z.string().nullable().optional(),
  is_public: z.boolean().optional().default(false),
  trip_id: z.string().uuid().optional(),
});

async function replaceItineraries(
  admin: ReturnType<typeof createAdminClient>,
  tripId: string,
  trip: z.infer<typeof tripGeneratorResponseSchema>,
) {
  await admin.from('itineraries').delete().eq('trip_id', tripId);

  const rows: ItineraryInsert[] = trip.itinerary.map((day) => ({
    trip_id: tripId,
    day: day.day,
    theme: day.theme,
    schedule: day.schedule as unknown as ItineraryInsert['schedule'],
  }));

  if (rows.length > 0) {
    const { error } = await admin.from('itineraries').insert(rows);
    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = saveTripSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const admin = createAdminClient();
    const { trip, preferences, notes, is_public, trip_id } = parsed.data;

    if (trip_id) {
      const { data: existing, error: existingError } = await admin
        .from('trips')
        .select('id, user_id')
        .eq('id', trip_id)
        .maybeSingle();

      if (existingError) {
        throw new Error(existingError.message);
      }

      if (!existing) {
        return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
      }

      if (existing.user_id && user && existing.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const { data: updated, error: updateError } = await admin
        .from('trips')
        .update({
          trip_title: trip.trip_title,
          destination: trip.destination,
          total_days: trip.total_days,
          preferences,
          notes: notes ?? null,
          status: 'ready',
          generated_payload: trip as unknown as Json,
          is_public,
          user_id: existing.user_id ?? user?.id ?? null,
        })
        .eq('id', trip_id)
        .select('id, is_public')
        .single();

      if (updateError || !updated) {
        throw new Error(updateError?.message ?? 'Failed to update trip');
      }

      await replaceItineraries(admin, updated.id, trip);

      return NextResponse.json({
        data: { id: updated.id, is_public: updated.is_public },
      });
    }

    const insertPayload: TripInsert = {
      user_id: user?.id ?? null,
      trip_title: trip.trip_title,
      destination: trip.destination,
      total_days: trip.total_days,
      preferences,
      notes: notes ?? null,
      status: 'ready',
      generated_payload: trip as unknown as TripInsert['generated_payload'],
      is_public,
    };

    const { data: created, error: insertError } = await admin
      .from('trips')
      .insert(insertPayload)
      .select('id, is_public')
      .single();

    if (insertError || !created) {
      throw new Error(insertError?.message ?? 'Failed to save trip');
    }

    await replaceItineraries(admin, created.id, trip);

    return NextResponse.json(
      { data: { id: created.id, is_public: created.is_public } },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error';
    console.error('[trips POST]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
