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
import { ButtonLink } from '@/components/ui/Button';
import { ToolActionRow } from '@/components/ui/ToolPageShell';

const ImageLightbox = dynamic(() => import('@/components/ui/ImageLightbox'), {
  ssr: false,
  loading: () => null,
});

export default function RoleplayStoryReel({
  story,
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
}: {
  story: RoleplayStoryBeat[];
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
      'poseLayout' | 'poseVariant' | 'posePhoto' | 'poseCamera' | 'poseLead'
    >
  ) => void;
  onRollScenes?: () => void;
  /** Cast home — bible rewrite/edit/clear live there. */
  castBibleHref?: string;
}) {
  const promptIds = useMemo(() => roleplayStoryPromptIds(story), [story]);
  const promptKey = promptIds.join('|');
  const [liveUrls, setLiveUrls] = useState<Record<string, string | null>>({});
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const [lightboxBeatIds, setLightboxBeatIds] = useState<string[]>([]);

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
    return {
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
  }, [activeBeat, activeSlide, onCopy, onRetry]);

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
      {watchPlaylist.length > 0 ? (
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">
            Watch plays completed clips in beat order. Stills hold when a clip is not ready.
          </p>
          <FilmWatchPlayer compact shots={watchPlaylist} />
        </div>
      ) : null}
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            />
          );
        })}
      </ol>
    </>
  );
}
