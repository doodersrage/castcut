'use client';

import type { CharacterRecord } from '@/lib/character-os';
import {
  dayNudeNeedsAutoFaceCrop,
  resolveDayCastPlate,
  resolveDayFaceOnlyPlate,
  type DayPlate,
} from '@/lib/day-plate';
import { collectIsolateSourceUrls, loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { cropCastFaceFromBlob } from '@/lib/cast-face-crop';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { checkReferenceImage } from '@/lib/reference-check-client';

/**
 * Resolve Image 1 for nude Day: distinct Cast face when present, else a
 * geometric top-center crop from the Cast body plate (so beige lingerie pixels
 * never enter ReferenceLatent / IP-Adapter). Falls back to the body plate only
 * when crop/upload fails.
 *
 * The face lock is checked first (reference-check.ts: one face, big enough to be a crop). A
 * lock that fails — a look's lock that pointed at an old whole-body plate put beige underwear
 * in sex scenes (f651d571) — is left out and the face is cropped from the look's plate instead;
 * `faceLockRejected` carries the message for the card. A check that could not run keeps the lock.
 */
/** 80% of the default crop (2.2× the face), with the same top edge. */
export const DAY_NUDE_FACE_BOX = { scale: 1.76, liftRatio: 0.34 } as const;

export async function resolveDayNudeIdentityPlateWithFaceCrop(input: {
  character: CharacterRecord | null | undefined;
  model?: string | null;
  comfyUrl?: string | null;
}): Promise<{
  plate: DayPlate | null;
  autoCropped: boolean;
  noFaceFound?: boolean;
  faceLockRejected?: string;
}> {
  const comfyUrl = input.comfyUrl?.trim() || undefined;
  const face = resolveDayFaceOnlyPlate(input.character);
  let faceLockRejected: string | undefined;
  if (face) {
    const verdict = await checkReferenceImage({
      role: 'face',
      filename: face.filename,
      imageUrl: face.imageUrl,
      subject: input.character?.name,
      comfyUrl,
    });
    if (verdict.status !== 'mismatch') {
      return { plate: face, autoCropped: false };
    }
    faceLockRejected = `${verdict.message ?? 'The face lock is not a face picture.'} The face was cropped from the look's plate instead.`;
  }

  const body = resolveDayCastPlate(input.character);
  const rejected = faceLockRejected ? { faceLockRejected } : {};
  if (!body || (!faceLockRejected && !dayNudeNeedsAutoFaceCrop(input.character))) {
    return { plate: body, autoCropped: false, ...rejected };
  }

  try {
    const urls = collectIsolateSourceUrls({
      imageUrl: body.imageUrl ?? body.originalUrl,
      filename: body.filename ?? body.originalFilename,
      comfyUrl,
    });
    const blob = await loadImageBlobFromUrls(urls);
    const stamp = Date.now();
    const { file, face: found } = await cropCastFaceFromBlob(
      blob,
      `day-nude-face-${stamp}.png`,
      {
        // Fallback window — Cast underwear plates put bra straps just below the head.
        heightRatio: 0.24,
        aspect: 0.9,
        topInsetRatio: 0.012,
      },
      // Tighter and higher than the default face crop: its bottom edge reached the shoulders,
      // and a plate's tank-top straps put a white top on 5 of 6 nude stills (Rapid replays,
      // 2026-10-06); cut just under the collarbones, 6 of 6 were nude.
      { comfyUrl, faceBox: DAY_NUDE_FACE_BOX }
    );
    const uploaded = await resolveQueueInputImage({
      file,
      filename: file.name,
      model: input.model ?? undefined,
      comfyUrl,
    });
    const filename = uploaded?.filename?.trim();
    if (!filename) {
      return { plate: body, autoCropped: false, ...rejected };
    }
    return {
      plate: {
        filename,
        imageUrl: undefined,
        isolated: false,
        isolateSubject: false,
        source: 'cast',
      },
      autoCropped: true,
      ...(found === 'missing' ? { noFaceFound: true } : {}),
      ...rejected,
    };
  } catch {
    return { plate: body, autoCropped: false, ...rejected };
  }
}
