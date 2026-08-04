'use client';

interface OfflineBannerProps {
  offline: boolean;
}

export function OfflineBanner({ offline }: OfflineBannerProps) {
  if (!offline) return null;

  return (
    <div className="mb-4 rounded-xl border border-[rgba(180,35,24,0.18)] bg-[rgba(180,35,24,0.08)] px-4 py-2.5 text-sm text-[var(--danger)]">
      目前為離線模式，正在顯示快取資料
    </div>
  );
}
