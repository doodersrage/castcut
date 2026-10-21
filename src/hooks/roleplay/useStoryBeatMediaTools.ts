'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { getCharacter } from '@/lib/character/os';
import { keepClipInGallery, keepStillInGallery } from '@/lib/clip/gallery-keep';
import {
  requestCopyMoves,
  requestDanceToMusic,
  requestLipSync,
  requestRelight,
  requestUpscaleStill,
} from '@/lib/media/actions-client';
import { storyBeatKey } from '@/lib/play/pose-targets';
import {
  CLIP_JOBS_UPDATED_EVENT,
  orphanedClipJob,
  runClipJob,
  takeKeptClipJobs,
  type KeptClip,
} from '@/lib/clip/clip-jobs-tracker';
import { CLIP_JOB_LABEL, type ClipJobTool } from '@/lib/clip/clip-jobs';
import { patchRoleplayStoryBeat, type RoleplayStoryBeat } from '@/lib/story/roleplay';
import { addRoleplayFixedTakePatch } from '@/lib/story/roleplay-gallery-takes';
import { loadSettingsCache } from '@/lib/settings/cache';

export type StoryMediaTool =
  'finish' | 'realism' | 'moves' | 'dance' | 'lip-sync' | 'relight' | 'upscale';

export type StoryBeatMediaTools = {
  busy: { key: string; tool: StoryMediaTool } | null;
  finish: (beat: RoleplayStoryBeat) => Promise<string | null>;
  realism: (beat: RoleplayStoryBeat) => Promise<string | null>;
  moves: (
    beat: RoleplayStoryBeat,
    video: Blob,
    options: { motion?: string; keepSound?: boolean }
  ) => Promise<string | null>;
  dance: (
    beat: RoleplayStoryBeat,
    music: Blob,
    options: { style: string; amplitude: string; start?: number }
  ) => Promise<string | null>;
  lipSync: (beat: RoleplayStoryBeat, audio: Blob, audio2?: Blob | null) => Promise<string | null>;
  relight: (beat: RoleplayStoryBeat, look: string) => Promise<string | null>;
  upscale: (beat: RoleplayStoryBeat) => Promise<string | null>;
  /** A sketch rendered in the Sketch sheet joins the scene's takes, pinned. */
  applySketch: (beat: RoleplayStoryBeat, url: string) => Promise<string | null>;
};

/**
 * Story's finishing tools on a scene — the same four as Day's (useDaySlotMediaTools): Sharpen &
 * smooth its clip, Copy moves from a video onto its still, Lip-sync its still to a recording,
 * Relight its still. Clips replace the scene's clip; a relit still joins its takes, pinned (as
 * Fix an area does). Kept in the Gallery; one at a time.
 */
/** A kept clip as the scene's clip fields. */
function keptClipPatch(latest: RoleplayStoryBeat, kept: KeptClip): Partial<RoleplayStoryBeat> {
  return {
    clipUrl: kept.url,
    clipStatus: 'completed',
    clipPromptId: kept.promptId,
    clipRenderPromptId: latest.clipRenderPromptId ?? latest.clipPromptId,
  };
}

