import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  searchNearbyAlongRoute,
  type NearbyFacilityType,
} from '@/services/mapService';

export const runtime = 'nodejs';

const nearbySchema = z.object({
  from: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  to: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  facility: z.enum([
    'convenience_store',
    'atm',
    'drugstore',
    'toilet',
  ]),
  radius_meters: z.number().int().positive().max(2000).optional().default(600),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = nearbySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const places = await searchNearbyAlongRoute(
      parsed.data.from,
      parsed.data.to,
      parsed.data.facility as NearbyFacilityType,
      parsed.data.radius_meters,
    );

    return NextResponse.json({ data: { places } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Nearby search failed';
    console.error('[nearby-along-route]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
