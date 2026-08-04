import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import type { PublicTripView, TripGeneratorResponse } from '@/types/database';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ tripId: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { tripId } = await context.params;
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('trips')
      .select(
        'id, trip_title, destination, total_days, preferences, is_public, generated_payload, created_at',
      )
      .eq('id', tripId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data || !data.is_public || !data.generated_payload) {
      return NextResponse.json(
        { error: '找不到公開行程，或此行程尚未開放分享' },
        { status: 404 },
      );
    }

    const view: PublicTripView = {
      id: data.id,
      trip_title: data.trip_title,
      destination: data.destination,
      total_days: data.total_days,
      preferences: data.preferences,
      is_public: data.is_public,
      generated_payload: data.generated_payload as TripGeneratorResponse,
      created_at: data.created_at,
    };

    return NextResponse.json({ data: view });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error';
    console.error('[trips GET]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
