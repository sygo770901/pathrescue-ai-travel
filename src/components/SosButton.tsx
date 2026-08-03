'use client';

import { useState } from 'react';

import type { RescueModeResponse } from '@/types/database';

interface SosButtonProps {
  onRescue: (payload: RescueModeResponse) => void;
  onError: (message: string) => void;
}

export function SosButton({ onRescue, onError }: SosButtonProps) {
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState('突然下雨，需要室內備案');

  async function handleRescue() {
    if (loading) return;
    setLoading(true);

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('此瀏覽器不支援定位'));
            return;
          }
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 12_000,
          });
        },
      );

      const response = await fetch('/api/rescue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          issue,
          radius_meters: 1500,
        }),
      });

      const json = (await response.json()) as {
        data?: RescueModeResponse;
        error?: string;
      };

      if (!response.ok || !json.data) {
        throw new Error(json.error ?? '救援請求失敗');
      }

      onRescue(json.data);
    } catch (error) {
      const message =
        error instanceof GeolocationPositionError
          ? '無法取得定位，請允許瀏覽器存取位置後再試'
          : error instanceof Error
            ? error.message
            : '救援失敗';
      onError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-rise-delay-2 space-y-3 rounded-2xl border border-[rgba(180,35,24,0.2)] bg-[rgba(180,35,24,0.06)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-[var(--danger)] uppercase">
            現場救援
          </p>
          <h3 className="font-display text-xl text-[var(--ink)]">
            SOS 備案重排
          </h3>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            讀取當前 GPS，搜尋 1.5 公里內替代方案。
          </p>
        </div>
        <button
          type="button"
          onClick={handleRescue}
          disabled={loading}
          className="sos-pulse shrink-0 rounded-full bg-[var(--danger)] px-4 py-3 text-sm font-semibold text-white"
        >
          {loading ? '搜尋中…' : 'SOS'}
        </button>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs text-[var(--ink-soft)]">狀況描述</span>
        <select
          value={issue}
          onChange={(e) => setIssue(e.target.value)}
          className="w-full rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-sm outline-none"
        >
          <option value="突然下雨，需要室內備案">突然下雨</option>
          <option value="原定店家休息或關閉">店家休息/關閉</option>
          <option value="太累了，想找附近輕鬆的地方">疲勞想休息</option>
          <option value="天氣太熱，想找有空調的地方">天氣太熱</option>
        </select>
      </label>
    </div>
  );
}
