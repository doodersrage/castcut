'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import ShotCardMenu, { SHOT_CARD_MENU_ITEM_CLASS } from '@/components/ui/ShotCardMenu';
import { continueClipActionLabel } from '@/lib/video-clip-mode';
import { loadEngineSettings } from '@/lib/engine-settings';
import {
  canRetryRoleplayClip,
  canRetryRoleplayStill,
  lastCompletedRoleplayStillUrl,
  roleplayClipTakes,
  roleplayStillTakeIndex,
  roleplayStillTakes,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { looksLikeMotionUrl } from '@/lib/roleplay-film';
import PoseMissPanel from '@/components/pose/PoseMissPanel';
import StillPromptCheckNote from '@/components/StillPromptCheckNote';
import { ADULT_GATE_WITHHELD_MESSAGE } from '@/lib/adult-appearance-gate';
import OpenInComfyButton from '@/components/OpenInComfyButton';
import StoryBeatSheet from '@/components/roleplay/sections/StoryBeatSheet';
import { useStoryBeatEditActions } from '@/components/roleplay/StoryBeatEditContext';
import {
  storyBeatAwaitsRewrite,
  storyBeatKey,
  storyBeatTextLocked,
} from '@/hooks/roleplay/story-beat-edit';
import { RoleplayStillFrame } from '@/components/roleplay/sections/RoleplayStillFrame';
import {
  storyFaceMatchLabel,
  storyPoseMatchLabel,
  storyRealismLabel,
} from '@/lib/roleplay-pose-check';
import { STORY_MIN_FACE_MATCH, STORY_FACE_MATCH_WARN_BELOW } from '@/lib/face-match';
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
  /** ⋯ → Fix an area…: paint over what's wrong in the shown still (fix-area.ts). */
  onFixArea?: (beat: RoleplayStoryBeat) => void;
  onPoseChange?: (
    beat: RoleplayStoryBeat,
    patch: Pick<
      RoleplayStoryBeat,
      'poseLayout' | 'poseVariant' | 'posePhoto' | 'poseCamera' | 'poseLead' | 'poseLook'
    >
  ) => void;
};

