'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import type { ImageLightboxSlideChrome } from '@/components/ui/image-lightbox/types';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import { roleplayWatchPlaylist } from '@/lib/character-film';
import { looksLikeMotionUrl } from '@/lib/roleplay-film';
import { downloadRoleplayUrl } from '@/lib/roleplay-export';
import {
  COMFY_LIVE_PREVIEW_UPDATED_EVENT,
  getComfyLivePreviewUrl,
} from '@/lib/comfyui-live-preview-store';
import {
  buildStoryProgressLightboxState,
  roleplayStillBasename,
  roleplayStoryPromptIds,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { RoleplayStoryBeatCard } from '@/components/roleplay/sections/RoleplayStoryBeatCard';
import { beatPreviewUrl } from '@/components/roleplay/roleplay-story-helpers';
import { EmptyState } from '@/components/ui/ViewState';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import type { FixAreaTarget } from '@/lib/fix-area-client';

const FixAreaDialog = dynamic(() => import('@/components/fix-area/FixAreaDialog'), {
  ssr: false,
  loading: () => null,
});

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});

export default function RoleplayStoryReel({
  story,
  dayOpening = null,
  busy = false,
  bioPresent = false,
  scenesLoading = false,
  onQueue,
  onCopy,
  onRetry,
  onRetryClip,
  onAnimate,
  onExtend,
  onSelectTake,
  onSelectClipTake,
  onPoseChange,
  onRollScenes,
  castBibleHref,
  fixAreaFor,
  layout = 'grid',
}: {
  story: RoleplayStoryBeat[];
  /**
   * `stage`: the picked scene (the newest by default) as one large card with all its actions,
   * the scenes so far as a numbered strip that picks which is on stage.
   */
  layout?: 'grid' | 'stage';
  /** Day → Story: open the empty reel with the Cast's Day stills (useDayStoryOpening). */
  dayOpening?: { count: number; use: () => void } | null;
  busy?: boolean;
  bioPresent?: boolean;
  scenesLoading?: boolean;
  onQueue?: (beat: RoleplayStoryBeat) => void;
  onCopy?: (beat: RoleplayStoryBeat) => void;
  onRetry?: (beat: RoleplayStoryBeat) => void;
  onRetryClip?: (beat: RoleplayStoryBeat) => void;
  onAnimate?: (beat: RoleplayStoryBeat) => void;
  onExtend?: (beat: RoleplayStoryBeat) => void;
  onSelectTake?: (beat: RoleplayStoryBeat, index: number) => void;
  onSelectClipTake?: (beat: RoleplayStoryBeat, index: number) => void;
  onPoseChange?: (
    beat: RoleplayStoryBeat,
    patch: Pick<
      RoleplayStoryBeat,
      'poseLayout' | 'poseVariant' | 'posePhoto' | 'poseCamera' | 'poseLead' | 'poseLook'
    >
  ) => void;
  onRollScenes?: () => void;
  /** Cast home — bible rewrite/edit/clear live there. */
  castBibleHref?: string;
  /** Fix an area (fix-area.ts): the dialog target for a beat's shown still, null when none. */
  fixAreaFor?: (beat: RoleplayStoryBeat) => FixAreaTarget | null;
}) {
  const promptIds = useMemo(() => roleplayStoryPromptIds(story), [story]);
  const promptKey = promptIds.join('|');
  const [liveUrls, setLiveUrls] = useState<Record<string, string | null>>({});
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const [lightboxBeatIds, setLightboxBeatIds] = useState<string[]>([]);
  const [fixTarget, setFixTarget] = useState<FixAreaTarget | null>(null);
  // Stage: the scene shown large. A pick holds until a new scene is added, which takes the stage.
  const newestBeatId = story[story.length - 1]?.id ?? null;
  const [stagePick, setStagePick] = useState<{ id: string; newest: string | null } | null>(null);
  const stageBeatId = stagePick && stagePick.newest === newestBeatId ? stagePick.id : null;

  useEffect(() => {
    const refresh = () => {
      const next: Record<string, string | null> = {};
      for (const id of promptKey.split('|').filter(Boolean)) {
        next[id] = getComfyLivePreviewUrl(id);
      }
      setLiveUrls(next);
    };
    refresh();
    window.addEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(COMFY_LIVE_PREVIEW_UPDATED_EVENT, refresh);
  }, [promptKey]);

  const watchPlaylist = useMemo(() => roleplayWatchPlaylist(story), [story]);

  const playlist = useMemo(() => {
    return story.flatMap(beat => {
      const liveUrl = beat.promptId ? (liveUrls[beat.promptId] ?? null) : null;
      const url = beatPreviewUrl(beat, liveUrl);
      if (!url) {
        return [];
      }
      return [
        {
          beatId: beat.id,
          url,
          title: beat.title,
          prompt: beat.prompt,
          kind: looksLikeMotionUrl(url) ? ('video' as const) : ('image' as const),
        },
      ];
    });
  }, [liveUrls, story]);

  const openStill = useCallback(
    (beat: RoleplayStoryBeat) => {
      const state = buildStoryProgressLightboxState(story, beat.id, entry => {
        const liveUrl = entry.promptId ? (liveUrls[entry.promptId] ?? null) : null;
        return beatPreviewUrl(entry, liveUrl);
      });
      if (!state) {
        return;
      }
      setLightboxBeatIds(state.beatIds);
      setLightbox({
        images: state.images,
        titles: state.titles,
        originalImages: state.images,
        mediaKinds: state.images.map((url, index) => {
          const slide = playlist.find(
            entry => entry.url === url && entry.title === state.titles[index]
          );
          return slide?.kind ?? (looksLikeMotionUrl(url) ? 'video' : 'image');
        }),
        index: state.index,
        title: state.title,
      });
    },
    [liveUrls, playlist, story]
  );

  const activeBeatId =
    lightbox && lightboxBeatIds.length > 0 ? lightboxBeatIds[lightbox.index] : undefined;
  const activeBeat = activeBeatId ? story.find(entry => entry.id === activeBeatId) : undefined;
  const activeSlide = lightbox ? playlist[lightbox.index] : undefined;

  const slideChrome = useMemo((): ImageLightboxSlideChrome | null => {
    if (!activeBeat && !activeSlide?.prompt) {
      return null;
    }
    const fix = activeBeat && fixAreaFor ? fixAreaFor(activeBeat) : null;
    return {
      fixArea: fix
        ? {
            ...fix,
            // The slides were built from the old picture: close the lightbox once swapped.
            onUse: async result => {
              await fix.onUse(result);
              setLightbox(null);
              setLightboxBeatIds([]);
            },
          }
        : null,
      meta: activeSlide?.prompt
        ? { tool: 'roleplay', prompt: activeSlide.prompt }
        : activeBeat?.prompt
          ? { tool: 'roleplay', prompt: activeBeat.prompt }
          : undefined,
      showRequeue: Boolean(onRetry && activeBeat),
      showSeedVariation: false,
      showImprove: false,
      showCompose: false,
      showInpaint: false,
      showUseStack: false,
      showUsePromptStack: false,
      showUseFace: false,
      onRequeue:
        onRetry && activeBeat
          ? () => {
              onRetry(activeBeat);
            }
          : undefined,
      onCopyPrompt:
        onCopy && activeBeat
          ? () => {
              onCopy(activeBeat);
            }
          : undefined,
    };
  }, [activeBeat, activeSlide, fixAreaFor, onCopy, onRetry]);

  if (story.length === 0) {
    return (
      <div className="space-y-3" data-testid="roleplay-story-empty">
        <EmptyState
          compact
          branded
          title="Roll scenes to start the reel"
          description={
            bioPresent
              ? 'Pick a beat above — stills and clips land here as they render.'
              : 'Set the character bible on Cast, then Roll four scenes above.'
          }
          action={
            onRollScenes
              ? {
                  label: scenesLoading || busy ? 'Rolling…' : 'Roll four scenes',
                  onClick: () => {
                    if (busy || scenesLoading) {
                      return;
                    }
                    onRollScenes();
                  },
                }
              : undefined
          }
        />
        {dayOpening ? (
          <div
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-3"
            data-testid="roleplay-day-opening"
          >
            <p className="type-caption text-[var(--text-muted)]">
              Start from today’s Day: its {dayOpening.count}{' '}
              {dayOpening.count === 1
                ? 'still becomes the first scene'
                : 'stills become the first scenes'}
              , and the next scene picks up from there.
            </p>
            <ToolActionRow className="mt-2">
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                data-testid="roleplay-day-opening-use"
                onClick={dayOpening.use}
              >
                Open with today’s Day ({dayOpening.count})
              </Button>
            </ToolActionRow>
          </div>
        ) : null}
        {!bioPresent && castBibleHref ? (
          <ToolActionRow>
            <ButtonLink
              href={castBibleHref}
              size="sm"
              variant="secondary"
              data-testid="roleplay-story-write-bio"
            >
              Set bible on Cast
            </ButtonLink>
          </ToolActionRow>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <ImageLightbox
        state={lightbox}
        onClose={() => {
          setLightbox(null);
          setLightboxBeatIds([]);
        }}
        onIndexChange={index =>
          setLightbox(previous =>
            previous
              ? {
                  ...previous,
                  index,
                  title: playlist[index]?.title ?? previous.title,
                }
              : previous
          )
        }
        onDownloadImage={async index => {
          const slide = playlist[index];
          if (!slide?.url) {
            return;
          }
          const storyIndex = story.findIndex(
            entry => entry.title === slide.title && entry.prompt === slide.prompt
          );
          try {
            await downloadRoleplayUrl(
              slide.url,
              `${roleplayStillBasename(slide.title, storyIndex >= 0 ? storyIndex : index)}.png`
            );
          } catch {
            // Lightbox download is best-effort; the zip export is the full bundle.
          }
        }}
        slideChrome={slideChrome}
      />
      {fixTarget ? <FixAreaDialog target={fixTarget} onClose={() => setFixTarget(null)} /> : null}
      {watchPlaylist.length > 0 && layout === 'stage' ? (
        // On the stage the newest scene is already large: watching is one tap away, not a second
        // big picture above it.
        <details
          className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2"
          data-testid="story-watch"
        >
          <summary className="type-caption cursor-pointer text-[var(--text-secondary)]">
            Watch the story so far
          </summary>
          <div className="mt-2">
            <FilmWatchPlayer compact shots={watchPlaylist} />
          </div>
        </details>
      ) : watchPlaylist.length > 0 ? (
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">
            Watch plays completed clips in beat order. Stills hold when a clip is not ready.
          </p>
          <FilmWatchPlayer compact shots={watchPlaylist} />
        </div>
      ) : null}
      {layout === 'stage' && story.length > 0 ? (
        (() => {
          const stageIndex = Math.max(
            0,
            stageBeatId ? story.findIndex(beat => beat.id === stageBeatId) : story.length - 1
          );
          const beat = story[stageIndex] ?? story[story.length - 1]!;
          const clipLive =
            beat.clipPromptId && (beat.clipStatus === 'queued' || beat.clipStatus === 'running')
              ? (liveUrls[beat.clipPromptId] ?? null)
              : null;
          const liveUrl = clipLive ?? (beat.promptId ? (liveUrls[beat.promptId] ?? null) : null);
          return (
            <div className="space-y-3" data-testid="story-stage">
              <ol className="mx-auto max-w-[30rem]">
                <RoleplayStoryBeatCard
                  key={`${beat.id}-${beat.at}`}
                  beat={beat}
                  index={stageIndex}
                  liveUrl={liveUrl}
                  busy={busy}
                  onOpen={() => openStill(beat)}
                  onQueue={onQueue}
                  onCopy={onCopy}
                  onRetry={onRetry}
                  onRetryClip={onRetryClip}
                  onAnimate={onAnimate}
                  onExtend={onExtend}
                  onSelectTake={onSelectTake}
                  onSelectClipTake={onSelectClipTake}
                  onPoseChange={onPoseChange}
                  onFixArea={fixAreaFor ? entry => setFixTarget(fixAreaFor(entry)) : undefined}
                />
              </ol>
              {story.length > 1 ? (
                <ol className="flex gap-2 overflow-x-auto pb-1" data-testid="story-reel">
                  {story.map((entry, index) => {
                    const thumb = beatPreviewUrl(
                      entry,
                      entry.promptId ? (liveUrls[entry.promptId] ?? null) : null
                    );
                    const on = index === stageIndex;
                    // Off-stage scenes that need a look: a failed still or clip, or a prompt
                    // check that could not fix everything.
                    const attention =
                      entry.stillStatus === 'error' ||
                      entry.clipStatus === 'error' ||
                      (entry.promptCheck?.remaining?.length ?? 0) > 0;
                    return (
                      <li key={`${entry.id}-${entry.at}`} className="w-20 shrink-0">
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={`Show scene ${index + 1}: ${entry.title}`}
                          data-testid="story-stage-thumb"
                          data-attention={attention ? 'true' : undefined}
                          className={`relative block w-full rounded-[var(--radius-md)] border-2 p-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                            on
                              ? 'border-[var(--accent)]'
                              : attention
                                ? 'border-[var(--tint-warning-border)]'
                                : 'border-transparent'
                          }`}
                          onClick={() => setStagePick({ id: entry.id, newest: newestBeatId })}
                        >
                          {thumb && !looksLikeMotionUrl(thumb) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt="" className="h-24 w-full rounded object-cover" />
                          ) : (
                            <span className="flex h-24 w-full items-center justify-center rounded bg-[var(--bg-muted)] text-xs text-[var(--text-muted)]">
                              {entry.stillStatus === 'error' ? 'Failed' : '…'}
                            </span>
                          )}
                          <span className="type-caption mt-1 block truncate">
                            {index + 1}. {entry.title}
                          </span>
                          <span className="sr-only">{entry.blurb}</span>
                          {attention ? (
                            <span
                              className="absolute right-1 top-1 rounded-full bg-[var(--tint-warning-bg)] px-1.5 text-xs font-semibold text-[var(--tint-warning-text)]"
                              title="Needs a look"
                            >
                              !<span className="sr-only"> needs a look</span>
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="sr-only" data-testid="story-reel">
                  {beat.title} {beat.blurb}
                </div>
              )}
            </div>
          );
        })()
      ) : (
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="story-reel">
          {story.map((beat, index) => {
            const clipLive =
              beat.clipPromptId && (beat.clipStatus === 'queued' || beat.clipStatus === 'running')
                ? (liveUrls[beat.clipPromptId] ?? null)
                : null;
            const liveUrl = clipLive ?? (beat.promptId ? (liveUrls[beat.promptId] ?? null) : null);
            return (
              <RoleplayStoryBeatCard
                key={`${beat.id}-${beat.at}`}
                beat={beat}
                index={index}
                liveUrl={liveUrl}
                busy={busy}
                onOpen={() => openStill(beat)}
                onQueue={onQueue}
                onCopy={onCopy}
                onRetry={onRetry}
                onRetryClip={onRetryClip}
                onAnimate={onAnimate}
                onExtend={onExtend}
                onSelectTake={onSelectTake}
                onSelectClipTake={onSelectClipTake}
                onPoseChange={onPoseChange}
                onFixArea={fixAreaFor ? entry => setFixTarget(fixAreaFor(entry)) : undefined}
              />
            );
          })}
        </ol>
      )}
    </>
  );
}
