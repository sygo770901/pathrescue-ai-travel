import { ImageResponse } from 'next/og';

import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface OgProps {
  params: Promise<{ tripId: string }>;
}

export default async function OpenGraphImage({ params }: OgProps) {
  const { tripId } = await params;

  let title = 'PathRescue 行程分享';
  let destination = '智慧旅遊規劃';
  let totalDays = 0;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('trips')
      .select('trip_title, destination, total_days, is_public')
      .eq('id', tripId)
      .eq('is_public', true)
      .maybeSingle();

    if (data) {
      title = data.trip_title;
      destination = data.destination;
      totalDays = data.total_days;
    }
  } catch {
    // keep fallback copy
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 64px',
          background:
            'linear-gradient(145deg, #0f6b5c 0%, #12352e 48%, #d4572a 140%)',
          color: '#f3f0e8',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 999,
              background: 'rgba(243,240,232,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            P
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2 }}>
              PathRescue
            </div>
            <div style={{ fontSize: 18, opacity: 0.85 }}>AI 智慧旅遊導航與救援</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '8px 16px',
              borderRadius: 999,
              background: 'rgba(243,240,232,0.16)',
              fontSize: 20,
            }}
          >
            AI 生成行程
          </div>
          <div
            style={{
              fontSize: 58,
              fontWeight: 700,
              lineHeight: 1.15,
              maxWidth: 980,
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 28, opacity: 0.92 }}>
            {destination}
            {totalDays > 0 ? ` · ${totalDays} 天` : ''}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontSize: 20,
            opacity: 0.85,
          }}
        >
          <div>唯讀分享頁面</div>
          <div>pathrescue-ai-travel.vercel.app</div>
        </div>
      </div>
    ),
    size,
  );
}
