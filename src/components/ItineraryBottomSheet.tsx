'use client';

import {
  useRef,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { cn } from '@/lib/utils';

export type SheetSnap = 'peek' | 'half' | 'mapFocus' | 'full';

const SNAP_HEIGHT: Record<SheetSnap, string> = {
  peek: '12vh',
  mapFocus: '30vh',
  half: '42vh',
  full: '85vh',
};

interface ItineraryBottomSheetProps {
  children: ReactNode;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  title?: string;
}

/**
 * Lightweight mobile bottom sheet with snap points (no external drawer lib).
 */
export function ItineraryBottomSheet({
  children,
  snap,
  onSnapChange,
  title = '行程列表',
}: ItineraryBottomSheetProps) {
  const startY = useRef(0);
  const startSnap = useRef<SheetSnap>(snap);

  function cycleSnap(direction: 'up' | 'down') {
    const order: SheetSnap[] = ['peek', 'mapFocus', 'half', 'full'];
    const idx = order.indexOf(snap);
    if (direction === 'up') {
      onSnapChange(order[Math.min(order.length - 1, idx + 1)]);
    } else {
      onSnapChange(order[Math.max(0, idx - 1)]);
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    startY.current = event.clientY;
    startSnap.current = snap;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const delta = startY.current - event.clientY;
    if (Math.abs(delta) < 36) return;
    cycleSnap(delta > 0 ? 'up' : 'down');
  }

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end lg:hidden"
      style={{ height: '100%' }}
    >
      <div
        className="pointer-events-auto flex flex-col overflow-hidden rounded-t-3xl border border-[var(--line)] bg-[var(--paper)] shadow-[0_-8px_30px_rgba(20,30,25,0.18)] transition-[height] duration-300 ease-out"
        style={{ height: SNAP_HEIGHT[snap] }}
      >
        <div
          className="flex shrink-0 cursor-grab flex-col items-center touch-none px-4 pt-2 pb-1 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          role="separator"
          aria-label="拖曳調整行程列表高度"
        >
          <div className="mb-2 h-1.5 w-12 rounded-full bg-[var(--line)]" />
          <div className="mb-2 flex w-full items-center justify-between gap-2">
            <p className="text-sm font-medium text-[var(--ink)]">{title}</p>
            <div className="flex gap-1">
              {(
                [
                  ['peek', '地圖'],
                  ['half', '半屏'],
                  ['full', '列表'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSnapChange(id)}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px]',
                    snap === id || (id === 'half' && snap === 'mapFocus')
                      ? 'bg-[var(--ink)] text-white'
                      : 'bg-[var(--paper-2)] text-[var(--ink-soft)]',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3">{children}</div>
      </div>
    </div>
  );
}
