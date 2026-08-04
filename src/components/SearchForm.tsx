'use client';

import { FormEvent, useState } from 'react';

import {
  BUDGET_OPTIONS,
  COMPANION_OPTIONS,
  DEFAULT_USER_PROFILE,
  DIETARY_OPTIONS,
  PACE_OPTIONS,
  TRANSPORT_OPTIONS,
} from '@/lib/travelProfile';
import { cn } from '@/lib/utils';
import type {
  DietaryPreference,
  TravelBudget,
  TravelCompanion,
  TravelPace,
  TravelTransport,
  UserTravelProfile,
} from '@/types/database';

export const PREFERENCE_OPTIONS = [
  { id: 'food', label: '美食' },
  { id: 'photo', label: '網美' },
  { id: 'outdoor', label: '戶外' },
  { id: 'family', label: '親子' },
] as const;

export interface SearchFormValues {
  destination: string;
  total_days: number;
  preferences: string[];
  notes: string;
  user_profile: UserTravelProfile;
}

interface SearchFormProps {
  loading?: boolean;
  onSubmit: (values: SearchFormValues) => void;
}

function OptionGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium tracking-wide text-[var(--ink-soft)] uppercase">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs transition sm:text-sm',
                active
                  ? 'bg-[var(--sea)] text-white'
                  : 'bg-white/60 text-[var(--ink-soft)] hover:bg-white',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SearchForm({ loading = false, onSubmit }: SearchFormProps) {
  const [destination, setDestination] = useState('東京');
  const [totalDays, setTotalDays] = useState(3);
  const [preferences, setPreferences] = useState<string[]>(['food', 'photo']);
  const [notes, setNotes] = useState('');
  const [pace, setPace] = useState<TravelPace>(DEFAULT_USER_PROFILE.pace);
  const [companions, setCompanions] = useState<TravelCompanion>(
    DEFAULT_USER_PROFILE.companions,
  );
  const [budget, setBudget] = useState<TravelBudget>(DEFAULT_USER_PROFILE.budget);
  const [transport, setTransport] = useState<TravelTransport>(
    DEFAULT_USER_PROFILE.transport,
  );
  const [dietary, setDietary] = useState<DietaryPreference[]>(
    DEFAULT_USER_PROFILE.dietary,
  );

  function togglePreference(id: string) {
    setPreferences((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function toggleDietary(id: DietaryPreference) {
    setDietary((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = destination.trim();
    if (!trimmed || loading) return;

    onSubmit({
      destination: trimmed,
      total_days: totalDays,
      preferences,
      notes: notes.trim(),
      user_profile: {
        pace,
        companions,
        budget,
        transport,
        dietary,
      },
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-rise space-y-5 border-b border-[var(--line)] pb-6"
    >
      <div className="grid gap-4 sm:grid-cols-[1.4fr_0.6fr]">
        <label className="block space-y-2">
          <span className="text-xs font-medium tracking-wide text-[var(--ink-soft)] uppercase">
            目的地
          </span>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="例如：大阪、京都、首爾…"
            required
            className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3 text-base outline-none transition focus:border-[var(--sea)] focus:ring-2 focus:ring-[var(--glow)]"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-xs font-medium tracking-wide text-[var(--ink-soft)] uppercase">
            天數
          </span>
          <input
            type="number"
            min={1}
            max={14}
            value={totalDays}
            onChange={(e) => setTotalDays(Number(e.target.value) || 1)}
            className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3 text-base outline-none transition focus:border-[var(--sea)] focus:ring-2 focus:ring-[var(--glow)]"
          />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium tracking-wide text-[var(--ink-soft)] uppercase">
          旅遊偏好
        </legend>
        <div className="flex flex-wrap gap-2">
          {PREFERENCE_OPTIONS.map((option) => {
            const active = preferences.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => togglePreference(option.id)}
                className={cn(
                  'rounded-lg px-3.5 py-2 text-sm transition',
                  active
                    ? 'bg-[var(--sea)] text-white'
                    : 'bg-white/60 text-[var(--ink-soft)] hover:bg-white',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <OptionGroup
        legend="步調風格"
        options={PACE_OPTIONS}
        value={pace}
        onChange={setPace}
      />
      <OptionGroup
        legend="同行夥伴"
        options={COMPANION_OPTIONS}
        value={companions}
        onChange={setCompanions}
      />
      <OptionGroup
        legend="預算等級"
        options={BUDGET_OPTIONS}
        value={budget}
        onChange={setBudget}
      />
      <OptionGroup
        legend="交通方式"
        options={TRANSPORT_OPTIONS}
        value={transport}
        onChange={setTransport}
      />

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium tracking-wide text-[var(--ink-soft)] uppercase">
          飲食偏好
        </legend>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((option) => {
            const active = dietary.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => toggleDietary(option.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs transition sm:text-sm',
                  active
                    ? 'bg-[var(--coral)] text-white'
                    : 'bg-white/60 text-[var(--ink-soft)] hover:bg-white',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="block space-y-2">
        <span className="text-xs font-medium tracking-wide text-[var(--ink-soft)] uppercase">
          補充需求（選填）
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="例如：不想走太多路、想吃拉麵、避開人潮…"
          className="w-full resize-none rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3 text-sm outline-none transition focus:border-[var(--sea)] focus:ring-2 focus:ring-[var(--glow)]"
        />
      </label>

      <button
        type="submit"
        disabled={loading || !destination.trim()}
        className="w-full rounded-xl bg-[var(--ink)] px-5 py-3.5 text-sm font-medium text-[var(--paper)] transition hover:bg-[var(--sea-deep)] sm:w-auto"
      >
        {loading ? '正在規劃路線…' : '生成智慧行程'}
      </button>
    </form>
  );
}
