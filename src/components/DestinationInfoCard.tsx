'use client';

import { useState } from 'react';

import type { DestinationEssentials } from '@/types/database';

interface DestinationInfoCardProps {
  destination: string;
  essentials?: DestinationEssentials | null;
}

export function DestinationInfoCard({
  destination,
  essentials,
}: DestinationInfoCardProps) {
  const [open, setOpen] = useState(true);

  if (!essentials) return null;

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white/60 p-4 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <p className="text-xs tracking-wide text-[var(--sea)] uppercase">
            目的地速查
          </p>
          <h3 className="font-display text-lg text-[var(--ink)]">
            {destination} 實用資訊
          </h3>
        </div>
        <span className="text-sm text-[var(--ink-soft)]">
          {open ? '收合' : '展開'}
        </span>
      </button>

      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-[var(--paper-2)]/70 px-3 py-3">
            <p className="text-[11px] text-[var(--ink-soft)]">貨幣 / 匯率</p>
            <p className="mt-1 font-medium text-[var(--ink)]">
              {essentials.currency_code} · {essentials.currency_name}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              {essentials.fx_note}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--paper-2)]/70 px-3 py-3">
            <p className="text-[11px] text-[var(--ink-soft)]">插座規格</p>
            <p className="mt-1 text-sm font-medium text-[var(--ink)]">
              {essentials.plug_type}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--paper-2)]/70 px-3 py-3">
            <p className="text-[11px] text-[var(--ink-soft)]">緊急電話</p>
            <p className="mt-1 text-sm text-[var(--ink)]">
              警察 {essentials.emergency_numbers.police}
            </p>
            <p className="text-sm text-[var(--ink)]">
              救護 {essentials.emergency_numbers.ambulance}
            </p>
            {essentials.emergency_numbers.notes && (
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                {essentials.emergency_numbers.notes}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
