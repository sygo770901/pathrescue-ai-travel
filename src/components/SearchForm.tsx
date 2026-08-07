'use client';

import { FormEvent, useMemo, useState } from 'react';

import {
  ACTIVITY_OPTIONS,
  MAX_DIRECTIONS,
  TRIP_DIRECTION_OPTIONS,
} from '@/lib/interestOptions';
import {
  BUDGET_OPTIONS,
  COMPANION_OPTIONS,
  DEFAULT_USER_PROFILE,
  DIETARY_OPTIONS,
  PACE_OPTIONS,
  TRANSPORT_OPTIONS,
  profileLabel,
} from '@/lib/travelProfile';
import { formatLocalISODate } from '@/lib/tripMode';
import { cn } from '@/lib/utils';
import type {
  DietaryPreference,
  TravelBudget,
  TravelCompanion,
  TravelPace,
  TravelTransport,
  UserTravelProfile,
} from '@/types/database';

export interface SearchFormValues {
  destination: string;
  total_days: number;
  start_date: string;
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

function ChipMultiSelect({
  legend,
  hint,
  options,
  selected,
  onToggle,
  accent = 'sea',
}: {
  legend: string;
  hint?: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  accent?: 'sea' | 'coral';
}) {
  const activeClass =
    accent === 'coral'
      ? 'bg-[var(--coral)] text-white'
      : 'bg-[var(--sea)] text-white';

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium tracking-wide text-[var(--ink-soft)] uppercase">
        {legend}
      </legend>
      {hint && <p className="text-[11px] text-[var(--ink-soft)]">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggle(option.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs transition sm:text-sm',
                active ? activeClass : 'bg-white/70 text-[var(--ink-soft)] hover:bg-white',
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

function defaultStartDate(): string {
  return formatLocalISODate(new Date());
}

export function SearchForm({ loading = false, onSubmit }: SearchFormProps) {
  const [destination, setDestination] = useState('東京');
  const [totalDays, setTotalDays] = useState(3);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [directions, setDirections] = useState<string[]>(['dir_food']);
  const [activities, setActivities] = useState<string[]>([
    'act_coffee',
    'act_local_food',
  ]);
  const [notes, setNotes] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  const smartSummary = useMemo(
    () =>
      profileLabel({
        pace,
        companions,
        budget,
        transport,
        dietary,
      }),
    [pace, companions, budget, transport, dietary],
  );

  function toggleDirection(id: string) {
    setDirections((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= MAX_DIRECTIONS) return [...prev.slice(1), id];
      return [...prev, id];
    });
  }

  function toggleActivity(id: string) {
    setActivities((prev) =>
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
    if (!trimmed || loading || !startDate) return;

    onSubmit({
      destination: trimmed,
      total_days: totalDays,
      start_date: startDate,
      preferences: [...directions, ...activities],
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
    <form onSubmit={handleSubmit} className="animate-rise space-y-4">
      <div className="space-y-3">
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

        <div className="grid grid-cols-2 gap-3">
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

          <label className="block space-y-2">
            <span className="text-xs font-medium tracking-wide text-[var(--ink-soft)] uppercase">
              出發日
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-3 text-base outline-none transition focus:border-[var(--sea)] focus:ring-2 focus:ring-[var(--glow)]"
            />
          </label>
        </div>
      </div>

      <ChipMultiSelect
        legend="旅行方向"
        hint={`最多選 ${MAX_DIRECTIONS} 個，決定行程主軸`}
        options={TRIP_DIRECTION_OPTIONS}
        selected={directions}
        onToggle={toggleDirection}
      />

      <ChipMultiSelect
        legend="想做的事"
        hint="可多選，越具體行程越貼近你"
        options={ACTIVITY_OPTIONS}
        selected={activities}
        onToggle={toggleActivity}
        accent="coral"
      />

      <label className="block space-y-2">
        <span className="text-xs font-medium tracking-wide text-[var(--ink-soft)] uppercase">
          補充需求（選填）
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="例如：想打網球、不想只去星巴克、想找有插座的獨立咖啡…"
          className="w-full resize-none rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm outline-none focus:border-[var(--sea)]"
        />
      </label>

      <div className="rounded-xl border border-[var(--line)] bg-white/50 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <div>
            <p className="text-xs tracking-wide text-[var(--sea)] uppercase">
              進階偏好（選填）
            </p>
            <p className="mt-0.5 text-xs text-[var(--ink-soft)]">
              聰明預設：{smartSummary}
            </p>
          </div>
          <span className="shrink-0 text-xs text-[var(--ink-soft)]">
            {showAdvanced ? '收合' : '調整'}
          </span>
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 border-t border-[var(--line)] pt-3">
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
                        'rounded-lg px-3 py-1.5 text-xs transition',
                        active
                          ? 'bg-[var(--coral)] text-white'
                          : 'bg-white/60 text-[var(--ink-soft)]',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || !destination.trim() || !startDate}
        className="w-full rounded-xl bg-[var(--ink)] px-5 py-3.5 text-sm font-medium text-[var(--paper)] transition hover:bg-[var(--sea-deep)]"
      >
        {loading ? '正在規劃路線…' : '✨ 一鍵生成行程'}
      </button>
    </form>
  );
}
