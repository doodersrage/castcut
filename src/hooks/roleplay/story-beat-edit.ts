/**
 * Editing a scene's text after it is in the reel: the rules shared by the beat card (when the
 * editor is offered) and the hook that saves the text and writes the still again.
 */
import {
  beginRoleplayStillRetryPatch,
  roleplayStillHasInFlightTake,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';

/** One key per scene in the reel (ids repeat when the same card is played twice). */
export function storyBeatKey(beat: Pick<RoleplayStoryBeat, 'id' | 'at'>): string {
  return `${beat.id}:${beat.at}`;
}

/**
 * The scene's text cannot change right now: its still is being written, queued or rendered (the
 * job was sent with the text as it was), or its clip's motion is being written from that text.
 */
export function storyBeatTextLocked(beat: RoleplayStoryBeat): boolean {
  return (
    beat.stillStatus === 'writing' ||
    beat.stillStatus === 'queued' ||
    beat.stillStatus === 'running' ||
    roleplayStillHasInFlightTake(beat) ||
    beat.clipStatus === 'writing'
  );
}

/** The player changed this scene's text and its still has not been written again yet. */
export function storyBeatAwaitsRewrite(beat: RoleplayStoryBeat): boolean {
  return beat.textEdited === true && !beat.prompt?.trim();
}

/** The scene as the writer is asked about it — the card it would have been. */
export function storyBeatScene(beat: RoleplayStoryBeat): RoleplayScene {
  return {
    id: beat.id,
    title: beat.title,
    blurb: beat.blurb,
    ...(beat.kind ? { kind: beat.kind } : {}),
    ...(beat.pose ? { pose: beat.pose } : {}),
  };
}

/**
 * The story up to (not including) a scene. A scene written again is told what led to it, as it
 * was when first picked — not the scenes that came after, and not its own earlier still.
 */
export function storyBeforeBeat(
  story: RoleplayStoryBeat[] | undefined,
  beat: Pick<RoleplayStoryBeat, 'id' | 'at'>
): RoleplayStoryBeat[] {
  const all = story ?? [];
  const index = all.findIndex(entry => entry.id === beat.id && entry.at === beat.at);
  return index < 0 ? all : all.slice(0, index);
}

/**
 * Start writing a scene's still again: the same patch a Retry starts with, so the earlier stills
 * stay in the reel as takes and the new one becomes the shown take.
 */
export function storyBeatRewriteStartPatch(beat: RoleplayStoryBeat): Partial<RoleplayStoryBeat> {
  return beginRoleplayStillRetryPatch(beat);
}

/** Put the scene's stills back as they were when writing it again failed before a job was sent. */
export function storyBeatRewriteRevertPatch(before: RoleplayStoryBeat): Partial<RoleplayStoryBeat> {
  return {
    stillTakes: before.stillTakes,
    stillTakeIndex: before.stillTakeIndex,
    promptId: before.promptId,
    imageUrl: before.imageUrl,
    stillStatus: before.stillStatus,
    stillTakePinned: before.stillTakePinned,
    stillTakeAutoPicked: before.stillTakeAutoPicked,
  };
}
