'use client';

import { FormEvent, useState } from 'react';

import { cn } from '@/lib/utils';
import type { ScheduleItem, UserTravelProfile } from '@/types/database';

const QUICK_PRESETS = [
  { id: 'taste', label: '換口味', value: '想換不同口味的美食' },
  { id: 'indoor', label: '換室內', value: '改室內備案，避免日曬或下雨' },
  { id: 'cafe', label: '咖啡廳', value: '想找氣氛好的獨立咖啡或下午茶，不要星巴克' },
  { id: 'local', label: '換小店', value: '換成在地小店、公園或非連鎖選項' },
  { id: 'nonchain', label: '非連鎖', value: '不要連鎖品牌或市立官方唯一場館，給更多樣的替代' },
  { id: 'budget', label: '降低預算', value: '降低預算，找更平價的選項' },
] as const;

interface RegenerateSlotModalProps {
  open: boolean;
  currentSlot: ScheduleItem;
  previousPlace?: ScheduleItem | null;
  nextPlace?: ScheduleItem | null;
  destination: string;
  userProfile?: UserTravelProfile;
  travelMode?: 'walking' | 'transit' | 'driving';
  onClose: () => void;
  onReplaced: (replacement: ScheduleItem, why: string) => void;
}

export function RegenerateSlotModal({
  open,
  currentSlot,
  previousPlace,
  nextPlace,
  destination,
  userProfile,
  travelMode = 'transit',
  onClose,
  onReplaced,
}: RegenerateSlotModalProps) {
  const [preference, setPreference] = useState('想換一個更好的替代景點');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/regenerate-slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_slot: currentSlot,
          previous_place: previousPlace ?? null,
          next_place: nextPlace ?? null,
          user_preference: preference.trim(),
          destination,
          user_profile: userProfile,
          travel_mode: travelMode,
        }),
      });

      const json = (await response.json()) as {
        data?: { replacement: ScheduleItem; why_replaced: string };
        error?: string;
      };

      if (!response.ok || !json.data) {
        throw new Error(json.error ?? '重新生成失敗');
      }

      onReplaced(json.data.replacement, json.data.why_replaced);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新生成失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-wide text-[var(--sea)] uppercase">
              單段微調
            </p>
            <h3 className="font-display mt-1 text-xl text-[var(--ink)]">
              換一個：{currentSlot.place_name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-[var(--ink-soft)] hover:bg-white"
          >
            關閉
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {QUICK_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPreference(preset.value)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs transition',
                  preference === preset.value
                    ? 'bg-[var(--sea)] text-white'
                    : 'bg-white/80 text-[var(--ink-soft)]',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--ink-soft)]">自訂需求</span>
            <textarea
              value={preference}
              onChange={(e) => setPreference(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--sea)]"
              placeholder="例如：改成室內展覽、想吃拉麵、靠近車站…"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-[rgba(180,35,24,0.08)] px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !preference.trim()}
            className="w-full rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-medium text-white hover:bg-[var(--sea-deep)]"
          >
            {loading ? '正在尋找替代景點…' : '確認替換'}
          </button>
        </form>
      </div>
    </div>
  );
}
