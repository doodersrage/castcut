'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import {
  galleryEntryHeroPreviewUrl,
  initGalleryStore,
  loadComfyGallery,
} from '@/lib/comfyui-gallery';
import { loadScheduledBatchConfig } from '@/lib/scheduled-batch';
import { loadActiveProjectId, loadPromptProjects } from '@/lib/prompt-projects';
import {
  loadLastToolDraft,
  clearLastToolDraft,
  type ToolDraftSummary,
} from '@/lib/tool-draft-memory';
import { loadLastToolRoute, clearLastToolRoute } from '@/lib/last-tool-route';
import { flattenAppNavLinks } from '@/lib/app-nav-catalog';
import { buildGalleryFocusUrl, buildUseAsHintsUrlFromGallery } from '@/lib/use-as-hints-url';
import {
  startPromptEditorFromGalleryEntry,
  startRefineFromGalleryEntry,
  startRoleplayFromGalleryEntry,
} from '@/lib/improve-output';
import { requeueComfyJobFromEntry } from '@/lib/comfyui-requeue';
import GalleryEntryPreview from '@/components/ui/GalleryEntryPreview';
import { usePromptHistory } from '@/hooks/usePromptHistory';
import { useHubPageDescription, useToolSectionDescription } from '@/hooks/useToolPageDescription';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { saveWorkspaceMode } from '@/lib/workspace-mode';
import ConnectionHealthChip from '@/components/ConnectionHealthChip';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ToolPageSkeleton } from '@/components/ui/ViewState';
import { resolveStudioEmptyCta } from '@/lib/empty-cta';
import { loadPlayCampaignState } from '@/lib/play-campaign';
import { loadPlayMetrics } from '@/lib/play-metrics';
import {
  StatCard,
  ToolActionRow,
  ToolBadge,
  ToolLayout,
  ToolSection,
} from '@/components/ui/ToolPageShell';

const QueueOrchestrationPanel = dynamic(() => import('@/components/QueueOrchestrationPanel'), {
  loading: () => <ToolPageSkeleton label="Loading queue" />,
});

const OnboardingChecklist = dynamic(() => import('@/components/OnboardingChecklist'), {
  loading: () => <ToolPageSkeleton label="Loading checklist" />,
});

const PlayFilmMetricsCard = dynamic(() => import('@/components/PlayFilmMetricsCard'), {
  loading: () => <ToolPageSkeleton label="Loading play metrics" />,
});

const FirstRunGoalChooser = dynamic(() => import('@/components/FirstRunGoalChooser'), {
  loading: () => <ToolPageSkeleton label="Loading goals" />,
});

const ACCENT = 'neutral' as const;

function labelForRoute(href: string): string {
  const path = href.split('?')[0] || href;
  const link = flattenAppNavLinks().find(
    entry => entry.href === href || (entry.href.split('?')[0] || entry.href) === path
  );
  return link?.label ?? path;
}

