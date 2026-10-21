'use client';

import { useRenderBackend } from '@/lib/engine/render-backend-status';
import { useEffect, useState } from 'react';
import BrandMark from '@/components/BrandMark';
import { hasChosenWorkspaceMode, saveWorkspaceMode } from '@/lib/app/workspace-mode';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { Button } from '@/components/ui/Button';
import { markOnboardingSetWorkspace } from '@/lib/app/onboarding-hooks';
import { saveFirstRunGoal, type FirstRunGoalId } from '@/lib/app/first-run-goal';
import { FIRST_RUN_GENERATE_HREF } from '@/lib/app/empty-cta';
import { startStarterPlayFilm } from '@/lib/play/starter';
import { welcomeSampleFilmShots } from '@/lib/film/welcome-sample-film';
import { noteWelcomeShownMetric } from '@/lib/server/local-observability';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import { useAuth } from '@/hooks/useAuth';
import {
  SETTINGS_SYNCED_WITH_SERVER_EVENT,
  isSettingsSyncedWithServer,
} from '@/lib/settings/push-flush';

/** Longest wait for the first server sync before judging a browser as brand new. */
const WELCOME_SYNC_WAIT_MS = 8000;

type WelcomePhase = 'goal';

/** One-time welcome: one screen — make a first film, try a starter, or just an image. */
export default function WorkspaceWelcome() {
  const auth = useAuth();
  const [phase, setPhase] = useState<WelcomePhase | null>(null);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PLAYWRIGHT === '1') {
      return;
    }
    if (auth?.authEnabled && !auth.user) {
      return;
    }
    // A new browser has no local "chosen" flag until the server copy lands — deciding earlier
    // showed the welcome to returning users on every new device.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const decide = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener(SETTINGS_SYNCED_WITH_SERVER_EVENT, decide);
      clearTimeout(timer);
      if (!hasChosenWorkspaceMode()) {
        setPhase('goal');
        noteWelcomeShownMetric();
      }
    };
    scheduleAfterCommit(() => {
      if (settled) return;
      if (isSettingsSyncedWithServer()) {
        decide();
        return;
      }
      window.addEventListener(SETTINGS_SYNCED_WITH_SERVER_EVENT, decide);
      timer = setTimeout(decide, WELCOME_SYNC_WAIT_MS);
    });
    return () => {
      settled = true;
      window.removeEventListener(SETTINGS_SYNCED_WITH_SERVER_EVENT, decide);
      clearTimeout(timer);
    };
  }, [auth?.authEnabled, auth?.user]);

  if (!phase || process.env.NEXT_PUBLIC_PLAYWRIGHT === '1') {
    return null;
  }

  /**
   * One screen (fresh-install walk, 2026-10-13: three steps, nine buttons on the first, a
   * density picker and a "You're set" screen of six more). The film paths never needed the
   * setup step — Day's queue nudges setup when something is missing.
   */
  function choose(goal: FirstRunGoalId) {
    saveFirstRunGoal(goal);
    markOnboardingSetWorkspace();
    noteWelcomeShownMetric();
    setPhase(null);
    if (goal === 'image') {
      saveWorkspaceMode('simple');
      window.location.assign(FIRST_RUN_GENERATE_HREF);
      return;
    }
    saveWorkspaceMode('play');
    if (goal === 'film') {
      window.location.assign(startStarterPlayFilm().href);
      return;
    }
    window.location.assign('/play');
  }

  return (
    <div
      className="ui-overlay fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-welcome-title"
    >
      <div className="page-enter ui-welcome-card max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain">
        <div className="mb-4">
          <BrandMark
            size={36}
            withWordmark
            wordmarkClassName="type-brand type-heading tracking-tight"
          />
        </div>
        <p className="type-overline text-[var(--text-muted)]">Welcome</p>
        <h2
          id="workspace-welcome-title"
          className="type-display mt-2 text-[1.5rem] text-[var(--text-primary)]"
        >
          Make your first film
        </h2>
        <p className="type-body mt-2 text-[var(--text-secondary)]">
          Name your lead (a photo helps), and Castcut turns a day in their life — four stills,
          morning to night — into a short film.
        </p>
        <WelcomeSetupState />
        <div className="mt-4" data-testid="welcome-sample-film">
          <FilmWatchPlayer shots={welcomeSampleFilmShots()} emptyLabel="Sample reel unavailable." />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2" data-testid="welcome-goal-chooser">
          <Button
            type="button"
            variant="primary"
            data-testid="welcome-goal-character"
            onClick={() => choose('character')}
          >
            Make my first film
          </Button>
          <Button
            type="button"
            variant="secondary"
            data-testid="welcome-goal-film"
            title="A sample lead (Nova) and a ready Day — queue it to see the whole path"
            onClick={() => choose('film')}
          >
            Try a starter film
          </Button>
        </div>
        <div className="type-caption mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[var(--text-muted)]">
          <button
            type="button"
            className="ui-text-link"
            data-testid="welcome-goal-image"
            onClick={() => choose('image')}
          >
            Just make an image
          </button>
          <button
            type="button"
            className="ui-text-link"
            data-testid="welcome-skip"
            onClick={() => {
              saveWorkspaceMode('play');
              markOnboardingSetWorkspace();
              setPhase(null);
            }}
          >
            Look around first
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Setup state on the first screen (UI audit 2026-10-11: health came only as an optional second
 * step): ready to create, or not yet. Only the state: the setup itself is the checklist's and the
 * first-queue modal's (lib/app/setup-copy.ts), so the welcome doesn't repeat their steps.
 */
function WelcomeSetupState() {
  const { state } = useRenderBackend();
  if (state === 'checking') return null;
  const ready = state === 'online';
  return (
    <p
      className={`type-caption mt-3 flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2 ${
        ready
          ? 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)]'
          : 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]'
      }`}
      data-testid="welcome-setup-state"
      data-ready={ready ? 'true' : 'false'}
    >
      <span
        className="ui-health-dot mt-1 shrink-0"
        data-status={ready ? 'ok' : 'warn'}
        aria-hidden
      />
      {ready
        ? 'Ready to create — ComfyUI answers.'
        : 'ComfyUI isn’t reachable yet — look around and plan freely. Your first queue walks you through setup.'}
    </p>
  );
}