export function useStoryBeatMediaTools({
  storyRef,
  updateToolSettings,
}: {
  storyRef: MutableRefObject<RoleplayStoryBeat[]>;
  updateToolSettings: (patch: { story: RoleplayStoryBeat[] }) => void;
}): StoryBeatMediaTools {
  const [busy, setBusy] = useState<StoryBeatMediaTools['busy']>(null);
  const busyRef = useRef(false);

  const latestOf = useCallback(
    (beat: RoleplayStoryBeat) =>
      storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? null,
    [storyRef]
  );

  const run = useCallback(
    async (
      beat: RoleplayStoryBeat,
      tool: StoryMediaTool,
      work: (latest: RoleplayStoryBeat) => Promise<Partial<RoleplayStoryBeat>>
    ): Promise<string | null> => {
      const latest = latestOf(beat);
      if (!latest) return 'This scene is gone.';
      if (busyRef.current) return 'Another finishing job is running — one at a time.';
      busyRef.current = true;
      setBusy({ key: storyBeatKey(latest), tool });
      try {
        const patch = await work(latest);
        const now = latestOf(beat) ?? latest;
        updateToolSettings({ story: patchRoleplayStoryBeat(storyRef.current, now, patch) });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : 'That did not work.';
      } finally {
        busyRef.current = false;
        setBusy(null);
      }
    },
    [latestOf, storyRef, updateToolSettings]
  );

  const keptClip = useCallback(
    async (
      latest: RoleplayStoryBeat,
      url: string,
      kind: 'finish' | 'realism' | 'moves' | 'dance' | 'lip-sync',
      label: string
    ): Promise<Partial<RoleplayStoryBeat>> =>
      keptClipPatch(
        latest,
        await keepClipInGallery({
          url,
          kind,
          prompt: `${label} · ${latest.title}`,
          tool: 'roleplay',
          sourcePromptId: latest.clipPromptId ?? latest.promptId,
        })
      ),
    []
  );

  const stillOf = (latest: RoleplayStoryBeat) =>
    latest.stillStatus === 'completed' ? latest.imageUrl?.trim() || '' : '';

  /** Sharpen & smooth / Make more realistic: a background job the jobs tray follows. */
  const clipJob = useCallback(
    (beat: RoleplayStoryBeat, tool: ClipJobTool) =>
      run(beat, tool, async latest => {
        const clipUrl = latest.clipStatus === 'completed' ? latest.clipUrl?.trim() : '';
        if (!clipUrl) throw new Error('This scene has no finished clip.');
        const label = `${CLIP_JOB_LABEL[tool]} · ${latest.title}`;
        const kept = await runClipJob({
          tool,
          body: { clipUrl },
          keep: {
            kind: tool,
            prompt: label,
            tool: 'roleplay',
            sourcePromptId: latest.clipPromptId ?? latest.promptId,
          },
          owner: { feature: 'story', ref: storyBeatKey(latest) },
          label,
        });
        return keptClipPatch(latest, kept);
      }),
    [run]
  );
  const finish = useCallback((beat: RoleplayStoryBeat) => clipJob(beat, 'finish'), [clipJob]);
  const realism = useCallback((beat: RoleplayStoryBeat) => clipJob(beat, 'realism'), [clipJob]);

  // A clip job that outlived the page: its scene shows busy while it runs, and gets the clip
  // once kept — if the scene still has the clip it started from.
  const [orphan, setOrphan] = useState<StoryBeatMediaTools['busy']>(null);
  useEffect(() => {
    const sync = () => {
      takeKeptClipJobs('story', entry => {
        const beat = storyRef.current.find(item => storyBeatKey(item) === entry.owner?.ref);
        if (!beat) return false;
        if (entry.kept && beat.clipUrl?.trim() === entry.body.clipUrl) {
          updateToolSettings({
            story: patchRoleplayStoryBeat(storyRef.current, beat, keptClipPatch(beat, entry.kept)),
          });
        }
        return true;
      });
      const running = orphanedClipJob('story');
      setOrphan(running?.owner ? { key: running.owner.ref, tool: running.tool } : null);
    };
    sync();
    window.addEventListener(CLIP_JOBS_UPDATED_EVENT, sync);
    return () => window.removeEventListener(CLIP_JOBS_UPDATED_EVENT, sync);
  }, [storyRef, updateToolSettings]);

  const moves = useCallback(
    (beat: RoleplayStoryBeat, video: Blob, options: { motion?: string; keepSound?: boolean }) =>
      run(beat, 'moves', async latest => {
        const stillUrl = stillOf(latest);
        if (!stillUrl) throw new Error('This scene has no still yet.');
        const cast = latest.castId ? getCharacter(latest.castId) : undefined;
        const url = await requestCopyMoves({
          video,
          stillUrl,
          look: (cast?.descriptor || cast?.hints || '').trim(),
          place: loadSettingsCache().tools.roleplay?.setting?.trim() || undefined,
          motion: options.motion?.trim() || undefined,
          keepSound: options.keepSound,
        });
        return keptClip(latest, url, 'moves', 'Copy moves');
      }),
    [keptClip, run]
  );

  const dance = useCallback(
    (
      beat: RoleplayStoryBeat,
      music: Blob,
      options: { style: string; amplitude: string; start?: number }
    ) =>
      run(beat, 'dance', async latest => {
        const stillUrl = stillOf(latest);
        if (!stillUrl) throw new Error('This scene has no still yet.');
        const url = await requestDanceToMusic({ music, stillUrl, ...options });
        return keptClip(latest, url, 'dance', 'Dance to music');
      }),
    [keptClip, run]
  );

  const lipSync = useCallback(
    (beat: RoleplayStoryBeat, audio: Blob, audio2?: Blob | null) =>
      run(beat, 'lip-sync', async latest => {
        const stillUrl = stillOf(latest);
        if (!stillUrl) throw new Error('This scene has no still yet.');
        const url = await requestLipSync({
          audio,
          audio2,
          stillUrl,
          prompt:
            `${latest.title}. ${latest.blurb}`.slice(0, 300) +
            ' The person talks to the camera, natural expressions and small head movements.',
        });
        return keptClip(latest, url, 'lip-sync', 'Lip-sync');
      }),
    [keptClip, run]
  );

  const relight = useCallback(
    (beat: RoleplayStoryBeat, look: string) =>
      run(beat, 'relight', async latest => {
        const stillUrl = stillOf(latest);
        if (!stillUrl) throw new Error('This scene has no still yet.');
        const url = await requestRelight(stillUrl, look);
        const kept = await keepStillInGallery({
          url,
          kind: 'relight',
          prompt: `Relight · ${latest.title}`,
          tool: 'roleplay',
          sourcePromptId: latest.promptId,
        });
        return addRoleplayFixedTakePatch(latest, {
          promptId: kept.promptId ?? `relight-${Date.now()}`,
          imageUrl: kept.url,
        });
      }),
    [run]
  );

  const applySketch = useCallback(
    async (beat: RoleplayStoryBeat, url: string): Promise<string | null> => {
      const latest = latestOf(beat);
      if (!latest) return 'This scene is gone.';
      const kept = await keepStillInGallery({
        url,
        kind: 'sketch',
        prompt: `Sketch · ${latest.title}`,
        tool: 'roleplay',
        sourcePromptId: latest.promptId,
      });
      const now = latestOf(beat) ?? latest;
      updateToolSettings({
        story: patchRoleplayStoryBeat(
          storyRef.current,
          now,
          addRoleplayFixedTakePatch(now, {
            promptId: kept.promptId ?? `sketch-${Date.now()}`,
            imageUrl: kept.url,
          })
        ),
      });
      return null;
    },
    [latestOf, storyRef, updateToolSettings]
  );

  const upscale = useCallback(
    (beat: RoleplayStoryBeat) =>
      run(beat, 'upscale', async latest => {
        const stillUrl = stillOf(latest);
        if (!stillUrl) throw new Error('This scene has no still yet.');
        const url = await requestUpscaleStill(stillUrl, '4k');
        const kept = await keepStillInGallery({
          url,
          kind: 'upscale',
          prompt: `Upscale · ${latest.title}`,
          tool: 'roleplay',
          sourcePromptId: latest.promptId,
        });
        return addRoleplayFixedTakePatch(latest, {
          promptId: kept.promptId ?? `upscale-${Date.now()}`,
          imageUrl: kept.url,
        });
      }),
    [run]
  );

  return {
    busy: busy ?? orphan,
    finish,
    realism,
    moves,
    dance,
    lipSync,
    relight,
    upscale,
    applySketch,
  };
}
