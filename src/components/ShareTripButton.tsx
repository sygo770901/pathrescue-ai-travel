'use client';

import { useState } from 'react';

import type { TripGeneratorResponse } from '@/types/database';
import { saveTripToCache } from '@/lib/offline/tripCache';
import { buildLocalShareUrl } from '@/utils/shareCodec';

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

  async function tryCloudShare(): Promise<string | null> {
    try {
      let id = tripId;

      if (!id || id.startsWith('local-')) {
        const response = await fetch('/api/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trip,
            is_public: true,
          }),
        });

        const json = (await response.json()) as {
          data?: { id: string; is_public: boolean; sharing_ready?: boolean };
          error?: string;
        };

        if (!response.ok || !json.data) {
          throw new Error(json.error ?? '儲存行程失敗');
        }

        id = json.data.id;
        onTripIdChange(id);
        saveTripToCache(id, trip, { isPublic: true });

        if (json.data.sharing_ready === false) {
          return null;
        }
      }

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

      saveTripToCache(id, trip, { isPublic: true });
      return publishJson.data.share_url;
    } catch {
      return null;
    }
  }

  async function handleShare() {
    if (loading) return;
    setLoading(true);

    try {
      const cloudUrl = await tryCloudShare();
      const shareUrl =
        cloudUrl ??
        buildLocalShareUrl(window.location.origin, trip);

      await navigator.clipboard.writeText(shareUrl);

      if (cloudUrl) {
        onToast('分享連結已複製到剪貼簿');
      } else {
        onToast(
          '雲端分享未就緒，已改複製本機分享連結（對方開啟同一連結即可看）',
        );
      }
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
