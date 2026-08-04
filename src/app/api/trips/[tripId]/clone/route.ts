import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type {
  ItineraryInsert,
  TripGeneratorResponse,
  TripInsert,
} from '@/types/database';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ tripId: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { tripId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: '需要登入才能複製到帳號',
          code: 'NEED_AUTH',
        },
        { status: 401 },
      );
    }

    const admin = createAdminClient();
    const { data, error: sourceError } = await admin
      .from('trips')
      .select(
        'id, trip_title, destination, total_days, preferences, notes, generated_payload, is_public',
      )
      .eq('id', tripId)
      .maybeSingle();

    if (sourceError) {
      throw new Error(sourceError.message);
    }

    const source = data as {
      id: string;
      trip_title: string;
      destination: string;
      total_days: number;
      preferences: string[];
      notes: string | null;
      generated_payload: TripGeneratorResponse | null;
      is_public: boolean;
    } | null;

    if (!source?.generated_payload || !source.is_public) {
      return NextResponse.json(
        { error: '找不到可複製的公開行程' },
        { status: 404 },
      );
    }

    const payload = source.generated_payload;

    const clonedPayload: TripGeneratorResponse = {
      ...payload,
      trip_title: `${payload.trip_title}（副本）`,
    };

    const insertPayload: TripInsert = {
      user_id: user.id,
      trip_title: `${source.trip_title}（副本）`,
      destination: source.destination,
      total_days: source.total_days,
      preferences: source.preferences,
      notes: source.notes,
      status: 'ready',
      generated_payload:
        clonedPayload as unknown as TripInsert['generated_payload'],
      is_public: false,
    };

    const { data: cloned, error: cloneError } = await admin
      .from('trips')
      .insert(insertPayload)
      .select('id')
      .single();

    if (cloneError || !cloned) {
      throw new Error(cloneError?.message ?? 'Failed to clone trip');
    }

    const days: ItineraryInsert[] = payload.itinerary.map((day) => ({
      trip_id: cloned.id,
      day: day.day,
      theme: day.theme,
      schedule: day.schedule as unknown as ItineraryInsert['schedule'],
    }));

    if (days.length > 0) {
      const { error: dayError } = await admin.from('itineraries').insert(days);
      if (dayError) {
        throw new Error(dayError.message);
      }
    }

    return NextResponse.json({
      data: {
        id: cloned.id,
        redirect_to: `/?tripId=${cloned.id}`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error';
    console.error('[trips clone]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
