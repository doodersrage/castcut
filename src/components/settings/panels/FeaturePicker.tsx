'use client';

import { useMemo } from 'react';
import {
  APP_FEATURES,
  ALL_FEATURE_IDS,
  featureInApp,
  type AppFeatureId,
} from '@/lib/auth/features';

export default function FeaturePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: AppFeatureId[];
  onChange: (next: AppFeatureId[]) => void;
  disabled?: boolean;
}) {
  const blockedSet = useMemo(() => new Set(value), [value]);
  const allowedCount = ALL_FEATURE_IDS.length - value.length;
  const allAllowed = value.length === 0;
  const allBlocked = value.length === ALL_FEATURE_IDS.length;

  function setBlocked(nextBlocked: AppFeatureId[]) {
    onChange([...new Set(nextBlocked)]);
  }

  function toggleAllowed(featureId: AppFeatureId) {
    if (blockedSet.has(featureId)) {
      setBlocked(value.filter(entry => entry !== featureId));
      return;
    }
    setBlocked([...value, featureId]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || allAllowed}
          onClick={() => setBlocked([])}
          className="rounded-full border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] px-3 py-1 text-xs text-[var(--tint-success-text)] transition hover:border-[var(--tint-success-border)] hover:bg-[var(--tint-success-bg)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Allow all
        </button>
        <button
          type="button"
          disabled={disabled || allBlocked}
          onClick={() => setBlocked([...ALL_FEATURE_IDS])}
          className="rounded-full border border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] px-3 py-1 text-xs text-[var(--tint-danger-text)] transition hover:border-[var(--tint-danger-border)] hover:bg-[var(--tint-danger-bg)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Block all
        </button>
        <span className="type-caption text-[var(--text-muted)]">
          {allowedCount} of {ALL_FEATURE_IDS.length} sections allowed
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {APP_FEATURES.filter(feature => featureInApp(feature.id)).map(feature => {
          const allowed = !blockedSet.has(feature.id);
          return (
            <label
              key={feature.id}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                disabled
                  ? 'cursor-not-allowed border-[var(--border-subtle)]/50 bg-[var(--bg-base)]/20 opacity-60'
                  : allowed
                    ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
                    : 'border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/40 text-[var(--text-muted)]'
              }`}
            >
              <input
                type="checkbox"
                checked={allowed}
                disabled={disabled}
                onChange={() => toggleAllowed(feature.id)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
              />
              <span>
                <span className="block font-medium text-[var(--text-primary)]">
                  {feature.label}
                </span>
                <span className="block text-xs text-[var(--text-muted)]">
                  {feature.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
