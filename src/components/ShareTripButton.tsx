'use client';

import { useState } from 'react';

import type { TripGeneratorResponse } from '@/types/database';
import { saveTripToCache } from '@/lib/offline/tripCache';

interface ShareTripButtonProps {
  trip: TripGeneratorResponse;
  tripId: string | null;
  onTripIdChange: (tripId: string) => void;
  onToast: (message: string) => void;
}

export function ShareTripButton({
  trip,
  tripId,
  onTripIdChange,
  onToast,
}: ShareTripButtonProps) {
  const [loading, setLoading] = useState(false);

  async function ensureSavedTripId(): Promise<string> {
    if (tripId) return tripId;

    const response = await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trip,
        is_public: true,
      }),
    });

    const json = (await response.json()) as {
      data?: { id: string; is_public: boolean };
      error?: string;
    };

    if (!response.ok || !json.data) {
      throw new Error(json.error ?? '儲存行程失敗');
    }

    onTripIdChange(json.data.id);
    saveTripToCache(json.data.id, trip, { isPublic: true });
    return json.data.id;
  }

  async function handleShare() {
    if (loading) return;
    setLoading(true);

    try {
      const id = await ensureSavedTripId();

      const publish = await fetch(`/api/trips/${id}/share`, {
        method: 'POST',
      });

      const publishJson = (await publish.json()) as {
        data?: { share_url: string };
        error?: string;
      };

      if (!publish.ok || !publishJson.data?.share_url) {
        throw new Error(publishJson.error ?? '產生分享連結失敗');
      }

      const shareUrl = publishJson.data.share_url;
      saveTripToCache(id, trip, { isPublic: true });

      await navigator.clipboard.writeText(shareUrl);
      onToast('分享連結已複製到剪貼簿');
    } catch (error) {
      onToast(error instanceof Error ? error.message : '分享失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={loading}
      className="rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--sea)] hover:text-[var(--sea-deep)]"
    >
      {loading ? '產生連結中…' : '複製分享連結'}
    </button>
  );
}
