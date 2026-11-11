'use client';

/**
 * "Same stranger all day": an invented Day partner gets one face, rendered once as a
 * head-and-shoulders portrait (an edit of the lead's face crop into a different person), then
 * used like a Cast partner's face (Image 2) on every two-person still that day. Without it the
 * stranger was a new face in every still — a date with five different people.
 */

import type { SendComfyUiOptions } from '@/hooks/prompt-result/comfy-ui-types';
import { waitForGalleryPromptIds } from '@/lib/best-of-n/vision-queue';
import { galleryEntryPrimaryViewUrl } from '@/lib/gallery/comfyui-gallery';
import type { DayPartnerNoun } from '@/lib/day/partner';
import { collectIsolateSourceUrls, loadImageBlobFromUrls } from '@/lib/edit/isolate-subject';
import { cropPortraitFaceRegionFromBlob } from '@/lib/face/portrait-face-crop';
import { resolveQueueInputImage } from '@/lib/queue/input-image';
import { pickCompanionLook } from '@/lib/day/clothed-lead';
import { neutralizeYouthWords } from '@/lib/adult/adult-age-safeguard';

export type DayPartnerStandIn = {
  noun: 'man' | 'woman';
  /** The composed look ("a Latino man in his early twenties with …"). */
  look: string;
  filename: string;
  imageUrl?: string;
};

type SendComfyUi = (
  prompt: string,
  sport?: null,
  historyId?: undefined,
  options?: SendComfyUiOptions
) => Promise<string | undefined | void>;

/**
 * The stand-in's look. Its face plays the partner on adult duo stills too, so it is never
 * younger than the thirties (the composed looks run from the early twenties) and carries no
 * youth-coded words (adult-age-safeguard.ts).
 */
export function pickDayPartnerStandInLook(
  noun: 'man' | 'woman',
  options?: { elderly?: boolean }
): string {
  const look = matureStandInLook(pickCompanionLook(noun));
  return options?.elderly ? elderlyStandInLook(look) : look;
}

/** An old person's look: the age said, hair gone grey (an "elderly man" was drawn in his thirties). */
export function elderlyStandInLook(look: string): string {
  const aged = look.replace(
    /\bin (her|his|their) (?:early |late |mid-)?(?:twenties|thirties|forties|fifties)\b/gi,
    (_match, who: string) => `in ${who} seventies`
  );
  const said = aged === look ? `${look}, in his or her seventies` : aged;
  return `${said}, grey-haired, with a lined, weathered face`;
}

/**
 * The other person a script's two-shot shows, from its opening ("Slyne and Elderly man, the two
 * of them together." — script-shots.ts). The partner (PARTNER, a husband, a date…) is the film's
 * one stand-in; anyone else gets a face of their own, so the bookstore's elderly man is not the
 * partner's face (live 2026-11-11: he was, in his late thirties). `noun` when the words say it.
 */
export type ScriptShotOther = {
  /** Lower-case, as the shot names them ("elderly man"); '' for the partner. */
  who: string;
  noun: 'man' | 'woman' | null;
  elderly: boolean;
};

const PARTNER_ROLE_RE =
  /\b(?:partner|boyfriend|girlfriend|husband|wife|fianc[eé]e?|date|lover|spouse)$/i;

