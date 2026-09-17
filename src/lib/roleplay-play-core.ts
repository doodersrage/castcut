import { avoidedTokensRequestBody } from './avoided-tokens';
import { getCachedClothingLabel } from './clothing-catalog-client';
import { ISOLATE_QUEUE_BLOCKED_MESSAGE } from './isolate-subject';
import { sharedLlmRequestBody } from './llm-request-options';
import {
  normalizeAvoidedRoleplayNames,
  resolveRoleplayLockedCharacterName,
  type RoleplayBio,
  type RoleplayContentId,
  type RoleplayScene,
  type RoleplayStoryBeat,
  type RoleplayTone,
} from './roleplay';
import type { SharedToolSettings } from './settings-cache';
import type { EnrichedToolGenerateResult } from './specialized/types';
import { buildFittingGarmentReferenceExtras } from './wardrobe-garment-thumbs';

export type RoleplayApiPayload = EnrichedToolGenerateResult & {
  error?: string;
  bio?: RoleplayBio;
  scenes?: RoleplayScene[];
  provider?: 'llm' | 'template';
};

export type RoleplayQueueStillOptions = {
  inputImageFilename?: string;
  inputImageUrl?: string;
  /**
   * Sparse extras: slot 0 empty so plate stays Image 1;
   * slot 1 = garment packshot; slot 2 = crude pose stick figure.
   */
  inputImageUrls?: Array<string | undefined>;
  inputImageFilenames?: string[];
  identityLock: true;
  identityLockStrength?: number;
  identityKind?: SharedToolSettings['identityKind'];
  /** Match Day stills: strong Qwen edit so Image 3 pose can beat the standing Cast plate. */
  queueTool?: 'image-prompt';
  turboEditStrength?: 'strong';
};

export function buildRoleplayRequestBody(input: {
  action: 'bio' | 'scenes' | 'prompt';
  situation?: RoleplayScene;
  shared: SharedToolSettings;
  personaId: string;
  customPersona?: string;
  characterName?: string;
  extraHints?: string;
  setting?: string;
  tone: RoleplayTone;
  content: RoleplayContentId;
  allowGore?: boolean;
  hasReferenceImage: boolean;
  isolatedSubject: boolean;
  bio?: RoleplayBio;
  story?: RoleplayStoryBeat[];
  rejectedScenes?: RoleplayScene[];
  /** Catalog kit label or id for wardrobe cues. */
  wardrobeLabel?: string;
  /** Vision / manual description of a BYO clothing packshot. */
  garmentDescription?: string;
  /** True when Image 2 will carry a packshot / BYO garment. */
  hasGarmentReference?: boolean;
}): Record<string, unknown> {
  const nameLock = resolveRoleplayLockedCharacterName(input.characterName);
  const writingBio = input.action === 'bio';
  return {
    action: input.action,
    model: input.shared.model,
    detail: input.shared.detail,
    personaId: input.personaId,
    customPersona: input.customPersona,
    characterName: nameLock,
    avoidCharacterNames:
      writingBio && !nameLock ? normalizeAvoidedRoleplayNames([input.bio?.name]) : [],
    extraHints: input.extraHints,
    setting: input.setting,
    lockedLocation: input.shared.lockedLocation,
    isolatedSubject: input.isolatedSubject,
    tone: input.tone,
    content: input.content,
    allowGore: input.allowGore === true,
    hasReferenceImage: input.hasReferenceImage,
    wardrobeLabel: input.wardrobeLabel?.trim() || undefined,
    garmentDescription: input.garmentDescription?.trim() || undefined,
    hasGarmentReference: input.hasGarmentReference === true,
    bio: writingBio ? undefined : input.bio,
    story: writingBio ? [] : input.story,
    rejectedScenes: input.action === 'scenes' ? input.rejectedScenes : undefined,
    situation: input.situation,
    ...avoidedTokensRequestBody(),
    ...sharedLlmRequestBody(input.shared),
  };
}

