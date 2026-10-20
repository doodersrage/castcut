import { stripGalleryViewWidthParam } from '@/lib/comfyui-outputs';
import { looksLikeMotionUrl } from '@/lib/story/roleplay-film';
import type { RoleplayStillStatus, RoleplayStoryBeat } from '@/lib/story/roleplay';

export function clipLabel(beat: RoleplayStoryBeat): string | null {
  if (beat.clipStatus === 'completed' && beat.clipUrl?.trim()) {
    return null;
  }
  if (beat.clipStatus === 'error') {
    return 'Clip failed';
  }
  if (beat.clipStatus === 'running') {
    return 'Animating…';
  }
  if (beat.clipStatus === 'queued') {
    return 'Clip queued…';
  }
  if (beat.clipStatus === 'writing') {
    return 'Writing motion…';
  }
  return null;
}

export function stillLabel(beat: RoleplayStoryBeat, liveUrl: string | null): string {
  if (beat.stillStatus === 'completed' && beat.imageUrl) {
    return beat.title;
  }
  if (beat.stillStatus === 'error') {
    return 'Still failed';
  }
  if (beat.stillStatus === 'running') {
    return 'Rendering…';
  }
  if (beat.stillStatus === 'queued') {
    return liveUrl ? 'Queued · preview' : 'Queued…';
  }
  if (beat.prompt && beat.stillStatus === 'writing') {
    return 'Queueing…';
  }
  if (beat.stillStatus === 'writing') {
    return 'Writing still…';
  }
  if (beat.prompt && !beat.promptId) {
    return 'Prompt ready';
  }
  return 'Waiting for a still';
}

export function isBusyStatus(status: RoleplayStillStatus | undefined): boolean {
  return status === 'writing' || status === 'queued' || status === 'running';
}

export function beatMotionUrl(beat: RoleplayStoryBeat): string | null {
  if (beat.clipStatus !== 'completed') {
    return null;
  }
  const clipUrl = beat.clipUrl?.trim();
  if (!clipUrl) {
    return null;
  }
  return stripGalleryViewWidthParam(clipUrl);
}

export function beatPreviewUrl(beat: RoleplayStoryBeat, liveUrl: string | null): string | null {
  const motion = beatMotionUrl(beat);
  if (motion) {
    return motion;
  }
  if (beat.stillStatus === 'completed' && beat.imageUrl?.trim()) {
    return beat.imageUrl.trim();
  }
  return liveUrl?.trim() || null;
}

export const ROLEPLAY_OVERLAY_BTN_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-[var(--bg-base)]/80 text-[var(--text-primary)] shadow-sm backdrop-blur-sm transition hover:bg-[var(--bg-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:opacity-40';

export function beatLooksLikeMotion(beat: RoleplayStoryBeat): boolean {
  const clipUrl = beatMotionUrl(beat) ?? '';
  return Boolean(clipUrl && looksLikeMotionUrl(clipUrl));
}
