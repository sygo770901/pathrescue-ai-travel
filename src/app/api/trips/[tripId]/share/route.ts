import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ tripId: string }>;
}

/** Mark an existing trip as publicly shareable. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { tripId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin
      .from('trips')
      .select('id, user_id, generated_payload')
      .eq('id', tripId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (!existing || !existing.generated_payload) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    if (existing.user_id && user && existing.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: updated, error: updateError } = await admin
      .from('trips')
      .update({ is_public: true })
      .eq('id', tripId)
      .select('id, is_public')
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? 'Failed to publish trip');
    }

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

    return NextResponse.json({
      data: {
        id: updated.id,
        is_public: updated.is_public,
        share_url: `${origin.replace(/\/$/, '')}/share/${updated.id}`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error';
    console.error('[trips share]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
