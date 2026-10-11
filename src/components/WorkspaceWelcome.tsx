'use client';

import { useRenderBackend } from '@/lib/render-backend-status';
import { useEffect, useState } from 'react';
import BrandMark from '@/components/BrandMark';
import BrandStudioIllustration from '@/components/BrandStudioIllustration';
import {
  WORKSPACE_MODE_OPTIONS,
  hasChosenWorkspaceMode,
  saveWorkspaceMode,
  type WorkspaceMode,
} from '@/lib/workspace-mode';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { Button, ButtonLink } from '@/components/ui/Button';
import { runHealAndReady } from '@/lib/first-run-setup';
import { markOnboardingSetWorkspace } from '@/lib/onboarding-hooks';
import {
  FIRST_RUN_GOAL_OPTIONS,
  saveFirstRunGoal,
  type FirstRunGoalId,
} from '@/lib/first-run-goal';
import {
  resolveWelcomeLandingCta,
  FIRST_RUN_QUEUE_HREF,
  FIRST_RUN_GENERATE_HREF,
} from '@/lib/empty-cta';
import { startStarterPlayFilm } from '@/lib/play-starter';
import { welcomeSampleFilmShots } from '@/lib/welcome-sample-film';
import { noteWelcomeShownMetric } from '@/lib/local-observability';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import { useAuth } from '@/hooks/useAuth';
import {
  SETTINGS_SYNCED_WITH_SERVER_EVENT,
  isSettingsSyncedWithServer,
} from '@/lib/settings-push-flush';

/** Longest wait for the first server sync before judging a browser as brand new. */
const WELCOME_SYNC_WAIT_MS = 8000;

type WelcomePhase = 'goal' | 'setup' | 'ready';

const PHASE_STEP: Record<WelcomePhase, number> = {
  goal: 1,
  setup: 2,
  ready: 3,
};

