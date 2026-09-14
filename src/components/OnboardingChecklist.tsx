'use client';

import { useEffect, useMemo, useState } from 'react';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { canAccessNavFeature, useAllowedFeatures, useAuth } from '@/hooks/useAuth';
import {
  dismissOnboarding,
  isOnboardingChromeStep,
  isOnboardingCoreStep,
  isOnboardingStepAccessible,
  loadOnboardingState,
  ONBOARDING_UPDATED_EVENT,
  type OnboardingStep,
} from '@/lib/onboarding-store';
import { Button } from '@/components/ui/Button';
import { settingsTabHref } from '@/lib/settings-nav';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { saveWorkspaceMode } from '@/lib/workspace-mode';

function StepRow({ step }: { step: OnboardingStep }) {
  const body = (
    <>
      <span
        className={step.done ? 'text-[var(--tint-success-text)]' : 'text-[var(--text-muted)]'}
        aria-hidden
      >
        {step.done ? '✓' : '○'}
      </span>
      <span className={step.done ? 'text-[var(--text-muted)] line-through' : undefined}>
        {step.label}
      </span>
    </>
  );

  if (step.done || !step.href) {
    return <li className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">{body}</li>;
  }

  return (
    <li>
      <Link
        href={step.href}
        className="flex items-center gap-2 rounded-[var(--radius-md)] text-sm text-[var(--accent-text)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
      >
        {body}
      </Link>
    </li>
  );
}

export default function OnboardingChecklist() {
  const auth = useAuth();
  const router = useRouter();
  const workspaceMode = useWorkspaceMode();
  const isSimple = workspaceMode === 'simple';
  const isPlay = workspaceMode === 'play';
  const allowedFeatures = useAllowedFeatures();
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [hidden, setHidden] = useState(false);

  const accessibleSteps = useMemo(() => {
    if (!auth || auth.loading || !auth.authEnabled) {
      return steps;
    }
    return steps.filter(step => isOnboardingStepAccessible(step, allowedFeatures));
  }, [allowedFeatures, auth, steps]);

  const settingsAccessible = canAccessNavFeature(allowedFeatures, 'settings');

  useEffect(() => {
    scheduleAfterCommit(() => {
      const state = loadOnboardingState();
      setSteps(state);
      setHidden(state.every(step => step.done));
    });
    const refresh = () => {
      const state = loadOnboardingState();
      setSteps(state);
      setHidden(state.every(step => step.done));
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener(ONBOARDING_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener(ONBOARDING_UPDATED_EVENT, refresh);
    };
  }, []);

  if (hidden || accessibleSteps.every(step => step.done)) {
    return null;
  }

  const playFocusIds = new Set([
    'first-play-campaign',
    'first-film-cut',
    'watch-first-film',
    'comfy-health',
    'system-workflows',
  ]);
  const core = accessibleSteps.filter(step => {
    if (!isOnboardingCoreStep(step.id)) {
      return false;
    }
    if (isPlay) {
      return playFocusIds.has(step.id);
    }
    return true;
  });
  const chrome =
    isSimple || isPlay ? [] : accessibleSteps.filter(step => isOnboardingChromeStep(step.id));
  const simpleTips = isSimple
    ? accessibleSteps.filter(step => step.id === 'discover-palette' || step.id === 'pin-tool')
    : [];
  const nextOpen = core.find(step => !step.done);

  return (
    <div className="mx-auto mb-6 max-w-3xl rounded-[var(--radius-xl)] border border-[var(--accent-border)] bg-[var(--accent-muted)] p-4 shadow-[var(--shadow-surface)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--accent-text)]">
          {isPlay ? 'Finish your film' : 'Getting started'}
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            dismissOnboarding();
            setHidden(true);
          }}
        >
          Dismiss
        </Button>
      </div>
      {nextOpen?.href ? (
        <p className="mt-2 type-caption text-[var(--text-muted)]">
          Next:{' '}
          <Link
            href={nextOpen.href}
            className="text-[var(--accent-text)] transition hover:text-[var(--text-primary)]"
          >
            {nextOpen.label}
          </Link>
        </p>
      ) : null}

      {isSimple &&
      (nextOpen?.id === 'first-queue-success' ||
        nextOpen?.id === 'review-gallery' ||
        nextOpen?.id === 'first-play-campaign' ||
        nextOpen?.id === 'first-film-cut' ||
        nextOpen?.id === 'watch-first-film') ? (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="play-workspace-nudge">
          <p className="type-caption text-[var(--text-muted)]">
            After your first still, switch to Play for Moodboard → Fitting → Day → film.
          </p>
          <Button
            size="sm"
            variant="secondary"
            data-testid="play-workspace-nudge-cta"
            onClick={() => {
              saveWorkspaceMode('play');
              router.push('/play');
            }}
          >
            Open Play workspace
          </Button>
        </div>
      ) : null}
      <ul className="mt-3 space-y-2">
        {core.map(step => (
          <StepRow key={step.id} step={step} />
        ))}
      </ul>
      {simpleTips.some(step => !step.done) ? (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          <p className="type-caption mb-2 text-[var(--text-muted)]">Quick tips</p>
          <ul className="space-y-2">
            {simpleTips.map(step => (
              <StepRow key={step.id} step={step} />
            ))}
          </ul>
        </div>
      ) : null}
      {chrome.some(step => !step.done) ? (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          <p className="type-caption mb-2 text-[var(--text-muted)]">UI tips</p>
          <ul className="space-y-2">
            {chrome.map(step => (
              <StepRow key={step.id} step={step} />
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 type-caption text-[var(--text-muted)]">
        Prefer one click?{' '}
        {settingsAccessible ? (
          <>
            Use{' '}
            <Link
              href={settingsTabHref('overview')}
              className="text-[var(--accent-text)] transition hover:text-[var(--text-primary)]"
            >
              Settings → Heal & ready
            </Link>
            , or press{' '}
          </>
        ) : (
          <>Press </>
        )}
        <kbd className="rounded border border-[var(--border-default)] px-1">⌘/Ctrl+K</kbd> anytime.
      </p>
    </div>
  );
}