/** Resolve kit / BYO fields for Story LLM cues and queue Image 2. */
export function resolveRoleplayWardrobeFields(input: {
  wardrobeId?: string | null;
  lockedWardrobeId?: string | null;
  wardrobeLabel?: string | null;
  customGarmentUrl?: string | null;
  customGarmentFilename?: string | null;
  customGarmentDescription?: string | null;
}): {
  wardrobeId?: string;
  wardrobeLabel?: string;
  garmentDescription?: string;
  hasGarmentReference: boolean;
  garmentFilename?: string;
  garmentUrl?: string;
} {
  const wardrobeId = input.wardrobeId?.trim() || input.lockedWardrobeId?.trim() || undefined;
  const extras = buildFittingGarmentReferenceExtras({
    wardrobeId,
    customGarmentUrl: input.customGarmentUrl,
    customGarmentFilename: input.customGarmentFilename,
  });
  const label =
    input.wardrobeLabel?.trim() ||
    (wardrobeId ? getCachedClothingLabel(wardrobeId) || wardrobeId : undefined);
  return {
    ...(wardrobeId ? { wardrobeId } : {}),
    ...(label ? { wardrobeLabel: label } : {}),
    ...(input.customGarmentDescription?.trim()
      ? { garmentDescription: input.customGarmentDescription.trim() }
      : {}),
    hasGarmentReference: Boolean(extras),
    ...(extras?.inputImageFilenames?.[1] ? { garmentFilename: extras.inputImageFilenames[1] } : {}),
    ...(extras?.inputImageUrls?.[1] ? { garmentUrl: extras.inputImageUrls[1] } : {}),
  };
}

export function buildRoleplayQueueStillOptions(input: {
  photoMode: boolean;
  isolateSubject: boolean;
  referenceIsolated: boolean;
  filename?: string;
  imageUrl?: string;
  identityLockStrength?: SharedToolSettings['ipAdapterStrength'];
  identityKind?: SharedToolSettings['identityKind'];
  /** Clothing packshot / BYO as Image 2. */
  garmentFilename?: string | null;
  garmentUrl?: string | null;
  wardrobeId?: string | null;
  customGarmentUrl?: string | null;
  customGarmentFilename?: string | null;
  /** Crude stick-figure pose guide as Image 3. */
  poseGuideFilename?: string | null;
  poseGuideUrl?: string | null;
  /** Drop Image 2 clothing packshot (intimate nude/sex beats). */
  omitGarment?: boolean;
}): RoleplayQueueStillOptions | undefined {
  if (!input.photoMode) {
    return undefined;
  }
  if (input.isolateSubject && input.referenceIsolated !== true) {
    throw new Error(ISOLATE_QUEUE_BLOCKED_MESSAGE);
  }
  const filename = input.filename?.trim() || '';
  const imageUrl = input.imageUrl?.trim() || '';
  if (!filename && !imageUrl) {
    return undefined;
  }
  const wardrobe = input.omitGarment
    ? {
        garmentFilename: undefined as string | undefined,
        garmentUrl: undefined as string | undefined,
      }
    : resolveRoleplayWardrobeFields({
        wardrobeId: input.wardrobeId,
        customGarmentUrl: input.customGarmentUrl,
        customGarmentFilename: input.customGarmentFilename,
      });
  // Explicit garmentFilename/Url win when callers already resolved extras (unless omitted).
  const garmentFilename = input.omitGarment
    ? ''
    : input.garmentFilename?.trim() || wardrobe.garmentFilename || '';
  const garmentUrl = input.omitGarment ? '' : input.garmentUrl?.trim() || wardrobe.garmentUrl || '';
  const poseGuideFilename = input.poseGuideFilename?.trim() || '';
  const poseGuideUrl = input.poseGuideUrl?.trim() || '';
  const hasGarment = Boolean(garmentFilename || garmentUrl);
  const hasPoseGuide = Boolean(poseGuideFilename || poseGuideUrl);
  const extraUrls: Array<string | undefined> = [undefined];
  const extraFilenames: string[] = [''];
  if (hasGarment || hasPoseGuide) {
    extraUrls[1] = hasGarment ? garmentUrl || undefined : undefined;
    extraFilenames[1] = hasGarment ? garmentFilename : '';
  }
  if (hasPoseGuide) {
    extraUrls[2] = poseGuideUrl || undefined;
    extraFilenames[2] = poseGuideFilename;
  }
  const hasExtras =
    extraUrls.some((url, index) => index > 0 && Boolean(url)) ||
    extraFilenames.some((name, index) => index > 0 && Boolean(name.trim()));
  return {
    inputImageFilename: filename || undefined,
    inputImageUrl: imageUrl || undefined,
    ...(hasExtras
      ? {
          ...(extraUrls.some(url => Boolean(url)) ? { inputImageUrls: extraUrls } : {}),
          ...(extraFilenames.some(name => Boolean(name.trim()))
            ? { inputImageFilenames: extraFilenames }
            : {}),
        }
      : {}),
    identityLock: true,
    identityLockStrength: input.identityLockStrength,
    identityKind: input.identityKind,
    // Soft roleplay denoise (~0.65) keeps Image 1 standing pose; Day uses image-prompt + strong.
    queueTool: 'image-prompt',
    turboEditStrength: 'strong',
  };
}

export async function postRoleplayJson(body: unknown): Promise<{
  ok: boolean;
  data: RoleplayApiPayload;
}> {
  const response = await fetch('/api/roleplay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as RoleplayApiPayload;
  return { ok: response.ok, data };
}