/** One-time welcome: what to make → optional Heal → land on the chosen path. */
export default function WorkspaceWelcome() {
  const auth = useAuth();
  const [phase, setPhase] = useState<WelcomePhase | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [generateCta, setGenerateCta] = useState({
    label: 'Open Generate',
    href: '/?source=random',
  });
  const [chosenGoal, setChosenGoal] = useState<FirstRunGoalId | null>(null);

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

  function chooseGoal(goal: FirstRunGoalId) {
    saveFirstRunGoal(goal);
    setChosenGoal(goal);
    // Image / Surprise stay out of the film kiosk — lean Simple chrome.
    if (goal === 'image' || goal === 'surprise') {
      saveWorkspaceMode('simple');
      markOnboardingSetWorkspace();
      setPhase('setup');
      return;
    }
    // Character — Film campaign at your own pace (Look → Outfit → Day).
    if (goal === 'character') {
      saveWorkspaceMode('play');
      markOnboardingSetWorkspace();
      noteWelcomeShownMetric();
      setPhase(null);
      window.location.assign('/play');
      return;
    }
    // Film — skip setup, land on starter Day with auto-queue.
    saveWorkspaceMode('play');
    markOnboardingSetWorkspace();
    noteWelcomeShownMetric();
    const result = startStarterPlayFilm();
    setPhase(null);
    window.location.assign(result.href);
  }

  function chooseDensity(mode: WorkspaceMode) {
    saveWorkspaceMode(mode);
    markOnboardingSetWorkspace();
    setPhase('setup');
  }

  function finishWelcome() {
    setGenerateCta(resolveWelcomeLandingCta());
    setPhase('ready');
  }

  async function heal() {
    setBusy(true);
    setSetupMessage(null);
    try {
      const result = await runHealAndReady({
        onProgress: progress => setSetupMessage(progress.message),
      });
      setSetupMessage(result.message);
      if (result.ok || result.systemWorkflowsEnabled) {
        void import('@/lib/first-run-dismiss').then(({ dismissFirstRunSetupSurfaces }) => {
          dismissFirstRunSetupSurfaces();
        });
      }
      finishWelcome();
    } catch (err) {
      setSetupMessage(
        err instanceof Error ? err.message : 'Setup failed — you can continue anyway.'
      );
    } finally {
      setBusy(false);
    }
  }

  const step = PHASE_STEP[phase];
  const filmGoal = chosenGoal === 'character' || chosenGoal === 'film' || chosenGoal == null;

  return (
    <div
      className="ui-overlay fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-welcome-title"
    >
      <div className="page-enter ui-welcome-card max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain">
        <div className="mb-5 flex items-start justify-between gap-4">
          <BrandMark
            size={36}
            withWordmark
            wordmarkClassName="type-brand type-heading tracking-tight"
          />
          <div className="ui-stepper" role="img" aria-label={`Step ${step} of 3`}>
            {[1, 2, 3].map(n => (
              <span
                key={n}
                className="ui-stepper-dot"
                data-active={n === step ? 'true' : 'false'}
              />
            ))}
          </div>
        </div>

        {phase === 'goal' ? (
          <>
            <div className="mb-4 flex justify-center">
              <BrandStudioIllustration size={112} className="opacity-90" />
            </div>
            <p className="type-overline text-[var(--text-muted)]">Welcome</p>
            <h2
              id="workspace-welcome-title"
              className="type-display mt-2 text-[1.5rem] text-[var(--text-primary)]"
            >
              What do you want to make?
            </h2>
            <p className="type-body mt-2 text-[var(--text-secondary)]">
              Castcut turns a Cast lead into a short day-in-the-life film — or a single still when
              you just need an image.
            </p>
            <WelcomeSetupState />
            <div
              className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-3 py-3"
              data-testid="welcome-sample-film"
            >
              <p className="type-caption text-[var(--text-muted)]">What you&apos;re making</p>
              <p className="type-body mt-1 mb-3 text-[var(--text-secondary)]">
                Four stills — morning to night — cut into a short reel you can watch on Cast.
              </p>
              <FilmWatchPlayer
                shots={welcomeSampleFilmShots()}
                emptyLabel="Sample reel unavailable."
              />
            </div>
            <div className="mt-5 grid gap-2" data-testid="welcome-goal-chooser">
              {FIRST_RUN_GOAL_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => chooseGoal(option.id)}
                  className="ui-choice-card"
                  data-testid={`welcome-goal-${option.id}`}
                >
                  <span className="block text-sm font-medium text-[var(--text-primary)]">
                    {option.label}
                  </span>
                  <span className="type-caption mt-1 block text-[var(--text-muted)]">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
            <details className="mt-4">
              <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
                Prefer density first? Film / Simple / Studio / Full
              </summary>
              <div className="mt-2 grid gap-2">
                {WORKSPACE_MODE_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseDensity(option.id)}
                    className="ui-choice-card"
                  >
                    <span className="block text-sm font-medium text-[var(--text-primary)]">
                      {option.label}
                    </span>
                    <span className="type-caption mt-1 block text-[var(--text-muted)]">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </details>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => chooseGoal('film')}>
                Skip — start a film
              </Button>
            </div>
          </>
        ) : null}

        {phase === 'setup' ? (
          <>
            <p className="type-overline text-[var(--text-muted)]">Connect</p>
            <h2
              id="workspace-welcome-title"
              className="type-display mt-2 text-[1.5rem] text-[var(--text-primary)]"
            >
              Ready when you are
            </h2>
            <p className="type-body mt-2 text-[var(--text-secondary)]">
              Optional one-click setup enables system workflows and checks Comfy + LLM health. It
              also installs missing custom nodes through ComfyUI-Manager, which restarts ComfyUI —
              skip it if a render is running. Skip and explore — we&apos;ll nudge you when you
              queue.
            </p>
            {setupMessage ? (
              <p
                className="mt-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-3 py-2 type-caption text-[var(--text-muted)]"
                data-testid="welcome-heal-status"
              >
                {setupMessage}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="primary" size="sm" onClick={finishWelcome}>
                Continue
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={busy}
                loadingLabel="Setting up…"
                onClick={() => void heal()}
              >
                Heal & ready
              </Button>
            </div>
          </>
        ) : null}

        {phase === 'ready' ? (
          <>
            <p className="type-overline text-[var(--text-muted)]">Ready</p>
            <h2
              id="workspace-welcome-title"
              className="type-display mt-2 text-[1.5rem] text-[var(--text-primary)]"
            >
              You&apos;re set
            </h2>
            <p className="type-body mt-2 text-[var(--text-secondary)]">
              {setupMessage ??
                (filmGoal
                  ? 'Make a starter film in one tap, or create a Cast lead and walk Look → Outfit → Day.'
                  : 'Queue a first still — you can start a film anytime from Film.')}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPhase(null)}>
                Close
              </Button>
              <ButtonLink href="/m/film" variant="ghost" size="sm" onClick={() => setPhase(null)}>
                Film on phone
              </ButtonLink>
              {filmGoal ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-testid="welcome-starter-film"
                  onClick={() => {
                    saveWorkspaceMode('play');
                    const result = startStarterPlayFilm();
                    setPhase(null);
                    window.location.assign(result.href);
                  }}
                >
                  Make a starter film
                </Button>
              ) : null}
              {generateCta.href === FIRST_RUN_GENERATE_HREF ||
              generateCta.href.startsWith('/?source=random') ? (
                <ButtonLink
                  href="/play"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    saveWorkspaceMode('play');
                    setPhase(null);
                  }}
                >
                  Open Film
                </ButtonLink>
              ) : null}
              {generateCta.href.startsWith('/story') ||
              generateCta.href.includes('/play') ||
              generateCta.href.includes('/day') ||
              generateCta.href.includes('/characters') ||
              generateCta.href.includes('/fitting') ||
              generateCta.href.includes('/moodboard') ? null : (
                <ButtonLink
                  href={generateCta.href}
                  variant="secondary"
                  size="sm"
                  onClick={() => setPhase(null)}
                >
                  {generateCta.label}
                </ButtonLink>
              )}
              <ButtonLink
                href={
                  generateCta.href.startsWith('/story') ||
                  generateCta.href.includes('/play') ||
                  generateCta.href.includes('/day') ||
                  generateCta.href.includes('/characters') ||
                  generateCta.href.includes('/fitting') ||
                  generateCta.href.includes('/moodboard')
                    ? generateCta.href
                    : FIRST_RUN_QUEUE_HREF
                }
                variant="primary"
                size="sm"
                onClick={() => setPhase(null)}
              >
                {generateCta.href.startsWith('/story') ||
                generateCta.href.includes('/play') ||
                generateCta.href.includes('/day') ||
                generateCta.href.includes('/characters') ||
                generateCta.href.includes('/fitting') ||
                generateCta.href.includes('/moodboard')
                  ? generateCta.label
                  : 'Generate & queue first scene'}
              </ButtonLink>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Setup state on the first screen (UI audit 2026-10-11: health came only as an optional second
 * step): ready to create, or what needs attention — you can still look around either way.
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
        ? 'Ready to create — ComfyUI answers. The next step checks its models and add-ons.'
        : 'Needs attention — ComfyUI isn’t reachable yet. Look around and plan freely; renders start once it runs (the next step helps set it up).'}
    </p>
  );
}