export default function HomeDashboard() {
  const workspaceMode = useWorkspaceMode();
  const isSimple = workspaceMode === 'simple';
  const description = useHubPageDescription('dashboard');
  const recentSectionDescription = useToolSectionDescription(
    'Open a result, continue editing, or seed a new scene from its prompt.'
  );
  const { entries } = usePromptHistory();
  const [gallery, setGallery] = useState<ReturnType<typeof loadComfyGallery>>([]);
  const [scheduled, setScheduled] = useState(loadScheduledBatchConfig());
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>();
  const [projects, setProjects] = useState(loadPromptProjects());
  const [draft, setDraft] = useState<ToolDraftSummary | null>(null);
  const [lastRoute, setLastRoute] = useState<string | null>(null);
  const [showGoalChooser, setShowGoalChooser] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setGallery(loadComfyGallery());
      setScheduled(loadScheduledBatchConfig());
      setActiveProjectId(loadActiveProjectId());
      setProjects(loadPromptProjects());
      setDraft(loadLastToolDraft());
      setLastRoute(loadLastToolRoute());
      const metrics = loadPlayMetrics();
      const campaign = loadPlayCampaignState();
      setShowGoalChooser(!metrics.firstPlayCampaignAt && !campaign?.characterId);
    };
    void initGalleryStore().then(refresh);
    window.addEventListener('comfyui-gallery-updated', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('comfyui-gallery-updated', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const pending = useMemo(
    () => gallery.filter(entry => entry.status === 'pending' || entry.status === 'running'),
    [gallery]
  );
  const recentCompleted = useMemo(
    () =>
      gallery
        .filter(entry => entry.status === 'completed')
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
        .slice(0, isSimple ? 4 : 6),
    [gallery, isSimple]
  );
  const studioEmptyCta = resolveStudioEmptyCta();
  const activeProject = projects.find(project => project.id === activeProjectId);
  const showContinue =
    Boolean(draft) ||
    (Boolean(lastRoute) && lastRoute !== '/dashboard' && lastRoute !== draft?.href);

  return (
    <ToolLayout
      accent={ACCENT}
      width="wide"
      badge={<ToolBadge accent={ACCENT}>Overview</ToolBadge>}
      title="Dashboard"
      description={description}
    >
      <div className="flex flex-col gap-[var(--group-gap)]">
        <div className="flex flex-wrap items-center gap-3">
          <ConnectionHealthChip />
        </div>
        <OnboardingChecklist />
        <PlayFilmMetricsCard />
      </div>

      {showGoalChooser ? <FirstRunGoalChooser /> : null}

      <ToolSection
        title="Get ready"
        description="Heal ComfyUI once, then use desk Play or phone Mobile Studio."
      >
        <ToolActionRow>
          <ButtonLink
            href="/settings?tab=overview"
            variant="secondary"
            size="sm"
            data-testid="dashboard-heal-ready"
          >
            Heal & ready
          </ButtonLink>
          <ButtonLink href="/m" variant="secondary" size="sm" data-testid="dashboard-mobile-studio">
            Mobile Studio
          </ButtonLink>
          <ButtonLink href="/play" size="sm" variant="ghost">
            Play campaign
          </ButtonLink>
        </ToolActionRow>
      </ToolSection>

      {showContinue ? (
        <ToolSection title="Pick up where you left off">
          <div className="ui-continue-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              {draft ? (
                <>
                  <p className="type-caption text-[var(--text-muted)]">Draft · {draft.label}</p>
                  <p className="truncate text-sm text-[var(--text-secondary)]">{draft.preview}</p>
                </>
              ) : lastRoute ? (
                <>
                  <p className="type-caption text-[var(--text-muted)]">Last tool</p>
                  <p className="truncate text-sm text-[var(--text-secondary)]">
                    {labelForRoute(lastRoute)}
                  </p>
                </>
              ) : null}
            </div>
            <ToolActionRow className="shrink-0">
              {draft ? (
                <ButtonLink href={draft.href} variant="primary" size="sm">
                  Resume draft
                </ButtonLink>
              ) : null}
              {lastRoute && lastRoute !== draft?.href ? (
                <ButtonLink href={lastRoute} size="sm" variant="secondary">
                  Open {labelForRoute(lastRoute)}
                </ButtonLink>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  clearLastToolDraft();
                  clearLastToolRoute();
                  setDraft(null);
                  setLastRoute(null);
                }}
              >
                Dismiss
              </Button>
            </ToolActionRow>
          </div>
        </ToolSection>
      ) : null}

      <ToolSection title="Studio" description="One primary path — Play campaign — then core tools.">
        <ToolActionRow>
          <ButtonLink
            href="/play"
            variant={showContinue ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => {
              if (isSimple) {
                saveWorkspaceMode('play');
              }
            }}
          >
            Open Play campaign
          </ButtonLink>
          <ButtonLink href="/" size="sm" variant="secondary">
            Generate
          </ButtonLink>
          <ButtonLink href="/gallery" size="sm" variant="secondary">
            Gallery
          </ButtonLink>
          <ButtonLink href="/queue" size="sm" variant="secondary">
            Queue
          </ButtonLink>
          {isSimple ? (
            <ButtonLink href="/settings" size="sm" variant="ghost">
              Settings
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/studio" size="sm" variant="ghost">
                Studio
              </ButtonLink>
              <ButtonLink href="/settings" size="sm" variant="ghost">
                Settings
              </ButtonLink>
            </>
          )}
        </ToolActionRow>
        {!isSimple ? (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 type-caption text-[var(--text-muted)]">
            <span>More:</span>
            <Link
              href="/topics"
              className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              Topics
            </Link>
            <Link
              href="/variations"
              className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              Variations
            </Link>
            <Link
              href="/variations?matrix=1"
              className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              Matrix
            </Link>
            <Link
              href="/plugins"
              className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              Plugins
            </Link>
          </p>
        ) : null}

        <div
          className={`mt-4 grid gap-[var(--group-gap)] ${isSimple ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4'}`}
        >
          <StatCard label="Pending ComfyUI" value={String(pending.length)} />
          {!isSimple ? <StatCard label="History entries" value={String(entries.length)} /> : null}
          {!isSimple ? (
            <>
              <StatCard
                label="Scheduled batch"
                value={scheduled.enabled ? `Every ${scheduled.intervalMinutes}m` : 'Off'}
              />
              <StatCard label="Active project" value={activeProject?.name ?? 'None'} />
            </>
          ) : null}
        </div>
      </ToolSection>

      {isSimple ? (
        <ToolSection title="Queue">
          <p className="type-caption text-[var(--text-muted)]">
            {pending.length > 0
              ? `${pending.length} job${pending.length === 1 ? '' : 's'} running or pending.`
              : 'No jobs in flight right now.'}
          </p>
          <ToolActionRow className="mt-3">
            <ButtonLink href="/queue" variant="primary" size="sm">
              Open Queue
            </ButtonLink>
          </ToolActionRow>
        </ToolSection>
      ) : (
        <QueueOrchestrationPanel compact />
      )}

      {recentCompleted.length > 0 ? (
        <ToolSection title="Recent outputs" description={recentSectionDescription}>
          <div
            className={`grid gap-3 ${isSimple ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'}`}
          >
            {recentCompleted.map(entry => {
              const preview = galleryEntryHeroPreviewUrl(entry);
              const focusHref = buildGalleryFocusUrl(entry.id);
              const hintsHref = buildUseAsHintsUrlFromGallery(entry);
              return (
                <div
                  key={entry.id}
                  className="group ui-media-card relative overflow-hidden transition hover:border-[var(--border-strong)] focus-within:border-[var(--border-strong)] focus-within:ring-2 focus-within:ring-[var(--accent-ring)]"
                >
                  <div className="relative">
                    {preview ? (
                      <GalleryEntryPreview
                        entry={entry}
                        className="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center p-2 type-caption text-[var(--text-muted)]">
                        No preview
                      </div>
                    )}
                    <Link
                      href={focusHref}
                      className="absolute inset-0 z-[1]"
                      aria-label={
                        entry.prompt.trim()
                          ? `Open ${entry.prompt.slice(0, 80)}`
                          : 'Open in gallery'
                      }
                    />
                    <p className="pointer-events-none relative z-[2] line-clamp-2 p-2 text-[11px] text-[var(--text-tertiary)]">
                      {entry.prompt}
                    </p>
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex translate-y-1 gap-1 bg-gradient-to-t from-[var(--bg-base)] via-[var(--bg-base)]/80 to-transparent p-2 pt-8 opacity-0 transition duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
                    <button
                      type="button"
                      className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                      onClick={() => void requeueComfyJobFromEntry(entry)}
                    >
                      Re-queue
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                      onClick={() => startRefineFromGalleryEntry(entry)}
                    >
                      Refine
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                      onClick={() => startRoleplayFromGalleryEntry(entry)}
                    >
                      Roleplay
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                      onClick={() => startPromptEditorFromGalleryEntry(entry)}
                    >
                      Edit
                    </button>
                    <Link
                      href={hintsHref}
                      className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    >
                      Hints
                    </Link>
                    <Link
                      href={focusHref}
                      className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3">
            <ButtonLink href="/gallery" size="sm">
              Open gallery
            </ButtonLink>
          </div>
        </ToolSection>
      ) : (
        <ToolSection
          title="Recent outputs"
          description="Queue a still or resume Play to fill this strip."
          data-testid="dashboard-recent-empty"
        >
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              href={studioEmptyCta.href}
              size="sm"
              variant="primary"
              data-testid="dashboard-recent-empty-cta"
            >
              {studioEmptyCta.label}
            </ButtonLink>
            <ButtonLink href="/gallery" size="sm" variant="secondary">
              Open gallery
            </ButtonLink>
          </div>
        </ToolSection>
      )}
    </ToolLayout>
  );
}