/**
 * One scene in the reel: its frame (tap for full size; prev / next takes), title, text, the
 * check lines, and one ⋯ menu for everything else (Edit scene, Pose…, Open full size, Queue
 * still, Animate, Play another still / clip, Extend, Copy prompt, Open in ComfyUI). Editing the
 * text or the pose opens the scene's side sheet.
 */
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
  onFixArea,
  onPoseChange,
}: Props) {
  const takes = roleplayStillTakes(beat);
  const withheld = takes[roleplayStillTakeIndex(beat)]?.adultHold === 'withheld';
  const edit = useStoryBeatEditActions();
  const [sheetOpen, setSheetOpen] = useState(false);
  const rewriting = edit?.rewritingKey === storyBeatKey(beat);
  // The job in flight was sent with the text as it was — it cannot change underneath it.
  const textLocked = storyBeatTextLocked(beat) || rewriting;
  const awaitsRewrite = storyBeatAwaitsRewrite(beat);
  const hasStill = takes.some(take => take.imageUrl?.trim() || take.promptId?.trim());
  const poseMatch = storyPoseMatchLabel(beat, DEFAULT_MIN_POSE_MATCH);
  const faceMatch = storyFaceMatchLabel(beat, {
    miss: STORY_MIN_FACE_MATCH,
    warn: STORY_FACE_MATCH_WARN_BELOW,
  });
  const realismMiss = storyRealismLabel(beat);
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
  // The frame used to carry these as overlay buttons; they live in the menu now.
  const motionClip = Boolean(beatMotionUrl(beat) && looksLikeMotionUrl(beatMotionUrl(beat) ?? ''));
  const canRetryStillAction = Boolean(!motionClip && onRetry && canRetryRoleplayStill(beat));
  const canRetryClipAction = Boolean(onRetryClip && canRetryRoleplayClip(beat));
  // The shown take's exact graph can go to ComfyUI's editor once it has rendered.
  const comfyPromptId =
    beat.stillStatus === 'completed' && beat.promptId?.trim() ? beat.promptId.trim() : '';
  const openSheet = () => setSheetOpen(true);

  return (
    <li key={`${beat.id}-${beat.at}`}>
      <article className="space-y-2" data-testid="story-beat-card">
        <div className="relative">
          <RoleplayStillFrame
            beat={beat}
            liveUrl={liveUrl}
            onOpen={canOpen ? onOpen : undefined}
            onSelectTake={onSelectTake ? nextIndex => onSelectTake(beat, nextIndex) : undefined}
            onSelectClipTake={
              onSelectClipTake ? nextIndex => onSelectClipTake(beat, nextIndex) : undefined
            }
          />
          <ShotCardMenu
            label={beat.title}
            testId="story-beat-menu"
            className="absolute right-1.5 top-1.5 z-20"
          >
            {edit ? (
              <button
                type="button"
                className={SHOT_CARD_MENU_ITEM_CLASS}
                disabled={busy || textLocked}
                title={
                  textLocked
                    ? 'This scene is being written or queued — edit it once that is done.'
                    : undefined
                }
                data-testid="story-beat-edit"
                onClick={openSheet}
              >
                Edit scene
              </button>
            ) : null}
            {onPoseChange ? (
              <button
                type="button"
                className={SHOT_CARD_MENU_ITEM_CLASS}
                data-testid="story-beat-pose-open"
                onClick={openSheet}
              >
                Pose…
              </button>
            ) : null}
            {canOpen && onOpen ? (
              <button type="button" className={SHOT_CARD_MENU_ITEM_CLASS} onClick={onOpen}>
                Open full size
              </button>
            ) : null}
            {onFixArea &&
            !withheld &&
            beat.stillStatus === 'completed' &&
            beat.imageUrl?.trim() &&
            !looksLikeMotionUrl(beat.imageUrl) ? (
              <button
                type="button"
                className={SHOT_CARD_MENU_ITEM_CLASS}
                title="Paint over a wrong hand, a stray object or a glitch and redraw only that area."
                data-testid="story-beat-fix-area"
                onClick={() => onFixArea(beat)}
              >
                Fix an area…
              </button>
            ) : null}
            {canQueue ? (
              <button
                type="button"
                className={SHOT_CARD_MENU_ITEM_CLASS}
                disabled={busy}
                onClick={() => onQueue?.(beat)}
              >
                Queue still
              </button>
            ) : null}
            {canAnimate ? (
              <button
                type="button"
                className={SHOT_CARD_MENU_ITEM_CLASS}
                disabled={busy}
                onClick={() => onAnimate?.(beat)}
              >
                {canAnimateStill ? 'Animate still' : 'Text to video'}
              </button>
            ) : null}
            {canRetryStillAction ? (
              <button
                type="button"
                className={SHOT_CARD_MENU_ITEM_CLASS}
                disabled={busy}
                title="Play another still with a new seed"
                data-testid="story-beat-retry"
                onClick={() => onRetry?.(beat)}
              >
                Play another still
              </button>
            ) : null}
            {canRetryClipAction ? (
              <button
                type="button"
                className={SHOT_CARD_MENU_ITEM_CLASS}
                disabled={busy}
                title="Play another clip with a new seed"
                data-testid="story-beat-retry-clip"
                onClick={() => onRetryClip?.(beat)}
              >
                Play another clip
              </button>
            ) : null}
            {canExtend ? (
              <button
                type="button"
                className={SHOT_CARD_MENU_ITEM_CLASS}
                disabled={busy}
                onClick={() => onExtend?.(beat)}
              >
                {continueClipActionLabel({
                  parentUrl: beat.clipUrl,
                  engine: loadEngineSettings().engine,
                })}
              </button>
            ) : null}
            {canCopy ? (
              <button
                type="button"
                className={SHOT_CARD_MENU_ITEM_CLASS}
                disabled={busy}
                onClick={() => onCopy?.(beat)}
              >
                Copy prompt
              </button>
            ) : null}
            {comfyPromptId ? (
              <OpenInComfyButton
                promptId={comfyPromptId}
                className={SHOT_CARD_MENU_ITEM_CLASS}
                testId="story-beat-open-in-comfy"
              />
            ) : null}
          </ShotCardMenu>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            <span className="type-caption mr-2 text-[var(--text-muted)]">{index + 1}.</span>
            {beat.title}
          </p>
          <p className="type-caption text-[var(--text-muted)]">{beat.blurb}</p>
          {edit && awaitsRewrite ? (
            <div
              className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2"
              data-testid="story-beat-rewrite"
            >
              <p className="type-caption text-[var(--text-muted)]">
                {rewriting
                  ? 'Writing this scene again from its new text…'
                  : beat.stillWriteInterrupted
                    ? 'Its still was not written — the page closed while it was being written.'
                    : hasStill
                      ? 'Scene text changed — the still shows the earlier text. Write it again to match; the earlier still stays as a take.'
                      : 'Scene text changed — its still has not been written yet.'}
              </p>
              <Button
                size="sm"
                variant="primary"
                loading={rewriting}
                loadingLabel="Writing the scene again"
                disabled={busy || textLocked}
                data-testid="story-beat-rewrite-button"
                onClick={() => void edit.rewriteBeat(beat)}
              >
                Write and queue again
              </Button>
            </div>
          ) : null}
          {beat.stillTakeAutoPicked && takes.length > 1 ? (
            <p
              className="type-caption text-[var(--text-muted)]"
              data-testid="story-take-autopicked"
            >
              Showing take {roleplayStillTakeIndex(beat) + 1} of {takes.length} — it matched the
              pose / Cast better than the newest. Tap another take to pick it yourself.
            </p>
          ) : null}
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
          {poseMatch?.miss && beat.poseMatch?.missView ? (
            <PoseMissPanel view={beat.poseMatch.missView} testId="story-pose-miss" />
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
          {realismMiss ? (
            <p
              className="type-caption text-[var(--tint-warning-text,var(--text-muted))]"
              data-testid="story-realism-miss"
            >
              {realismMiss.text}
            </p>
          ) : null}
          {withheld ? (
            <p
              className="type-caption text-[var(--tint-danger-text)]"
              role="status"
              data-testid="story-beat-withheld"
            >
              {ADULT_GATE_WITHHELD_MESSAGE}
            </p>
          ) : null}
          <StillPromptCheckNote check={beat.promptCheck} testId="story-beat-prompt-check" />
        </div>
      </article>
      {sheetOpen ? (
        <StoryBeatSheet
          open
          onClose={() => setSheetOpen(false)}
          beat={beat}
          index={index}
          busy={busy}
          edit={edit}
          textLocked={textLocked}
          onPoseChange={onPoseChange}
        />
      ) : null}
    </li>
  );
}