export function scriptShotOther(hints: string | null | undefined): ScriptShotOther | null {
  const pair = /^\s*([^,.!?]{1,60}?)\s+and\s+([^,.!?]{1,60}?),\s+the two of them together\b/.exec(
    hints ?? ''
  );
  const other = pair?.[2]?.trim();
  if (!other) return null;
  const words = other.toLowerCase().replace(/^.*[’']s\s+/, '');
  if (PARTNER_ROLE_RE.test(words)) return { who: '', noun: null, elderly: false };
  const noun =
    /\b(?:woman|lady|girl|mother|mom|mum|grandma|grandmother|granny|aunt|sister|daughter|wife|girlfriend|waitress|actress|nun|queen)\b/.test(
      words
    )
      ? 'woman'
      : /\b(?:man|gentleman|guy|boy|father|dad|grandpa|grandfather|uncle|brother|son|husband|boyfriend|waiter|priest|king)\b/.test(
            words
          )
        ? 'man'
        : null;
  const elderly =
    /\b(?:elderly|old|older|aged|senior|retired|grand(?:pa|ma|father|mother)|granny)\b/.test(words);
  return { who: words.slice(0, 60), noun, elderly };
}

/** Where a film keeps a stand-in: the script for its partner, `script|who` for anyone else. */
export function filmStandInKey(scriptId: string, other: ScriptShotOther | null): string {
  return other?.who ? `${scriptId}|${other.who.replace(/\|/g, ' ')}` : scriptId;
}

export function matureStandInLook(look: string): string {
  return neutralizeYouthWords(look).replace(
    /\bin (her|his|their) (?:early |late |mid-)?twenties\b/gi,
    (_match, who: string) => `in ${who} thirties`
  );
}

export function buildDayPartnerStandInPrompt(look: string): string {
  return [
    `Replace the person in Image 1 with a completely different person: ${look}.`,
    'Head-and-shoulders portrait facing the camera, neutral relaxed expression, eyes open, plain light gray background, soft even daylight, simple crew-neck top.',
    'A new face, not the face in Image 1 — different face shape, nose, eyes, hair and skin tone as described.',
    'Photorealistic photograph, natural skin.',
  ].join(' ');
}

/** The stored stand-in still fits the chosen partner (same gender), or null. */
export function reusableDayPartnerStandIn(
  standIn: DayPartnerStandIn | null | undefined,
  noun: DayPartnerNoun
): DayPartnerStandIn | null {
  return standIn?.filename?.trim() && standIn.noun === noun ? standIn : null;
}

/**
 * The stand-in portrait's head crop: hair to chin with a sliver of collar at most (the portrait
 * runs hair ~6%, chin ~72%, neckline ~76% of its height). It asked 0.58 under a 0.4 cap and
 * kept only the forehead (live 2026-11-11: refused as no face on every two-person shot).
 */
export const DAY_PARTNER_STAND_IN_CROP = {
  heightRatio: 0.74,
  aspect: 0.85,
  topInsetRatio: 0.03,
} as const;

export async function renderDayPartnerStandIn(input: {
  noun: 'man' | 'woman';
  /** The lead's face crop (ComfyUI input filename) — the edit's canvas, replaced entirely. */
  leadFaceFilename: string;
  model?: string | null;
  comfyUrl?: string;
  sendComfyUi: SendComfyUi;
  characterId?: string;
  /** An old person (scriptShotOther): their look says so. */
  elderly?: boolean;
}): Promise<DayPartnerStandIn | null> {
  const look = pickDayPartnerStandInLook(input.noun, { elderly: input.elderly });
  const promptId = await input.sendComfyUi(buildDayPartnerStandInPrompt(look), null, undefined, {
    inputImageFilename: input.leadFaceFilename,
    identityLock: false,
    queueTool: 'image-prompt',
    preserveInputAspect: true,
    queueHints: '',
    ...(input.characterId ? { characterId: input.characterId } : {}),
  });
  const id = typeof promptId === 'string' ? promptId.trim() : '';
  if (!id) {
    return null;
  }
  const [entry] = await waitForGalleryPromptIds([id], { timeoutMs: 3 * 60_000, pollMs: 2_000 });
  const resultUrl = entry ? galleryEntryPrimaryViewUrl(entry)?.trim() : '';
  if (!resultUrl) {
    return null;
  }
  const blob = await loadImageBlobFromUrls([resultUrl]);
  // Head only: the portrait's T-shirt rode into every still as the partner's outfit.
  const name = `day-partner-${input.noun}-${Date.now()}.png`;
  const file = await cropPortraitFaceRegionFromBlob(blob, name, DAY_PARTNER_STAND_IN_CROP).catch(
    () => new File([blob], name, { type: blob.type || 'image/png' })
  );
  const uploaded = await resolveQueueInputImage({
    file,
    filename: file.name,
    model: input.model ?? undefined,
    comfyUrl: input.comfyUrl,
  });
  const filename = uploaded?.filename?.trim();
  return filename ? { noun: input.noun, look, filename, imageUrl: resultUrl } : null;
}

/**
 * The partner's face as a VL-only reference (`day-partner-vl-*`, no ReferenceLatent) for clothed
 * Day stills — the latent of a lone head crop was painted as a third person. Adult stills keep
 * the latent (two-person layouts tested clean with it).
 */
export async function uploadDayPartnerVlFace(input: {
  filename?: string;
  imageUrl?: string;
  model?: string | null;
  comfyUrl?: string;
}): Promise<string | null> {
  const urls = collectIsolateSourceUrls({
    imageUrl: input.imageUrl?.trim() || undefined,
    filename: input.filename?.trim() || undefined,
    comfyUrl: input.comfyUrl,
  });
  if (urls.length === 0) return null;
  try {
    const blob = await loadImageBlobFromUrls(urls);
    const file = new File([blob], `day-partner-vl-${Date.now()}.png`, {
      type: blob.type || 'image/png',
    });
    const uploaded = await resolveQueueInputImage({
      file,
      filename: file.name,
      model: input.model ?? undefined,
      comfyUrl: input.comfyUrl,
    });
    return uploaded?.filename?.trim() || null;
  } catch {
    return null;
  }
}
