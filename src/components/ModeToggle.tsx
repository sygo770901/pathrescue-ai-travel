'use client';

import { cn } from '@/lib/utils';
import type { AppTripMode } from '@/types/database';
import type { ModeOverride } from '@/lib/tripMode';

interface ModeToggleProps {
  mode: AppTripMode;
  override: ModeOverride;
  canAutoOnTrip: boolean;
  onChange: (override: ModeOverride) => void;
}

export function ModeToggle({
  mode,
  override,
  canAutoOnTrip,
  onChange,
}: ModeToggleProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] bg-white/70 p-1">
      <button
        type="button"
        onClick={() => onChange('planning')}
        className={cn(
          'rounded-lg px-3 py-1.5 text-xs font-medium transition',
          mode === 'planning'
            ? 'bg-[var(--ink)] text-white'
            : 'text-[var(--ink-soft)] hover:bg-white',
        )}
      >
        規劃
      </button>
      <button
        type="button"
        onClick={() => onChange('ontrip')}
        className={cn(
          'rounded-lg px-3 py-1.5 text-xs font-medium transition',
          mode === 'ontrip'
            ? 'bg-[var(--coral)] text-white'
            : 'text-[var(--ink-soft)] hover:bg-white',
        )}
        title={
          canAutoOnTrip
            ? '旅途中模式：聚焦今日下一站'
            : '手動切換出行模式（建議先設定出發日）'
        }
      >
        出行
      </button>
      {override !== 'auto' && (
        <button
          type="button"
          onClick={() => onChange('auto')}
          className="rounded-lg px-2 py-1.5 text-[10px] text-[var(--ink-soft)]"
        >
          自動
        </button>
      )}
    </div>
  );
}
