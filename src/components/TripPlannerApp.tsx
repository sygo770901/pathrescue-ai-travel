'use client';

import { useState } from 'react';

import { ExportMapsButton } from '@/components/ExportMapsButton';
import { ItineraryPanel } from '@/components/ItineraryPanel';
import { RescuePanel } from '@/components/RescuePanel';
import { SearchForm, type SearchFormValues } from '@/components/SearchForm';
import { SosButton } from '@/components/SosButton';
import { TripMap } from '@/components/TripMap';
import type {
  RescueModeResponse,
  TripGeneratorResponse,
} from '@/types/database';

export function TripPlannerApp() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trip, setTrip] = useState<TripGeneratorResponse | null>(null);
  const [rescue, setRescue] = useState<RescueModeResponse | null>(null);
  const [activeDay, setActiveDay] = useState<number | 'all'>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  async function handleGenerate(values: SearchFormValues) {
    setLoading(true);
    setError(null);
    setRescue(null);

    try {
      const response = await fetch('/api/generate-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: values.destination,
          total_days: values.total_days,
          preferences: values.preferences,
          notes: values.notes || null,
          locale: 'zh-TW',
        }),
      });

      const json = (await response.json()) as {
        data?: TripGeneratorResponse;
        error?: string;
      };

      if (!response.ok || !json.data) {
        throw new Error(json.error ?? '行程生成失敗');
      }

      setTrip(json.data);
      setActiveDay('all');
      setSelectedKey(
        json.data.itinerary[0]?.schedule[0]
          ? '1-0'
          : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '行程生成失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header className="animate-rise mb-8 max-w-2xl">
        <p className="text-sm font-medium tracking-[0.18em] text-[var(--sea)] uppercase">
          PathRescue
        </p>
        <h1 className="font-display mt-2 text-4xl leading-tight text-[var(--ink)] sm:text-5xl">
          AI 智慧旅遊導航與救援
        </h1>
        <p className="mt-3 max-w-xl text-base text-[var(--ink-soft)]">
          依偏好生成可落地的行程，用地圖校正真實景點，現場突發狀況一鍵重排備案。
        </p>
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <div className="rounded-2xl border border-[var(--line)] bg-white/50 p-5 backdrop-blur-sm">
            <SearchForm loading={loading} onSubmit={handleGenerate} />
            {error && (
              <p className="mt-4 rounded-lg bg-[rgba(180,35,24,0.08)] px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </p>
            )}
          </div>

          <SosButton
            onRescue={(payload) => {
              setRescue(payload);
              setError(null);
            }}
            onError={(message) => setError(message)}
          />

          <RescuePanel rescue={rescue} />
        </aside>

        <main className="min-h-[70vh]">
          {!trip ? (
            <div className="animate-rise-delay-1 flex h-full min-h-[420px] items-end rounded-2xl border border-dashed border-[var(--line)] bg-[rgba(15,107,92,0.06)] p-8">
              <div className="max-w-md">
                <h2 className="font-display text-3xl text-[var(--ink)]">
                  先選一個城市
                </h2>
                <p className="mt-2 text-[var(--ink-soft)]">
                  生成後會在這裡展開路線地圖與每日行程卡片，點擊卡片可高亮對應標記。
                </p>
              </div>
            </div>
          ) : (
            <div className="animate-rise flex h-full min-h-0 flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs tracking-wide text-[var(--ink-soft)] uppercase">
                    {trip.destination} · {trip.total_days} 天
                  </p>
                  <h2 className="font-display text-3xl text-[var(--ink)]">
                    {trip.trip_title}
                  </h2>
                </div>
                <ExportMapsButton trip={trip} />
              </div>

              <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <TripMap
                  trip={trip}
                  selectedKey={selectedKey}
                  activeDay={activeDay}
                  onSelect={setSelectedKey}
                />
                <div className="min-h-[360px] rounded-2xl border border-[var(--line)] bg-white/50 p-4 backdrop-blur-sm xl:min-h-0">
                  <ItineraryPanel
                    days={trip.itinerary}
                    activeDay={activeDay}
                    selectedKey={selectedKey}
                    onSelectDay={setActiveDay}
                    onSelectPlace={setSelectedKey}
                  />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
