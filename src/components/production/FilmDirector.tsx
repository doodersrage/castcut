'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import {
  findingDecisionMap,
  loadFindingDecisions,
  subscribeFindingDecisions,
  type FindingDecision,
} from '@/lib/checks/finding-decisions';
import { getCharacter } from '@/lib/character/os';
import { normalizeSavedScenes } from '@/lib/day/scenes';
import { useSceneScripts } from '@/hooks/day-planner/useSceneScripts';
import { DEFAULT_CUT_TOOL_CACHE } from '@/lib/film/cut-room';
import { productionOverview, type SceneState } from '@/lib/film/production-overview';
import { nextProductionActions } from '@/lib/film/production-next';
import { normalizeSceneRun, runProgress, type SceneRun } from '@/lib/day/scene-run';

const RUN_STATE_LABELS: Record<SceneRun['state'], string> = {
  prepared: 'ready, not started',
  running: 'running',
  paused: 'paused',
  done: 'done',
  cancelled: 'cancelled',
};
import { lookPlateKey } from '@/lib/character/os';
import { Button, ButtonLink } from '@/components/ui/Button';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  getGalleryCache,
  initGalleryStore,
  type ComfyGalleryEntry,
} from '@/lib/gallery/comfyui-gallery';
import { DEFAULT_SCENE_TOOL_CACHE } from '@/lib/play/settings';

const EMPTY_GALLERY: ComfyGalleryEntry[] = [];
const NO_DECISIONS: FindingDecision[] = [];

function subscribeGallery(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onChange);
  return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onChange);
}

let decisionsCache: { key: string; value: FindingDecision[] } | null = null;
function decisionsSnapshot(): FindingDecision[] {
  const value = loadFindingDecisions();
  const key = JSON.stringify(value);
  if (decisionsCache?.key !== key) decisionsCache = { key, value };
  return decisionsCache.value;
}

const STATE_LABELS: Record<SceneState, string> = {
  planned: 'No take yet',
  rendering: 'Rendering',
  'to-review': 'Takes to review',
  kept: 'Kept',
};

/** One count, linked to the tool that owns it; muted when zero. */
function Stat({
  label,
  value,
  href,
  tone = 'plain',
  testId,
}: {
  label: string;
  value: number | string;
  href?: string;
  tone?: 'plain' | 'attention' | 'problem';
  testId: string;
}) {
  const zero = value === 0;
  const color = zero
    ? 'text-[var(--text-muted)]'
    : tone === 'problem'
      ? 'ui-status-danger'
      : tone === 'attention'
        ? 'text-[var(--tint-warning-text,var(--accent-text))]'
        : '';
  const body = (
    <>
      <span className={`block text-xl font-semibold tabular-nums ${color}`}>{value}</span>
      <span className="type-caption text-[var(--text-muted)]">{label}</span>
    </>
  );
  return href && !zero ? (
    <Link
      href={href}
      className="block rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-3 py-2 hover:border-[var(--accent-border)]"
      data-testid={testId}
    >
      {body}
    </Link>
  ) : (
    <div
      className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-3 py-2"
      data-testid={testId}
    >
      {body}
    </div>
  );
}

