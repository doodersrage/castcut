'use client';

import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import {
  clipExtendProgressNote,
  startClipExtend,
  waitForClipExtend,
  type ClipExtendRequest,
} from '@/lib/clip-extend';
import { keepClipInGallery } from '@/lib/clip-gallery-keep';
import type { ClipExtendChoice } from '@/components/ClipExtendSheet';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { clipUrlIsAnimatedImage } from '@/lib/clip-media-kind';
import { requestClipVoice } from '@/lib/clip-voice';
import { spokenLineHeat } from '@/lib/spoken-line';
import { loadSettingsCache } from '@/lib/settings-cache';
import { leadIsMan } from '@/hooks/roleplay/useRoleplayBeatQueueCore';
import {
  normalizeSpokenLine,
  normalizeSpokenLineTone,
  type SpokenLineTone,
} from '@/lib/ltx25-renderer';
import {
  storyBeatKey,
  storyBeatRewriteRevertPatch,
  storyBeatRewriteStartPatch,
  storyBeatScene,
  storyBeatTextLocked,
  storyBeforeBeat,
} from '@/hooks/roleplay/story-beat-edit';
import {
  requestRoleplayStillPrompt,
  type buildRoleplayRequestBody,
  type RoleplayApiPayload,
} from '@/lib/roleplay-play-core';
import {
  editRoleplayStoryBeatPatch,
  patchRoleplayStoryBeat,
  type RoleplayBio,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import type { RoleplayToolCache } from '@/lib/play-settings';

type UseStoryBeatEditOptions = {
  storyRef: MutableRefObject<RoleplayStoryBeat[]>;
  /** The story as rendered — watched for silent clips with a line (automatic Add voice). */
  story?: RoleplayStoryBeat[];
  updateToolSettings: (patch: Partial<RoleplayToolCache>) => void;
  bio: RoleplayBio | undefined;
  requestBody: (
    action: 'bio' | 'scenes' | 'prompt',
    situation?: RoleplayScene
  ) => ReturnType<typeof buildRoleplayRequestBody>;
  commitStill: (
    data: RoleplayApiPayload,
    beat: RoleplayStoryBeat,
    bio: RoleplayBio,
    writingStory: RoleplayStoryBeat[],
    options: { queueStill: boolean; liveStory: boolean }
  ) => Promise<RoleplayStoryBeat[]>;
  /** Why a still cannot be written right now (no photo / plate), as picking a card says it. */
  referenceMissingMessage: string | null;
  setError: (value: string | null) => void;
};

export type StoryBeatEditActions = {
  /** Save a scene's edited text. False when it was refused (the editor stays open). */
  saveBeatText: (beat: RoleplayStoryBeat, text: { title: string; blurb: string }) => boolean;
  /** Set (or clear) what the lead says in the scene's clip. */
  saveBeatLine: (beat: RoleplayStoryBeat, line: string) => void;
  /** Keep the whole still for the scene's talking clip (else chest-up when the face is small). */
  saveBeatLineFullFrame: (beat: RoleplayStoryBeat, fullFrame: boolean) => void;
  /** How the scene's line is said (natural clears it). */
  saveBeatLineTone: (beat: RoleplayStoryBeat, tone: SpokenLineTone) => void;
  /** Two-person scenes: what the other person answers. */
  saveBeatReply: (beat: RoleplayStoryBeat, reply: string) => void;
  /**
   * Give a finished silent clip a soundtrack (and the scene's line) — two-person adult clips
   * render on WAN without sound. Resolves to an error message, or null when done.
   */
  voiceBeatClip: (beat: RoleplayStoryBeat) => Promise<string | null>;
  /** The scene whose clip is getting its voice, if any (see `storyBeatKey`). */
  voicingKey: string | null;
  /** "Make it 30 s": carry the scene's clip on in chained segments. Resolves to an error, or null. */
  extendBeatClip: (beat: RoleplayStoryBeat, choice?: ClipExtendChoice) => Promise<string | null>;
  /** The scene's clip and text for the Make it 30 s sheet (null without a finished clip). */
  extendRequestFor: (
    beat: RoleplayStoryBeat
  ) => Omit<ClipExtendRequest, 'direction' | 'beats'> | null;
  /** The scene being made longer, and how far it is. */
  extending: { key: string; note: string } | null;
  /** How a job picked up after a reload ended (the card shows it). */
  extendResult: { key: string; text: string } | null;
  /** Write the scene's still again from its text and queue it. */
  rewriteBeat: (beat: RoleplayStoryBeat) => Promise<void>;
  /** The scene being written again, if any (see `storyBeatKey`). */
  rewritingKey: string | null;
};

/**
 * Edit a scene's text in the reel, then write and queue its still again. Shared by desk and
 * phone Story: both write a still through the same request and the same `commitStill`.
 */

/** Which clip a scene shows: its clip job (stable across URL rewrites), else the URL. */
function beatClipIdentity(beat: RoleplayStoryBeat): string {
  return beat.clipPromptId?.trim() || beat.clipUrl?.trim() || '';
}
export function useStoryBeatEdit({
  storyRef,
  story,
  updateToolSettings,
  bio,
  requestBody,
  commitStill,
  referenceMissingMessage,
  setError,
}: UseStoryBeatEditOptions): StoryBeatEditActions {
  const [rewritingKey, setRewritingKey] = useState<string | null>(null);
  // State lags a render behind: two quick taps must not start two writes.
  const rewritingRef = useRef<string | null>(null);

  const saveBeatText = useCallback(
    (beat: RoleplayStoryBeat, text: { title: string; blurb: string }) => {
      const latest = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
      if (!latest) {
        return false;
      }
      // The card disables the editor too; this is the state as of this tap.
      if (storyBeatTextLocked(latest) || rewritingRef.current === storyBeatKey(latest)) {
        setError('That scene is being written — change its text once its still is queued.');
        return false;
      }
      const patch = editRoleplayStoryBeatPatch(latest, text);
      if (patch) {
        setError(null);
        updateToolSettings({ story: patchRoleplayStoryBeat(storyRef.current, latest, patch) });
      }
      return true;
    },
    [setError, storyRef, updateToolSettings]
  );

  const saveBeatLine = useCallback(
    (beat: RoleplayStoryBeat, line: string) => {
      const latest = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
      if (!latest) return;
      const next = normalizeSpokenLine(line);
      if ((latest.line ?? '') === next) return;
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, { line: next || undefined }),
      });
    },
    [storyRef, updateToolSettings]
  );

  const rewriteBeat = useCallback(
    async (beat: RoleplayStoryBeat) => {
      const latest = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
      if (!latest || rewritingRef.current || storyBeatTextLocked(latest)) {
        return;
      }
      if (!bio) {
        setError('Set the bible on Cast first — the still needs someone to be in it.');
        return;
      }
      if (referenceMissingMessage) {
        setError(referenceMissingMessage);
        return;
      }
      const key = storyBeatKey(latest);
      rewritingRef.current = key;
      setRewritingKey(key);
      setError(null);
      const startPatch = storyBeatRewriteStartPatch(latest);
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, startPatch),
      });
      try {
        const data = await requestRoleplayStillPrompt({
          ...requestBody('prompt', storyBeatScene(latest)),
          story: storyBeforeBeat(storyRef.current, latest),
        });
        // Always queued: "Write and queue again" is asked for by name, whatever the
        // queue-on-pick setting says.
        await commitStill(data, { ...latest, ...startPatch }, bio, storyRef.current, {
          queueStill: true,
          liveStory: true,
        });
      } catch (err) {
        // Nothing was sent: show the earlier still again rather than an empty failed take.
        updateToolSettings({
          story: patchRoleplayStoryBeat(
            storyRef.current,
            latest,
            storyBeatRewriteRevertPatch(latest)
          ),
        });
        setError(err instanceof Error ? err.message : 'Could not write that scene again.');
      } finally {
        rewritingRef.current = null;
        setRewritingKey(null);
      }
    },
    [bio, commitStill, referenceMissingMessage, requestBody, setError, storyRef, updateToolSettings]
  );

  const saveBeatLineFullFrame = useCallback(
    (beat: RoleplayStoryBeat, fullFrame: boolean) => {
      const latest = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
      if (!latest) return;
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, {
          lineFullFrame: fullFrame || undefined,
        }),
      });
    },
    [storyRef, updateToolSettings]
  );

  const saveBeatLineTone = useCallback(
    (beat: RoleplayStoryBeat, tone: SpokenLineTone) => {
      const latest = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
      if (!latest) return;
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, {
          lineTone: normalizeSpokenLineTone(tone),
        }),
      });
    },
    [storyRef, updateToolSettings]
  );

  const saveBeatReply = useCallback(
    (beat: RoleplayStoryBeat, reply: string) => {
      const latest = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
      if (!latest) return;
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, {
          replyLine: normalizeSpokenLine(reply) || undefined,
        }),
      });
    },
    [storyRef, updateToolSettings]
  );

  const [voicingKey, setVoicingKey] = useState<string | null>(null);
  const voiceBeatClip = useCallback(
    async (beat: RoleplayStoryBeat): Promise<string | null> => {
      const latest = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
      const clipUrl = latest?.clipStatus === 'completed' ? latest.clipUrl?.trim() : '';
      if (!latest || !clipUrl) return 'This scene has no finished clip.';
      setVoicingKey(storyBeatKey(latest));
      try {
        const url = await requestClipVoice({
          clipUrl,
          scene: `${latest.title}. ${latest.blurb}`,
          line: latest.line,
          heat: spokenLineHeat(loadSettingsCache().tools.roleplay?.content),
          lead: leadIsMan() ? 'man' : 'woman',
        });
        const now = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
        const same = latest.clipPromptId?.trim()
          ? now?.clipPromptId?.trim() === latest.clipPromptId.trim()
          : now?.clipUrl?.trim() === clipUrl;
        if (!now || !same) {
          return 'The clip changed while its voice was being made — try again.';
        }
        const kept = await keepClipInGallery({
          url,
          kind: 'voice',
          prompt: `Add voice · ${now.title}`,
          tool: 'roleplay',
          sourcePromptId: now.clipPromptId,
        });
        const after =
          storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? now;
        updateToolSettings({
          story: patchRoleplayStoryBeat(storyRef.current, after, {
            clipUrl: kept.url,
            clipPromptId: kept.promptId,
            clipRenderPromptId: after.clipRenderPromptId ?? after.clipPromptId,
          }),
        });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : 'Add voice failed.';
      } finally {
        setVoicingKey(null);
      }
    },
    [storyRef, updateToolSettings]
  );

  const [extending, setExtending] = useState<{ key: string; note: string } | null>(null);
  const extendRequestFor = useCallback(
    (beat: RoleplayStoryBeat): Omit<ClipExtendRequest, 'direction' | 'beats'> | null => {
      const latest = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
      const clipUrl = latest?.clipStatus === 'completed' ? latest.clipUrl?.trim() : '';
      if (!latest || !clipUrl) return null;
      return {
        clipUrl,
        clipPromptId: latest.clipRenderPromptId ?? latest.clipPromptId,
        scene: `${latest.title}. ${latest.blurb}`,
        heat: spokenLineHeat(loadSettingsCache().tools.roleplay?.content),
      };
    },
    [storyRef]
  );
  const watchingExtendRef = useRef<string | null>(null);
  const [extendResult, setExtendResult] = useState<{ key: string; text: string } | null>(null);
  const patchBeat = useCallback(
    (beat: RoleplayStoryBeat, patch: Partial<RoleplayStoryBeat>) => {
      const now = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
      if (now) updateToolSettings({ story: patchRoleplayStoryBeat(storyRef.current, now, patch) });
    },
    [storyRef, updateToolSettings]
  );
  /** Wait for the scene's job and put the long clip in place. Resolves to an error, or null. */
  const finishExtend = useCallback(
    async (beat: RoleplayStoryBeat, jobId: string, fromUrl: string): Promise<string | null> => {
      const key = storyBeatKey(beat);
      if (watchingExtendRef.current) return 'Already making a clip longer — one at a time.';
      watchingExtendRef.current = key;
      setExtending({ key, note: 'Making it longer…' });
      try {
        const job = await waitForClipExtend(jobId, {
          onProgress: progress => setExtending({ key, note: clipExtendProgressNote(progress) }),
        });
        const now = storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at);
        if (!now || beatClipIdentity(now) !== fromUrl) {
          patchBeat(beat, { extendJobId: undefined });
          return 'The clip changed while it was being made longer — try again.';
        }
        setExtending({ key, note: 'Saving to the Gallery…' });
        const kept = await keepClipInGallery({
          url: job.url!,
          kind: 'extend',
          prompt: `Make it 30 s · ${now.title}`,
          tool: 'roleplay',
          sourcePromptId: now.clipPromptId,
        });
        patchBeat(beat, {
          clipUrl: kept.url,
          clipPromptId: kept.promptId,
          clipRenderPromptId: now.clipRenderPromptId ?? now.clipPromptId,
          extendJobId: undefined,
        });
        return null;
      } catch (error) {
        patchBeat(beat, { extendJobId: undefined });
        return error instanceof Error ? error.message : 'Could not make the clip longer.';
      } finally {
        watchingExtendRef.current = null;
        setExtending(null);
      }
    },
    [patchBeat, storyRef]
  );
  const extendBeatClip = useCallback(
    async (beat: RoleplayStoryBeat, choice?: ClipExtendChoice): Promise<string | null> => {
      const request = extendRequestFor(beat);
      if (!request) return 'This scene has no finished clip.';
      if (watchingExtendRef.current) return 'Already making a clip longer — one at a time.';
      try {
        const job = await startClipExtend(
          {
            ...request,
            direction: choice?.direction,
            beats: choice?.beats,
            lines: choice?.lines,
            tones: choice?.tones,
            lead: leadIsMan() ? 'man' : 'woman',
          },
          sharedLlmRequestBody(loadSettingsCache().shared)
        );
        patchBeat(beat, { extendJobId: job.id });
        const current = storyRef.current.find(
          entry => entry.id === beat.id && entry.at === beat.at
        );
        return await finishExtend(
          beat,
          job.id,
          current ? beatClipIdentity(current) : request.clipUrl
        );
      } catch (error) {
        return error instanceof Error ? error.message : 'Could not make the clip longer.';
      }
    },
    [extendRequestFor, finishExtend, patchBeat, storyRef]
  );
  // A job that was running when the page was left: wait for it again.
  useEffect(() => {
    if (watchingExtendRef.current || !story) return;
    const pending = story.find(entry => entry.extendJobId && entry.clipUrl?.trim());
    if (!pending?.extendJobId || !pending.clipUrl) return;
    const key = storyBeatKey(pending);
    const jobId = pending.extendJobId;
    const fromUrl = beatClipIdentity(pending);
    const timer = setTimeout(() => {
      void finishExtend(pending, jobId, fromUrl).then(error =>
        setExtendResult({ key, text: error ?? 'Done — the clip is now about 30 seconds.' })
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [finishExtend, story]);

  // A scene with a line whose clip came back silent (WAN): add the voice without a tap. Once per
  // clip, one at a time.
  const triedVoiceRef = useRef(new Set<string>());
  useEffect(() => {
    if (voicingKey || !story) return;
    for (const entry of story) {
      const clipUrl = entry.clipStatus === 'completed' ? entry.clipUrl?.trim() : '';
      if (!entry.line?.trim() || !clipUrl || triedVoiceRef.current.has(clipUrl)) continue;
      if (entry.extendJobId) continue;
      if (!clipUrlIsAnimatedImage(clipUrl, { promptId: entry.clipPromptId })) continue;
      triedVoiceRef.current.add(clipUrl);
      void voiceBeatClip(entry);
      return;
    }
  }, [story, voiceBeatClip, voicingKey]);

  // One object per change: it is a context value, and every card in the reel reads it.
  return useMemo(
    () => ({
      saveBeatText,
      saveBeatLine,
      saveBeatLineFullFrame,
      saveBeatLineTone,
      saveBeatReply,
      voiceBeatClip,
      voicingKey,
      extendBeatClip,
      extendRequestFor,
      extending,
      extendResult,
      rewriteBeat,
      rewritingKey,
    }),
    [
      extendBeatClip,
      extendRequestFor,
      extending,
      extendResult,
      rewriteBeat,
      rewritingKey,
      saveBeatLine,
      saveBeatLineFullFrame,
      saveBeatLineTone,
      saveBeatReply,
      saveBeatText,
      voiceBeatClip,
      voicingKey,
    ]
  );
}
