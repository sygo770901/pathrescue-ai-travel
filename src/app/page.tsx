import { Suspense } from 'react';

import { TripPlannerApp } from '@/components/TripPlannerApp';

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-[var(--ink-soft)]">
          載入中…
        </div>
      }
    >
      <TripPlannerApp />
    </Suspense>
  );
}
