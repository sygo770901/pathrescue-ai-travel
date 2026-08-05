'use client';

import { useEffect, useState } from 'react';

const STAGES = [
  '正在挑選熱門景點與動線…',
  '正在對接 Google Maps 驗證座標與營業資訊…',
  '正在計算最佳順路交通時間…',
] as const;

interface GenerationProgressProps {
  active: boolean;
}

export function GenerationProgress({ active }: GenerationProgressProps) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setStageIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setStageIndex((prev) => (prev + 1) % STAGES.length);
    }, 2800);

    return () => window.clearInterval(timer);
  }, [active]);

  if (!active) return null;

  return (
    <div className="animate-rise space-y-3 rounded-2xl border border-[var(--line)] bg-white/70 p-4">
      <p className="text-xs tracking-wide text-[var(--sea)] uppercase">
        生成進度
      </p>
      <p className="font-medium text-[var(--ink)]">{STAGES[stageIndex]}</p>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-3 overflow-hidden rounded-full bg-[var(--paper-2)]"
          >
            <div
              className="h-full rounded-full bg-[var(--sea)]/70 transition-all duration-700"
              style={{
                width: i < stageIndex ? '100%' : i === stageIndex ? '62%' : '18%',
              }}
            />
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="h-20 animate-pulse rounded-xl bg-[var(--paper-2)]" />
        <div className="h-20 animate-pulse rounded-xl bg-[var(--paper-2)]" />
      </div>
    </div>
  );
}
