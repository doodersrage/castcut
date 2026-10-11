'use client';

import { locateFaceOnPlateBlob } from './face-locate-client';
import {
  stillPostureFromBody,
  TALKING_WIDE_FACE_SHARE,
  talkingClipCropRect,
  talkingFramingFromShare,
  type TalkingFraming,
} from './talking-clip-framing';

/**
 * How a still kept whole is framed (talkingFramingFromShare): wide, mid or close. Unreadable or
 * faceless stills count as `mid`, so the clip holds its framing.
 */
export async function talkingStillFraming(imageUrl: string): Promise<TalkingFraming> {
  try {
    const response = await fetch(imageUrl, { credentials: 'same-origin' });
    if (!response.ok) return 'mid';
    const blob = await response.blob();
    const located = await locateFaceOnPlateBlob(blob);
    if (!located?.available || !located.face) return 'mid';
    const bitmap = await createImageBitmap(blob);
    try {
      return talkingFramingFromShare(located.face.height / Math.max(1, bitmap.height));
    } finally {
      bitmap.close();
    }
  } catch {
    return 'mid';
  }
}

/**
 * True when the still is a full-body shot (face under {@link TALKING_WIDE_FACE_SHARE} of its
 * height). False when it can't be read or no face is found.
 */
export async function talkingStillIsWide(imageUrl: string): Promise<boolean> {
  try {
    const response = await fetch(imageUrl, { credentials: 'same-origin' });
    if (!response.ok) return false;
    const blob = await response.blob();
    const located = await locateFaceOnPlateBlob(blob);
    if (!located?.available || !located.face) return false;
    const bitmap = await createImageBitmap(blob);
    try {
      return located.face.height / Math.max(1, bitmap.height) < TALKING_WIDE_FACE_SHARE;
    } finally {
      bitmap.close();
    }
  } catch {
    return false;
  }
}

/**
 * The still a talking clip starts from: a chest-up crop around the face when the face is small
 * (talking-clip-framing.ts), else null (use the still as it is). Never throws — a still that
 * can't be read or has no face found animates uncropped.
 */
export async function framedTalkingStill(imageUrl: string): Promise<File | null> {
  try {
    const response = await fetch(imageUrl, { credentials: 'same-origin' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const located = await locateFaceOnPlateBlob(blob);
    if (!located?.available || !located.face) return null;
    const bitmap = await createImageBitmap(blob);
    try {
      const rect = talkingClipCropRect(bitmap.width, bitmap.height, located.face);
      if (!rect) return null;
      const canvas = document.createElement('canvas');
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      return out ? new File([out], 'talking-still.png', { type: 'image/png' }) : null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/**
 * Seated or not, read from the still's pose (/api/pose-detect, cached per image). `null` when the
 * pose reader isn't installed or finds nobody — the caller falls back to the still's words.
 */
export async function talkingStillPosture(imageUrl: string): Promise<'seated' | 'upright' | null> {
  try {
    const { detectStillPoseShared } = await import('./pose-detect-client');
    const result = await detectStillPoseShared(imageUrl);
    if (!result.available) return null;
    const body = result.pose.people[0];
    return body ? stillPostureFromBody(body) : null;
  } catch {
    return null;
  }
}
