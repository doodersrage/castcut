'use client';

import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { comfyInputViewUrl } from '@/lib/face-match-client';
import {
  judgeReference,
  referenceCheckCacheKey,
  type ReferenceCheckResponse,
  type ReferenceRole,
  type ReferenceVerdict,
} from '@/lib/reference-check';
import { isComfyViewUrl } from '@/lib/still-comfy-url';

/**
 * Browser: check a reference picture against its role through `/api/reference-check`
 * (reference-check.ts). Never throws and never blocks a queue on a failure: a check that errors
 * or times out answers `unknown` (logged). One check per picture × role × comparison for the
 * page's life, mirrored in localStorage so a Day's face crop is checked once, not once per
 * still — input files are named by content (comfy-input-name.ts), so a name is a picture.
 */

export type ReferenceCheckInput = {
  role: ReferenceRole;
  /** A ComfyUI input file name (what the queue sends). */
  filename?: string | null;
  /** Or a ComfyUI view URL. Other URLs cannot be checked (`unknown`). */
  imageUrl?: string | null;
  /** The Cast's name, for the message. */
  subject?: string | null;
  /** `partner-face`: the partner's plate and the lead's plate (ComfyUI view URLs). */
  partnerReferenceUrl?: string | null;
  leadReferenceUrl?: string | null;
  comfyUrl?: string | null;
  timeoutMs?: number;
};

/** The first check loads InsightFace in ComfyUI (~8 s cold); later ones take under a second. */
export const REFERENCE_CHECK_TIMEOUT_MS = 45_000;

const STORAGE_KEY = 'castcut-reference-checks-v1';
const STORAGE_MAX = 300;

const pending = new Map<string, Promise<ReferenceVerdict>>();
const settled = new Map<string, ReferenceVerdict>();
let storageLoaded = false;

function loadStored(): void {
  if (storageLoaded || typeof window === 'undefined') return;
  storageLoaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as { entries?: Array<[string, ReferenceVerdict]> })
      : null;
    for (const [key, verdict] of parsed?.entries ?? []) {
      if (
        typeof key === 'string' &&
        verdict &&
        (verdict.status === 'ok' || verdict.status === 'mismatch')
      ) {
        settled.set(key, verdict);
      }
    }
  } catch {
    // Private window / blocked storage: in-memory only.
  }
}

function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    const entries = Array.from(settled.entries()).slice(-STORAGE_MAX);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries }));
  } catch {
    // ignore
  }
}

/** Tests and a replaced Cast picture. */
export function clearReferenceCheckCache(): void {
  pending.clear();
  settled.clear();
  storageLoaded = true;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/** ComfyUI view URL for a plate the checks can compare with (its input upload or view URL). */
export function referenceViewUrl(
  plate: { filename?: string | null; imageUrl?: string | null } | null | undefined
): string | undefined {
  const filename = plate?.filename?.trim();
  if (filename) return comfyInputViewUrl(filename) ?? undefined;
  const imageUrl = plate?.imageUrl?.trim();
  return imageUrl && isComfyViewUrl(imageUrl) ? imageUrl : undefined;
}

export async function checkReferenceImage(input: ReferenceCheckInput): Promise<ReferenceVerdict> {
  const filename = input.filename?.trim() || '';
  const imageUrl = input.imageUrl?.trim() || '';
  const name = filename || imageUrl;
  if (!name) return { status: 'unknown', issues: [], message: 'No picture to check.' };
  // The name alone can settle it (a Cast plate as a face) — no request.
  const byName = judgeReference(input.role, null, { filename: name, subject: input.subject });
  if (byName.status === 'mismatch') return byName;
  if (!filename && !isComfyViewUrl(imageUrl)) {
    return { status: 'unknown', issues: [], message: 'Not a ComfyUI picture.' };
  }
  loadStored();
  const key = referenceCheckCacheKey(input);
  const done = settled.get(key);
  if (done) return done;
  const running = pending.get(key);
  if (running) return running;
  const task = (async (): Promise<ReferenceVerdict> => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort(),
      input.timeoutMs ?? REFERENCE_CHECK_TIMEOUT_MS
    );
    try {
      const comfyUrl = input.comfyUrl?.trim() || loadComfyUiSettings().apiUrl?.trim() || undefined;
      const response = await fetch('/api/reference-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
        body: JSON.stringify({
          role: input.role,
          ...(filename ? { filename } : { imageUrl }),
          ...(input.subject?.trim() ? { subject: input.subject.trim() } : {}),
          ...(input.role === 'partner-face' && input.partnerReferenceUrl?.trim()
            ? { partnerReferenceUrl: input.partnerReferenceUrl.trim() }
            : {}),
          ...(input.role === 'partner-face' && input.leadReferenceUrl?.trim()
            ? { leadReferenceUrl: input.leadReferenceUrl.trim() }
            : {}),
          ...(comfyUrl ? { comfyUrl } : {}),
        }),
      });
      const data = (await response
        .json()
        .catch(() => null)) as Partial<ReferenceCheckResponse> | null;
      const verdict = data?.verdict;
      if (!response.ok || !verdict || typeof verdict.status !== 'string') {
        const reason = (data as { error?: string } | null)?.error ?? `HTTP ${response.status}`;
        console.warn('Reference check did not run:', input.role, name, reason);
        return { status: 'unknown', issues: [], message: reason };
      }
      if (verdict.status !== 'unknown') {
        settled.set(key, verdict);
        persist();
      } else {
        console.warn(
          'Reference check could not read the picture:',
          input.role,
          name,
          verdict.message
        );
      }
      return verdict;
    } catch (error) {
      console.warn(
        'Reference check failed (ignored):',
        input.role,
        name,
        error instanceof Error ? error.message : error
      );
      return {
        status: 'unknown',
        issues: [],
        message: controller.signal.aborted ? 'The check timed out.' : 'The check failed.',
      };
    } finally {
      window.clearTimeout(timer);
      pending.delete(key);
    }
  })();
  pending.set(key, task);
  return task;
}

/**
 * The checks a still's plain references get at queue time (Day, Story, Outfit): Image 1 when it
 * is meant to be a face crop, and the clothing image. Mismatch messages, joined for the card;
 * undefined when everything passed or nothing could be checked.
 */
export async function checkStillReferences(input: {
  face?: { filename?: string | null; imageUrl?: string | null } | null;
  clothing?: { filename?: string | null; imageUrl?: string | null } | null;
  subject?: string | null;
  comfyUrl?: string | null;
}): Promise<string | undefined> {
  const checks: Promise<ReferenceVerdict>[] = [];
  if (input.face && (input.face.filename?.trim() || input.face.imageUrl?.trim())) {
    checks.push(
      checkReferenceImage({
        role: 'face',
        filename: input.face.filename,
        imageUrl: input.face.imageUrl,
        subject: input.subject,
        comfyUrl: input.comfyUrl,
      })
    );
  }
  if (input.clothing && (input.clothing.filename?.trim() || input.clothing.imageUrl?.trim())) {
    checks.push(
      checkReferenceImage({
        role: 'clothing',
        filename: input.clothing.filename,
        imageUrl: input.clothing.imageUrl,
        comfyUrl: input.comfyUrl,
      })
    );
  }
  if (checks.length === 0) return undefined;
  const verdicts = await Promise.all(checks);
  const notes = verdicts
    .filter(verdict => verdict.status === 'mismatch' && verdict.message)
    .map(verdict => verdict.message as string);
  return notes.length > 0 ? notes.join(' ') : undefined;
}
