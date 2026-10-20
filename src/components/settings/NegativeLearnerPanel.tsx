'use client';

import { useCallback, useEffect, useState } from 'react';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { EmptyState } from '@/components/ui/ViewState';
import { addAvoidedToken } from '@/lib/avoided-tokens';
import { loadComfyUiSettings, saveComfyUiSettings } from '@/lib/comfyui/settings';
import { DEFAULT_NEGATIVE_PROFILES } from '@/lib/negative-profiles';
import {
  activeNegativeSuggestions,
  dismissNegativeSuggestion,
  loadNegativeSuggestions,
  type NegativeSuggestion,
} from '@/lib/negative-learner';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

export default function NegativeLearnerPanel() {
  const [items, setItems] = useState<NegativeSuggestion[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setItems(activeNegativeSuggestions(20));
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      refresh();
    });
  }, [refresh]);

  function appendToNegativeProfile(token: string) {
    const settings = loadComfyUiSettings();
    const profiles =
      (settings.negativeProfiles?.length ?? 0) > 0
        ? [...settings.negativeProfiles!]
        : [...DEFAULT_NEGATIVE_PROFILES];
    const profileId = settings.selectedNegativeProfileId ?? profiles[0]?.id;
    const index = profiles.findIndex(entry => entry.id === profileId);
    if (index < 0) {
      return;
    }
    const profile = profiles[index]!;
    const extra = profile.extra?.trim() ?? '';
    const fragment = token.trim().toLowerCase();
    if (extra.toLowerCase().includes(fragment)) {
      setStatus(`“${token}” is already in the active negative profile.`);
      return;
    }
    profiles[index] = {
      ...profile,
      extra: extra ? `${extra}, ${fragment}` : fragment,
    };
    saveComfyUiSettings({
      ...settings,
      negativeProfiles: profiles,
    });
    setStatus(`Added “${token}” to negative profile “${profile.label}”.`);
  }

  return (
    <ToolSection title="Negative prompt learner">
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        Tokens from gallery prompts rated 1–2 stars. Add frequent ones to avoided tokens or your
        negative profile.
      </p>
      {items.length === 0 ? (
        <EmptyState
          compact
          icon="inbox"
          title="No suggestions yet"
          description="Rate a few low outputs in Gallery review — frequent tokens from 1–2 star prompts will show up here."
          action={{ label: 'Open gallery review', href: '/gallery?review=1' }}
        />
      ) : (
        <ul className="space-y-2">
          {items.map(item => (
            <li
              key={item.token}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/35 px-3 py-2"
            >
              <span className="text-sm text-[var(--tint-danger-text)]">
                {item.token} · {item.count}×
              </span>
              <button
                type="button"
                onClick={() => {
                  addAvoidedToken(item.token);
                  setStatus(`Added “${item.token}” to avoided tokens.`);
                }}
                className="rounded-full border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-2.5 py-0.5 text-xs text-[var(--tint-warning-text)] transition hover:border-[var(--tint-warning-border)]"
              >
                Avoid
              </button>
              <button
                type="button"
                onClick={() => appendToNegativeProfile(item.token)}
                className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2.5 py-0.5 text-xs text-[var(--accent-text)] transition hover:border-[var(--accent-border)]"
              >
                To negative
              </button>
              <button
                type="button"
                onClick={() => {
                  dismissNegativeSuggestion(item.token);
                  refresh();
                }}
                className="rounded-full border border-[var(--border-default)]/60 px-2.5 py-0.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)]"
              >
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}
      {status ? <p className="mt-3 text-xs text-[var(--tint-success-text)]">{status}</p> : null}
      <button
        type="button"
        className="mt-3 text-xs text-[var(--text-muted)] underline underline-offset-2"
        onClick={() => {
          setItems(loadNegativeSuggestions().filter(entry => !entry.dismissed));
        }}
      >
        Show all learned tokens
      </button>
    </ToolSection>
  );
}