function Stats({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>;
}

/**
 * Film Director (M5 W1, ROADMAP §8.1): the active Cast's production in one place — Scenes and
 * takes, the script's coverage, jobs, open findings and the Cut — every count read from the
 * records the tools keep, and linked to the tool that owns it. Read-only.
 */
export default function FilmDirector() {
  const sceneTool = useCachedSettings('scene', DEFAULT_SCENE_TOOL_CACHE);
  const cut = useCachedSettings('cut', DEFAULT_CUT_TOOL_CACHE);
  const gallery = useSyncExternalStore(subscribeGallery, getGalleryCache, () => EMPTY_GALLERY);
  const decisions = useSyncExternalStore(
    subscribeFindingDecisions,
    decisionsSnapshot,
    () => NO_DECISIONS
  );
  useEffect(() => {
    void initGalleryStore();
  }, []);
  // The stored settings are read (they say who the Cast is and what was made).
  const mounted = sceneTool.mounted && cut.mounted;
  const castId = sceneTool.shared.activeCharacterId?.trim() ?? '';
  const castRecord = castId ? getCharacter(castId) : null;
  const castName = castRecord?.name;
  const settings = sceneTool.toolSettings;
  // Scripts keep their own store (M6 V6); any still in the settings move there.
  const { scripts } = useSceneScripts(sceneTool);

  const overview = useMemo(() => {
    if (!castId) return null;
    return productionOverview({
      castId,
      scenes: normalizeSavedScenes(settings.scenes),
      activeSceneId: settings.activeSceneId,
      activeStillStatus: settings.stills?.[0]?.status,
      scripts,
      gallery,
      decisions: findingDecisionMap(decisions),
      cut: cut.toolSettings,
    });
  }, [castId, cut.toolSettings, decisions, gallery, scripts, settings]);

  // The Scene page's run (M5 W4), as recorded — what automation did, step by step (W5).
  const run = useMemo(() => {
    const stored = normalizeSceneRun(settings.run);
    return stored && stored.castId === castId ? stored : undefined;
  }, [castId, settings.run]);
  const actions = useMemo(
    () =>
      overview
        ? nextProductionActions(
            overview,
            {
              ...(castName ? { name: castName } : {}),
              hasReference: Boolean(castRecord && lookPlateKey(castRecord)),
            },
            run
          )
        : [],
    [castName, castRecord, overview, run]
  );
  const [showAll, setShowAll] = useState(false);

  if (!mounted) return null;
  const scene = `/scene?character=${encodeURIComponent(castId)}`;
  return (
    <ToolLayout
      accent="amber"
      title="Film Director"
      description={
        castName
          ? `${castName}’s production as it stands — every number is read from the tools, and opens the one that owns it.`
          : 'Your production as it stands.'
      }
    >
      {!overview ? (
        <ToolSection title="Pick a Cast" data-testid="director-no-cast">
          <p className="type-caption text-[var(--text-muted)]">
            Film Director shows one Cast’s production. Pick a Cast lead on{' '}
            <Link className="underline" href="/play">
              Film
            </Link>{' '}
            or{' '}
            <Link className="underline" href="/characters">
              Cast
            </Link>
            .
          </p>
        </ToolSection>
      ) : (
        <>
          <ToolSection title="What next" data-testid="director-next">
            {actions.length ? (
              <>
                <ol className="space-y-2">
                  {(showAll ? actions : actions.slice(0, 5)).map(action => (
                    <li
                      key={action.id}
                      className="flex flex-wrap items-center gap-3"
                      data-testid={`director-next-${action.kind}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{action.title}</p>
                        <p className="type-caption text-[var(--text-muted)]">{action.detail}</p>
                      </div>
                      <ButtonLink href={action.href} size="sm" variant="secondary">
                        {action.cta}
                      </ButtonLink>
                    </li>
                  ))}
                </ol>
                {actions.length > 5 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    data-testid="director-next-more"
                    onClick={() => setShowAll(!showAll)}
                  >
                    {showAll ? 'Show fewer' : `Show all ${actions.length}`}
                  </Button>
                ) : null}
              </>
            ) : (
              <p className="type-caption text-[var(--text-muted)]" data-testid="director-next-none">
                Nothing waiting on you — every Scene has a kept take, no job failed and nothing is
                flagged.
              </p>
            )}
          </ToolSection>

          <ToolSection title="Scenes and takes" data-testid="director-scenes">
            <Stats>
              <Stat
                label="Scenes"
                value={overview.scenes.total}
                href={scene}
                testId="director-scenes-total"
              />
              <Stat
                label="Rendering or being checked"
                value={overview.scenes.rendering}
                href={scene}
                testId="director-scenes-rendering"
              />
              <Stat
                label="Takes to review (no keeper)"
                value={overview.scenes.toReview}
                href={scene}
                tone="attention"
                testId="director-scenes-review"
              />
              <Stat
                label="Kept"
                value={overview.scenes.kept}
                href={scene}
                testId="director-scenes-kept"
              />
              <Stat
                label="No take yet"
                value={overview.scenes.planned}
                href={scene}
                testId="director-scenes-planned"
              />
              <Stat
                label="Kept take looks wrong"
                value={overview.scenes.keptLooksWrong}
                href={scene}
                tone="problem"
                testId="director-scenes-looks-wrong"
              />
              <Stat
                label="In the Cut"
                value={overview.scenes.inCut}
                href="/cut?from=scenes"
                testId="director-scenes-in-cut"
              />
            </Stats>
            {overview.scenes.items.length ? (
              <ul className="mt-3 space-y-0.5">
                {overview.scenes.items.map(item => (
                  <li
                    key={item.id}
                    className="type-caption flex flex-wrap gap-x-2"
                    data-testid={`director-scene-${item.id}`}
                    data-state={item.state}
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="text-[var(--text-muted)]">
                      {STATE_LABELS[item.state]}
                      {item.takes ? ` · ${item.takes} take${item.takes === 1 ? '' : 's'}` : ''}
                      {item.inCut ? ' · in the Cut' : ''}
                    </span>
                    {item.keptLooksWrong ? (
                      <span className="ui-status-danger">kept take looks wrong</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </ToolSection>

          <ToolSection title="Script" data-testid="director-script">
            {overview.script.scripts ? (
              <>
                <Stats>
                  <Stat
                    label={`Script scenes (${overview.script.planned} planned)`}
                    value={overview.script.scenes}
                    href={scene}
                    testId="director-script-scenes"
                  />
                  <Stat
                    label="Shots planned"
                    value={overview.script.shots}
                    href={scene}
                    testId="director-script-shots"
                  />
                  <Stat
                    label="Made into Scenes"
                    value={overview.script.made}
                    href={scene}
                    testId="director-script-made"
                  />
                  <Stat
                    label="Coverage to look at"
                    value={overview.script.openFindings}
                    href={scene}
                    tone="attention"
                    testId="director-script-findings"
                  />
                </Stats>
                {overview.script.uncovered.length ? (
                  <p className="type-caption mt-2" data-testid="director-script-uncovered">
                    Planned, nothing made yet:{' '}
                    {overview.script.uncovered.map(entry => entry.heading).join(' · ')}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="type-caption text-[var(--text-muted)]">
                No script yet — import one on the{' '}
                <Link className="underline" href={scene}>
                  Scene page
                </Link>
                .
              </p>
            )}
          </ToolSection>

          <ToolSection title="Jobs (last two days)" data-testid="director-jobs">
            <Stats>
              <Stat
                label="Waiting"
                value={overview.jobs.waiting}
                href="/queue"
                testId="director-jobs-waiting"
              />
              <Stat
                label="Running"
                value={overview.jobs.running}
                href="/queue"
                testId="director-jobs-running"
              />
              <Stat
                label="Failed"
                value={overview.jobs.failed}
                href="/queue"
                tone="problem"
                testId="director-jobs-failed"
              />
              <Stat
                label="Lost or timed out"
                value={overview.jobs.lost}
                href="/queue"
                tone="problem"
                testId="director-jobs-lost"
              />
            </Stats>
            {overview.jobs.problems.length ? (
              <ul className="mt-2 space-y-0.5" data-testid="director-jobs-problems">
                {overview.jobs.problems.slice(0, 5).map(problem => (
                  <li key={problem.promptId} className="type-caption">
                    <span className="ui-status-danger">{problem.outcome}</span> · {problem.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </ToolSection>

          <ToolSection title="Automation" data-testid="director-run">
            {run ? (
              <div className="space-y-2">
                <p className="text-sm" data-testid="director-run-state" data-state={run.state}>
                  <span className="font-medium">{run.label}</span> · {RUN_STATE_LABELS[run.state]} ·{' '}
                  {runProgress(run, normalizeSavedScenes(settings.scenes)).done} of{' '}
                  {runProgress(run, normalizeSavedScenes(settings.scenes)).total} done · it never
                  keeps a take
                </p>
                {run.stopReason && run.state === 'paused' ? (
                  <p className="type-caption ui-status-danger">{run.stopReason}</p>
                ) : null}
                <ol className="max-h-56 space-y-0.5 overflow-auto" data-testid="director-run-log">
                  {[...run.log]
                    .reverse()
                    .slice(0, 30)
                    .map((entry, index) => (
                      <li
                        key={`${entry.at}-${index}`}
                        className="type-caption"
                        data-event={entry.event}
                      >
                        <span className="text-[var(--text-muted)]">
                          {new Date(entry.at).toLocaleString()}
                        </span>{' '}
                        <span className="font-medium">{entry.event}</span>
                        {entry.detail ? ` · ${entry.detail}` : ''}
                      </li>
                    ))}
                </ol>
                <ButtonLink href={scene} size="sm" variant="ghost">
                  Open the run
                </ButtonLink>
              </div>
            ) : (
              <p className="type-caption text-[var(--text-muted)]">
                No run. On the Scene page, open a script and Prepare a run to render its Scenes one
                at a time.
              </p>
            )}
          </ToolSection>

          <ToolSection title="Continuity and the Cut" data-testid="director-cut">
            <Stats>
              <Stat
                label="Open findings on kept takes"
                value={overview.continuity.open}
                href="/cut?from=scenes"
                tone="attention"
                testId="director-continuity-open"
              />
              <Stat
                label="Saved versions"
                value={overview.cut.versions}
                href="/cut"
                testId="director-cut-versions"
              />
              <Stat
                label="Films cut"
                value={overview.cut.films}
                href="/cut"
                testId="director-cut-films"
              />
              <Stat
                label="Last film"
                value={
                  overview.cut.lastFilmAt
                    ? new Date(overview.cut.lastFilmAt).toLocaleDateString()
                    : '—'
                }
                href="/cut"
                testId="director-cut-last"
              />
            </Stats>
            <p className="type-caption mt-2 text-[var(--text-muted)]">
              Missing media and the pre-cut checks are read in{' '}
              <Link className="underline" href="/cut">
                Cut
              </Link>{' '}
              (they need the files themselves).
            </p>
          </ToolSection>
        </>
      )}
    </ToolLayout>
  );
}
