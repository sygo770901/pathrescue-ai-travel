import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ShareTripView } from '@/components/ShareTripView';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PublicTripView, TripGeneratorResponse } from '@/types/database';

interface SharePageProps {
  params: Promise<{ tripId: string }>;
}

async function getPublicTrip(tripId: string): Promise<PublicTripView | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('trips')
      .select(
        'id, trip_title, destination, total_days, preferences, is_public, generated_payload, created_at',
      )
      .eq('id', tripId)
      .eq('is_public', true)
      .maybeSingle();

    if (error || !data?.generated_payload) {
      return null;
    }

    return {
      id: data.id,
      trip_title: data.trip_title,
      destination: data.destination,
      total_days: data.total_days,
      preferences: data.preferences,
      is_public: data.is_public,
      generated_payload: data.generated_payload as TripGeneratorResponse,
      created_at: data.created_at,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: SharePageProps): Promise<Metadata> {
  const { tripId } = await params;
  const trip = await getPublicTrip(tripId);

  if (!trip) {
    return {
      title: '找不到行程 | PathRescue',
    };
  }

  const title = `${trip.trip_title} | PathRescue`;
  const description = `${trip.destination} ${trip.total_days} 日行程 — 由 PathRescue AI 產生的旅遊規劃`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      locale: 'zh_TW',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function ShareTripPage({ params }: SharePageProps) {
  const { tripId } = await params;
  const trip = await getPublicTrip(tripId);

  if (!trip) {
    notFound();
  }

  return <ShareTripView tripView={trip} />;
}
