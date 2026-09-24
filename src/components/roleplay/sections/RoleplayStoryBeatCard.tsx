'use client';

import { Button } from '@/components/ui/Button';
import { continueClipActionLabel } from '@/lib/video-clip-mode';
import { loadEngineSettings } from '@/lib/engine-settings';
import {
  canRetryRoleplayClip,
  lastCompletedRoleplayStillUrl,
  roleplayClipTakes,
  roleplayStillTakes,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { RoleplayStillFrame } from '@/components/roleplay/sections/RoleplayStillFrame';
import { storyFaceMatchLabel, storyPoseMatchLabel } from '@/lib/roleplay-pose-check';
import { DEFAULT_MIN_FACE_MATCH, FACE_MATCH_WARN_BELOW } from '@/lib/face-match';
import { DEFAULT_MIN_POSE_MATCH } from '@/lib/pose-score';
import {
  beatMotionUrl,
  beatPreviewUrl,
  isBusyStatus,
} from '@/components/roleplay/roleplay-story-helpers';

type Props = {
  beat: RoleplayStoryBeat;
  index: number;
  liveUrl: string | null;
  busy: boolean;
  onOpen?: () => void;
  onQueue?: (beat: RoleplayStoryBeat) => void;
  onCopy?: (beat: RoleplayStoryBeat) => void;
  onRetry?: (beat: RoleplayStoryBeat) => void;
  onRetryClip?: (beat: RoleplayStoryBeat) => void;
  onAnimate?: (beat: RoleplayStoryBeat) => void;
  onExtend?: (beat: RoleplayStoryBeat) => void;
  onSelectTake?: (beat: RoleplayStoryBeat, index: number) => void;
  onSelectClipTake?: (beat: RoleplayStoryBeat, index: number) => void;
};

export function RoleplayStoryBeatCard({
  beat,
  index,
  liveUrl,
  busy,
  onOpen,
  onQueue,
  onCopy,
  onRetry,
  onRetryClip,
  onAnimate,
  onExtend,
  onSelectTake,
  onSelectClipTake,
}: Props) {
  const takes = roleplayStillTakes(beat);
  const poseMatch = storyPoseMatchLabel(beat, DEFAULT_MIN_POSE_MATCH);
  const faceMatch = storyFaceMatchLabel(beat, {
    miss: DEFAULT_MIN_FACE_MATCH,
    warn: FACE_MATCH_WARN_BELOW,
  });
  const clipTakes = roleplayClipTakes(beat);
  const hasClipAttempt = clipTakes.some(
    take =>
      take.clipPromptId ||
      take.clipUrl ||
      take.clipStatus === 'completed' ||
      take.clipStatus === 'error' ||
      isBusyStatus(take.clipStatus)
  );
  const canQueue = Boolean(
    beat.prompt &&
    onQueue &&
    !beat.promptId &&
    !takes.some(
      take =>
        take.promptId ||
        take.imageUrl ||
        take.stillStatus === 'completed' ||
        take.stillStatus === 'error' ||
        isBusyStatus(take.stillStatus)
    )
  );
  const canCopy = Boolean(beat.prompt && onCopy);
  const canOpen = Boolean(beatPreviewUrl(beat, liveUrl));
  const clipBusy =
    beat.clipStatus === 'writing' || beat.clipStatus === 'queued' || beat.clipStatus === 'running';
  const canAnimateStill = Boolean(
    onAnimate &&
    lastCompletedRoleplayStillUrl(beat) &&
    beat.stillStatus === 'completed' &&
    !hasClipAttempt &&
    !clipBusy
  );
  const canAnimateT2v = Boolean(
    onAnimate && beat.prompt?.trim() && !canAnimateStill && !hasClipAttempt && !clipBusy
  );
  const canAnimate = canAnimateStill || canAnimateT2v;
  const canExtend = Boolean(onExtend && beat.clipStatus === 'completed' && beat.clipUrl?.trim());
  const canRetryClipAction = Boolean(
    onRetryClip && canRetryRoleplayClip(beat) && !beatMotionUrl(beat)
  );

  return (
    <li key={`${beat.id}-${beat.at}`}>
      <article className="space-y-2">
        <RoleplayStillFrame
          beat={beat}
          liveUrl={liveUrl}
          onOpen={canOpen ? onOpen : undefined}
          onRetry={onRetry ? () => onRetry(beat) : undefined}
          onRetryClip={onRetryClip ? () => onRetryClip(beat) : undefined}
          onSelectTake={onSelectTake ? nextIndex => onSelectTake(beat, nextIndex) : undefined}
          onSelectClipTake={
            onSelectClipTake ? nextIndex => onSelectClipTake(beat, nextIndex) : undefined
          }
        />
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            <span className="type-caption mr-2 text-[var(--text-muted)]">{index + 1}.</span>
            {beat.title}
          </p>
          <p className="type-caption text-[var(--text-muted)]">{beat.blurb}</p>
          {poseMatch ? (
            <p
              className={`type-caption ${
                poseMatch.miss
                  ? 'text-[var(--tint-warning-text,var(--text-muted))]'
                  : 'text-[var(--text-muted)]'
              }`}
              data-testid="story-pose-match"
            >
              {poseMatch.text}
            </p>
          ) : null}
          {faceMatch ? (
            <p
              className={`type-caption ${
                faceMatch.miss
                  ? 'text-[var(--tint-warning-text,var(--text-muted))]'
                  : 'text-[var(--text-muted)]'
              }`}
              data-testid="story-face-match"
            >
              {faceMatch.text}
            </p>
          ) : null}
          {beat.poseGuideUrl ? (
            <details
              className="type-caption text-[var(--text-muted)]"
              data-testid="story-pose-guide"
            >
              <summary className="cursor-pointer">Pose guide</summary>
              {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI proxy URL */}
              <img
                src={beat.poseGuideUrl}
                alt={`${beat.title} pose guide`}
                className="mt-1 max-h-40 w-auto rounded border border-[var(--border-subtle)]"
                loading="lazy"
              />
            </details>
          ) : null}
        </div>
        {canQueue || canCopy || canAnimate || canExtend || canRetryClipAction ? (
          <div className="flex flex-wrap gap-2">
            {canQueue ? (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => onQueue?.(beat)}>
                Queue still
              </Button>
            ) : null}
            {canAnimate ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => onAnimate?.(beat)}
              >
                {canAnimateStill ? 'Animate still' : 'Text to video'}
              </Button>
            ) : null}
            {canRetryClipAction ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => onRetryClip?.(beat)}
              >
                Play another clip
              </Button>
            ) : null}
            {canExtend ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => onExtend?.(beat)}
              >
                {continueClipActionLabel({
                  parentUrl: beat.clipUrl,
                  engine: loadEngineSettings().engine,
                })}
              </Button>
            ) : null}
            {canCopy ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onCopy?.(beat)}>
                Copy prompt
              </Button>
            ) : null}
          </div>
        ) : null}
      </article>
    </li>
  );
}
